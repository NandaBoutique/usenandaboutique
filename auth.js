/* UseNandaBoutique — autenticação, catálogo, avaliações e mídia no Supabase.
 * A sessão usa sessionStorage; catálogo e contas nunca são salvos localmente.
 * /auth/v1/user e PostgreSQL verificam a identidade da administradora:
 * localStorage, metadata e JWT decodificado nunca autorizam a edição.
 * A senha inicial deve ser definida apenas no Supabase Auth, fora do front-end.
 * Documentação: https://github.com/supabase/auth#endpoints
 * https://supabase.com/docs/guides/database/postgres/row-level-security
 */
(() => {
    'use strict';

    const ADMIN_EMAIL = 'usenandaboutiquee@gmail.com';
    const SESSION_KEY = 'nandaBoutique.supabase.session.v1';
    const listeners = new Set();
    const requests = new Set();
    const rawConfig = globalThis.NANDA_CONFIG || {};
    let tokens = null;
    let generation = 0;
    let refreshJob = null;
    let storeLoaded = false;
    let storeUpdatedAt = null;
    let savingStore = false;
    let storeLoadJob = null;
    let state = Object.freeze({ user: null, role: 'guest', verified: false, recovery: false });

    function publicKeyOnly(key) {
        if (typeof key !== 'string' || key.length > 5000) return false;
        if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
        // Decode only the PUBLIC CONFIGURATION KEY to reject privileged secrets.
        // This never decodes a user's token or confers authorization.
        try {
            const parts = key.split('.');
            if (parts.length !== 3) return false;
            const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))).role === 'anon';
        } catch { return false; }
    }

    function readConfiguration() {
        try {
            const url = new URL(String(rawConfig.supabaseUrl || '').trim());
            const key = String(rawConfig.supabaseAnonKey || '').trim();
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !publicKeyOnly(key)) return null;
            if (url.pathname !== '/' && url.pathname !== '') return null;
            return Object.freeze({ url: url.origin, key });
        } catch { return null; }
    }

    const config = readConfiguration();
    const configured = () => Boolean(config);
    const mode = () => configured() ? 'supabase' : 'unconfigured';
    const getState = () => state;
    const normalizeEmail = value => String(value || '').trim().toLowerCase();

    function error(message, status = 0) {
        const issue = new Error(message);
        issue.status = status;
        return issue;
    }

    function requireConfiguration() {
        if (!config) throw error('O acesso seguro ainda está sendo configurado. A loja continua disponível para compras pelo WhatsApp.');
    }

    function publish(next) {
        state = Object.freeze({ ...next, user: next.user ? Object.freeze({ ...next.user }) : null });
        listeners.forEach(listener => { try { listener(state); } catch { /* A UI cannot break session cleanup. */ } });
        return state;
    }

    function persistTokens() {
        try {
            if (tokens) sessionStorage.setItem(SESSION_KEY, JSON.stringify(tokens));
            else sessionStorage.removeItem(SESSION_KEY);
        } catch { /* Memory-only authentication remains valid if storage is unavailable. */ }
    }

    function clearSession() {
        generation += 1;
        requests.forEach(controller => controller.abort());
        requests.clear();
        refreshJob = null;
        tokens = null;
        persistTokens();
        return publish({ user: null, role: 'guest', verified: false, recovery: false });
    }

    function assertCurrent(ticket) {
        if (ticket !== generation) throw error('A sessão mudou. Entre novamente para continuar.');
    }

    function installTokens(response, ticket, recovery = false) {
        assertCurrent(ticket);
        if (typeof response?.access_token !== 'string' || !response.access_token || typeof response?.refresh_token !== 'string' || !response.refresh_token) {
            throw error('Não foi possível validar a sessão. Entre novamente.');
        }
        const explicit = Number(response.expires_at);
        const lifetime = Number(response.expires_in);
        tokens = {
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            expires_at: Number.isFinite(explicit) && explicit > 0 ? explicit : Math.floor(Date.now() / 1000) + (Number.isFinite(lifetime) && lifetime > 0 ? Math.min(lifetime, 86400) : 3600),
            recovery: Boolean(recovery)
        };
        persistTokens();
    }

    async function request(path, { method = 'GET', body, token, headers: extraHeaders, ticket = generation, timeoutMs = 15000 } = {}) {
        requireConfiguration();
        assertCurrent(ticket);
        const controller = new AbortController();
        requests.add(controller);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const isFile = typeof Blob !== 'undefined' && body instanceof Blob;
        const headers = { apikey: config.key, ...extraHeaders };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body !== undefined && !isFile) headers['Content-Type'] = 'application/json';
        try {
            const response = await fetch(`${config.url}${path}`, {
                method, headers, credentials: 'omit', cache: 'no-store', redirect: 'error',
                referrerPolicy: 'no-referrer', signal: controller.signal,
                ...(body === undefined ? {} : { body: isFile ? body : JSON.stringify(body) })
            });
            assertCurrent(ticket);
            if (!response.ok) {
                let detail = {};
                try { detail = await response.json(); } catch { /* Keep the safe, contextual message. */ }
                if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(detail.code)) throw error('A base da loja ainda precisa ser instalada no Supabase. Execute supabase/setup.sql no SQL Editor.', response.status);
                if (detail.error_code === 'email_not_confirmed' || detail.code === 'email_not_confirmed') throw error('Confirme seu e-mail antes de entrar. Confira também a pasta de spam.', response.status);
                if (path.startsWith('/auth/v1/token?grant_type=password') && [400, 401, 422].includes(response.status)) throw error('E-mail ou senha incorretos. Confira seus dados e tente novamente.', response.status);
                if (response.status === 409) throw error(path.includes('review') ? 'Você já enviou uma avaliação. Exclua a anterior para avaliar novamente.' : 'A loja foi alterada em outro dispositivo. Atualize a página antes de salvar novamente.', 409);
                if (response.status === 429) throw error('Muitas tentativas. Aguarde um pouco e tente novamente.', 429);
                if (path.startsWith('/storage/') && [400, 404].includes(response.status)) throw error('Não foi possível enviar esta mídia. Confira o formato, o tamanho e se o bucket boutique-media foi criado com supabase/setup.sql.', response.status);
                if (response.status === 403) throw error('Sua conta não tem permissão para esta ação. Entre com a conta da administradora.', 403);
                throw error('Não foi possível concluir com segurança. Confira seus dados e tente novamente.', response.status);
            }
            if (response.status === 204) return null;
            const text = await response.text();
            assertCurrent(ticket);
            return text ? JSON.parse(text) : null;
        } catch (issue) {
            assertCurrent(ticket);
            if (issue.status) throw issue;
            throw error('Não foi possível conectar à loja. Verifique sua conexão e tente novamente.');
        } finally {
            clearTimeout(timeout);
            requests.delete(controller);
        }
    }

    async function refreshSession(ticket) {
        assertCurrent(ticket);
        if (refreshJob) return refreshJob;
        if (!tokens?.refresh_token) throw error('Entre na sua conta para continuar.');
        const current = tokens;
        const job = (async () => {
            const response = await request('/auth/v1/token?grant_type=refresh_token', {
                method: 'POST', body: { refresh_token: current.refresh_token }, ticket
            });
            installTokens(response, ticket, current.recovery);
        })();
        refreshJob = job;
        try { await job; }
        finally { if (refreshJob === job) refreshJob = null; }
    }

    async function verifiedUser(ticket) {
        requireConfiguration();
        assertCurrent(ticket);
        if (!tokens) throw error('Entre na sua conta para continuar.');
        if (tokens.expires_at <= Date.now() / 1000 + 30) await refreshSession(ticket);
        let user;
        try { user = await request('/auth/v1/user', { token: tokens.access_token, ticket }); }
        catch (issue) {
            if (issue.status !== 401) throw issue;
            await refreshSession(ticket);
            user = await request('/auth/v1/user', { token: tokens.access_token, ticket });
        }
        assertCurrent(ticket);
        if (!user?.id || !user.email || !user.email_confirmed_at || user.is_anonymous === true) {
            throw error('Confirme seu e-mail antes de entrar. Confira também a pasta de spam.');
        }
        return user;
    }

    function safeName(value) {
        return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Cliente';
    }

    async function validateSession(ticket, needsAdmin = false) {
        let clientVerified = false;
        try {
            const remote = await verifiedUser(ticket);
            const email = normalizeEmail(remote.email);
            let admin = false;
            if (email === ADMIN_EMAIL) {
                // An email match only nominates a candidate; PostgreSQL decides.
                admin = await request('/rest/v1/rpc/is_store_admin', { method: 'POST', body: {}, token: tokens.access_token, ticket }) === true;
            }
            assertCurrent(ticket);
            const next = publish({
                user: { id: String(remote.id), email, name: safeName(remote.user_metadata?.name || remote.user_metadata?.full_name) },
                role: admin ? 'admin' : 'client', verified: true, recovery: Boolean(tokens.recovery)
            });
            clientVerified = !admin;
            if (needsAdmin && !admin) throw error('A edição está disponível somente para a administradora da loja.', 403);
            return next;
        } catch (issue) {
            // Deny offline/stale sessions too. A forbidden client remains a client.
            if (ticket === generation && !(issue.status === 403 && clientVerified)) clearSession();
            throw issue;
        }
    }

    function readRecoveryFromLocation() {
        if (!globalThis.location?.href) return null;
        const url = new URL(location.href);
        const fragment = new URLSearchParams(url.hash.slice(1));
        const containsAuth = ['access_token', 'refresh_token', 'error_description', 'error_code'].some(key => fragment.has(key));
        const containsQueryAuth = ['token_hash', 'access_token', 'refresh_token', 'code', 'error_description'].some(key => url.searchParams.has(key));
        if (!containsAuth && !containsQueryAuth) return null;
        const result = {
            access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token'),
            expires_in: fragment.get('expires_in'), type: fragment.get('type') || url.searchParams.get('type'),
            token_hash: url.searchParams.get('token_hash'), failed: fragment.has('error_description') || url.searchParams.has('error_description')
        };
        if (containsAuth) url.hash = '';
        ['token_hash', 'access_token', 'refresh_token', 'code', 'error', 'error_code', 'error_description', 'type'].forEach(key => url.searchParams.delete(key));
        try { history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`); } catch { /* No credential is ever printed. */ }
        return result;
    }

    async function restore() {
        const callback = readRecoveryFromLocation();
        clearSessionMemoryOnly();
        const ticket = generation;
        if (!configured()) {
            return state;
        }
        try {
            if (callback) {
                if (callback.failed) throw error('Este link não está mais disponível. Solicite outro link de recuperação.');
                if (callback.token_hash && ['recovery', 'signup', 'email'].includes(callback.type)) {
                    const response = await request('/auth/v1/verify', { method: 'POST', body: { token_hash: callback.token_hash, type: callback.type }, ticket });
                    installTokens(response, ticket, callback.type === 'recovery');
                } else installTokens(callback, ticket, callback.type === 'recovery');
            } else {
                let cached = null;
                try { cached = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { /* Discard corrupt storage. */ }
                if (!cached) return state;
                installTokens(cached, ticket, cached.recovery === true);
            }
            return await validateSession(ticket);
        } catch (issue) {
            if (ticket === generation) clearSession();
            if (callback) throw issue;
            return state;
        }
    }

    function clearSessionMemoryOnly() {
        generation += 1;
        requests.forEach(controller => controller.abort());
        requests.clear();
        refreshJob = null;
        tokens = null;
        publish({ user: null, role: 'guest', verified: false, recovery: false });
    }

    async function signIn(email, password) {
        requireConfiguration();
        clearSession();
        const ticket = generation;
        try {
            const response = await request('/auth/v1/token?grant_type=password', {
                method: 'POST', body: { email: normalizeEmail(email), password: String(password || '') }, ticket
            });
            installTokens(response, ticket);
            return await validateSession(ticket);
        } catch (issue) {
            if (ticket === generation) clearSession();
            throw issue;
        }
    }

    function redirectAddress() {
        const base = new URL(location.href);
        const result = rawConfig.passwordResetRedirect ? new URL(rawConfig.passwordResetRedirect, base) : base;
        if (result.origin !== base.origin || !['https:', 'http:'].includes(result.protocol)) throw error('O endereço de recuperação da loja precisa ser configurado.');
        result.hash = '';
        result.search = '';
        return result.href;
    }

    async function signUp({ name, email, password }) {
        requireConfiguration();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) throw error('Digite um e-mail válido.');
        if (normalizeEmail(email) === ADMIN_EMAIL) throw error('A conta da dona deve ser criada no Supabase Auth. Para entrar, use a aba Entrar.');
        if (String(password || '').length < 8) throw error('Use uma senha com pelo menos 8 caracteres.');
        if (!String(name || '').trim()) throw error('Informe seu nome para criar sua conta.');
        clearSession();
        const ticket = generation;
        try {
            const response = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectAddress())}`, {
                method: 'POST', body: { email: normalizeEmail(email), password: String(password), data: { name: safeName(name) } }, ticket
            });
            if (!response?.access_token) return { state, confirmationRequired: true };
            installTokens(response, ticket);
            return { state: await validateSession(ticket), confirmationRequired: false };
        } catch (issue) {
            if (ticket === generation) clearSession();
            throw issue;
        }
    }

    async function signOut() {
        const previous = tokens?.access_token;
        clearSession();
        // Local cleanup is immediate and unconditional even if Supabase is offline.
        if (configured() && previous) {
            try { await request('/auth/v1/logout?scope=local', { method: 'POST', token: previous }); }
            catch { /* A network failure cannot restore the local account. */ }
        }
        return state;
    }

    async function resetPassword(email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) throw error('Digite um e-mail válido.');
        requireConfiguration();
        await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectAddress())}`, { method: 'POST', body: { email: normalizeEmail(email) } });
        return { simulated: false };
    }

    async function updatePassword(password) {
        requireConfiguration();
        if (String(password || '').length < 8) throw error('Use uma senha com pelo menos 8 caracteres.');
        const ticket = generation;
        await validateSession(ticket);
        assertCurrent(ticket);
        if (!tokens?.recovery) throw error('Abra o link de recuperação recebido por e-mail para definir a nova senha.');
        await request('/auth/v1/user', { method: 'PUT', body: { password: String(password) }, token: tokens.access_token, ticket });
        assertCurrent(ticket);
        tokens.recovery = false;
        persistTokens();
        return publish({ ...state, recovery: false });
    }

    const requireUser = () => validateSession(generation);
    const requireAdmin = () => validateSession(generation, true);

    async function loadStore() {
        requireConfiguration();
        if (savingStore) return Promise.reject(error('Aguarde o salvamento terminar antes de recarregar a loja.'));
        if (storeLoadJob) return storeLoadJob;
        // Compartilha leituras simultâneas para impedir respostas fora de ordem.
        storeLoadJob = (async () => {
            const rows = await request('/rest/v1/boutique_store?id=eq.main&select=payload,updated_at');
            if (!Array.isArray(rows)) throw error('O catálogo retornou dados inválidos. Tente carregar novamente.');
            const row = rows[0];
            if (row && (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload) || typeof row.updated_at !== 'string')) throw error('O catálogo precisa ser revisado no Supabase antes de continuar.');
            storeUpdatedAt = row?.updated_at || null;
            storeLoaded = true;
            return row?.payload || null;
        })().finally(() => { storeLoadJob = null; });
        return storeLoadJob;
    }

    async function saveStore(payload) {
        requireConfiguration();
        if (!storeLoaded) throw error('Carregue o catálogo antes de salvar. Atualize a página e tente novamente.');
        if (savingStore) throw error('Aguarde o salvamento atual terminar.');
        if (storeLoadJob) throw error('Aguarde o carregamento da loja terminar antes de salvar.');
        const ticket = generation;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error('Os dados da loja são inválidos.');
        const serialized = JSON.stringify(payload);
        if (new Blob([serialized]).size > 2 * 1024 * 1024) throw error('Os dados da loja excederam o limite. Envie imagens pela galeria.');
        const snapshot = JSON.parse(serialized), expectedUpdatedAt = storeUpdatedAt;
        savingStore = true;
        try {
            await validateSession(ticket, true);
            assertCurrent(ticket);
            // Compare-and-swap: a second browser cannot overwrite newer stock/content.
            // Never use upsert here: first creation must also detect competing writes.
            const existing = expectedUpdatedAt !== null;
            const path = existing ? `/rest/v1/boutique_store?id=eq.main&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : '/rest/v1/boutique_store';
            const rows = await request(path, {
                method: existing ? 'PATCH' : 'POST', body: existing ? { payload: snapshot } : { id: 'main', payload: snapshot }, token: tokens.access_token, ticket,
                headers: { Prefer: 'return=representation' }
            });
            if (!Array.isArray(rows) || !rows[0]?.payload || typeof rows[0]?.updated_at !== 'string') throw error('A loja foi alterada em outro dispositivo. Atualize a página antes de salvar novamente.', 409);
            storeUpdatedAt = rows[0].updated_at;
            return rows[0].payload;
        } finally { savingStore = false; }
    }

    async function uploadFile(file, imagesOnly) {
        requireConfiguration();
        const ticket = generation;
        await validateSession(ticket, true);
        const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', ...(!imagesOnly ? { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } : {}) };
        const video = file?.type?.startsWith('video/');
        const limit = (video ? 25 : 5) * 1024 * 1024;
        if (!(file instanceof Blob) || !formats[file.type] || file.size < 1 || file.size > limit) throw error(imagesOnly ? 'Escolha uma foto JPG, PNG ou WebP de até 5 MB.' : 'Escolha uma foto JPG, PNG ou WebP de até 5 MB, ou um vídeo MP4, WebM ou MOV de até 25 MB.');
        // Do not trust a renamed executable or the browser-provided MIME type.
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const validPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
        const validWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
        const validMp4 = String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
        const validWebm = [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value);
        if (!(file.type === 'image/jpeg' && validJpeg || file.type === 'image/png' && validPng || file.type === 'image/webp' && validWebp || ['video/mp4', 'video/quicktime'].includes(file.type) && validMp4 || file.type === 'video/webm' && validWebm)) throw error('O arquivo parece inválido. Escolha outra foto ou vídeo compatível.');
        assertCurrent(ticket);
        const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
        const name = `${id}.${formats[file.type]}`;
        // Every replacement has a new URL, including each product's size guide.
        // Immutable names prevent an old picture from being reused by a CDN/SW.
        await request(`/storage/v1/object/boutique-media/${name}`, { method: 'POST', body: file, token: tokens.access_token, ticket, timeoutMs: video ? 120000 : 45000, headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'Cache-Control': '31536000' } });
        return `${config.url}/storage/v1/object/public/boutique-media/${name}`;
    }

    const uploadImage = file => uploadFile(file, true);
    const uploadMedia = file => uploadFile(file, false);

    function uploadedObjectName(publicURL) {
        if (typeof publicURL !== 'string' || !config) return '';
        try {
            const url = new URL(publicURL);
            const prefix = '/storage/v1/object/public/boutique-media/';
            if (url.origin !== config.url || !url.pathname.startsWith(prefix)) return '';
            const name = decodeURIComponent(url.pathname.slice(prefix.length));
            // Delete only immutable files created by uploadFile; never a manually entered URL.
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|mp4|webm|mov)$/i.test(name) ? name : '';
        } catch { return ''; }
    }

    async function removeMedia(publicURL) {
        requireConfiguration();
        const name = uploadedObjectName(publicURL);
        if (!name) return false;
        const ticket = generation;
        await validateSession(ticket, true);
        await request(`/storage/v1/object/boutique-media/${encodeURIComponent(name)}`, { method: 'DELETE', token: tokens.access_token, ticket });
        return true;
    }

    function mapReview(row) {
        return {
            id: Number(row.id), ownerId: row.owner_id ? String(row.owner_id) : null,
            name: safeName(row.display_name), estrelas: Number(row.stars),
            comentario: String(row.comment || '').slice(0, 1000), criadoEm: Date.parse(row.created_at) || Date.now()
        };
    }

    async function loadReviews() {
        requireConfiguration();
        const rows = await request('/rest/v1/rpc/boutique_list_reviews', { method: 'POST', body: {}, token: tokens?.access_token });
        return Array.isArray(rows) ? rows.map(mapReview).filter(row => Number.isSafeInteger(row.id) && row.estrelas >= 1 && row.estrelas <= 5) : [];
    }

    async function submitReview({ id, estrelas, comentario }) {
        const ticket = generation;
        await validateSession(ticket);
        assertCurrent(ticket);
        const stars = Number(estrelas);
        const comment = String(comentario || '').trim();
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || !Number.isInteger(stars) || stars < 1 || stars > 5 || comment.length < 3 || comment.length > 1000) throw error('Escolha de 1 a 5 estrelas e escreva um comentário entre 3 e 1.000 caracteres.');
        const rows = await request('/rest/v1/rpc/boutique_submit_review', { method: 'POST', body: { review_id: Number(id), review_stars: stars, review_comment: comment }, token: tokens.access_token, ticket });
        return Array.isArray(rows) && rows[0] ? mapReview(rows[0]) : null;
    }

    async function deleteReview(id) {
        const ticket = generation;
        await validateSession(ticket);
        assertCurrent(ticket);
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw error('Avaliação inválida.');
        const removed = await request('/rest/v1/rpc/boutique_delete_review', { method: 'POST', body: { review_id: Number(id) }, token: tokens.access_token, ticket });
        if (removed !== true) throw error('Você pode excluir somente a sua própria avaliação.');
        return true;
    }

    globalThis.BoutiqueAuth = Object.freeze({
        configured, mode, getState, restore, signIn, signUp, signOut, resetPassword, updatePassword,
        requireAdmin, requireUser, loadStore, saveStore, uploadImage, uploadMedia, removeMedia, loadReviews, submitReview, deleteReview,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    });
})();
