"use strict";

// Conteúdos do Supabase são validados antes de chegar à interface.
function normalizeMediaURL(value, mediaType = 'auto') {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const raw = value.trim();
  if (!raw || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  const extension = /\.(jpe?g|png|webp|avif|gif|mp4|webm|mov)$/i;
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

function isVideoURL(value) { try { return /\.(mp4|webm|mov)$/i.test(decodeURIComponent(new URL(value, 'https://catalogo.invalid/').pathname)); } catch { return false; } }
function productVideoURL(value, product) { return isVideoURL(value) || (product.tipoMidia === 'video' && !/\.(jpe?g|png|webp|avif|gif)(?:[?#]|$)/i.test(value)); }

const BoutiqueData = (() => {
  const KEYS = Object.freeze({ products: 'nanda-boutique-produtos-v1', story: 'nanda-boutique-historia-v1', reviews: 'nanda-boutique-avaliacoes-v1', profile: 'nanda-boutique-perfil-v1', cart: 'nanda-boutique-sacola-v4', role: 'userRole', content: 'nanda-boutique-conteudo-v1', accounts: 'nanda-boutique-contas-demo-v1', reviewOwner: 'nanda-boutique-autoria-v1' });
  const CATEGORIES = Object.freeze(['Conjuntos & Macacões', 'Calças & Shorts', 'Bolsas & Acessórios']);
  const PAYMENTS = Object.freeze(['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro']);
  // A única taxa conhecida é a divulgada pela boutique. Outros destinos permanecem
  // explicitamente "a combinar", sem inventar um valor para a cliente.
  const DELIVERY_OPTIONS = Object.freeze([
    Object.freeze({ id: 'combinar', label: 'Entrega em outro local', feeCents: null }),
    Object.freeze({ id: 'osasco', label: 'Entrega em Osasco', feeCents: 1000 }),
    Object.freeze({ id: 'retirada', label: 'Retirada na boutique', feeCents: 0 })
  ]);
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
  // Estoque ausente nunca equivale a uma quantidade inventada.
  function stockForSize(product, size) {
    if (!product || product.esgotado || !parseSizes(product.tamanhos).includes(size)) return 0;
    const amount = product.estoquePorTamanho?.[size];
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
  }
  function productHasSize(product, size) { return stockForSize(product, size) > 0; }
  function totalStock(product) { return parseSizes(product.tamanhos).reduce((total, size) => total + stockForSize(product, size), 0); }
  function money(value) { return (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function cartKey(item) { return JSON.stringify([item.id, item.size]); }
  function normalizeProduct(raw) {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1) return null;
    const nome = cleanText(raw.nome, 100);
    const tipoMidia = ['image', 'video'].includes(raw.tipoMidia) ? raw.tipoMidia : 'auto';
    const midias = [...new Set((Array.isArray(raw.midias) ? raw.midias : []).slice(0, 8).map(url => normalizeMediaURL(url, tipoMidia)).filter(Boolean))];
    const preco = raw.preco == null ? null : raw.preco;
    if (!nome || !midias.length || (preco !== null && (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0 || preco > 1e7))) return null;
    const sizes = parseSizes(raw.tamanhos);
    const estoquePorTamanho = Object.fromEntries(sizes.map(size => {
      const amount = raw.estoquePorTamanho?.[size];
      return [size, raw.esgotado === true || parseSizes(raw.tamanhosIndisponiveis).includes(size) ? 0 : Number.isSafeInteger(amount) && amount >= 0 ? Math.min(amount, 99999) : 0];
    }));
    const guide = normalizeMediaURL(raw.guiaMedidas, 'image');
    const limiteReposicao = Number.isInteger(raw.limiteReposicao) && raw.limiteReposicao >= 0 ? Math.min(raw.limiteReposicao, 99999) : 2;
    return { id: raw.id, nome, descricao: cleanText(raw.descricao, 800), categoria: CATEGORIES.includes(raw.categoria) ? raw.categoria : CATEGORIES[0], tamanhos: sizes.join(', '), preco: preco === null ? null : Math.round(preco * 100) / 100, midias, tipoMidia, estoquePorTamanho, limiteReposicao, guiaMedidas: guide && !isVideoURL(guide) ? guide : '', esgotado: !Object.values(estoquePorTamanho).some(amount => amount > 0) };
  }
  function loadProducts(serialized) {
    const fallback = () => [];
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
    return { id: raw.id, estrelas: raw.estrelas, comentario, criadoEm: raw.criadoEm, name: cleanText(raw.name, 80) || 'Cliente da Nanda', ownerId: cleanText(raw.ownerId, 100) };
  }
  function loadReviews(serialized) {
    try {
      const rows = JSON.parse(serialized);
      const ids = new Set(), owners = new Set();
      return Array.isArray(rows) ? rows.slice(0, 200).map(normalizeReview).filter(r => r && !ids.has(r.id) && (!r.ownerId || !owners.has(r.ownerId)) && ids.add(r.id) && (r.ownerId ? owners.add(r.ownerId) : true)).sort((a, b) => b.criadoEm - a.criadoEm) : [];
    } catch { return []; }
  }
  function normalizeProfile(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const email = normalizeEmail(value.email);
    // Nunca restaura privilégios a partir de um perfil serializado no navegador.
    return { role: email ? 'client' : 'guest', email, name: cleanText(value.name, 80), ownerId: cleanText(value.ownerId, 100) };
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
      cart.set(key, { id, size, quantity: Math.min(99, stockForSize(product, size), (cart.get(key)?.quantity || 0) + item.quantity) });
    }
    return [...cart.values()];
  }
  function normalizeDelivery(value) {
    const id = typeof value === 'object' && value ? value.id : value;
    return DELIVERY_OPTIONS.find(option => option.id === id) || DELIVERY_OPTIONS[0];
  }
  function buildWhatsAppMessage(items, products, payment, delivery = 'combinar') {
    const entries = normalizeCart(items, products);
    if (!entries.length || !PAYMENTS.includes(payment)) return '';
    const deliveryOption = normalizeDelivery(delivery);
    let total = 0, pendingPrice = false;
    const pieces = entries.map((item, index) => {
      const product = products.find(p => p.id === item.id), cents = product.preco === null ? null : Math.round(product.preco * 100);
      if (cents === null) pendingPrice = true; else total += cents * item.quantity;
      return `${index + 1}. ${product.nome}\nTamanho: ${item.size}\nQuantidade: ${item.quantity}\nValor unitário: ${cents === null ? 'a consultar' : money(cents)}\nSubtotal: ${cents === null ? 'a consultar' : money(cents * item.quantity)}`;
    });
    const subtotal = pendingPrice ? money(total) + ' + valores a confirmar' : money(total);
    const deliveryFee = deliveryOption.feeCents === null ? 'a combinar' : money(deliveryOption.feeCents);
    const finalTotal = pendingPrice || deliveryOption.feeCents === null ? 'a confirmar' : money(total + deliveryOption.feeCents);
    return 'Olá, Nanda Boutique! Gostaria de finalizar minha sacola:\n\n' + pieces.join('\n\n') + '\n\nSubtotal da compra: ' + subtotal + '\nEntrega: ' + deliveryOption.label + '\nTaxa de entrega: ' + deliveryFee + '\nTotal final: ' + finalTotal + '\nForma de pagamento: ' + payment + '\n\nPoderia confirmar a disponibilidade e o valor final do pedido?';
  }
  function normalizeSections(rows) {
    const ids = new Set();
    return (Array.isArray(rows) ? rows : []).slice(0, 300).flatMap(raw => {
      if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || ids.has(raw.id) || !['elas-usam', 'inauguracao', 'sobre'].includes(raw.secao)) return [];
      const titulo = cleanText(raw.titulo, 120), midia = normalizeMediaURL(raw.midia, raw.tipoMidia);
      if (!titulo || (raw.midia && !midia)) return [];
      ids.add(raw.id);
      return [{ id: raw.id, secao: raw.secao, titulo, descricao: cleanText(raw.descricao, 4000), midia: midia || '', tipoMidia: raw.tipoMidia === 'video' ? 'video' : 'auto', alt: cleanText(raw.alt, 240) || titulo, posicao: Number.isSafeInteger(raw.posicao) ? Math.max(0, raw.posicao) : 0, publicado: raw.publicado !== false }];
    }).sort((a, b) => a.posicao - b.posicao || a.id - b.id);
  }
  return { KEYS, CATEGORIES, PAYMENTS, DELIVERY_OPTIONS, DEFAULT_PRODUCTS, DEFAULT_STORY, cleanText, normalizeEmail, normalizeCPF, parseSizes, stockForSize, totalStock, money, productHasSize, cartKey, normalizeProduct, loadProducts, normalizeReview, loadReviews, normalizeProfile, normalizeCart, normalizeDelivery, buildWhatsAppMessage, normalizeSections };
})();

function initBoutique() {
  const D = BoutiqueData, A = globalThis.BoutiqueAuth, byId = id => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = matchMedia('(forced-colors: active)');
  const memory = new Map();
  function read(key) { if (memory.has(key)) return memory.get(key); try { return localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); memory.delete(key); return true; } catch { memory.set(key, value); byId('storageNotice').hidden = false; return false; } }
  function parse(value, fallback = null) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  let products = [], reviews = [], sections = [], storeLoaded = false, storeLoading = true, storeLoadError = false;
  let profile = D.normalizeProfile(null);
  // Remove credenciais de demonstração e papéis legados; não são autenticação.
  for (const key of [D.KEYS.accounts, D.KEYS.profile, D.KEYS.role, D.KEYS.reviewOwner]) { try { localStorage.removeItem(key); } catch {} }
  const isSignedIn = () => !!A?.getState().verified && !!A.getState().user;
  const isAdmin = () => isSignedIn() && A.getState().role === 'admin' && D.normalizeEmail(A.getState().user.email) === 'usenandaboutiquee@gmail.com';
  const reviewOwner = () => isSignedIn() ? A.getState().user.id : '';
  let story = D.DEFAULT_STORY;
  const oldCart = read(D.KEYS.cart) ?? read('nanda-boutique-sacola-v3') ?? read('nanda-boutique-sacola-v2') ?? read('nanda-boutique-sacola-v1');
  // A sacola é uma preferência deste aparelho. Só será reconciliada após a leitura remota.
  let cart = parse(oldCart, []); if (!Array.isArray(cart)) cart = [];
  let selectedCategory = 'Todos os Looks', toastTimer, pendingDelete = null, checkoutPreflight = false, checkoutVerified = '', checkoutVerifiedAt = 0;
  const bag = byId('shoppingBag'), payment = byId('paymentMethod'), delivery = byId('deliveryMethod'), checkout = byId('checkoutButton');
  const flights = new Set(), petalTimers = new Map(), returnFocus = new WeakMap();
  let bagAnimation;
  const motionAllowed = () => !reducedMotion.matches && !forcedColors.matches && !document.hidden && !document.querySelector('dialog[open]');
  function notify(text) { clearTimeout(toastTimer); const toast = byId('toast'); toast.textContent = text; toast.classList.add('show'); toastTimer = setTimeout(() => { toast.classList.remove('show'); toast.textContent = ''; }, 4500); }
  function saveProfile() {
    const state = A?.getState();
    profile = state?.verified && state.user ? D.normalizeProfile({ email: state.user.email, name: state.user.name, ownerId: state.user.id }) : D.normalizeProfile(null);
    if (isAdmin()) profile.role = 'admin';
    syncProfile(); renderProducts(); renderReviews(); renderSections();
  }
  function syncProfile() {
    const admin = isAdmin(), signedIn = isSignedIn();
    document.body.classList.toggle('editing-mode', admin);
    byId('adminQuickActions').hidden = !admin;
    byId('adminToggle').hidden = !admin;
    byId('stockAlertsToggle').hidden = !admin;
    byId('adminAddProduct').hidden = !admin;
    byId('editBrand').hidden = !admin;
    document.querySelectorAll('.edit-pencil').forEach(button => { button.hidden = !admin; });
    document.querySelectorAll('[data-community-admin]').forEach(panel => { panel.hidden = !admin; });
    byId('accountLabel').textContent = signedIn ? 'Sair' : 'Entrar';
    byId('accountToggle').setAttribute('aria-label', signedIn ? 'Sair da conta' : 'Entrar ou criar conta');
    if (signedIn) byId('accountToggle').removeAttribute('aria-haspopup'); else byId('accountToggle').setAttribute('aria-haspopup', 'dialog');
    byId('accountSession').hidden = !signedIn; byId('accountForms').hidden = signedIn; byId('accountAdmin').hidden = !admin;
    byId('accountSessionLabel').textContent = admin ? 'Modo Edição ativo. Cuide de cada detalhe da boutique.' : 'Olá, ' + (profile.name || 'cliente') + '! Que bom ter você aqui.';
    byId('customerGreeting').textContent = signedIn ? 'Olá, ' + (admin ? 'Nanda' : profile.name || 'cliente') + '!' : 'Seja bem-vinda!';
    byId('customerGreeting').hidden = !signedIn;
    byId('authSetupNotice').hidden = true;
    byId('reviewEmail').value = profile.email;
    renderStockAlerts();
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

  // As páginas editoriais compartilham o mesmo documento para preservar a sessão,
  // o payload da loja e os IDs usados pelo painel administrativo.
  const editorialRoutes = new Set(['elas-usam', 'inauguracao']);
  const homeRoutes = new Set(['inicio', 'colecao', 'sobre', 'avaliacoes', 'informacoes', 'contatos', 'frete']);
  function currentHash() {
    try { return decodeURIComponent(location.hash.slice(1)).toLowerCase(); }
    catch { return ''; }
  }
  function syncRoute({ focus = false } = {}) {
    const hash = currentHash(), route = editorialRoutes.has(hash) ? hash : '';
    const home = byId('homeView'), footer = byId('contatos');
    home.hidden = !!route;
    footer.hidden = !!route;
    for (const routeName of editorialRoutes) byId(routeName).hidden = routeName !== route;
    document.body.classList.toggle('editorial-route-active', !!route);
    document.querySelectorAll('[data-route-link]').forEach(link => {
      if (link.dataset.routeLink === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    requestAnimationFrame(() => {
      if (route) {
        window.scrollTo(0, 0);
        if (focus) byId(route).focus({ preventScroll: true });
      } else if (homeRoutes.has(hash)) byId(hash)?.scrollIntoView({ block: 'start', behavior: 'instant' });
      BoutiqueMedia.refresh();
    });
  }
  window.addEventListener('hashchange', () => syncRoute({ focus: true }));
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
  function showLogin(trigger) { selectAuthTab('login'); syncProfile(); openDialog('loginModal', trigger); }
  byId('accountToggle').addEventListener('click', event => { if (isSignedIn()) logout(); else showLogin(event.currentTarget); });
  byId('anonymousContinue').addEventListener('click', () => { byId('loginModal').close(); notify('Fique à vontade para explorar a coleção.'); });
  function openAdminAccess(event) { if (adminAllowed()) { clearContentContext(); renderAdmin(); openDialog('adminModal', event.currentTarget.closest('dialog') ? byId('adminToggle') : event.currentTarget); } }
  byId('adminToggle').addEventListener('click', openAdminAccess);
  byId('accountAdmin').addEventListener('click', openAdminAccess);
  function openStockAlerts(event) { if (adminAllowed()) { renderStockAlerts(); openDialog('stockAlertsModal', event.currentTarget); } }
  byId('stockAlertsToggle').addEventListener('click', openStockAlerts);
  byId('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); const submit = byId('loginSubmit'); if (submit.disabled) return;
    clearFormError('loginError'); submit.disabled = true;
    try {
      const email = D.normalizeEmail(byId('adminUsername').value);
      if (!email) { formError('loginError', 'Informe seu e-mail completo.', byId('adminUsername')); return; }
      await A.signIn(email, byId('adminPassword').value);
      saveProfile(); byId('loginModal').close();
      if (isAdmin()) { if (storeRequest) await storeRequest.catch(() => {}); renderAdmin(); openDialog('adminModal', byId('adminToggle')); }
      notify(isAdmin() ? 'Bem-vinda, Nanda! Seu painel está pronto para editar.' : 'Bem-vinda de volta, ' + (profile.name || 'cliente') + '!');
    } catch (error) { formError('loginError', error.message || 'Não foi possível entrar. Confira seu e-mail e senha.', byId('adminPassword')); }
    finally { submit.disabled = false; byId('adminPassword').value = ''; }
  });
  function passwordsMatch(first, confirmation, errorId) {
    if (first.value === confirmation.value) { confirmation.removeAttribute('aria-invalid'); return true; }
    confirmation.setAttribute('aria-invalid', 'true'); formError(errorId, 'As senhas não coincidem. Digite a mesma senha nos dois campos.', confirmation); return false;
  }
  byId('registerConfirmPassword').addEventListener('input', () => { byId('registerConfirmPassword').removeAttribute('aria-invalid'); clearFormError('registerError'); });
  byId('registerForm').addEventListener('submit', async event => {
    event.preventDefault(); clearFormError('registerError');
    const submit = event.currentTarget.querySelector('[type="submit"]'); if (submit.disabled) return;
    if (!passwordsMatch(byId('registerPassword'), byId('registerConfirmPassword'), 'registerError')) return;
    const name = D.cleanText(byId('registerName').value, 80), email = D.normalizeEmail(byId('registerEmail').value), password = byId('registerPassword').value;
    if (name.length < 2 || !email || !D.normalizeCPF(byId('registerCPF').value) || password.length < 8) { formError('registerError', 'Informe nome, e-mail, CPF com 11 dígitos e senha de pelo menos 8 caracteres.'); return; }
    submit.disabled = true;
    try {
      const result = await A.signUp({ name, email, password });
      saveProfile(); byId('registerForm').reset();
      if (result.confirmationRequired) byId('signupSuccessText').textContent = 'Enviamos um e-mail de confirmação para você. Confirme o cadastro por lá e depois volte para entrar na sua conta.';
      else applyContent();
      openDialog('signupSuccessModal', byId('accountToggle')); celebrateSignup();
      if (result.confirmationRequired) notify('Confira seu e-mail para confirmar o cadastro e entrar.');
    } catch (error) { formError('registerError', error.message || 'Não foi possível criar sua conta. Tente novamente.'); }
    finally { submit.disabled = false; byId('registerPassword').value = ''; byId('registerConfirmPassword').value = ''; byId('registerCPF').value = ''; }
  });
  byId('loginModal').addEventListener('close', () => { byId('adminPassword').value = ''; byId('registerPassword').value = ''; byId('registerConfirmPassword').value = ''; byId('registerCPF').value = ''; });
  async function logout() {
    await A.signOut(); saveProfile(); document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    byId('accountToggle').focus({ preventScroll: true }); notify('Sessão encerrada. Continue explorando a boutique.');
  }
  byId('adminLogout').addEventListener('click', logout); byId('accountLogout').addEventListener('click', logout);
  byId('forgotPassword').addEventListener('click', () => { byId('resetEmail').value = D.normalizeEmail(byId('adminUsername').value); clearFormError('resetError'); byId('resetStatus').textContent = ''; openDialog('resetModal', byId('accountToggle')); });
  byId('resetForm').addEventListener('submit', async event => {
    event.preventDefault(); clearFormError('resetError'); const submit = byId('resetSubmit'); if (submit.disabled) return;
    const email = D.normalizeEmail(byId('resetEmail').value); if (!email) { formError('resetError', 'Informe seu e-mail completo.', byId('resetEmail')); return; }
    submit.disabled = true;
    try { await A.resetPassword(email); byId('resetStatus').hidden = false; byId('resetStatus').textContent = 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'; }
    catch (error) { formError('resetError', error.message || 'Não foi possível solicitar a recuperação. Tente novamente.'); }
    finally { submit.disabled = false; }
  });
  byId('updatePasswordForm').addEventListener('submit', async event => {
    event.preventDefault(); clearFormError('updatePasswordError');
    if (!passwordsMatch(byId('newPassword'), byId('confirmNewPassword'), 'updatePasswordError')) return;
    const submit = event.currentTarget.querySelector('[type="submit"]'); if (submit.disabled) return; submit.disabled = true;
    try { await A.updatePassword(byId('newPassword').value); byId('updatePasswordStatus').hidden = false; byId('updatePasswordStatus').textContent = 'Senha atualizada com sucesso!'; event.target.reset(); }
    catch (error) { formError('updatePasswordError', error.message || 'Não foi possível atualizar a senha. Solicite um novo link.'); }
    finally { submit.disabled = false; }
  });
  byId('updatePasswordModal').addEventListener('close', () => byId('updatePasswordForm').reset());

  function renderProducts(category = selectedCategory) {
    selectedCategory = category;
    BoutiqueMedia.clear();
    document.querySelectorAll('.category-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
    byId('productsGrid').setAttribute('aria-busy', String(storeLoading));
    byId('catalogLoading').hidden = !storeLoading || storeLoaded;
    byId('catalogError').hidden = !storeLoadError;
    if (!storeLoaded) { byId('productsGrid').replaceChildren(); byId('collectionEmpty').hidden = true; return; }
    const filtered = products.filter(p => category === 'Todos os Looks' || p.categoria === category);
    const fragment = document.createDocumentFragment();
    for (const product of filtered) {
      const card = node('article', 'product-card'); card.dataset.id = product.id; card.setAttribute('aria-labelledby', 'product-title-' + product.id);
      card.append(createMediaCarousel(product));
      if (!D.totalStock(product)) card.append(node('span', 'sold-out-badge', 'Esgotado'));
      else if (D.parseSizes(product.tamanhos).some(size => D.stockForSize(product, size) > 0 && D.stockForSize(product, size) <= product.limiteReposicao)) card.append(node('span', 'product-low-stock', 'Últimas unidades'));
      const content = node('div', 'product-content'), title = node('h3', 'product-title', product.nome), bottom = node('div', 'product-bottom');
      title.id = 'product-title-' + product.id;
      const field = node('div', 'product-size-field'), label = node('label', '', 'Escolher Tamanho'), select = node('select', 'product-size-select'), feedback = node('p', 'size-feedback');
      select.id = 'product-size-' + product.id; select.required = true; label.htmlFor = select.id;
      feedback.id = 'size-feedback-' + product.id; feedback.setAttribute('aria-live', 'polite'); select.setAttribute('aria-describedby', feedback.id);
      const placeholder = node('option', '', 'Escolha seu tamanho'); placeholder.value = ''; select.append(placeholder);
      for (const size of D.parseSizes(product.tamanhos)) { const amount = D.stockForSize(product, size); const option = node('option', '', size + ' · ' + amount + (amount === 1 ? ' disponível' : ' disponíveis')); option.value = size; select.append(option); }
      select.disabled = !D.parseSizes(product.tamanhos).length;
      const action = node('button', 'primary-btn product-action', 'Comprar'); action.type = 'button'; action.dataset.id = product.id;
      const restock = node('a', 'secondary-btn restock-btn', 'Avisar quando chegar'); restock.target = '_blank'; restock.rel = 'noopener noreferrer';
      function updateSizeAction() {
        const unavailable = product.esgotado || !D.parseSizes(product.tamanhos).some(size => D.productHasSize(product, size)) || (select.value && !D.productHasSize(product, select.value));
        action.hidden = !!unavailable; restock.hidden = !unavailable;
        action.textContent = 'Comprar';
        action.setAttribute('aria-label', 'Adicionar à Sacola: ' + product.nome + (select.value ? ', tamanho ' + select.value : ''));
        feedback.textContent = unavailable ? 'Esgotado neste tamanho. Peça um aviso de reposição.' : select.value ? D.stockForSize(product, select.value) + ' unidade(s) disponível(is) no tamanho ' + select.value + '.' : D.totalStock(product) + ' unidade(s) na peça. Escolha seu tamanho.';
        select.removeAttribute('aria-invalid');
        restock.href = whatsappURL('Olá Nanda Boutique! Gostaria de ser avisada quando a peça ' + product.nome + (select.value ? ' - Tamanho ' + select.value : '') + ' estiver disponível. Poderia me avisar quando chegar?');
      }
      select.addEventListener('change', updateSizeAction); updateSizeAction();
      const guide = node('button', 'text-button size-guide-link', 'Guia de Medidas'); guide.type = 'button'; guide.setAttribute('aria-haspopup', 'dialog'); guide.setAttribute('aria-controls', 'sizeGuideModal'); guide.addEventListener('click', () => {
        const current = products.find(item => item.id === product.id); if (!current) return;
        byId('sizeGuideTitle').textContent = 'Guia de Medidas · ' + current.nome;
        byId('sizeGuideHint').textContent = 'Tabela individual desta peça, enviada pela Nanda. Precisa de ajuda com o caimento? Fale com a loja.';
        const image = byId('sizeGuideImage'); image.hidden = !current.guiaMedidas; image.alt = 'Tabela de medidas de ' + current.nome;
        if (current.guiaMedidas) image.src = current.guiaMedidas; else image.removeAttribute('src');
        byId('sizeGuideEmpty').hidden = !!current.guiaMedidas;
        byId('sizeGuideWhatsApp').href = whatsappURL('Olá, Nanda! Gostaria de saber as medidas da peça ' + current.nome + '. Pode me ajudar a escolher o tamanho?');
        openDialog('sizeGuideModal', guide);
      });
      const questions = node('a', 'secondary-btn product-question', 'Tire Dúvidas'); questions.href = whatsappURL('Olá, Nanda! Tenho uma dúvida sobre a peça ' + product.nome + '. Pode me ajudar?'); questions.target = '_blank'; questions.rel = 'noopener noreferrer';
      field.append(label, select, guide, feedback); bottom.append(action, restock, questions);
      content.append(title);
      if (product.descricao) content.append(node('p', 'product-description', product.descricao));
      content.append(node('p', 'product-price', product.preco === null ? 'Consulte o valor com a loja' : product.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })), field, bottom);
      card.append(content); fragment.append(card);
    }
    byId('productsGrid').replaceChildren(fragment); byId('collectionEmpty').hidden = filtered.length > 0;
    byId('catalogStatus').textContent = filtered.length ? filtered.length + (filtered.length === 1 ? ' peça' : ' peças') + ' · ' + category : '';
    BoutiqueMedia.observe(byId('productsGrid'));
  }
  document.querySelector('.category-nav').addEventListener('click', event => { const button = event.target.closest('button[data-category]'); if (button) renderProducts(button.dataset.category); });
  function clearPaymentError() { byId('paymentError').hidden = true; payment.removeAttribute('aria-invalid'); payment.setAttribute('aria-describedby', 'paymentHint'); byId('paymentStep').classList.remove('has-error'); }
  function checkoutFingerprint() {
    return JSON.stringify({
      cart,
      payment: payment.value,
      delivery: delivery.value,
      inventory: cart.map(item => {
        const product = products.find(row => row.id === item.id);
        return product ? [product.id, product.preco, D.stockForSize(product, item.size)] : [item.id, null, 0];
      })
    });
  }
  function syncCheckout() {
    const hasCart = cart.length > 0;
    const inventoryReady = storeLoaded && !storeLoading && !storeLoadError && !checkoutPreflight;
    const message = D.buildWhatsAppMessage(cart, products, payment.value, delivery.value);
    checkout.tabIndex = hasCart ? 0 : -1;
    checkout.setAttribute('aria-disabled', String(!hasCart || !inventoryReady));
    if (hasCart && inventoryReady && message) checkout.href = whatsappURL(message); else checkout.removeAttribute('href');
  }
  function thumbnail(product, className) {
    const image = node('img', className);
    image.src = product.midias.find(src => !productVideoURL(src, product)) || './img/sacola-carrinho.png';
    image.alt = ''; image.width = 70; image.height = 94; image.referrerPolicy = 'no-referrer'; image.loading = className === 'courier-product' ? 'eager' : 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => { image.src = './img/sacola-carrinho.png'; }, { once: true });
    return image;
  }
  function saveCart() { write(D.KEYS.cart, JSON.stringify(cart)); }
  function renderCart(announce = false) {
    if (!storeLoaded) { byId('bagCount').textContent = '0'; checkout.removeAttribute('href'); checkout.setAttribute('aria-disabled', 'true'); return; }
    cart = D.normalizeCart(cart, products);
    const count = cart.reduce((n, item) => n + item.quantity, 0);
    byId('bagCount').textContent = count; bag.setAttribute('aria-label', 'Abrir sacola: ' + count + (count === 1 ? ' item' : ' itens'));
    byId('emptyCart').hidden = count > 0; byId('checkoutSummary').hidden = !count;
    byId('cartCountSummary').textContent = count + (count === 1 ? ' peça na sua lista' : ' peças na sua lista');
    const pricedItems = cart.map(item => ({ ...item, product: products.find(p => p.id === item.id) }));
    const pendingPrice = pricedItems.some(item => item.product.preco === null);
    const subtotal = pricedItems.reduce((sum, item) => sum + Math.round((item.product.preco || 0) * 100) * item.quantity, 0);
    const deliveryOption = D.normalizeDelivery(delivery.value);
    const finalTotal = pendingPrice || deliveryOption.feeCents === null ? null : subtotal + deliveryOption.feeCents;
    byId('cartTotal').textContent = pendingPrice ? D.money(subtotal) + ' + a confirmar' : D.money(subtotal);
    byId('cartDeliveryLabel').textContent = 'Taxa de entrega · ' + deliveryOption.label;
    byId('cartDelivery').textContent = deliveryOption.feeCents === null ? 'A combinar' : D.money(deliveryOption.feeCents);
    byId('cartFinalTotal').textContent = finalTotal === null ? 'A confirmar' : D.money(finalTotal);
    byId('cartTotalHint').textContent = pendingPrice ? 'Há peças com preço a consultar. O total final será confirmado pela Nanda.' : deliveryOption.feeCents === null ? 'O frete será confirmado pela Nanda antes do pagamento.' : 'A taxa escolhida será enviada no resumo do WhatsApp.';
    if (!count) { payment.value = ''; clearPaymentError(); }
    syncCheckout();
    if (announce) byId('cartStatus').textContent = count + (count === 1 ? ' peça na sacola.' : ' peças na sacola.');
    const fragment = document.createDocumentFragment();
    for (const item of cart) {
      const product = products.find(p => p.id === item.id), line = node('li', 'cart-item'), details = node('div', 'cart-details'), controls = node('div', 'cart-controls'), quantity = node('div', 'quantity-controls');
      line.dataset.key = D.cartKey(item);
      details.append(node('h3', '', product.nome), node('p', 'cart-item-note', 'Tamanho: ' + item.size));
      if (product.preco !== null) details.append(node('p', 'cart-item-note', D.money(Math.round(product.preco * 100)) + ' por peça · Subtotal: ' + D.money(Math.round(product.preco * 100) * item.quantity)));
      else details.append(node('p', 'cart-item-note', 'Valor a consultar'));
      details.append(node('p', 'cart-item-note', D.stockForSize(product, item.size) + ' unidade(s) disponível(is)'));
      for (const delta of [-1, 1]) {
        const button = node('button', '', delta < 0 ? '−' : '+'); button.type = 'button'; button.dataset.key = D.cartKey(item); button.dataset.change = delta; button.disabled = delta > 0 && item.quantity >= Math.min(99, D.stockForSize(product, item.size));
        button.setAttribute('aria-label', (delta < 0 ? 'Diminuir' : 'Aumentar') + ' quantidade de ' + product.nome + ', tamanho ' + item.size); quantity.append(button);
        if (delta < 0) { const amount = node('span', '', item.quantity); amount.setAttribute('aria-label', item.quantity + ' unidades'); quantity.append(amount); }
      }
      const remove = node('button', 'remove-item', 'Remover'); remove.type = 'button'; remove.dataset.key = D.cartKey(item); remove.dataset.remove = 'true'; remove.setAttribute('aria-label', 'Remover ' + product.nome + ', tamanho ' + item.size);
      controls.append(quantity, remove); line.append(thumbnail(product, 'cart-thumbnail'), details, controls); fragment.append(line);
    }
    byId('cartItems').replaceChildren(fragment);
  }
  byId('productsGrid').addEventListener('click', event => {
    const action = event.target.closest('.product-action'); if (!action || action.disabled) return;
    const product = products.find(p => p.id === Number(action.dataset.id)); if (!product || product.esgotado) return;
    const select = byId('product-size-' + product.id), size = select.value;
    if (!D.productHasSize(product, size)) { byId('size-feedback-' + product.id).textContent = 'Escolha um tamanho disponível antes de adicionar à sacola.'; select.setAttribute('aria-invalid', 'true'); select.focus(); return; }
    const existing = cart.find(item => item.id === product.id && item.size === size);
    if (existing?.quantity >= Math.min(99, D.stockForSize(product, size))) { notify('Você já adicionou a quantidade disponível deste tamanho.'); return; }
    if (existing) existing.quantity++; else cart.push({ id: product.id, size, quantity: 1 });
    saveCart(); renderCart(); bounceBag(); celebrate(action); notify(product.nome + ' · Tamanho ' + size + ' na sacola.');
  });
  byId('cartItems').addEventListener('click', event => {
    const button = event.target.closest('button[data-key]'); if (!button || button.disabled) return;
    const item = cart.find(row => D.cartKey(row) === button.dataset.key); if (!item) return;
    item.quantity = button.dataset.remove ? 0 : Math.min(99, D.stockForSize(products.find(p => p.id === item.id), item.size), item.quantity + Number(button.dataset.change));
    cart = cart.filter(row => row.quantity > 0); saveCart(); renderCart(true);
    const equivalent = [...byId('cartItems').querySelectorAll('button')].find(b => b.dataset.key === button.dataset.key && b.dataset.change === button.dataset.change && b.dataset.remove === button.dataset.remove && !b.disabled);
    (equivalent || byId('cartItems').querySelector('button') || byId('continueShopping')).focus();
  });
  bag.addEventListener('click', event => { openDialog('checkoutModal', event.currentTarget); if (!storeLoading && !storeSaving) refreshStore().catch(() => notify('Não foi possível atualizar a disponibilidade. Tente novamente quando a conexão voltar.')); });
  byId('continueShopping').addEventListener('click', () => { returnFocus.set(byId('checkoutModal'), byId('colecao')); byId('checkoutModal').close(); byId('colecao').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' }); });
  payment.addEventListener('change', () => { if (D.PAYMENTS.includes(payment.value)) clearPaymentError(); syncCheckout(); });
  delivery.addEventListener('change', () => renderCart());
  async function validateCheckout(event) {
    if (checkoutVerified === checkoutFingerprint() && Date.now() - checkoutVerifiedAt < 15000 && checkout.hasAttribute('href')) return;
    event.preventDefault();
    const valid = D.normalizeCart(cart, products);
    if (JSON.stringify(valid) !== JSON.stringify(cart)) { cart = valid; saveCart(); renderCart(true); notify('A disponibilidade mudou. Confira sua sacola antes de continuar.'); return; }
    if (!cart.length) { syncCheckout(); return; }
    if (!D.PAYMENTS.includes(payment.value)) {
      syncCheckout(); byId('paymentError').hidden = false; payment.setAttribute('aria-invalid', 'true'); payment.setAttribute('aria-describedby', 'paymentHint paymentError'); byId('paymentStep').classList.add('has-error'); payment.focus(); payment.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return;
    }
    if (checkoutPreflight || storeSaving) return;
    clearPaymentError();
    const snapshotBeforeRefresh = JSON.stringify(cart);
    checkoutPreflight = true; syncCheckout();
    // A aba é aberta ainda no gesto da cliente; a URL só é aplicada após a leitura remota.
    const popup = window.open('', '_blank');
    if (popup) popup.opener = null;
    try {
      await refreshStore();
      if (snapshotBeforeRefresh !== JSON.stringify(cart)) {
        popup?.close(); renderCart(true); notify('A disponibilidade mudou. Confira sua sacola antes de continuar.'); return;
      }
      const message = D.buildWhatsAppMessage(cart, products, payment.value, delivery.value);
      if (!message) { popup?.close(); notify('Confira a sacola e a forma de pagamento antes de continuar.'); return; }
      checkoutVerified = checkoutFingerprint(); checkoutVerifiedAt = Date.now();
      if (popup && !popup.closed) popup.location.replace(whatsappURL(message));
      else notify('Disponibilidade atualizada. Toque novamente em “Finalizar no WhatsApp”.');
    } catch (error) {
      popup?.close(); notify(error.message || 'Não foi possível atualizar a disponibilidade agora. Tente novamente.');
    } finally {
      checkoutPreflight = false; syncCheckout();
    }
  }
  checkout.addEventListener('click', validateCheckout); checkout.addEventListener('auxclick', validateCheckout);
  checkout.addEventListener('keydown', event => { if (event.key === ' ' || (event.key === 'Enter' && !checkout.hasAttribute('href'))) { event.preventDefault(); checkout.click(); } });
  // Administração: cada gravação passa pelo Auth e pelas políticas RLS do Supabase.
  function adminAllowed() {
    if (isAdmin()) { if (storeLoading) { notify('Aguarde a atualização da loja antes de editar.'); return false; } return true; }
    byId('adminModal').close(); byId('stockAlertsModal').close(); byId('contentEditorModal').close(); byId('brandEditorModal').close(); notify('Entre na conta oficial da Nanda para editar a boutique.'); return false;
  }
  function nextId(rows) { let id = Date.now(); while (rows.some(row => row.id === id)) id++; return id; }
  let storeSaving = false, adminBusy = false, saveNoticeTimer;
  const disabledBeforeSave = new Map();
  function setAdminBusy(busy) {
    adminBusy = busy; byId('adminModal').setAttribute('aria-busy', String(busy));
    if (busy) {
      for (const control of byId('adminModal').querySelectorAll('input,select,textarea,button:not([data-close])')) { disabledBeforeSave.set(control, control.disabled); control.disabled = true; }
    } else {
      for (const [control, disabled] of disabledBeforeSave) if (control.isConnected) control.disabled = disabled;
      disabledBeforeSave.clear();
    }
  }
  byId('adminModal').addEventListener('click', event => { if (adminBusy && !event.target.closest('[data-close]')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  function savedFeedback(detail = '') {
    byId('adminStatus').textContent = 'Alteração salva com sucesso!' + (detail ? ' ' + detail : '');
    const notice = byId('saveNotice'); notice.textContent = 'Alteração salva com sucesso!'; notice.hidden = false;
    clearTimeout(saveNoticeTimer); saveNoticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
  }
  async function persistStore(next = {}) {
    if (!adminAllowed() || storeSaving) throw new Error('Aguarde a alteração atual terminar antes de salvar novamente.');
    storeSaving = true;
    try {
      await A.requireAdmin();
      if (!storeLoaded) throw new Error('Carregue a loja antes de editar. Use Tentar novamente na coleção.');
      const payload = { products: next.products || products, story: next.story ?? story, content: next.content || content, sections: next.sections || sections };
      await A.saveStore(payload);
      products = payload.products; story = payload.story; content = payload.content; sections = payload.sections;
      applyContent(); renderSections(); renderAdminContent(); savedFeedback();
    } catch (error) { byId('adminStatus').textContent = 'Erro ao salvar: ' + error.message; notify('Erro ao salvar. ' + error.message); throw error;
    } finally { storeSaving = false; }
  }
  let uploadPreviews = [], retainedMedia = [], retainedGuide = '', guidePreviewURL = '', draftStock = {};
  function mediaIsReferenced(url) {
    if (!url) return false;
    return products.some(product => product.guiaMedidas === url || product.midias.includes(url)) ||
      sections.some(section => section.midia === url) || Object.values(content).includes(url);
  }
  async function releaseUnusedMedia(url) {
    if (!url || mediaIsReferenced(url) || typeof A.removeMedia !== 'function') return;
    // A referência já foi removida do payload com sucesso. Falhar ao limpar um
    // arquivo órfão não desfaz a alteração visível para a administradora.
    try { await A.removeMedia(url); } catch {}
  }
  function clearUploads() { uploadPreviews.forEach(url => URL.revokeObjectURL(url)); uploadPreviews = []; byId('productUploadPreview').replaceChildren(); byId('uploadStatus').textContent = ''; }
  function resetProductForm() { retainedMedia = []; retainedGuide = ''; draftStock = {}; clearUploads(); byId('productForm').reset(); byId('editingProductId').value = ''; byId('productFormTitle').textContent = 'Adicionar novo produto'; byId('saveProduct').textContent = 'Adicionar produto'; byId('cancelProductEdit').hidden = true; clearFormError('productError'); renderStockFields(false); renderGuidePreview(); }
  function openNewProduct(event) { if (!adminAllowed()) return; clearContentContext(); resetProductForm(); renderAdmin(); openDialog('adminModal', event.currentTarget); byId('productName').focus(); }
  byId('adminAddProduct').addEventListener('click', openNewProduct);
  function validateImageFile(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) throw new Error('Escolha uma foto JPG, PNG ou WebP com até 5 MB.');
  }
  function validateMediaFile(file) {
    if (file?.type.startsWith('image/')) { validateImageFile(file); return; }
    if (!file || !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type) || !file.size || file.size > 25 * 1024 * 1024) throw new Error('Escolha uma foto JPG, PNG ou WebP até 5 MB, ou vídeo MP4, WebM ou MOV até 25 MB.');
  }
  function mediaPreview(url, alt = '') {
    const video = isVideoURL(url), media = node(video ? 'video' : 'img'); media.src = url;
    if (video) { media.controls = true; media.playsInline = true; media.preload = 'metadata'; media.setAttribute('aria-label', alt); }
    else { media.alt = alt; media.loading = 'lazy'; media.decoding = 'async'; }
    return media;
  }
  // As quantidades digitadas são preservadas quando a dona acrescenta um tamanho.
  function renderStockFields(capture = true) {
    if (capture) byId('productStockFields').querySelectorAll('[data-stock-size]').forEach(input => { draftStock[input.dataset.stockSize] = input.value; });
    const fragment = document.createDocumentFragment();
    D.parseSizes(byId('productSizes').value).forEach((size, index) => {
      const field = node('div', 'stock-field'), label = node('label', '', size), input = node('input');
      input.id = 'stock-size-' + index; label.htmlFor = input.id; input.type = 'number'; input.inputMode = 'numeric'; input.min = '0'; input.max = '99999'; input.step = '1'; input.required = true; input.dataset.stockSize = size; input.value = Object.hasOwn(draftStock, size) ? draftStock[size] : '0'; input.setAttribute('aria-label', 'Estoque do tamanho ' + size);
      field.append(label, input); fragment.append(field);
    });
    if (!fragment.childNodes.length) fragment.append(node('p', 'field-hint', 'Informe os tamanhos acima para preencher as quantidades.'));
    byId('productStockFields').replaceChildren(fragment);
  }
  byId('productSizes').addEventListener('input', () => renderStockFields());
  function renderGuidePreview() {
    if (guidePreviewURL) URL.revokeObjectURL(guidePreviewURL); guidePreviewURL = '';
    const file = byId('productSizeGuideUpload').files[0];
    const source = file ? (guidePreviewURL = URL.createObjectURL(file)) : byId('productSizeGuideUrl').value.trim() || retainedGuide;
    const preview = byId('productSizeGuidePreview'); preview.hidden = !source; if (source) preview.src = source; else preview.removeAttribute('src');
    byId('removeProductSizeGuide').hidden = !source;
  }
  byId('productSizeGuideUpload').addEventListener('change', () => { try { const file = byId('productSizeGuideUpload').files[0]; if (file) validateImageFile(file); renderGuidePreview(); } catch (error) { byId('productSizeGuideUpload').value = ''; formError('productError', error.message); } });
  byId('productSizeGuideUrl').addEventListener('change', renderGuidePreview);
  byId('removeProductSizeGuide').addEventListener('click', () => { retainedGuide = ''; byId('productSizeGuideUpload').value = ''; byId('productSizeGuideUrl').value = ''; renderGuidePreview(); });
  byId('productUpload').addEventListener('change', () => {
    clearUploads(); renderRetainedMedia(); const files = [...byId('productUpload').files];
    try {
      if (files.length + retainedMedia.length > 8) throw new Error('Selecione até 8 mídias por produto, incluindo as atuais.');
      files.forEach(file => { validateMediaFile(file); const media = node(file.type.startsWith('video/') ? 'video' : 'img'); media.src = URL.createObjectURL(file); uploadPreviews.push(media.src); if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; } else { media.alt = 'Prévia da foto selecionada'; media.loading = 'lazy'; } byId('productUploadPreview').append(media); });
      byId('uploadStatus').textContent = files.length ? files.length + ' mídia(s) pronta(s) para salvar.' : '';
    } catch (error) { clearUploads(); byId('productUpload').value = ''; formError('productError', error.message); }
  });
  function renderRetainedMedia() {
    byId('productUploadPreview').querySelectorAll('.existing-media').forEach(item => item.remove());
    retainedMedia.forEach((url, index) => {
      const item = node('div', 'existing-media'), image = mediaPreview(url, 'Mídia atual do produto'), remove = node('button', 'secondary-btn', 'Remover mídia'); remove.type = 'button';
      remove.addEventListener('click', () => { retainedMedia.splice(index, 1); renderRetainedMedia(); }); item.append(image, remove); byId('productUploadPreview').append(item);
    });
  }
  async function compactImage(file) {
    validateImageFile(file);
    const url = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Esta imagem não pôde ser aberta. Escolha outro arquivo.')); image.src = url; });
      if (image.naturalWidth * image.naturalHeight > 50000000) throw new Error('Esta imagem é muito grande. Escolha uma foto com menos de 50 megapixels.');
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff8f4'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let blob;
      for (const quality of [.84, .68, .5]) { blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)); if (blob && blob.size < 850000) break; }
      if (!blob || blob.size >= 850000) throw new Error('Escolha uma foto menor para enviar com mais rapidez.');
      return new File([blob], 'foto-boutique.jpg', { type: 'image/jpeg' });
    } finally { URL.revokeObjectURL(url); }
  }
  function collectStockAlerts() {
    const alerts = [];
    for (const product of products) for (const size of D.parseSizes(product.tamanhos)) {
      const stock = D.stockForSize(product, size);
      if (stock <= product.limiteReposicao) alerts.push({ product, size, stock });
    }
    return alerts;
  }
  function renderStockAlerts() {
    const toggle = byId('stockAlertsToggle'), badge = byId('stockAlertsBadge'), list = byId('stockAlertsList'), summary = byId('stockAlertCount'), empty = byId('stockAlertsEmpty');
    if (!isAdmin()) {
      toggle.hidden = true; badge.hidden = true; badge.textContent = '0';
      toggle.setAttribute('aria-label', 'Abrir alertas de estoque'); summary.textContent = ''; list.replaceChildren(); empty.hidden = true;
      return;
    }
    const alerts = collectStockAlerts(), count = alerts.length;
    toggle.hidden = false; badge.textContent = String(count); badge.hidden = !count;
    toggle.setAttribute('aria-label', count ? 'Abrir alertas de estoque: ' + count + (count === 1 ? ' alerta' : ' alertas') : 'Abrir alertas de estoque: nenhum alerta');
    summary.textContent = count ? count + (count === 1 ? ' tamanho precisa de reposição.' : ' tamanhos precisam de reposição.') : 'Nenhum tamanho precisa de reposição neste momento.';
    const fragment = document.createDocumentFragment();
    for (const alert of alerts) {
      const item = node('li', 'stock-alert-item' + (alert.stock === 0 ? ' is-empty' : ''));
      const status = node('span', 'stock-alert-status', alert.stock === 0 ? 'Esgotado' : 'Em alerta');
      const details = node('div', 'stock-alert-details');
      details.append(node('strong', '', alert.product.nome), node('span', '', 'Tamanho: ' + alert.size));
      item.append(status, details, node('span', 'stock-alert-quantity', alert.stock + (alert.stock === 1 ? ' unidade em estoque' : ' unidades em estoque')));
      fragment.append(item);
    }
    list.replaceChildren(fragment); empty.hidden = !!count;
  }
  function renderAdmin() {
    if (!isAdmin()) return;
    const fragment = document.createDocumentFragment();
    for (const product of products) {
      const line = node('li', 'admin-product'), details = node('div'), actions = node('div', 'form-actions');
      details.append(node('h4', '', product.nome), node('p', '', D.parseSizes(product.tamanhos).map(size => size + ': ' + D.stockForSize(product, size)).join(' · ') || 'Cadastre os tamanhos e o estoque'));
      if (product.preco !== null) details.append(node('p', '', product.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })));
      for (const [action, label] of [['edit', 'Editar'], ['delete', 'Excluir']]) {
        const button = node('button', 'secondary-btn', label); button.type = 'button'; button.dataset.adminAction = action; button.dataset.id = product.id; button.setAttribute('aria-label', label + ': ' + product.nome); actions.append(button);
      }
      line.append(thumbnail(product, ''), details, actions); fragment.append(line);
    }
    if (!products.length) fragment.append(node('li', '', 'Sua coleção ainda não tem peças. Adicione a primeira acima.'));
    byId('adminProducts').replaceChildren(fragment);
    renderStockAlerts();
    renderAdminContent();
  }
  async function commitProducts(nextProducts) {
    await persistStore({ products: nextProducts });
    cart = D.normalizeCart(cart, products); saveCart(); renderProducts(); renderCart(); renderAdmin();
    pendingDelete = null; byId('deletePrompt').hidden = true;
  }
  byId('productForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!adminAllowed() || storeSaving) return;
    const submit = byId('saveProduct'); if (submit.disabled) return; clearFormError('productError');
    const enteredMedia = byId('productMedia').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    // URLs digitadas formam a lista final da edição; assim a capa e a animação
    // passam a usar exatamente a mídia nova salva no Supabase, sem uma foto antiga à frente.
    const media = [...new Set(enteredMedia.length ? enteredMedia : retainedMedia)], files = [...byId('productUpload').files], tipoMidia = byId('productMediaType').value;
    if ((!media.length && !files.length) || media.length + files.length > 8 || media.some(v => !normalizeMediaURL(v, tipoMidia))) { formError('productError', 'Escolha de 1 a 8 fotos da galeria ou links diretos de fotos e vídeos.', byId('productUpload')); return; }
    const sizes = D.parseSizes(byId('productSizes').value), priceText = byId('productPrice').value.trim();
    if (!sizes.length) { formError('productError', 'Informe os tamanhos da peça, por exemplo P, M, G ou Único.', byId('productSizes')); return; }
    const stockInputs = [...byId('productStockFields').querySelectorAll('[data-stock-size]')];
    if (stockInputs.length !== sizes.length || stockInputs.some(input => !/^\d{1,5}$/.test(input.value))) { formError('productError', 'Informe uma quantidade inteira de 0 a 99999 para cada tamanho.'); return; }
    const guideUrl = byId('productSizeGuideUrl').value.trim() || retainedGuide, guideFile = byId('productSizeGuideUpload').files[0];
    if (guideUrl && (!normalizeMediaURL(guideUrl, 'image') || isVideoURL(guideUrl))) { formError('productError', 'Informe uma imagem válida para o guia de medidas.', byId('productSizeGuideUrl')); return; }
    if (priceText && !/^\d{1,8}(?:[.,]\d{1,2})?$/.test(priceText)) { formError('productError', 'Informe um preço como 169,90.', byId('productPrice')); return; }
    const editingId = Number(byId('editingProductId').value);
    if (editingId && !products.some(p => p.id === editingId)) { formError('productError', 'Esta peça foi removida. Cadastre uma nova peça.'); return; }
    if (!editingId && products.length >= 100) { formError('productError', 'O catálogo já tem 100 peças. Remova uma antes de adicionar outra.'); return; }
    const previousGuide = editingId ? products.find(product => product.id === editingId)?.guiaMedidas || '' : '';
    const draft = { id: editingId || nextId(products), nome: byId('productName').value, descricao: byId('productDescription').value, categoria: byId('productCategory').value, tamanhos: sizes.join(', '), tipoMidia, preco: priceText ? Number(priceText.replace(',', '.')) : null, midias: [...media], estoquePorTamanho: Object.fromEntries(stockInputs.map(input => [input.dataset.stockSize, Number(input.value)])), limiteReposicao: Number(byId('productStockThreshold').value), guiaMedidas: guideUrl };
    submit.disabled = true; setAdminBusy(true);
    try {
      await A.requireAdmin();
      for (const file of files) { validateMediaFile(file); byId('uploadStatus').textContent = 'Enviando suas mídias…'; draft.midias.push(await A.uploadMedia(file.type.startsWith('image/') ? await compactImage(file) : file)); }
      // A tabela preserva a resolução original para manter legíveis os números.
      if (guideFile) { validateImageFile(guideFile); byId('uploadStatus').textContent = 'Enviando o guia de medidas…'; draft.guiaMedidas = await A.uploadImage(guideFile); }
      const product = D.normalizeProduct(draft); if (!product) throw new Error('Confira o nome, as fotos e o preço da peça.');
      await commitProducts(editingId ? products.map(p => p.id === editingId ? product : p) : [...products, product]);
      if (previousGuide && previousGuide !== product.guiaMedidas) await releaseUnusedMedia(previousGuide);
      resetProductForm(); byId('productName').focus();
    } catch (error) { formError('productError', error.message || 'Não foi possível salvar. Suas informações continuam no formulário.'); }
    finally { setAdminBusy(false); submit.disabled = false; byId('uploadStatus').textContent = ''; }
  });
  byId('cancelProductEdit').addEventListener('click', () => { resetProductForm(); byId('productName').focus(); });
  function editProduct(id) {
    const product = products.find(p => p.id === id); if (!product || !adminAllowed()) return;
    resetProductForm(); byId('editingProductId').value = product.id; byId('productName').value = product.nome; retainedMedia = [...product.midias]; byId('productMedia').value = ''; renderRetainedMedia(); byId('productDescription').value = product.descricao; byId('productCategory').value = product.categoria; byId('productSizes').value = product.tamanhos; byId('productMediaType').value = product.tipoMidia; byId('productPrice').value = product.preco == null ? '' : String(product.preco).replace('.', ','); draftStock = { ...product.estoquePorTamanho }; renderStockFields(false); byId('productStockThreshold').value = product.limiteReposicao; retainedGuide = product.guiaMedidas; renderGuidePreview();
    byId('productFormTitle').textContent = 'Editar produto'; byId('saveProduct').textContent = 'Salvar alterações'; byId('cancelProductEdit').hidden = false; byId('productName').focus();
  }
  byId('adminProducts').addEventListener('click', async event => {
    const button = event.target.closest('button[data-admin-action]'); if (!button || !adminAllowed() || storeSaving) return;
    const product = products.find(p => p.id === Number(button.dataset.id)); if (!product) return;
    if (button.dataset.adminAction === 'edit') editProduct(product.id);
    else { pendingDelete = product.id; byId('deletePromptText').textContent = 'Excluir “' + product.nome + '” da coleção e da sacola?'; byId('deletePrompt').hidden = false; byId('cancelDelete').focus(); }
  });
  byId('cancelDelete').addEventListener('click', () => { pendingDelete = null; byId('deletePrompt').hidden = true; byId('adminProducts').querySelector('button')?.focus(); });
  byId('confirmDelete').addEventListener('click', async () => {
    if (!adminAllowed() || pendingDelete === null || storeSaving) return;
    try { if (Number(byId('editingProductId').value) === pendingDelete) resetProductForm(); await commitProducts(products.filter(p => p.id !== pendingDelete)); (byId('adminProducts').querySelector('button') || byId('productName')).focus(); }
    catch (error) { byId('adminStatus').textContent = error.message; }
  });
  byId('adminModal').addEventListener('close', () => { pendingDelete = null; byId('deletePrompt').hidden = true; clearContentContext(); });

  // Páginas editoriais: cada registro pode ser publicado, reordenado e removido.
  const sectionLabels = { 'elas-usam': 'Elas Usam', inauguracao: 'Inauguração', sobre: 'História da Loja' };
  let pendingContentDelete = null, retainedContentMedia = '', retainedContentType = 'auto', contentListSection = '';
  function isContentSection(section) { return Object.hasOwn(sectionLabels, section); }
  function clearContentContext() {
    contentListSection = '';
    const context = byId('contentSectionContext');
    context.hidden = true; context.textContent = '';
  }
  function setContentContext(section) {
    if (!isContentSection(section)) return false;
    contentListSection = section;
    byId('contentSection').value = section;
    const context = byId('contentSectionContext');
    context.textContent = 'Você está gerenciando as publicações de ' + sectionLabels[section] + '.';
    context.hidden = false;
    return true;
  }
  function renderSections() {
    for (const [section, gridId, emptyId] of [['elas-usam', 'elasUsamGrid', 'elasUsamEmpty'], ['inauguracao', 'inauguracaoGrid', 'inauguracaoEmpty'], ['sobre', 'storyGallery', 'storyEmpty']]) {
      const visible = sections.filter(item => item.secao === section && item.publicado), fragment = document.createDocumentFragment();
      for (const item of visible) {
        const card = node('article', 'community-card'), copy = node('div', 'community-card-copy'); card.dataset.contentId = item.id;
        if (item.midia) {
          const video = isVideoURL(item.midia) || item.tipoMidia === 'video', media = node(video ? 'video' : 'img');
          media.src = item.midia;
          if (video) { media.controls = true; media.playsInline = true; media.preload = 'metadata'; media.setAttribute('aria-label', item.alt); }
          else { media.alt = item.alt; media.loading = 'lazy'; media.decoding = 'async'; media.width = 600; media.height = 750; }
          media.addEventListener('error', () => { const fallback = node('p', 'field-hint', 'Esta mídia está indisponível no momento.'); media.replaceWith(fallback); }, { once: true });
          card.append(media);
        }
        copy.append(node('h3', '', item.titulo)); if (item.descricao) copy.append(node('p', '', item.descricao));
        if (isAdmin() && (section === 'elas-usam' || section === 'inauguracao')) {
          const edit = node('button', 'secondary-btn community-card-edit', 'Editar publicação');
          edit.type = 'button'; edit.dataset.communityContentAction = 'edit'; edit.dataset.contentSection = section; edit.dataset.contentId = item.id;
          edit.setAttribute('aria-label', 'Editar publicação ' + item.titulo); copy.append(edit);
        }
        card.append(copy); fragment.append(card);
      }
      byId(gridId).replaceChildren(fragment);
      byId(emptyId).hidden = !storeLoaded || !!visible.length || (section === 'sobre' && !!story);
    }
    byId('storyText').hidden = !story;
  }
  function renderAdminContent() {
    if (!isAdmin()) return;
    const contentRows = contentListSection ? sections.filter(item => item.secao === contentListSection) : sections;
    const fragment = document.createDocumentFragment();
    for (const item of contentRows) {
      const row = node('li', 'admin-product'), copy = node('div'), actions = node('div', 'form-actions');
      copy.append(node('h4', '', item.titulo), node('p', '', sectionLabels[item.secao] + ' · ' + (item.publicado ? 'Publicado' : 'Rascunho') + ' · Ordem ' + item.posicao));
      for (const [action, label] of [['edit', 'Editar'], ['delete', 'Excluir']]) { const button = node('button', 'secondary-btn', label); button.type = 'button'; button.dataset.contentAction = action; button.dataset.contentId = item.id; button.setAttribute('aria-label', label + ' ' + item.titulo); actions.append(button); }
      row.append(copy, actions); fragment.append(row);
    }
    if (!contentRows.length) fragment.append(node('li', 'field-hint', contentListSection ? 'Ainda não há publicações nesta página.' : 'Conte sua história e compartilhe os primeiros momentos da boutique.'));
    byId('adminContentList').replaceChildren(fragment);
  }
  function resetContentForm(section = contentListSection) { byId('contentForm').reset(); if (isContentSection(section)) byId('contentSection').value = section; byId('editingContentId').value = ''; retainedContentMedia = ''; retainedContentType = 'auto'; byId('saveContent').textContent = 'Publicar conteúdo'; byId('cancelContentEdit').hidden = true; byId('contentStatus').textContent = ''; clearFormError('contentError'); }
  function editContent(item) {
    resetContentForm(item.secao); byId('editingContentId').value = item.id; byId('contentSection').value = item.secao; byId('contentTitle').value = item.titulo; byId('contentDescription').value = item.descricao; byId('contentMediaUrl').value = item.midia; retainedContentMedia = item.midia; retainedContentType = item.tipoMidia; byId('contentAlt').value = item.alt; byId('contentPosition').value = item.posicao; byId('contentPublished').checked = item.publicado; byId('saveContent').textContent = 'Salvar alterações'; byId('cancelContentEdit').hidden = false;
  }
  function openCommunityContentEditor(section, action, trigger, id = 0) {
    if (!isContentSection(section) || !adminAllowed() || !setContentContext(section)) return;
    if (action === 'edit') {
      const item = sections.find(row => row.id === Number(id) && row.secao === section);
      if (!item) return;
      editContent(item);
    } else resetContentForm(section);
    renderAdmin(); openDialog('adminModal', trigger);
    requestAnimationFrame(() => {
      const panel = byId('contentForm').closest('.admin-section'), modal = byId('adminModal');
      modal.scrollTop = Math.max(0, panel.offsetTop - 16);
      const target = action === 'manage' ? byId('adminContentList').querySelector('button') || byId('contentTitle') : byId('contentTitle');
      target.focus({ preventScroll: true });
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-community-content-action]');
    if (!button) return;
    const action = button.dataset.communityContentAction, section = button.dataset.contentSection;
    if (!['create', 'manage', 'edit'].includes(action)) return;
    openCommunityContentEditor(section, action, button, button.dataset.contentId);
  });
  byId('cancelContentEdit').addEventListener('click', () => { resetContentForm(); byId('contentTitle').focus(); });
  byId('contentForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!adminAllowed() || storeSaving) return;
    const submit = byId('saveContent'); if (submit.disabled) return; clearFormError('contentError'); byId('contentStatus').textContent = ''; submit.disabled = true; setAdminBusy(true);
    try {
      const id = Number(byId('editingContentId').value), file = byId('contentUpload').files[0];
      if (id && !sections.some(item => item.id === id)) throw new Error('Este conteúdo já foi removido. Cadastre um novo.');
      if (!id && sections.length >= 300) throw new Error('Há 300 conteúdos cadastrados. Remova um antes de adicionar outro.');
      let midia = byId('contentMediaUrl').value.trim(), tipoMidia = midia === retainedContentMedia ? retainedContentType : 'auto';
      // URL vazia ao editar remove a mídia; o arquivo escolhido substitui a URL.
      if (file) { validateMediaFile(file); byId('contentStatus').textContent = 'Enviando a mídia…'; midia = await A.uploadMedia(file.type.startsWith('image/') ? await compactImage(file) : file); tipoMidia = file.type.startsWith('video/') ? 'video' : 'auto'; }
      const draft = { id: id || nextId(sections), secao: byId('contentSection').value, titulo: byId('contentTitle').value, descricao: byId('contentDescription').value, midia, tipoMidia, alt: byId('contentAlt').value, posicao: Number(byId('contentPosition').value), publicado: byId('contentPublished').checked };
      const item = D.normalizeSections([draft])[0]; if (!item) throw new Error('Confira o título e o endereço da mídia. Use uma foto ou vídeo válido.');
      await persistStore({ sections: D.normalizeSections(id ? sections.map(row => row.id === id ? item : row) : [...sections, item]) });
      resetContentForm(); byId('contentStatus').textContent = 'Salvo com sucesso!'; byId('contentTitle').focus();
    } catch (error) { formError('contentError', 'Erro ao salvar: ' + error.message); byId('contentStatus').textContent = ''; }
    finally { setAdminBusy(false); submit.disabled = false; }
  });
  byId('adminContentList').addEventListener('click', event => {
    const button = event.target.closest('[data-content-action]'); if (!button || !adminAllowed() || storeSaving) return;
    const item = sections.find(row => row.id === Number(button.dataset.contentId)); if (!item) return;
    if (button.dataset.contentAction === 'delete') { pendingContentDelete = item.id; byId('contentDeletePrompt').hidden = false; byId('cancelContentDelete').focus(); return; }
    editContent(item); byId('contentTitle').focus();
  });
  byId('cancelContentDelete').addEventListener('click', () => { pendingContentDelete = null; byId('contentDeletePrompt').hidden = true; byId('contentTitle').focus(); });
  byId('confirmContentDelete').addEventListener('click', async () => {
    if (!adminAllowed() || storeSaving || pendingContentDelete === null) return;
    try { const id = pendingContentDelete; await persistStore({ sections: sections.filter(item => item.id !== id) }); pendingContentDelete = null; byId('contentDeletePrompt').hidden = true; if (Number(byId('editingContentId').value) === id) resetContentForm(); byId('contentTitle').focus(); }
    catch (error) { formError('contentError', 'Erro ao excluir: ' + error.message); }
  });

  // CMS de textos e imagens: chaves permitidas vêm exclusivamente do HTML da loja.
  const editableElements = new Map([...document.querySelectorAll('[data-edit-key]')].map(element => [element.dataset.editKey, element]));
  const contentDefaults = Object.fromEntries([...editableElements].map(([key, element]) => [key, element.dataset.editType === 'image' ? element.getAttribute('src') : element.innerText]));
  const contentDefaultNodes = new Map([...editableElements].map(([key, element]) => [key, [...element.childNodes].map(child => child.cloneNode(true))]));
  let content = {}, editingContentKey = '';
  function normalizeContentValue(key, value) {
    const element = editableElements.get(key); if (!element) return '';
    const type = element.dataset.editType, text = D.cleanText(value, 4000);
    if (type === 'image') { const url = normalizeMediaURL(value, 'image'); return url && !isVideoURL(url) ? url : ''; }
    if (type === 'phone') return /^\+?[\d\s().-]+$/.test(text) && /^\d{10,15}$/.test(text.replace(/\D/g, '')) ? text : '';
    if (type === 'instagram') return /^@?[a-z0-9._]{1,30}$/i.test(text) ? text : '';
    return text;
  }
  function loadContent(raw = {}) {
    content = {};
    for (const key of editableElements.keys()) { if (!Object.hasOwn(raw, key)) continue; const value = normalizeContentValue(key, raw[key]); if (value || editableElements.get(key).dataset.editType === 'text') content[key] = value; }
  }
  function phoneNumber() { const raw = (content.contactPhone || contentDefaults.contactPhone || '5511989423365').replace(/\D/g, ''); return raw.length <= 11 ? '55' + raw : raw; }
  function whatsappURL(message = '') { return 'https://wa.me/' + phoneNumber() + (message ? '?text=' + encodeURIComponent(message) : ''); }
  function applyContent() {
    for (const [key, element] of editableElements) {
      const value = key === 'story' ? story : content[key] ?? contentDefaults[key];
      if (element.dataset.editType === 'image') element.src = value;
      else if (Object.hasOwn(content, key) || key === 'story') element.textContent = value;
      else element.replaceChildren(...contentDefaultNodes.get(key).map(child => child.cloneNode(true)));
    }
    document.querySelectorAll('a[href]').forEach(link => {
      if (/^https:\/\/wa\.me\//.test(link.href)) { const message = new URL(link.href).searchParams.get('text') || ''; link.href = whatsappURL(message); }
      if (/^https:\/\/www\.instagram\.com\//.test(link.href)) link.href = 'https://www.instagram.com/' + (content.contactInstagram || contentDefaults.contactInstagram || 'usenandaboutique').replace(/^@/, '') + '/';
    });
    byId('storyText').hidden = !story; syncCheckout();
  }
  const brandKeys = new Set(['logoHeader', 'storeName', 'headerCaption']);
  const inlineEditorExclusions = new Set([...brandKeys, 'signupWelcome']);
  function contentValue(key) { return key === 'story' ? story : content[key] ?? contentDefaults[key]; }
  function openContentEditor(key, trigger) {
    const field = editableElements.get(key);
    if (!field || !adminAllowed() || adminBusy) return;
    const image = field.dataset.editType === 'image';
    editingContentKey = key;
    byId('contentEditorTitle').textContent = 'Editar ' + (field.dataset.editLabel || 'conteúdo');
    byId('contentEditorLabel').textContent = image ? 'URL da imagem' : field.dataset.editType === 'phone' ? 'WhatsApp com DDD (e código do país, se necessário)' : field.dataset.editType === 'instagram' ? 'Usuário do Instagram' : 'Texto';
    byId('contentImageUploadField').hidden = !image;
    byId('contentImageUpload').value = '';
    byId('contentEditorValue').required = !image && field.dataset.editType !== 'text';
    byId('contentEditorValue').value = contentValue(key);
    byId('contentEditorValue').placeholder = image ? 'Mantenha a foto atual, escolha uma da galeria ou cole uma URL.' : '';
    clearFormError('contentEditorError');
    openDialog('contentEditorModal', trigger);
    byId('contentEditorValue').focus();
  }
  loadContent();
  for (const [key, element] of editableElements) {
    if (inlineEditorExclusions.has(key) || element.dataset.editorWired === 'true') continue;
    const image = element.dataset.editType === 'image';
    const anchor = element.closest('a');
    const target = anchor || element;
    // Uma âncora com vários campos deve ganhar um editor agrupado explícito.
    // Esta trava impede wrappers/pencils aninhados caso o HTML evolua.
    if (target.dataset.editorWired === 'true') continue;
    target.dataset.editorWired = 'true';
    const wrapper = node('div', image ? 'editable-image' : 'editable-field');
    target.before(wrapper); wrapper.append(target);
    const pencil = node('button', 'edit-pencil', '✎');
    pencil.type = 'button'; pencil.hidden = !isAdmin(); pencil.dataset.editContent = key;
    pencil.setAttribute('aria-label', 'Editar ' + (element.dataset.editLabel || key));
    pencil.setAttribute('aria-haspopup', 'dialog'); pencil.setAttribute('aria-controls', 'contentEditorModal');
    wrapper.append(pencil); element.dataset.editorWired = 'true';
    pencil.addEventListener('click', () => openContentEditor(key, pencil));
  }
  byId('contentEditorForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!adminAllowed() || storeSaving) return;
    const key = editingContentKey, field = editableElements.get(key), image = field?.dataset.editType === 'image', file = byId('contentImageUpload').files[0], submit = event.currentTarget.querySelector('[type="submit"]'); if (submit.disabled) return; submit.disabled = true;
    try {
      let value = normalizeContentValue(key, byId('contentEditorValue').value);
      if (image && file) value = await A.uploadImage(await compactImage(file));
      if (!value && image && !file && !byId('contentEditorValue').value.trim()) value = content[key] || contentDefaults[key];
      if (!value && field?.dataset.editType !== 'text') throw new Error('Confira o conteúdo. Informe uma imagem, um telefone com DDD ou um usuário de Instagram válido para o campo.');
      await persistStore({ content: { ...content, [key]: value }, ...(key === 'story' ? { story: value } : {}) });
      byId('contentEditorModal').close();
    } catch (error) { formError('contentEditorError', error.message || 'Não foi possível salvar. Tente novamente.', byId('contentEditorValue')); }
    finally { submit.disabled = false; }
  });
  byId('contentEditorModal').addEventListener('close', () => { editingContentKey = ''; byId('contentImageUpload').value = ''; });
  function openBrandEditor(trigger) {
    if (!adminAllowed() || adminBusy) return;
    byId('brandLogoUrl').value = contentValue('logoHeader');
    byId('brandLogoUpload').value = '';
    byId('brandName').value = contentValue('storeName');
    byId('brandCaption').value = contentValue('headerCaption');
    clearFormError('brandEditorError');
    openDialog('brandEditorModal', trigger);
    byId('brandName').focus();
  }
  byId('editBrand').addEventListener('click', event => openBrandEditor(event.currentTarget));
  byId('brandEditorForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!adminAllowed() || storeSaving) return;
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true; clearFormError('brandEditorError');
    try {
      const file = byId('brandLogoUpload').files[0];
      let logo = normalizeContentValue('logoHeader', byId('brandLogoUrl').value);
      if (file) { validateImageFile(file); logo = await A.uploadImage(await compactImage(file)); }
      const name = normalizeContentValue('storeName', byId('brandName').value);
      const caption = normalizeContentValue('headerCaption', byId('brandCaption').value);
      if (!logo || !name || !caption) throw new Error('Informe um logo válido, o nome da loja e a legenda do cabeçalho.');
      await persistStore({ content: { ...content, logoHeader: logo, storeName: name, headerCaption: caption } });
      byId('brandEditorModal').close();
    } catch (error) {
      formError('brandEditorError', error.message || 'Não foi possível salvar a marca. Tente novamente.');
    } finally {
      submit.disabled = false;
    }
  });
  byId('brandEditorModal').addEventListener('close', () => { byId('brandLogoUpload').value = ''; });
  byId('editWelcomeMessage').addEventListener('click', event => openContentEditor('signupWelcome', event.currentTarget));

  // Depoimentos: autoria verificada no servidor, sem e-mails no conteúdo público.
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
      card.append(node('p', 'review-author', review.name), stars, node('p', 'review-comment', review.comentario));
      if (review.ownerId && review.ownerId === reviewOwner()) { const remove = node('button', 'text-button review-delete', 'Excluir minha avaliação'); remove.type = 'button'; remove.dataset.reviewId = review.id; card.append(remove); }
      fragment.append(card);
    }
    reviewTrack.replaceChildren(fragment); reviewTrack.hidden = !reviews.length; byId('reviewsEmpty').hidden = !!reviews.length; byId('reviewNavigation').hidden = reviews.length < 2; reviewTrack.scrollLeft = 0; updateReviewNavigation();
  }
  const moveReview = delta => { const { step, max } = reviewMetrics(); reviewTrack.scrollTo({ left: Math.max(0, Math.min(max, reviewTrack.scrollLeft + delta * step)), behavior: reducedMotion.matches ? 'instant' : 'smooth' }); };
  byId('reviewPrevious').addEventListener('click', () => moveReview(-1)); byId('reviewNext').addEventListener('click', () => moveReview(1));
  reviewTrack.addEventListener('scroll', () => { if (!reviewScrollFrame) reviewScrollFrame = requestAnimationFrame(() => { reviewScrollFrame = 0; updateReviewNavigation(); }); }, { passive: true });
  reviewTrack.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveReview(event.key === 'ArrowLeft' ? -1 : 1); } });
  async function refreshReviews() {
    const loaded = await A.loadReviews(); reviews = D.loadReviews(JSON.stringify(loaded || []));
    renderReviews();
  }
  byId('writeReview').addEventListener('click', event => {
    if (!isSignedIn()) { showLogin(event.currentTarget); formError('loginError', 'Entre na sua conta para avaliar. Visitantes anônimos não podem deixar avaliações.'); return; }
    byId('reviewEmail').value = profile.email; clearFormError('reviewError'); openDialog('reviewModal', event.currentTarget);
  });
  byId('reviewForm').addEventListener('submit', async event => {
    event.preventDefault(); clearFormError('reviewError');
    if (!isSignedIn()) { byId('reviewModal').close(); showLogin(byId('writeReview')); return; }
    const submit = event.currentTarget.querySelector('[type="submit"]'); if (submit.disabled) return;
    if (!D.normalizeCPF(byId('reviewCPF').value)) { formError('reviewError', 'Informe seu CPF com 11 dígitos. Ele não será exibido nem armazenado.', byId('reviewCPF')); return; }
    const checked = byId('reviewForm').querySelector('input[name="rating"]:checked');
    const review = D.normalizeReview({ id: nextId(reviews), estrelas: Number(checked?.value), comentario: byId('reviewComment').value, criadoEm: Date.now(), name: profile.name, ownerId: reviewOwner() });
    if (!review) { formError('reviewError', 'Escolha de 1 a 5 estrelas e escreva um comentário com pelo menos 3 caracteres.'); return; }
    submit.disabled = true;
    try { await A.submitReview(review); await refreshReviews(); byId('reviewForm').reset(); byId('reviewModal').close(); notify('Obrigada pelo carinho! Sua avaliação foi salva.'); }
    catch (error) { formError('reviewError', error.message || 'Não foi possível salvar sua avaliação.'); }
    finally { submit.disabled = false; }
  });
  byId('reviewModal').addEventListener('close', () => { byId('reviewCPF').value = ''; });
  reviewTrack.addEventListener('click', async event => {
    const button = event.target.closest('[data-review-id]'); if (!button || button.disabled || !isSignedIn()) return;
    const review = reviews.find(row => row.id === Number(button.dataset.reviewId)); if (!review?.ownerId || review.ownerId !== reviewOwner()) return;
    button.disabled = true;
    try { await A.deleteReview(review.id); await refreshReviews(); byId('writeReview').focus({ preventScroll: true }); notify('Sua avaliação foi excluída.'); }
    catch (error) { button.disabled = false; notify(error.message || 'Não foi possível excluir sua avaliação.'); }
  });

  function bounceBag() {
    byId('bagCount').classList.add('bag-highlight');
    setTimeout(() => byId('bagCount').classList.remove('bag-highlight'), 900);
    if (reducedMotion.matches || typeof bag.animate !== 'function') return;
    bagAnimation?.cancel(); bagAnimation = bag.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-5px) rotate(-5deg)' }, { transform: 'translateY(0) rotate(4deg)' }, { transform: 'translateY(-2px) rotate(-2deg)' }, { transform: 'translateY(0) rotate(0)' }], { duration: 650, easing: 'ease-in-out' });
  }
  function clearCelebration() { document.querySelectorAll('.celebration-petal').forEach(petal => petal.remove()); }
  function celebrateSignup() {
    clearCelebration(); if (reducedMotion.matches || forcedColors.matches) return;
    for (let i = 0; i < 36; i++) {
      const petal = node('span', 'celebration-petal', '🌸'); petal.setAttribute('aria-hidden', 'true'); petal.style.setProperty('--left', Math.random() * 100 + '%'); petal.style.setProperty('--duration', 4 + Math.random() * 3 + 's'); petal.style.setProperty('--drift', Math.random() * 100 - 50 + 'px'); petal.style.animationDelay = Math.random() * 2 + 's';
      byId('signupSuccessModal').append(petal); petal.addEventListener('animationend', () => petal.remove(), { once: true });
    }
    setTimeout(clearCelebration, 10000);
  }
  byId('signupSuccessModal').addEventListener('close', () => { clearCelebration(); applyContent(); });

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
    // A origem é sempre a mídia do produto atual vindo do Supabase, nunca o src
    // de uma imagem antiga do DOM. Cada upload recebe uma URL única no Storage.
    const activeIndex = Number(button.closest('.product-card').querySelector('.media-track')?.dataset.activeIndex || 0);
    const activeURL = product.midias[activeIndex];
    carriedProduct.src = activeURL && !productVideoURL(activeURL, product) ? activeURL : product.midias.find(src => !productVideoURL(src, product)) || './img/sacola-carrinho.png';
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
  function motionChanged() { if (reducedMotion.matches || forcedColors.matches) { cancelFlights(); clearPetals(); clearCelebration(); } else { dropPetals(false); dropPetals(true); } }
  reducedMotion.addEventListener('change', motionChanged); forcedColors.addEventListener('change', motionChanged);
  const measure = () => { document.documentElement.style.setProperty('--header-height', Math.ceil(document.querySelector('.store-header').getBoundingClientRect().height) + 'px'); updateReviewNavigation(); };
  if (typeof ResizeObserver === 'function') { const observer = new ResizeObserver(measure); observer.observe(document.querySelector('.store-header')); observer.observe(reviewTrack); } else window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('resize', cancelFlights, { passive: true });
  let storeRequest = null;
  function refreshStore() {
    if (storeRequest) return storeRequest;
    checkoutVerified = ''; checkoutVerifiedAt = 0;
    storeLoading = true; storeLoadError = false; renderProducts(); syncCheckout();
    storeRequest = (async () => {
      try {
        const loaded = await A.loadStore();
        const previousCart = JSON.stringify(cart);
        products = D.loadProducts(JSON.stringify(loaded?.products || []));
        story = loaded && Object.hasOwn(loaded, 'story') ? D.cleanText(loaded.story, 4000) : D.DEFAULT_STORY;
        sections = D.normalizeSections(loaded?.sections); loadContent(loaded?.content || {}); storeLoaded = true;
        cart = D.normalizeCart(cart, products); saveCart(); applyContent(); renderCart(); renderSections(); renderAdmin(); renderStockAlerts();
        if (previousCart !== JSON.stringify(cart)) notify('A disponibilidade mudou. Sua sacola foi ajustada ao estoque atual.');
      } catch (error) { storeLoadError = true; throw error; }
      finally { storeLoading = false; storeRequest = null; renderProducts(); syncCheckout(); }
    })();
    return storeRequest;
  }
  byId('catalogRetry').addEventListener('click', () => refreshStore().catch(error => notify(error.message || 'Não foi possível carregar a coleção.')));
  window.addEventListener('storage', event => {
    if (event.key === D.KEYS.cart) { memory.delete(D.KEYS.cart); const saved = parse(read(D.KEYS.cart), []); cart = storeLoaded ? D.normalizeCart(saved, products) : Array.isArray(saved) ? saved : []; renderCart(true); }
  });
  // Voltar de outro aplicativo busca novamente preço, imagem e estoque.
  function refreshOnReturn() { if (!document.hidden && !storeSaving && !storeLoading && !document.querySelector('dialog[open]')) refreshStore().catch(() => {}); }
  window.addEventListener('online', refreshOnReturn); window.addEventListener('focus', refreshOnReturn);
  document.addEventListener('visibilitychange', refreshOnReturn);

  byId('storyText').textContent = story; byId('year').textContent = new Date().getFullYear();
  applyContent(); syncProfile(); renderProducts(); renderCart(); renderReviews(); renderSections(); syncRoute({ focus: editorialRoutes.has(currentHash()) }); renderStockFields(false); measure();
  dropPetals(false); dropPetals(true);
  A.subscribe(() => {
    saveProfile();
    if (!isAdmin()) { byId('adminModal').close(); byId('stockAlertsModal').close(); byId('contentEditorModal').close(); byId('brandEditorModal').close(); }
    if (!isSignedIn()) byId('reviewModal').close();
    refreshReviews().catch(() => {});
  });
  Promise.allSettled([A.restore(), refreshStore()]).then(results => {
    saveProfile(); refreshReviews().catch(() => notify('Não foi possível atualizar as avaliações agora.'));
    if (A.getState().recovery) openDialog('updatePasswordModal', byId('accountToggle'));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) notify(failed.reason?.message || 'Não foi possível carregar a loja. Use Tentar novamente na coleção.');
  });
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
