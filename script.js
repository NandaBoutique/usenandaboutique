"use strict";

// Os dados locais são sempre validados antes de chegar à interface.
function normalizeMediaURL(value, mediaType = 'auto') {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const raw = value.trim();
  if (!raw || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  const extension = /\.(jpe?g|png|webp|avif|gif|mp4|webm)$/i;
  try {
    if (/^(\.\/)?img\//.test(raw)) {
      const filename = decodeURIComponent(raw.replace(/^(\.\/)?img\//, ''));
      if (!extension.test(filename) || filename.startsWith('.') || filename.includes('..') || !/^[\p{L}\p{N} _().-]+$/u.test(filename)) return null;
      return './img/' + encodeURIComponent(filename);
    }
    if (!/^https:\/\//i.test(raw) || /\s/.test(raw)) return null;
    const rawPath = decodeURIComponent(raw.replace(/^https:\/\/[^/?#]+/i, '').split(/[?#]/)[0]);
    if (/[\\\u0000-\u001f\u007f]/.test(rawPath) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath) || /%2e|%2f|%5c|%00/i.test(rawPath)) return null;
    const url = new URL(raw);
    const pathname = decodeURIComponent(url.pathname);
    const explicitType = ['image', 'video'].includes(mediaType) && !/\.[a-z0-9]{1,8}$/i.test(pathname);
    if (url.protocol !== 'https:' || url.username || url.password || (!extension.test(pathname) && !explicitType)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function isVideoURL(value) { try { return /\.(mp4|webm)$/i.test(decodeURIComponent(new URL(value, 'https://catalogo.invalid/').pathname)); } catch { return false; } }
function productVideoURL(value, product) { return isVideoURL(value) || (product.tipoMidia === 'video' && !/\.(jpe?g|png|webp|avif|gif)(?:[?#]|$)/i.test(value)); }

const BoutiqueData = (() => {
  const KEYS = Object.freeze({ products: 'nanda-boutique-produtos-v1', story: 'nanda-boutique-historia-v1', reviews: 'nanda-boutique-avaliacoes-v1', profile: 'nanda-boutique-perfil-v1', cart: 'nanda-boutique-sacola-v4', role: 'userRole', content: 'nanda-boutique-conteudo-v1', accounts: 'nanda-boutique-contas-demo-v1', reviewOwner: 'nanda-boutique-autoria-v1' });
  const CATEGORIES = Object.freeze(['Conjuntos & Macacões', 'Calças & Shorts', 'Bolsas & Acessórios']);
  const PAYMENTS = Object.freeze(['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro']);
  const DEFAULT_STORY = 'Após 23 anos no mercado financeiro, a Nanda Boutique nasceu de um sonho. Nosso propósito é acolher, ouvir histórias e fazer com que cada mulher se sinta especial e linda.';
  const DEFAULT_PRODUCTS = [
    { id: 1, nome: 'Calça Jeans com Brilho', descricao: 'Calça jeans com detalhes de brilho.', categoria: CATEGORIES[1], tamanhos: '36, 40, 42, 46', preco: 169.9, esgotado: false, midias: ['./img/calca-jeans-brilho-1.jpg', './img/calca-jeans-brilho-2.jpg', './img/calca-jeans-brilho-3.mp4'] },
    { id: 2, nome: 'Look Listras e Rosa', descricao: 'Look com blusa rosa e calça listrada.', categoria: CATEGORIES[0], tamanhos: '', preco: null, esgotado: false, midias: ['./img/look-listras-rosa-1.jpg', './img/look-listras-rosa-2.jpg', './img/look-listras-rosa-3.jpg', './img/look-listras-rosa-4.mp4'] },
    { id: 3, nome: 'Coleção de Cintos', descricao: 'Cintos para completar o seu look.', categoria: CATEGORIES[2], tamanhos: '', preco: null, esgotado: false, midias: ['./img/cintos-colecao-1.jpg', './img/cintos-colecao-2.mp4'] },
    { id: 4, nome: 'Conjunto Saia e Camisa Renda', descricao: 'Conjunto de saia e camisa em renda.', categoria: CATEGORIES[0], tamanhos: 'Preto (P), Caramelo (M)', preco: 249.9, esgotado: false, midias: ['./img/conjunto-renda-1.jpg', './img/conjunto-renda-2.mp4', './img/conjunto-renda-3.jpg', './img/conjunto-renda-4.jpg', './img/conjunto-renda-5.jpg', './img/conjunto-renda-6.jpg'] },
    { id: 5, nome: 'Calça Listrada Verão', descricao: 'Calça listrada da coleção de verão. Cores: verde e rosa.', categoria: CATEGORIES[1], tamanhos: '', preco: 139.9, esgotado: false, midias: ['./img/calca-listrada-1.jpg', './img/calca-listrada-2.jpg', './img/calca-listrada-3.jpg', './img/calca-listrada-4.jpg'] }
  ];
  function cleanText(value, max = 800) { return typeof value === 'string' ? value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : ''; }
  function normalizeEmail(value) { const email = cleanText(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[<>"']/.test(email) ? email : ''; }
  // A confirmação de titularidade do CPF e do e-mail pertence ao futuro servidor.
  function normalizeCPF(value) { const raw = cleanText(value, 14); if (!/^[\d.\-\s]+$/.test(raw)) return ''; const digits = raw.replace(/\D/g, ''); return /^\d{11}$/.test(digits) && !/^(\d)\1{10}$/.test(digits) ? digits : ''; }
  function parseSizes(value) {
    const text = cleanText(value, 100);
    const range = /^(\d{2})\s*(?:a|até|-)\s*(\d{2})$/i.exec(text);
    if (range) { const start = Number(range[1]), end = Number(range[2]); if (end >= start && end - start <= 40) return Array.from({ length: Math.floor((end - start) / 2) + 1 }, (_, i) => String(start + i * 2)); }
    return [...new Set(text.split(/[,;\n]|\s+e\s+/i).map(size => size.trim()).filter(Boolean))].slice(0, 24);
  }
  function productHasSize(product, size) { return !product.esgotado && parseSizes(product.tamanhos).includes(size) && !parseSizes(product.tamanhosIndisponiveis).includes(size); }
  function cartKey(item) { return JSON.stringify([item.id, item.size]); }
  function normalizeProduct(raw) {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1) return null;
    const nome = cleanText(raw.nome, 100);
    const tipoMidia = ['image', 'video'].includes(raw.tipoMidia) ? raw.tipoMidia : 'auto';
    const midias = [...new Set((Array.isArray(raw.midias) ? raw.midias : []).slice(0, 8).map(url => normalizeMediaURL(url, tipoMidia)).filter(Boolean))];
    const preco = raw.preco == null ? null : raw.preco;
    if (!nome || !midias.length || (preco !== null && (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0 || preco > 1e7))) return null;
    return { id: raw.id, nome, descricao: cleanText(raw.descricao, 800), categoria: CATEGORIES.includes(raw.categoria) ? raw.categoria : CATEGORIES[0], tamanhos: cleanText(raw.tamanhos, 100), tamanhosIndisponiveis: parseSizes(raw.tamanhosIndisponiveis).filter(size => parseSizes(raw.tamanhos).includes(size)).join(', '), preco, midias, tipoMidia, esgotado: raw.esgotado === true };
  }
  function loadProducts(serialized) {
    const fallback = () => DEFAULT_PRODUCTS.map(normalizeProduct);
    try {
      const rows = JSON.parse(serialized);
      if (!Array.isArray(rows)) return fallback();
      const ids = new Set();
      const products = rows.slice(0, 100).map(normalizeProduct).filter(p => p && !ids.has(p.id) && ids.add(p.id));
      return rows.length && !products.length ? fallback() : products;
    } catch { return fallback(); }
  }
  function normalizeReview(raw) {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || !Number.isInteger(raw.estrelas) || raw.estrelas < 1 || raw.estrelas > 5 || typeof raw.criadoEm !== 'number' || !Number.isFinite(raw.criadoEm) || raw.criadoEm < 0 || raw.criadoEm > Date.now() + 86400000) return null;
    const comentario = cleanText(raw.comentario, 600);
    if (comentario.length < 3) return null;
    // Identificação local nunca é inserida no HTML público dos depoimentos.
    return { id: raw.id, estrelas: raw.estrelas, comentario, criadoEm: raw.criadoEm, email: normalizeEmail(raw.email), ownerId: cleanText(raw.ownerId, 100), cpfInformado: raw.cpfInformado === true };
  }
  function loadReviews(serialized) {
    try {
      const rows = JSON.parse(serialized);
      const ids = new Set(), emails = new Set();
      return Array.isArray(rows) ? rows.slice(0, 200).map(normalizeReview).filter(r => r && !ids.has(r.id) && (!r.email || !emails.has(r.email)) && ids.add(r.id) && (r.email ? emails.add(r.email) : true)).sort((a, b) => b.criadoEm - a.criadoEm) : [];
    } catch { return []; }
  }
  function normalizeProfile(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const email = normalizeEmail(value.email);
    return { role: value.role === 'admin' ? 'admin' : value.role === 'customer' && email ? 'customer' : 'guest', email, name: cleanText(value.name, 80), ownerId: cleanText(value.ownerId, 100) };
  }
  function normalizeCart(entries, products) {
    const legacy = { 'calca-jeans-brilho': 1, 'look-listras-rosa': 2, 'cintos-colecao': 3, 'conjunto-renda': 4, 'calca-listrada': 5 };
    const cart = new Map();
    if (Array.isArray(entries)) for (const row of entries.slice(0, 300)) {
      const item = Array.isArray(row) ? { id: row[0], quantity: row[1] } : row;
      if (!item || typeof item !== 'object') continue;
      const id = Object.hasOwn(legacy, item.id) ? legacy[item.id] : item.id;
      const product = products.find(p => p.id === id), size = cleanText(item.size, 100);
      if (!product || !productHasSize(product, size) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) continue;
      const key = cartKey({ id, size });
      cart.set(key, { id, size, quantity: Math.min(99, (cart.get(key)?.quantity || 0) + item.quantity) });
    }
    return [...cart.values()];
  }
  function buildWhatsAppMessage(items, products, payment) {
    const entries = normalizeCart(items, products);
    if (!entries.length || !PAYMENTS.includes(payment)) return '';
    const pieces = entries.map(item => '[' + products.find(p => p.id === item.id).nome + ' - Tamanho ' + item.size + (item.quantity > 1 ? ' - Quantidade ' + item.quantity : '') + ']');
    return 'Olá Nanda Boutique! Tenho interesse nas seguintes peças: ' + pieces.join(', ') + '. Pagamento: ' + payment + '. Poderia confirmar a disponibilidade?';
  }
  async function verifyAdminCredentials(username, password) {
    // Conveniência LOCAL solicitada: o modo edição não é autenticação de servidor.
    // Comparação exata, inclusive maiúsculas e espaços. Nenhuma senha é persistida.
    return username === 'usenandaboutique' && password === 'Nanda100239';
  }
  return { KEYS, CATEGORIES, PAYMENTS, DEFAULT_PRODUCTS, DEFAULT_STORY, cleanText, normalizeEmail, normalizeCPF, parseSizes, productHasSize, cartKey, normalizeProduct, loadProducts, normalizeReview, loadReviews, normalizeProfile, normalizeCart, buildWhatsAppMessage, verifyAdminCredentials };
})();

function initBoutique() {
  const D = BoutiqueData, byId = id => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = matchMedia('(forced-colors: active)');
  const memory = new Map();
  function read(key) { if (memory.has(key)) return memory.get(key); try { return localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); memory.delete(key); return true; } catch { memory.set(key, value); byId('storageNotice').hidden = false; return false; } }
  function parse(value, fallback = null) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  let products = D.loadProducts(read(D.KEYS.products));
  let reviews = D.loadReviews(read(D.KEYS.reviews));
  let profile = D.normalizeProfile(parse(read(D.KEYS.profile)));
  if (read(D.KEYS.role) !== null) profile.role = read(D.KEYS.role) === 'admin' ? 'admin' : profile.email && read(D.KEYS.role) === 'customer' ? 'customer' : 'guest';
  const makeToken = () => globalThis.crypto?.randomUUID?.() || 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  let guestOwner = D.cleanText(read(D.KEYS.reviewOwner), 100) || makeToken();
  write(D.KEYS.reviewOwner, guestOwner);
  const reviewOwner = () => profile.role === 'customer' ? profile.ownerId : guestOwner;
  let story = D.cleanText(read(D.KEYS.story), 4000) || D.DEFAULT_STORY;
  const oldCart = read(D.KEYS.cart) ?? read('nanda-boutique-sacola-v3') ?? read('nanda-boutique-sacola-v2') ?? read('nanda-boutique-sacola-v1');
  let cart = D.normalizeCart(parse(oldCart, []), products);
  let selectedCategory = 'Todos os Looks', toastTimer, pendingDelete = null;
  const bag = byId('shoppingBag'), payment = byId('paymentMethod'), checkout = byId('checkoutButton');
  const flights = new Set(), petalTimers = new Map(), returnFocus = new WeakMap();
  let bagAnimation;
  const motionAllowed = () => !reducedMotion.matches && !forcedColors.matches && !document.hidden && !document.querySelector('dialog[open]');
  function notify(text) { clearTimeout(toastTimer); const toast = byId('toast'); toast.textContent = text; toast.classList.add('show'); toastTimer = setTimeout(() => { toast.classList.remove('show'); toast.textContent = ''; }, 4500); }
  function saveProfile() { write(D.KEYS.profile, JSON.stringify(profile)); write(D.KEYS.role, profile.role); syncProfile(); renderProducts(); renderReviews(); }
  function syncProfile() {
    const admin = profile.role === 'admin', signedIn = profile.role !== 'guest';
    document.body.classList.toggle('editing-mode', admin);
    byId('adminToggle').hidden = !admin;
    document.querySelectorAll('.edit-pencil').forEach(button => { button.hidden = !admin; });
    byId('accountLabel').textContent = admin ? 'Nanda · Editar' : signedIn ? (profile.name.split(' ')[0] || 'Minha conta') : 'Entrar / Cadastrar';
    byId('accountSession').hidden = !signedIn; byId('accountForms').hidden = signedIn; byId('accountAdmin').hidden = !admin;
    byId('accountSessionLabel').textContent = admin ? 'Modo Edição ativo. Cuide de cada detalhe da boutique.' : 'Olá, ' + (profile.name || 'cliente') + '! Sua conta de demonstração está ativa neste navegador.';
    byId('reviewEmail').value = profile.email;
  }
  function clearFormError(id) { byId(id).textContent = ''; byId(id).hidden = true; }
  function formError(id, message, field) { byId(id).textContent = message; byId(id).hidden = false; field?.focus(); }
  function openDialog(id, trigger = document.activeElement) {
    cancelFlights();
    const dialog = byId(id);
    returnFocus.set(dialog, trigger);
    for (const other of document.querySelectorAll('dialog[open]')) if (other !== dialog) other.close();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open');
    BoutiqueMedia.refresh();
  }
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('close', () => {
      if (document.querySelector('dialog[open]')) return;
      document.body.classList.remove('modal-open');
      const target = returnFocus.get(dialog);
      if (target?.isConnected && !target.closest('dialog')) target.focus({ preventScroll: true });
      BoutiqueMedia.refresh();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const targets = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not([type=hidden]),textarea,select,[tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden]'));
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  }
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => byId(button.dataset.close).close()));
  function selectAuthTab(tab, focus = false) {
    document.querySelectorAll('[data-auth-tab]').forEach(button => { const active = button.dataset.authTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
    byId('loginPanel').hidden = tab !== 'login'; byId('registerPanel').hidden = tab !== 'register';
    clearFormError('loginError'); clearFormError('registerError');
  }
  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.addEventListener('click', () => selectAuthTab(button.dataset.authTab));
    button.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); selectAuthTab(event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : button.dataset.authTab === 'login' ? 'register' : 'login', true); } });
  });
  byId('accountToggle').addEventListener('click', event => { selectAuthTab('login'); syncProfile(); openDialog('loginModal', event.currentTarget); });
  byId('anonymousContinue').addEventListener('click', () => { profile = D.normalizeProfile({ role: 'guest' }); saveProfile(); byId('loginModal').close(); notify('Fique à vontade para explorar a coleção.'); });
  function openAdminAccess(event) { if (profile.role === 'admin') { renderAdmin(); byId('adminStory').value = story; openDialog('adminModal', event.currentTarget.closest('dialog') ? byId('adminToggle') : event.currentTarget); } else { selectAuthTab('login'); openDialog('loginModal', event.currentTarget); } }
  byId('adminToggle').addEventListener('click', openAdminAccess);
  byId('accountAdmin').addEventListener('click', openAdminAccess);
  function loadAccounts() {
    const rows = parse(read(D.KEYS.accounts), []);
    return Array.isArray(rows) ? rows.filter(row => row && D.normalizeEmail(row.email) && typeof row.salt === 'string' && /^[a-f0-9]{64}$/.test(row.passwordHash) && typeof row.ownerId === 'string').slice(0, 100) : [];
  }
  async function passwordHash(password, salt) {
    if (!globalThis.crypto?.subtle) throw new Error('secure-context');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bytes = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  byId('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = byId('loginSubmit');
    if (submit.disabled) return;
    clearFormError('loginError'); submit.disabled = true;
    try {
      const username = byId('adminUsername').value, password = byId('adminPassword').value;
      const accepted = await D.verifyAdminCredentials(username, password);
      const account = !accepted && loadAccounts().find(row => row.email === D.normalizeEmail(username));
      const customerAccepted = account && await passwordHash(password, account.salt) === account.passwordHash;
      byId('adminPassword').value = '';
      if (!byId('loginModal').open || byId('loginPanel').hidden) return;
      if (!accepted && !customerAccepted) { formError('loginError', 'Usuário ou senha incorretos. Confira os dados e tente novamente.', byId('adminPassword')); return; }
      profile = D.normalizeProfile(accepted ? { role: 'admin', name: 'Nanda' } : { role: 'customer', email: account.email, name: account.name, ownerId: account.ownerId }); saveProfile();
      byId('loginModal').close(); notify(accepted ? 'Modo Edição ativo. Use os lápis para personalizar a boutique.' : 'Bem-vinda de volta, ' + (profile.name || 'cliente') + '!');
    } catch { formError('loginError', 'Não foi possível entrar. Abra o site por localhost ou HTTPS para usar as contas locais.', byId('adminUsername')); }
    finally { submit.disabled = false; byId('adminPassword').value = ''; }
  });
  byId('registerForm').addEventListener('submit', async event => {
    event.preventDefault(); clearFormError('registerError');
    const submit = event.currentTarget.querySelector('[type="submit"]'); if (submit.disabled) return;
    const name = D.cleanText(byId('registerName').value, 80), email = D.normalizeEmail(byId('registerEmail').value), cpf = D.normalizeCPF(byId('registerCPF').value), password = byId('registerPassword').value;
    if (name.length < 2 || !email || !cpf || password.length < 8) { formError('registerError', 'Informe nome, e-mail, CPF com 11 dígitos e uma senha de pelo menos 8 caracteres.'); return; }
    if (loadAccounts().some(row => row.email === email)) { formError('registerError', 'Este e-mail já tem uma conta neste navegador. Use a aba Entrar.', byId('registerEmail')); return; }
    submit.disabled = true;
    try {
      const salt = makeToken(), hash = await passwordHash(password, salt);
      if (!byId('loginModal').open || byId('registerPanel').hidden) return;
      const accounts = loadAccounts();
      if (accounts.some(row => row.email === email)) { formError('registerError', 'Este e-mail já foi cadastrado. Use a aba Entrar.'); return; }
      if (accounts.length >= 100) { formError('registerError', 'O limite de contas locais foi atingido neste navegador.'); return; }
      const account = { name, email, salt, passwordHash: hash, ownerId: makeToken() };
      accounts.push(account); const saved = write(D.KEYS.accounts, JSON.stringify(accounts));
      profile = D.normalizeProfile({ role: 'customer', ...account }); saveProfile(); byId('registerForm').reset(); byId('loginModal').close();
      notify(saved ? 'Conta de demonstração criada neste navegador. Bem-vinda!' : 'Conta disponível nesta aba. Não foi possível salvar no navegador.');
    } catch { formError('registerError', 'Abra o site por localhost ou HTTPS para criar sua conta de demonstração.'); }
    finally { submit.disabled = false; byId('registerPassword').value = ''; byId('registerCPF').value = ''; }
  });
  byId('loginModal').addEventListener('close', () => { byId('adminPassword').value = ''; byId('registerPassword').value = ''; byId('registerCPF').value = ''; });
  function logout() { profile = D.normalizeProfile({ role: 'guest' }); saveProfile(); document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); byId('accountToggle').focus({ preventScroll: true }); notify('Sessão encerrada. Continue explorando a boutique.'); }
  byId('adminLogout').addEventListener('click', logout); byId('accountLogout').addEventListener('click', logout);

  function renderProducts(category = selectedCategory) {
    selectedCategory = category;
    BoutiqueMedia.clear();
    document.querySelectorAll('.category-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
    const filtered = products.filter(p => category === 'Todos os Looks' || p.categoria === category);
    const fragment = document.createDocumentFragment();
    for (const product of filtered) {
      const card = node('article', 'product-card'); card.dataset.id = product.id; card.setAttribute('aria-labelledby', 'product-title-' + product.id);
      card.append(createMediaCarousel(product));
      if (product.esgotado) card.append(node('span', 'sold-out-badge', 'Esgotado'));
      const content = node('div', 'product-content'), title = node('h3', 'product-title', product.nome), bottom = node('div', 'product-bottom');
      title.id = 'product-title-' + product.id;
      const field = node('div', 'product-size-field'), label = node('label', '', 'Escolher Tamanho'), select = node('select', 'product-size-select'), feedback = node('p', 'size-feedback');
      select.id = 'product-size-' + product.id; select.required = true; label.htmlFor = select.id;
      feedback.id = 'size-feedback-' + product.id; feedback.setAttribute('aria-live', 'polite'); select.setAttribute('aria-describedby', feedback.id);
      const placeholder = node('option', '', 'Escolha seu tamanho'); placeholder.value = ''; select.append(placeholder);
      for (const size of D.parseSizes(product.tamanhos)) { const option = node('option', '', size + (D.productHasSize(product, size) ? '' : ' · Indisponível')); option.value = size; select.append(option); }
      select.disabled = !D.parseSizes(product.tamanhos).length;
      const action = node('button', 'primary-btn product-action', 'Adicionar à Sacola'); action.type = 'button'; action.dataset.id = product.id;
      const restock = node('a', 'secondary-btn restock-btn', 'Avisar quando chegar'); restock.target = '_blank'; restock.rel = 'noopener noreferrer';
      function updateSizeAction() {
        const unavailable = product.esgotado || !D.parseSizes(product.tamanhos).some(size => D.productHasSize(product, size)) || (select.value && !D.productHasSize(product, select.value));
        action.hidden = !!unavailable; restock.hidden = !unavailable;
        action.setAttribute('aria-label', 'Adicionar à Sacola: ' + product.nome + (select.value ? ', tamanho ' + select.value : ''));
        feedback.textContent = unavailable ? 'Vamos consultar a reposição desta peça com a loja.' : '';
        select.removeAttribute('aria-invalid');
        restock.href = whatsappURL('Olá Nanda Boutique! Gostaria de ser avisada quando a peça ' + product.nome + (select.value ? ' - Tamanho ' + select.value : '') + ' estiver disponível. Poderia me avisar quando chegar?');
      }
      select.addEventListener('change', updateSizeAction); updateSizeAction();
      field.append(label, select, feedback); bottom.append(action, restock);
      content.append(title);
      if (product.descricao) content.append(node('p', 'product-description', product.descricao));
      content.append(node('p', 'product-price', product.preco === null ? 'Consulte o valor com a loja' : product.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })), field, bottom);
      if (profile.role === 'admin') { const edit = node('button', 'edit-pencil product-edit', '✎'); edit.type = 'button'; edit.dataset.editProduct = product.id; edit.setAttribute('aria-label', 'Editar produto: ' + product.nome); card.append(edit); }
      card.append(content); fragment.append(card);
    }
    byId('productsGrid').replaceChildren(fragment); byId('collectionEmpty').hidden = filtered.length > 0;
    byId('catalogStatus').textContent = filtered.length ? filtered.length + (filtered.length === 1 ? ' peça' : ' peças') + ' · ' + category : '';
    BoutiqueMedia.observe(byId('productsGrid'));
  }
  document.querySelector('.category-nav').addEventListener('click', event => { const button = event.target.closest('button[data-category]'); if (button) renderProducts(button.dataset.category); });
  function clearPaymentError() { byId('paymentError').hidden = true; payment.removeAttribute('aria-invalid'); payment.setAttribute('aria-describedby', 'paymentHint'); byId('paymentStep').classList.remove('has-error'); }
  function syncCheckout() {
    const message = D.buildWhatsAppMessage(cart, products, payment.value);
    checkout.tabIndex = cart.length ? 0 : -1;
    checkout.setAttribute('aria-disabled', String(!cart.length));
    if (message) checkout.href = whatsappURL(message); else checkout.removeAttribute('href');
  }
  function thumbnail(product, className) {
    const image = node('img', className);
    image.src = product.midias.find(src => !productVideoURL(src, product)) || './img/sacola-carrinho.png';
    image.alt = ''; image.width = 70; image.height = 94; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { image.src = './img/sacola-carrinho.png'; }, { once: true });
    return image;
  }
  function saveCart() { write(D.KEYS.cart, JSON.stringify(cart)); }
  function renderCart(announce = false) {
    cart = D.normalizeCart(cart, products);
    const count = cart.reduce((n, item) => n + item.quantity, 0);
    byId('bagCount').textContent = count; bag.setAttribute('aria-label', 'Abrir sacola: ' + count + (count === 1 ? ' item' : ' itens'));
    byId('emptyCart').hidden = count > 0; byId('checkoutSummary').hidden = !count;
    byId('cartCountSummary').textContent = count + (count === 1 ? ' peça na sua lista' : ' peças na sua lista');
    if (!count) { payment.value = ''; clearPaymentError(); }
    syncCheckout();
    if (announce) byId('cartStatus').textContent = count + (count === 1 ? ' peça na sacola.' : ' peças na sacola.');
    const fragment = document.createDocumentFragment();
    for (const item of cart) {
      const product = products.find(p => p.id === item.id), line = node('li', 'cart-item'), details = node('div', 'cart-details'), controls = node('div', 'cart-controls'), quantity = node('div', 'quantity-controls');
      line.dataset.key = D.cartKey(item);
      details.append(node('h3', '', product.nome), node('p', 'cart-item-note', 'Tamanho: ' + item.size));
      if (product.preco !== null) details.append(node('p', 'cart-item-note', product.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' por peça'));
      for (const delta of [-1, 1]) {
        const button = node('button', '', delta < 0 ? '−' : '+'); button.type = 'button'; button.dataset.key = D.cartKey(item); button.dataset.change = delta; button.disabled = delta > 0 && item.quantity >= 99;
        button.setAttribute('aria-label', (delta < 0 ? 'Diminuir' : 'Aumentar') + ' quantidade de ' + product.nome + ', tamanho ' + item.size); quantity.append(button);
        if (delta < 0) { const amount = node('span', '', item.quantity); amount.setAttribute('aria-label', item.quantity + ' unidades'); quantity.append(amount); }
      }
      const remove = node('button', 'remove-item', 'Remover'); remove.type = 'button'; remove.dataset.key = D.cartKey(item); remove.dataset.remove = 'true'; remove.setAttribute('aria-label', 'Remover ' + product.nome + ', tamanho ' + item.size);
      controls.append(quantity, remove); line.append(thumbnail(product, 'cart-thumbnail'), details, controls); fragment.append(line);
    }
    byId('cartItems').replaceChildren(fragment);
  }
  byId('productsGrid').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-product]');
    if (edit) { if (adminAllowed()) { renderAdmin(); openDialog('adminModal', byId('adminToggle')); editProduct(Number(edit.dataset.editProduct)); } return; }
    const action = event.target.closest('.product-action'); if (!action || action.disabled) return;
    const product = products.find(p => p.id === Number(action.dataset.id)); if (!product || product.esgotado) return;
    const select = byId('product-size-' + product.id), size = select.value;
    if (!D.productHasSize(product, size)) { byId('size-feedback-' + product.id).textContent = 'Escolha um tamanho disponível antes de adicionar à sacola.'; select.setAttribute('aria-invalid', 'true'); select.focus(); return; }
    const existing = cart.find(item => item.id === product.id && item.size === size);
    if (existing?.quantity >= 99) { notify('Você já adicionou 99 unidades desta peça.'); return; }
    if (existing) existing.quantity++; else cart.push({ id: product.id, size, quantity: 1 });
    saveCart(); renderCart(); celebrate(action); notify(product.nome + ' · Tamanho ' + size + ' na sacola.');
  });
  byId('cartItems').addEventListener('click', event => {
    const button = event.target.closest('button[data-key]'); if (!button || button.disabled) return;
    const item = cart.find(row => D.cartKey(row) === button.dataset.key); if (!item) return;
    item.quantity = button.dataset.remove ? 0 : Math.min(99, item.quantity + Number(button.dataset.change));
    cart = cart.filter(row => row.quantity > 0); saveCart(); renderCart(true);
    const equivalent = [...byId('cartItems').querySelectorAll('button')].find(b => b.dataset.key === button.dataset.key && b.dataset.change === button.dataset.change && b.dataset.remove === button.dataset.remove && !b.disabled);
    (equivalent || byId('cartItems').querySelector('button') || byId('continueShopping')).focus();
  });
  bag.addEventListener('click', event => openDialog('checkoutModal', event.currentTarget));
  byId('continueShopping').addEventListener('click', () => { returnFocus.set(byId('checkoutModal'), byId('colecao')); byId('checkoutModal').close(); byId('colecao').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' }); });
  payment.addEventListener('change', () => { if (D.PAYMENTS.includes(payment.value)) clearPaymentError(); syncCheckout(); });
  function validateCheckout(event) {
    const valid = D.normalizeCart(cart, products);
    if (JSON.stringify(valid) !== JSON.stringify(cart)) { event.preventDefault(); cart = valid; saveCart(); renderCart(true); notify('A disponibilidade mudou. Confira sua sacola antes de continuar.'); return; }
    if (!cart.length) { event.preventDefault(); syncCheckout(); return; }
    if (!D.PAYMENTS.includes(payment.value)) {
      event.preventDefault(); syncCheckout(); byId('paymentError').hidden = false; payment.setAttribute('aria-invalid', 'true'); payment.setAttribute('aria-describedby', 'paymentHint paymentError'); byId('paymentStep').classList.add('has-error'); payment.focus(); payment.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return;
    }
    clearPaymentError(); syncCheckout();
  }
  checkout.addEventListener('click', validateCheckout); checkout.addEventListener('auxclick', validateCheckout);
  checkout.addEventListener('keydown', event => { if (event.key === ' ' || (event.key === 'Enter' && !checkout.hasAttribute('href'))) { event.preventDefault(); checkout.click(); } });
  // Administração local: cada mutação verifica o perfil da visita atual.
  function adminAllowed() { if (profile.role === 'admin') return true; byId('adminModal').close(); byId('contentEditorModal').close(); notify('Entre na sua conta da Nanda para editar a boutique.'); return false; }
  function nextId(rows) { let id = Date.now(); while (rows.some(row => row.id === id)) id++; return id; }
  function resetProductForm() { byId('productForm').reset(); byId('editingProductId').value = ''; byId('productFormTitle').textContent = 'Adicionar novo produto'; byId('saveProduct').textContent = 'Adicionar produto'; byId('cancelProductEdit').hidden = true; clearFormError('productError'); }
  function renderAdmin() {
    if (profile.role !== 'admin') return;
    const fragment = document.createDocumentFragment();
    for (const product of products) {
      const line = node('li', 'admin-product'), details = node('div'), actions = node('div', 'form-actions');
      details.append(node('h4', '', product.nome), node('p', '', product.esgotado ? 'Esgotado' : 'Disponível'));
      if (product.preco !== null) details.append(node('p', '', product.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })));
      for (const [action, label] of [['edit', 'Editar'], ['stock', product.esgotado ? 'Disponibilizar' : 'Marcar esgotado'], ['delete', 'Excluir']]) {
        const button = node('button', 'secondary-btn', label); button.type = 'button'; button.dataset.adminAction = action; button.dataset.id = product.id; button.setAttribute('aria-label', label + ': ' + product.nome); actions.append(button);
      }
      line.append(thumbnail(product, ''), details, actions); fragment.append(line);
    }
    if (!products.length) fragment.append(node('li', '', 'Sua coleção ainda não tem peças. Adicione a primeira acima.'));
    byId('adminProducts').replaceChildren(fragment);
  }
  function commitProducts(message) {
    const saved = write(D.KEYS.products, JSON.stringify(products));
    const previousCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cart = D.normalizeCart(cart, products); saveCart(); renderProducts(); renderCart(); renderAdmin();
    pendingDelete = null; byId('deletePrompt').hidden = true;
    const removed = cart.reduce((sum, item) => sum + item.quantity, 0) < previousCount;
    byId('adminStatus').textContent = message + (removed ? ' As peças indisponíveis foram retiradas da sacola.' : '') + (saved ? '' : ' Esta alteração está apenas nesta aba; não foi possível salvá-la.');
  }
  byId('productForm').addEventListener('submit', event => {
    event.preventDefault(); if (!adminAllowed()) return;
    clearFormError('productError');
    const media = byId('productMedia').value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    const tipoMidia = byId('productMediaType').value;
    if (!media.length || media.length > 8 || media.some(v => !normalizeMediaURL(v, tipoMidia))) { formError('productError', 'Use de 1 a 8 links diretos de imagens ou vídeos, um por linha. Para links HTTPS sem extensão, escolha Foto ou Vídeo.', byId('productMedia')); return; }
    const sizes = D.parseSizes(byId('productSizes').value), unavailable = D.parseSizes(byId('productUnavailableSizes').value);
    if (!sizes.length || unavailable.some(size => !sizes.includes(size))) { formError('productError', 'Informe os tamanhos da peça. Os indisponíveis precisam fazer parte dessa lista.', byId('productSizes')); return; }
    const priceText = byId('productPrice').value.trim();
    if (priceText && !/^\d{1,8}(?:[.,]\d{1,2})?$/.test(priceText)) { formError('productError', 'Informe um valor como 169,90 ou deixe o preço em branco.', byId('productPrice')); return; }
    const editingId = Number(byId('editingProductId').value);
    if (editingId && !products.some(p => p.id === editingId)) { formError('productError', 'Essa peça foi removida em outra aba. Cancele a edição e cadastre uma nova peça.'); return; }
    const product = D.normalizeProduct({ id: editingId || nextId(products), nome: byId('productName').value, descricao: byId('productDescription').value, categoria: byId('productCategory').value, tamanhos: byId('productSizes').value, tamanhosIndisponiveis: byId('productUnavailableSizes').value, tipoMidia, preco: priceText ? Number(priceText.replace(',', '.')) : null, midias: media, esgotado: byId('productSoldOut').checked });
    if (!product) { formError('productError', 'Confira o nome da peça e o preço. Use um valor de zero a 10.000.000.', byId('productName')); return; }
    if (!editingId && products.length >= 100) { formError('productError', 'Esta coleção já tem 100 peças. Remova uma peça antes de adicionar outra.'); return; }
    if (editingId) products = products.map(p => p.id === editingId ? product : p); else products.push(product);
    commitProducts(editingId ? 'Peça atualizada.' : 'Nova peça adicionada à coleção.'); resetProductForm(); byId('productName').focus();
  });
  byId('cancelProductEdit').addEventListener('click', () => { resetProductForm(); byId('productName').focus(); });
  function editProduct(id) {
    const product = products.find(p => p.id === id); if (!product || !adminAllowed()) return;
    byId('editingProductId').value = product.id; byId('productName').value = product.nome; byId('productMedia').value = product.midias.join('\n'); byId('productDescription').value = product.descricao; byId('productCategory').value = product.categoria; byId('productSizes').value = product.tamanhos; byId('productUnavailableSizes').value = product.tamanhosIndisponiveis; byId('productMediaType').value = product.tipoMidia; byId('productPrice').value = product.preco == null ? '' : String(product.preco).replace('.', ','); byId('productSoldOut').checked = product.esgotado;
    byId('productFormTitle').textContent = 'Editar produto'; byId('saveProduct').textContent = 'Salvar alterações'; byId('cancelProductEdit').hidden = false; clearFormError('productError'); byId('productName').focus();
  }
  byId('adminProducts').addEventListener('click', event => {
    const button = event.target.closest('button[data-admin-action]'); if (!button || !adminAllowed()) return;
    const product = products.find(p => p.id === Number(button.dataset.id)); if (!product) return;
    if (button.dataset.adminAction === 'edit') {
      editProduct(product.id);
    } else if (button.dataset.adminAction === 'stock') {
      product.esgotado = !product.esgotado; commitProducts(product.esgotado ? 'Peça marcada como esgotada.' : 'Peça disponível novamente.');
      byId('adminProducts').querySelector('[data-id="' + product.id + '"][data-admin-action="stock"]')?.focus();
    } else {
      pendingDelete = product.id; byId('deletePromptText').textContent = 'Excluir “' + product.nome + '” da coleção e da sacola deste navegador?'; byId('deletePrompt').hidden = false; byId('cancelDelete').focus();
    }
  });
  byId('cancelDelete').addEventListener('click', () => { const trigger = byId('adminProducts').querySelector('[data-id="' + pendingDelete + '"][data-admin-action="delete"]'); pendingDelete = null; byId('deletePrompt').hidden = true; trigger?.focus(); });
  byId('confirmDelete').addEventListener('click', () => {
    if (!adminAllowed() || pendingDelete === null) return;
    if (Number(byId('editingProductId').value) === pendingDelete) resetProductForm();
    products = products.filter(p => p.id !== pendingDelete); commitProducts('Peça excluída da coleção.'); (byId('adminProducts').querySelector('button') || byId('productName')).focus();
  });
  byId('storyForm').addEventListener('submit', event => {
    event.preventDefault(); if (!adminAllowed()) return;
    const value = D.cleanText(byId('adminStory').value, 4000);
    if (!value) { byId('adminStatus').textContent = 'Escreva a história antes de salvar.'; byId('adminStory').focus(); return; }
    story = value; const saved = write(D.KEYS.story, story); byId('storyText').textContent = story; byId('adminStatus').textContent = saved ? 'Nossa história foi atualizada.' : 'Texto atualizado nesta aba. Não foi possível salvar no navegador.';
  });
  byId('adminModal').addEventListener('close', () => { pendingDelete = null; byId('deletePrompt').hidden = true; });

  // CMS de textos e imagens: chaves permitidas vêm exclusivamente do HTML da loja.
  const editableElements = new Map([...document.querySelectorAll('[data-edit-key]')].map(element => [element.dataset.editKey, element]));
  const contentDefaults = Object.fromEntries([...editableElements].map(([key, element]) => [key, element.dataset.editType === 'image' ? element.getAttribute('src') : element.innerText]));
  const contentDefaultNodes = new Map([...editableElements].map(([key, element]) => [key, [...element.childNodes].map(child => child.cloneNode(true))]));
  let content = {}, editingContentKey = '';
  function normalizeContentValue(key, value) {
    const element = editableElements.get(key); if (!element) return '';
    const type = element.dataset.editType, text = D.cleanText(value, type === 'image' ? 2000 : 4000);
    if (type === 'image') { const url = normalizeMediaURL(text, 'image'); return url && !isVideoURL(url) ? url : ''; }
    if (type === 'phone') return /^\+?[\d\s().-]+$/.test(text) && /^\d{10,15}$/.test(text.replace(/\D/g, '')) ? text : '';
    if (type === 'instagram') return /^@?[a-z0-9._]{1,30}$/i.test(text) ? text : '';
    return text;
  }
  function loadContent() {
    const raw = parse(read(D.KEYS.content), {}); content = {};
    for (const key of editableElements.keys()) { const value = normalizeContentValue(key, raw?.[key]); if (value) content[key] = value; }
  }
  function phoneNumber() { const raw = (content.contactPhone || contentDefaults.contactPhone || '5511989423365').replace(/\D/g, ''); return raw.length <= 11 ? '55' + raw : raw; }
  function whatsappURL(message = '') { return 'https://wa.me/' + phoneNumber() + (message ? '?text=' + encodeURIComponent(message) : ''); }
  function applyContent() {
    for (const [key, element] of editableElements) {
      const value = key === 'story' ? story : content[key] || contentDefaults[key];
      if (element.dataset.editType === 'image') element.src = value;
      else if (Object.hasOwn(content, key) || key === 'story') element.textContent = value;
      else element.replaceChildren(...contentDefaultNodes.get(key).map(child => child.cloneNode(true)));
    }
    document.querySelectorAll('a[href]').forEach(link => {
      if (/^https:\/\/wa\.me\//.test(link.href)) { const message = new URL(link.href).searchParams.get('text') || ''; link.href = whatsappURL(message); }
      if (/^https:\/\/www\.instagram\.com\//.test(link.href)) link.href = 'https://www.instagram.com/' + (content.contactInstagram || contentDefaults.contactInstagram || 'usenandaboutique').replace(/^@/, '') + '/';
    });
    byId('adminStory').value = story; syncCheckout();
  }
  loadContent();
  for (const [key, element] of editableElements) {
    const image = element.dataset.editType === 'image', anchor = element.closest('a'), target = anchor || element;
    const wrapper = node('div', image ? 'editable-image' : 'editable-field'); target.before(wrapper); wrapper.append(target);
    const pencil = node('button', 'edit-pencil', '✎'); pencil.type = 'button'; pencil.hidden = profile.role !== 'admin'; pencil.dataset.editContent = key; pencil.setAttribute('aria-label', 'Editar ' + (element.dataset.editLabel || key)); pencil.setAttribute('aria-haspopup', 'dialog'); pencil.setAttribute('aria-controls', 'contentEditorModal'); wrapper.append(pencil);
    pencil.addEventListener('click', () => {
      if (!adminAllowed()) return;
      editingContentKey = key; byId('contentEditorTitle').textContent = 'Editar ' + (element.dataset.editLabel || 'conteúdo');
      byId('contentEditorLabel').textContent = image ? 'URL da imagem' : element.dataset.editType === 'phone' ? 'WhatsApp com DDD (e código do país, se necessário)' : element.dataset.editType === 'instagram' ? 'Usuário do Instagram' : 'Texto';
      byId('contentEditorValue').value = key === 'story' ? story : content[key] || contentDefaults[key]; clearFormError('contentEditorError'); openDialog('contentEditorModal', pencil); byId('contentEditorValue').focus();
    });
  }
  byId('contentEditorForm').addEventListener('submit', event => {
    event.preventDefault(); if (!adminAllowed()) return;
    const value = normalizeContentValue(editingContentKey, byId('contentEditorValue').value);
    if (!value) { formError('contentEditorError', 'Confira o conteúdo. Use uma imagem local ou HTTPS, um telefone com DDD ou um usuário de Instagram válido para o campo correspondente.', byId('contentEditorValue')); return; }
    loadContent(); content[editingContentKey] = value;
    let saved = true;
    if (editingContentKey === 'story') { story = value; saved = write(D.KEYS.story, value); }
    saved = write(D.KEYS.content, JSON.stringify(content)) && saved;
    applyContent(); byId('contentEditorModal').close(); notify(saved ? 'Alteração salva neste navegador.' : 'Alteração aplicada nesta aba. Não foi possível salvar no navegador.');
  });
  byId('contentEditorModal').addEventListener('close', () => { editingContentKey = ''; });

  // Depoimentos: uma avaliação por e-mail, autoria local independente do texto público.
  const reviewTrack = byId('reviewTrack');
  let reviewScrollFrame = 0;
  function reviewMetrics() { const first = reviewTrack.firstElementChild; return { step: (first?.getBoundingClientRect().width || 1) + 24, max: Math.max(0, reviewTrack.scrollWidth - reviewTrack.clientWidth) }; }
  function updateReviewNavigation() {
    const { step, max } = reviewMetrics();
    const index = Math.min(Math.max(0, reviews.length - 1), Math.round(reviewTrack.scrollLeft / step));
    byId('reviewPosition').textContent = reviews.length ? (index + 1) + ' de ' + reviews.length : '';
    byId('reviewPrevious').setAttribute('aria-disabled', String(reviewTrack.scrollLeft <= 1)); byId('reviewNext').setAttribute('aria-disabled', String(reviewTrack.scrollLeft >= max - 1));
  }
  function renderReviews() {
    const fragment = document.createDocumentFragment();
    for (const review of reviews) {
      const card = node('article', 'review-card'), stars = node('p', 'review-stars', '★'.repeat(review.estrelas) + '☆'.repeat(5 - review.estrelas));
      stars.setAttribute('aria-label', review.estrelas + ' de 5 estrelas');
      card.append(stars, node('p', 'review-comment', review.comentario));
      if (review.ownerId && review.ownerId === reviewOwner()) { const remove = node('button', 'text-button review-delete', 'Excluir minha avaliação'); remove.type = 'button'; remove.dataset.reviewId = review.id; card.append(remove); }
      fragment.append(card);
    }
    reviewTrack.replaceChildren(fragment); reviewTrack.hidden = !reviews.length; byId('reviewsEmpty').hidden = !!reviews.length; byId('reviewNavigation').hidden = reviews.length < 2; reviewTrack.scrollLeft = 0; updateReviewNavigation();
  }
  const moveReview = delta => { const { step, max } = reviewMetrics(); reviewTrack.scrollTo({ left: Math.max(0, Math.min(max, reviewTrack.scrollLeft + delta * step)), behavior: reducedMotion.matches ? 'instant' : 'smooth' }); };
  byId('reviewPrevious').addEventListener('click', () => moveReview(-1)); byId('reviewNext').addEventListener('click', () => moveReview(1));
  reviewTrack.addEventListener('scroll', () => { if (!reviewScrollFrame) reviewScrollFrame = requestAnimationFrame(() => { reviewScrollFrame = 0; updateReviewNavigation(); }); }, { passive: true });
  reviewTrack.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveReview(event.key === 'ArrowLeft' ? -1 : 1); } });
  byId('writeReview').addEventListener('click', event => { byId('reviewEmail').value = profile.email; clearFormError('reviewError'); openDialog('reviewModal', event.currentTarget); });
  byId('reviewForm').addEventListener('submit', event => {
    event.preventDefault(); clearFormError('reviewError');
    const email = D.normalizeEmail(byId('reviewEmail').value);
    if (!email) { formError('reviewError', 'Informe um e-mail válido para registrar sua avaliação.', byId('reviewEmail')); return; }
    if (profile.role === 'customer' && email !== profile.email) { formError('reviewError', 'Use o e-mail da sua conta para identificar sua própria avaliação.', byId('reviewEmail')); return; }
    if (!D.normalizeCPF(byId('reviewCPF').value)) { formError('reviewError', 'Informe seu CPF com 11 dígitos para a futura validação.', byId('reviewCPF')); return; }
    reviews = D.loadReviews(read(D.KEYS.reviews));
    if (reviews.some(review => review.email === email)) { formError('reviewError', 'Este e-mail já tem uma avaliação. Você pode excluir sua própria avaliação antes de escrever outra.', byId('reviewEmail')); return; }
    const checked = byId('reviewForm').querySelector('input[name="rating"]:checked');
    const review = D.normalizeReview({ id: nextId(reviews), estrelas: Number(checked?.value), comentario: byId('reviewComment').value, criadoEm: Date.now(), email, ownerId: reviewOwner(), cpfInformado: true });
    if (!review) { formError('reviewError', 'Escolha de 1 a 5 estrelas e escreva um comentário com pelo menos 3 caracteres.', checked || byId('reviewComment')); return; }
    if (reviews.length >= 200) { formError('reviewError', 'Este navegador já tem 200 avaliações salvas. Agradecemos todo esse carinho!'); return; }
    reviews.unshift(review); const saved = write(D.KEYS.reviews, JSON.stringify(reviews)); renderReviews(); byId('reviewForm').reset(); byId('reviewModal').close(); notify(saved ? 'Seu carinho ficou registrado. Obrigada pela avaliação!' : 'Avaliação exibida nesta aba. Não foi possível salvá-la no navegador.');
  });
  byId('reviewModal').addEventListener('close', () => { byId('reviewCPF').value = ''; });
  reviewTrack.addEventListener('click', event => {
    const button = event.target.closest('[data-review-id]'); if (!button) return;
    reviews = D.loadReviews(read(D.KEYS.reviews)); const review = reviews.find(row => row.id === Number(button.dataset.reviewId));
    if (!review?.ownerId || review.ownerId !== reviewOwner()) { renderReviews(); notify('Apenas a autora pode excluir esta avaliação neste navegador.'); return; }
    reviews = reviews.filter(row => row.id !== review.id); const saved = write(D.KEYS.reviews, JSON.stringify(reviews)); renderReviews(); byId('writeReview').focus({ preventScroll: true }); notify(saved ? 'Sua avaliação foi excluída.' : 'Avaliação removida nesta aba. Não foi possível salvar a exclusão.');
  });

  // Efeitos limitados e independentes da adição à sacola.
  function cancelFlights() { for (const animation of flights) animation.cancel(); flights.clear(); byId('flightLayer').replaceChildren(); bagAnimation?.cancel(); }
  function playFlight(element, frames, options, finish) {
    const animation = element.animate(frames, options); flights.add(animation);
    const clean = () => { flights.delete(animation); element.remove(); };
    animation.oncancel = clean; animation.onfinish = () => { clean(); if (motionAllowed()) finish?.(); }; return animation;
  }
  function celebrate(button) {
    if (!motionAllowed() || typeof button.animate !== 'function' || byId('flightLayer').querySelectorAll('.butterfly-courier').length >= 4) return;
    const start = button.getBoundingClientRect(), target = bag.querySelector('img').getBoundingClientRect();
    const from = { x: Math.max(58, Math.min(innerWidth - 58, start.left + start.width / 2)), y: Math.max(90, Math.min(innerHeight - 80, start.top - 40)) };
    const to = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
    const control = { x: Math.max(58, (from.x + to.x) / 2 - 60), y: Math.max(75, Math.min(from.y, to.y) - 70) };
    const point = t => ({ x: (1-t)**2 * from.x + 2*(1-t)*t*control.x + t*t*to.x, y: (1-t)**2*from.y + 2*(1-t)*t*control.y + t*t*to.y });
    const product = products.find(p => p.id === Number(button.dataset.id));
    const courier = node('div', 'butterfly-courier'), butterfly = node('span', 'courier-butterfly'), wings = node('img', 'courier-wings'), carriedProduct = thumbnail(product, 'courier-product');
    const activePhoto = button.closest('.product-card').querySelector('.media-slide[data-active="true"] img');
    if (activePhoto) carriedProduct.src = activePhoto.src;
    courier.setAttribute('aria-hidden', 'true'); wings.src = './img/logo-borboleta.png'; wings.alt = ''; wings.width = 833; wings.height = 432;
    butterfly.append(wings); courier.append(carriedProduct, butterfly); byId('flightLayer').append(courier);
    const frames = Array.from({ length: 41 }, (_, index) => { const t = index / 40, pos = point(t); return { transform: `translate(${pos.x - 58}px,${pos.y - 80}px) scale(${t < .8 ? 1 : 1 - (t-.8)*3.5}) rotate(${Math.sin(t*Math.PI*2)*7}deg)`, opacity: t === 0 || t === 1 ? 0 : Math.min(1,t*10,(1-t)*10), offset: t }; });
    playFlight(courier, frames, { duration: 2600, easing: 'linear', fill: 'both' }, () => {
      bagAnimation?.cancel(); bagAnimation = bag.querySelector('img').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: .5 }, { transform: 'scale(1)' }], { duration: 600 });
    });
    const available = 28 - byId('flightLayer').querySelectorAll('.flying-emoji').length;
    ['💍','👗','👠','👜','🌸','👗','🌸'].slice(0, Math.max(0,available)).forEach((glyph, index) => {
      const t = .12 + index * .105, pos = point(t), emoji = node('span', 'flying-emoji', glyph); byId('flightLayer').append(emoji);
      playFlight(emoji, [{ transform: `translate(${pos.x-12}px,${pos.y+25}px) scale(.4)`, opacity: 0 }, { transform: `translate(${pos.x-12}px,${pos.y+33}px) scale(.9)`, opacity: .8, offset: .25 }, { transform: `translate(${pos.x-24}px,${pos.y+60}px) scale(.5) rotate(18deg)`, opacity: 0 }], { duration: 800, delay: t * 2600, fill: 'both', easing: 'ease-out' });
    });
  }
  function clearPetals() { petalTimers.forEach(timer => clearTimeout(timer)); petalTimers.clear(); byId('fallingScene').replaceChildren(); }
  function dropPetals(right = false) {
    if (!motionAllowed()) return;
    const scene = byId('fallingScene');
    for (let i = 0; i < 2 && scene.children.length < 20; i++) {
      const particle = node('span', 'falling-particle' + (i ? ' particle-variant' : '')), sway = node('span', 'particle-sway'), crop = node('span', 'particle-crop'), image = node('img');
      const duration = 23000 + Math.random() * 9000;
      particle.style.setProperty('--left', (right ? 52 + Math.random() * 43 : 3 + Math.random() * 43) + '%'); particle.style.setProperty('--duration', duration + 'ms'); particle.style.setProperty('--drift', (right ? -1 : 1) * (40 + Math.random() * 80) + 'px'); particle.style.setProperty('--sway', '7s');
      image.src = './img/' + (i ? 'petalas-caindo-2.png' : 'petalas-caindo-1.png'); image.alt = ''; image.width = 283; image.height = 512; crop.append(image); sway.append(crop); particle.append(sway); scene.append(particle);
      const clean = () => { clearTimeout(petalTimers.get(particle)); petalTimers.delete(particle); particle.remove(); };
      particle.addEventListener('animationend', event => { if (event.target === particle) clean(); }); petalTimers.set(particle, setTimeout(clean, duration + 5000));
    }
  }
  // Fluxo contínuo com no máximo 20 pétalas; nenhuma decoração captura cliques.
  setInterval(() => { if (motionAllowed()) dropPetals(Math.random() > .5); }, 3800);
  window.addEventListener('pagehide', () => { cancelFlights(); clearPetals(); });
  document.addEventListener('visibilitychange', () => { document.body.classList.toggle('page-inactive', document.hidden); if (document.hidden) { cancelFlights(); clearPetals(); } else { dropPetals(false); dropPetals(true); } });
  function motionChanged() { if (reducedMotion.matches || forcedColors.matches) { cancelFlights(); clearPetals(); } else { dropPetals(false); dropPetals(true); } }
  reducedMotion.addEventListener('change', motionChanged); forcedColors.addEventListener('change', motionChanged);
  const measure = () => { document.documentElement.style.setProperty('--header-height', Math.ceil(document.querySelector('.store-header').getBoundingClientRect().height) + 'px'); updateReviewNavigation(); };
  if (typeof ResizeObserver === 'function') { const observer = new ResizeObserver(measure); observer.observe(document.querySelector('.store-header')); observer.observe(reviewTrack); } else window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('resize', cancelFlights, { passive: true });
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== null && !Object.values(D.KEYS).includes(event.key))) return;
    if (event.key === null) memory.clear(); else memory.delete(event.key);
    if (event.key === null || event.key === D.KEYS.products) { products = D.loadProducts(read(D.KEYS.products)); cart = D.normalizeCart(cart, products); renderProducts(); renderCart(); renderAdmin(); }
    if (event.key === null || event.key === D.KEYS.story) { story = D.cleanText(read(D.KEYS.story), 4000) || D.DEFAULT_STORY; byId('storyText').textContent = story; if (!byId('adminModal').open) byId('adminStory').value = story; }
    if (event.key === null || event.key === D.KEYS.content) { loadContent(); applyContent(); }
    if (event.key === null || event.key === D.KEYS.reviews) { reviews = D.loadReviews(read(D.KEYS.reviews)); renderReviews(); }
    if (event.key === null || event.key === D.KEYS.cart) { cart = D.normalizeCart(parse(read(D.KEYS.cart), []), products); renderCart(true); }
    if (event.key === null || event.key === D.KEYS.profile || event.key === D.KEYS.role) { profile = D.normalizeProfile(parse(read(D.KEYS.profile))); const role = read(D.KEYS.role); if (role !== null) profile.role = role === 'admin' ? 'admin' : role === 'customer' && profile.email ? 'customer' : 'guest'; syncProfile(); renderProducts(); renderReviews(); if (profile.role !== 'admin') { byId('adminModal').close(); byId('contentEditorModal').close(); } }
    if (event.key === null || event.key === D.KEYS.reviewOwner) { guestOwner = D.cleanText(read(D.KEYS.reviewOwner), 100) || makeToken(); write(D.KEYS.reviewOwner, guestOwner); renderReviews(); }
  });
  byId('storyText').textContent = story; byId('adminStory').value = story; byId('year').textContent = new Date().getFullYear();
  applyContent(); syncProfile(); renderProducts(); renderCart(); renderReviews(); measure();
  write(D.KEYS.products, JSON.stringify(products)); saveCart();
  const previousCart = parse(oldCart, []);
  if (Array.isArray(previousCart) && previousCart.length > cart.length) notify('Confira os tamanhos na coleção: itens sem tamanho ou indisponíveis saíram da sacola.');
  dropPetals(false); dropPetals(true);
}

document.addEventListener('DOMContentLoaded', initBoutique, { once: true });
function createMediaCarousel(product) {
  const frame = document.createElement('div');
  frame.className = 'product-image';
  const track = document.createElement('div');
  track.className = 'media-track';
  track.setAttribute('role', 'region');
  track.setAttribute('aria-label', `Fotos e vídeos de ${product.nome}`);
  track.dataset.activeIndex = '0';

  const files = [...new Set((Array.isArray(product.midias) ? product.midias : [])
    .map(file => normalizeMediaURL(file, product.tipoMidia)).filter(Boolean))].map(src => ({
      src,
      isVideo: productVideoURL(src, product)
    }));
  const poster = files.find(file => !file.isVideo)?.src;
  frame.classList.toggle('has-video', files.some(file => file.isVideo));
  frame.classList.toggle('video-active', Boolean(files[0]?.isVideo));
  for (const [index, file] of files.entries()) {
    const slide = document.createElement('div');
    slide.className = 'media-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${file.isVideo ? 'Vídeo' : 'Foto'} ${index + 1} de ${files.length}`);
    slide.dataset.active = String(index === 0);
    slide.inert = index !== 0;
    if (index !== 0) slide.setAttribute('aria-hidden', 'true');

    const media = document.createElement(file.isVideo ? 'video' : 'img');
    media.width = 360;
    media.height = 400;
    if (file.isVideo) {
      media.controls = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.autoplay = false;
      media.defaultMuted = false;
      media.muted = false;
      media.setAttribute('playsinline', '');
      media.setAttribute('aria-label', `${product.nome}, vídeo ${index + 1} de ${files.length}`);
      if (poster) media.poster = poster;
      media.textContent = `Seu navegador não reproduz este vídeo de ${product.nome}. Consulte as fotos ou fale com a Nanda.`;
    } else {
      media.alt = `${product.nome}, foto ${index + 1} de ${files.length}`;
      media.loading = 'lazy';
      media.decoding = 'async';
      media.draggable = false;
    }
    media.addEventListener('error', () => {
      if (file.isVideo) media.pause();
      const message = document.createElement('p');
      message.className = 'product-placeholder';
      message.textContent = `Não foi possível carregar ${file.isVideo ? 'o vídeo' : 'a foto'} de ${product.nome}. Consulte as outras mídias da peça ou fale com a Nanda.`;
      slide.replaceChildren(message);
    }, { once: true });
    media.src = file.src;
    slide.append(media);
    track.append(slide);
  }

  if (!files.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'product-placeholder';
    placeholder.textContent = 'Fotos em breve';
    track.append(placeholder);
  }
  frame.append(track);

  if (files.length > 1) {
    track.tabIndex = 0;
    track.setAttribute('aria-roledescription', 'carrossel');
    const slides = [...track.children];
    const count = document.createElement('span');
    count.className = 'media-count';
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    count.setAttribute('aria-atomic', 'true');
    count.textContent = `1 / ${files.length}`;
    const arrows = [];
    const currentIndex = () => Math.max(0, Math.min(files.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));

    const updateActiveSlide = () => {
      const index = currentIndex();
      const changed = Number(track.dataset.activeIndex) !== index;
      track.dataset.activeIndex = String(index);
      frame.classList.toggle('video-active', files[index].isVideo);
      slides.forEach((slide, position) => {
        const active = position === index;
        if (!active && slide.contains(document.activeElement)) track.focus({ preventScroll: true });
        slide.inert = !active;
        slide.dataset.active = String(active);
        if (active) slide.removeAttribute('aria-hidden');
        else {
          slide.setAttribute('aria-hidden', 'true');
          slide.querySelectorAll('video').forEach(video => video.pause());
        }
      });
      for (const { button, delta } of arrows) {
        button.setAttribute('aria-disabled', String(delta < 0 ? index === 0 : index === files.length - 1));
      }
      if (changed) {
        count.textContent = `${index + 1} / ${files.length}`;
        BoutiqueMedia.refresh();
      }
    };
    const goTo = index => {
      const destination = Math.max(0, Math.min(files.length - 1, index));
      if (destination !== currentIndex()) track.querySelectorAll('video').forEach(video => video.pause());
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({ left: destination * track.clientWidth, behavior: reduceMotion ? 'instant' : 'smooth' });
    };
    for (const [delta, label, glyph] of [[-1, 'Mídia anterior', '‹'], [1, 'Próxima mídia', '›']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `media-arrow ${delta < 0 ? 'previous' : 'next'}`;
      button.textContent = glyph;
      button.setAttribute('aria-label', `${label}: ${product.nome}`);
      button.addEventListener('click', () => goTo(currentIndex() + delta));
      arrows.push({ button, delta });
      frame.append(button);
    }
    let scrollFrame = 0;
    track.addEventListener('scroll', () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        updateActiveSlide();
      });
    }, { passive: true });
    track.addEventListener('keydown', event => {
      if (event.target !== track) return;
      const destinations = { ArrowLeft: currentIndex() - 1, ArrowRight: currentIndex() + 1, Home: 0, End: files.length - 1 };
      if (Object.hasOwn(destinations, event.key)) {
        event.preventDefault();
        goTo(destinations[event.key]);
      }
    });

    let drag;
    track.addEventListener('pointerdown', event => {
      if (event.target.closest('video, button') || event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { x: event.clientX, left: track.scrollLeft };
      track.setPointerCapture(event.pointerId);
      track.classList.add('dragging');
      event.preventDefault();
    });
    track.addEventListener('pointermove', event => {
      if (drag) track.scrollLeft = drag.left + drag.x - event.clientX;
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      track.classList.remove('dragging');
      goTo(currentIndex());
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', endDrag);
    updateActiveSlide();
    frame.append(count);
  }
  return frame;
}

/* Preserva o slide no redimensionamento e deixa a reprodução sob controle da pessoa. */
const BoutiqueMedia = (() => {
  const tracks = new Set();
  const videos = new Map();
  const canPlay = video => video.isConnected
    && !document.hidden
    && !document.body.classList.contains('modal-open')
    && !document.querySelector('dialog[open]')
    && video.closest('.media-slide')?.dataset.active === 'true';
  const pauseAll = () => videos.forEach((_, video) => video.pause());
  const align = track => {
    const width = track.clientWidth;
    if (!width || width === Number(track.dataset.mediaWidth)) return;
    track.dataset.mediaWidth = String(width);
    track.scrollTo({ left: Number(track.dataset.activeIndex) * width, behavior: 'instant' });
  };
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(entries => entries.forEach(({ target }) => align(target)))
    : null;
  const refresh = () => {
    tracks.forEach(align);
    videos.forEach((_, video) => { if (!canPlay(video)) video.pause(); });
  };
  if (!resizeObserver) window.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', pauseAll);
  const modalObserver = typeof MutationObserver === 'function' ? new MutationObserver(refresh) : null;
  let watchingModals = false;

  return {
    refresh,
    clear() {
      resizeObserver?.disconnect();
      tracks.clear();
      videos.forEach((onPlay, video) => {
        video.removeEventListener('play', onPlay);
        video.pause();
      });
      videos.clear();
    },
    observe(root) {
      if (!watchingModals && document.body) {
        modalObserver?.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
        watchingModals = true;
      }
      root.querySelectorAll('.media-track').forEach(track => {
        tracks.add(track);
        align(track);
        resizeObserver?.observe(track);
      });
      root.querySelectorAll('video').forEach(video => {
        if (videos.has(video)) return;
        const onPlay = () => {
          if (video.paused) return;
          if (!canPlay(video)) {
            video.pause();
            return;
          }
          // Um vídeo por vez. Nenhuma pausa provoca retomada automática.
          videos.forEach((_, other) => { if (other !== video) other.pause(); });
        };
        videos.set(video, onPlay);
        video.addEventListener('play', onPlay);
      });
      refresh();
    }
  };
})();
