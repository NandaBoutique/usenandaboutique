/* Nanda Boutique — contas locais e adaptador de autenticação Supabase.
 * Sem configuração, contas e dados ficam SOMENTE neste navegador. Senhas são
 * derivadas com PBKDF2 + sal aleatório, nunca armazenadas em texto aberto.
 * Esse modo offline não comprova a posse de um e-mail nem protege contra alguém
 * que controla o navegador. A proteção remota real exige Supabase + setup.sql.
 * No modo remoto, localStorage/metadata/JWT decodificado nunca autorizam CMS:
 * /auth/v1/user + PostgreSQL verificam a identidade; tokens usam sessionStorage.
 * Documentação: https://github.com/supabase/auth#endpoints
 * https://supabase.com/docs/guides/database/postgres/row-level-security
 */
(() => {
    'use strict';

    const ADMIN_EMAIL = 'usenandaboutiquee@gmail.com';
    const SESSION_KEY = 'nandaBoutique.supabase.session.v1';
    const LOCAL_ACCOUNTS_KEY = 'nandaBoutique.local.accounts.v1';
    const LOCAL_SESSION_KEY = 'nandaBoutique.local.session.v1';
    const LOCAL_STORE_KEY = 'nandaBoutique.local.store.v1';
    const LOCAL_REVIEWS_KEY = 'nandaBoutique.local.reviews.v1';
    const listeners = new Set();
    const requests = new Set();
    const rawConfig = globalThis.NANDA_CONFIG || {};
    let tokens = null;
    let generation = 0;
    let refreshJob = null;
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
    const mode = () => configured() ? 'supabase' : 'local';
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
        if (!configured()) {
            try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch { /* Always clear in-memory state. */ }
        }
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

    async function request(path, { method = 'GET', body, token, headers: extraHeaders, ticket = generation } = {}) {
        requireConfiguration();
        assertCurrent(ticket);
        const controller = new AbortController();
        requests.add(controller);
        const timeout = setTimeout(() => controller.abort(), 15000);
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
                if (response.status === 409) throw error('Você já enviou uma avaliação. Exclua a anterior para avaliar novamente.', 409);
                if (response.status === 429) throw error('Muitas tentativas. Aguarde um pouco e tente novamente.', 429);
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
            try { return await validateLocalSession(ticket); }
            catch { if (ticket === generation) clearSession(); return state; }
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
        if (!configured()) return localSignIn(email, password);
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
        if (!configured()) return localSignUp({ name, email, password });
        requireConfiguration();
        if (String(password || '').length < 8) throw error('Use uma senha com pelo menos 8 caracteres.');
        if (!String(name || '').trim()) throw error('Informe seu nome para criar sua conta.');
        clearSession();
        const ticket = generation;
        try {
            const response = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectAddress())}`, {
                method: 'POST', body: { email: normalizeEmail(email), password: String(password), data: { name: safeName(name), userRole: 'client' } }, ticket
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
        if (!configured()) return { simulated: true };
        await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectAddress())}`, { method: 'POST', body: { email: normalizeEmail(email) } });
        return { simulated: false };
    }

    async function updatePassword(password) {
        if (!configured()) throw error('A recuperação por e-mail estará disponível quando a loja conectar o Supabase. Nenhuma senha foi alterada.');
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

    const requireUser = () => configured() ? validateSession(generation) : validateLocalSession(generation);
    const requireAdmin = () => configured() ? validateSession(generation, true) : validateLocalSession(generation, true);

    async function loadStore() {
        if (!configured()) return readLocal(LOCAL_STORE_KEY, null);
        const rows = await request('/rest/v1/boutique_store?id=eq.main&select=payload');
        return Array.isArray(rows) && rows[0]?.payload && typeof rows[0].payload === 'object' ? rows[0].payload : null;
    }

    async function saveStore(payload) {
        const ticket = generation;
        if (configured()) await validateSession(ticket, true);
        else await validateLocalSession(ticket, true);
        assertCurrent(ticket);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error('Os dados da loja são inválidos.');
        if (!configured()) { writeLocal(LOCAL_STORE_KEY, payload); return structuredClone(payload); }
        if (new Blob([JSON.stringify(payload)]).size > 2 * 1024 * 1024) throw error('Os dados da loja excederam o limite. Envie imagens pela galeria.');
        const rows = await request('/rest/v1/boutique_store?on_conflict=id', {
            method: 'POST', body: { id: 'main', payload }, token: tokens.access_token, ticket,
            headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
        });
        return Array.isArray(rows) && rows[0]?.payload ? rows[0].payload : payload;
    }

    async function uploadImage(file) {
        const ticket = generation;
        if (configured()) await validateSession(ticket, true);
        else await validateLocalSession(ticket, true);
        const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        if (!(file instanceof Blob) || !formats[file.type] || file.size < 1 || file.size > 5 * 1024 * 1024) throw error('Escolha uma foto JPG, PNG ou WebP de até 5 MB.');
        // Do not trust a renamed executable or the browser-provided MIME type.
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const validPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
        const validWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
        if (!(file.type === 'image/jpeg' && validJpeg || file.type === 'image/png' && validPng || file.type === 'image/webp' && validWebp)) throw error('A foto parece inválida. Escolha outra imagem JPG, PNG ou WebP.');
        assertCurrent(ticket);
        if (!configured()) {
            const result = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(error('Não foi possível abrir esta foto. Escolha outra imagem.'));
                reader.readAsDataURL(file);
            });
            assertCurrent(ticket);
            return result;
        }
        const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
        const name = `${id}.${formats[file.type]}`;
        await request(`/storage/v1/object/boutique-media/${name}`, { method: 'POST', body: file, token: tokens.access_token, ticket, headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'Cache-Control': '3600' } });
        return `${config.url}/storage/v1/object/public/boutique-media/${name}`;
    }

    function mapReview(row) {
        return {
            id: Number(row.id), ownerId: row.owner_id ? String(row.owner_id) : null,
            name: safeName(row.display_name), estrelas: Number(row.stars),
            comentario: String(row.comment || '').slice(0, 1000), criadoEm: Date.parse(row.created_at) || Date.now()
        };
    }

    async function loadReviews() {
        if (!configured()) {
            return readLocalReviews().map(row => ({ ...row, ownerId: row.ownerId === state.user?.id ? row.ownerId : null }));
        }
        const rows = await request('/rest/v1/rpc/boutique_list_reviews', { method: 'POST', body: {}, token: tokens?.access_token });
        return Array.isArray(rows) ? rows.map(mapReview).filter(row => Number.isSafeInteger(row.id) && row.estrelas >= 1 && row.estrelas <= 5) : [];
    }

    async function submitReview({ id, estrelas, comentario }) {
        const ticket = generation;
        if (configured()) await validateSession(ticket);
        else await validateLocalSession(ticket);
        assertCurrent(ticket);
        const stars = Number(estrelas);
        const comment = String(comentario || '').trim();
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || !Number.isInteger(stars) || stars < 1 || stars > 5 || comment.length < 3 || comment.length > 1000) throw error('Escolha de 1 a 5 estrelas e escreva um comentário entre 3 e 1.000 caracteres.');
        if (!configured()) {
            const reviews = readLocalReviews();
            if (reviews.some(row => row.ownerId === state.user.id)) throw error('Você já enviou uma avaliação. Exclua a anterior para avaliar novamente.', 409);
            if (reviews.some(row => row.id === Number(id))) throw error('Tente enviar a avaliação novamente.');
            const review = { id: Number(id), ownerId: state.user.id, name: state.user.name, estrelas: stars, comentario: comment, criadoEm: Date.now() };
            writeLocal(LOCAL_REVIEWS_KEY, [review, ...reviews]);
            return { ...review };
        }
        const rows = await request('/rest/v1/rpc/boutique_submit_review', { method: 'POST', body: { review_id: Number(id), review_stars: stars, review_comment: comment }, token: tokens.access_token, ticket });
        return Array.isArray(rows) && rows[0] ? mapReview(rows[0]) : null;
    }

    async function deleteReview(id) {
        const ticket = generation;
        if (configured()) await validateSession(ticket);
        else await validateLocalSession(ticket);
        assertCurrent(ticket);
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw error('Avaliação inválida.');
        if (!configured()) {
            const reviews = readLocalReviews();
            if (!reviews.some(row => row.id === Number(id) && row.ownerId === state.user.id)) throw error('Você pode excluir somente a sua própria avaliação.');
            writeLocal(LOCAL_REVIEWS_KEY, reviews.filter(row => row.id !== Number(id)));
            return true;
        }
        const removed = await request('/rest/v1/rpc/boutique_delete_review', { method: 'POST', body: { review_id: Number(id) }, token: tokens.access_token, ticket });
        if (removed !== true) throw error('Você pode excluir somente a sua própria avaliação.');
        return true;
    }

    function readLocal(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
        catch { return fallback; }
    }

    function writeLocal(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch { throw error('Não foi possível salvar neste navegador. Libere espaço ou reduza a quantidade/tamanho das fotos.'); }
    }

    function readLocalAccounts() {
        const entries = readLocal(LOCAL_ACCOUNTS_KEY, []);
        return Array.isArray(entries) ? entries.filter(account => account && typeof account.id === 'string' && typeof account.email === 'string' && typeof account.passwordHash === 'string' && typeof account.salt === 'string' && account.algorithm === 'PBKDF2-SHA256' && account.iterations === 210000) : [];
    }

    function readLocalReviews() {
        const entries = readLocal(LOCAL_REVIEWS_KEY, []);
        return Array.isArray(entries) ? entries.filter(row => row && Number.isSafeInteger(row.id) && typeof row.ownerId === 'string' && Number.isInteger(row.estrelas) && row.estrelas >= 1 && row.estrelas <= 5).map(row => ({
            id: row.id, ownerId: row.ownerId, name: safeName(row.name), estrelas: row.estrelas,
            comentario: String(row.comentario || '').slice(0, 1000), criadoEm: Number(row.criadoEm) || Date.now()
        })) : [];
    }

    function hex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }

    function randomHex(size = 24) {
        if (!globalThis.crypto?.getRandomValues) throw error('Abra a loja em um navegador atualizado para criar sua conta.');
        return hex(crypto.getRandomValues(new Uint8Array(size)));
    }

    async function passwordDigest(password, salt) {
        if (!globalThis.crypto?.subtle) throw error('Para proteger sua senha, abra a loja por localhost ou HTTPS em um navegador atualizado.');
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 210000 }, material, 256);
        return hex(new Uint8Array(bits));
    }

    async function tokenDigest(token) {
        if (!globalThis.crypto?.subtle) throw error('Abra a loja por localhost ou HTTPS para entrar com segurança.');
        return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
    }

    function sameHash(left, right) {
        if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
        let difference = 0;
        for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
        return difference === 0;
    }

    async function validateLocalSession(ticket, needsAdmin = false) {
        try {
            assertCurrent(ticket);
            const localSession = readLocal(LOCAL_SESSION_KEY, null);
            if (!localSession || typeof localSession.token !== 'string' || Number(localSession.expiresAt) < Date.now()) throw error('Entre na sua conta para continuar.');
            const account = readLocalAccounts().find(entry => entry.id === localSession.accountId);
            if (!account || account.credentialVersion !== localSession.credentialVersion || !sameHash(account.sessionHash, await tokenDigest(localSession.token))) throw error('Sua sessão expirou. Entre novamente para continuar.');
            assertCurrent(ticket);
            // Re-read the record after crypto work to catch logout in another tab.
            if (readLocal(LOCAL_SESSION_KEY, null)?.token !== localSession.token) throw error('Sua sessão foi encerrada.');
            const admin = normalizeEmail(account.email) === ADMIN_EMAIL;
            const next = publish({
                user: { id: account.id, email: normalizeEmail(account.email), name: safeName(account.name) },
                role: admin ? 'admin' : 'client', verified: true, recovery: false,
                identityVerified: false, mode: 'local'
            });
            if (needsAdmin && !admin) throw error('A edição está disponível somente para a administradora da loja.', 403);
            return next;
        } catch (issue) {
            if (ticket === generation && issue.status !== 403) clearSession();
            throw issue;
        }
    }

    async function establishLocalSession(account, ticket) {
        const token = randomHex();
        const sessionHash = await tokenDigest(token);
        assertCurrent(ticket);
        const accounts = readLocalAccounts();
        const current = accounts.find(entry => entry.id === account.id);
        if (!current || current.passwordHash !== account.passwordHash) throw error('A conta mudou. Entre novamente.');
        current.sessionHash = sessionHash;
        writeLocal(LOCAL_ACCOUNTS_KEY, accounts);
        writeLocal(LOCAL_SESSION_KEY, { accountId: current.id, token, credentialVersion: current.credentialVersion, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
        return validateLocalSession(ticket);
    }

    async function localSignIn(email, password) {
        clearSession();
        const ticket = generation;
        const account = readLocalAccounts().find(entry => normalizeEmail(entry.email) === normalizeEmail(email));
        const supplied = await passwordDigest(String(password || ''), account?.salt || randomHex(16));
        assertCurrent(ticket);
        if (!account || !sameHash(supplied, account.passwordHash)) throw error('E-mail ou senha incorretos. Confira seus dados e tente novamente.');
        return establishLocalSession(account, ticket);
    }

    async function localSignUp({ name, email, password }) {
        const address = normalizeEmail(email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw error('Digite um e-mail válido.');
        if (!String(name || '').trim()) throw error('Informe seu nome para criar sua conta.');
        if (String(password || '').length < 8 || String(password).length > 1024) throw error('Use uma senha entre 8 e 1.024 caracteres.');
        if (readLocalAccounts().some(entry => normalizeEmail(entry.email) === address)) throw error('Este e-mail já tem uma conta neste navegador. Use a aba Entrar.');
        clearSession();
        const ticket = generation;
        const salt = randomHex(16);
        const passwordHash = await passwordDigest(String(password), salt);
        assertCurrent(ticket);
        const accounts = readLocalAccounts();
        if (accounts.some(entry => normalizeEmail(entry.email) === address)) throw error('Este e-mail já tem uma conta neste navegador. Use a aba Entrar.');
        const account = { id: `local-${randomHex(16)}`, email: address, name: safeName(name), algorithm: 'PBKDF2-SHA256', iterations: 210000, salt, passwordHash, credentialVersion: randomHex(12), createdAt: Date.now() };
        writeLocal(LOCAL_ACCOUNTS_KEY, [...accounts, account]);
        return { state: await establishLocalSession(account, ticket), confirmationRequired: false };
    }

    if (typeof globalThis.addEventListener === 'function') {
        globalThis.addEventListener('storage', event => {
            if (configured() || ![LOCAL_SESSION_KEY, LOCAL_ACCOUNTS_KEY].includes(event.key)) return;
            const ticket = generation;
            validateLocalSession(ticket).catch(() => {});
        });
    }

    globalThis.BoutiqueAuth = Object.freeze({
        configured, mode, getState, restore, signIn, signUp, signOut, resetPassword, updatePassword,
        requireAdmin, requireUser, loadStore, saveStore, uploadImage, loadReviews, submitReview, deleteReview,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    });
})();
