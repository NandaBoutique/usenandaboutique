// Teste real no Chrome/Edge, sem dependências npm e sem enviar mensagens.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(__dirname, "artifacts");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, chrome, ws;
const failures = [], errors = [], responses = [], requests = [];
const pending = new Map();
let messageId = 0;
let send, evaluate;
const expectedNames = ["Calça Jeans com Brilho", "Look Listras e Rosa", "Coleção de Cintos", "Conjunto Saia e Camisa Renda", "Calça Listrada Verão"];
const widths = [320, 390, 768, 1024, 1440, 1920];

async function until(expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await evaluate(expression)) return; } catch { /* Aguardar navegação. */ }
    await delay(120);
  }
  throw Error("Tempo esgotado: " + label);
}
async function check(name, callback) {
  try { await callback(); console.log("PASS " + name); }
  catch (error) { failures.push(name + ": " + error.message); console.error("FAIL " + name + ": " + error.message); }
}
async function viewport(width, height = 900) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await delay(180);
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from(result.data, "base64"));
}
async function key(key, code, windowsVirtualKeyCode) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}
async function reload() {
  await send("Page.reload", { ignoreCache: false });
  await delay(200);
  await until("document.readyState === 'complete' && typeof BoutiqueAuth !== 'undefined' && document.querySelector('#catalogLoading')?.hidden", "carregamento");
}
async function main() { console.log("Iniciando verificações no navegador...");
  fs.mkdirSync(artifacts, { recursive: true });
  const browserPath = process.env.CHROME_PATH || [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].find(file => fs.existsSync(file));
  assert(browserPath, "Chrome ou Edge não encontrado.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nanda-boutique-test-"));
  const uploadFile = path.join(profile, "foto-da-galeria.png"); fs.copyFileSync(path.join(root, "img", "look-listras-rosa-1.jpg"), uploadFile);
  server = http.createServer((req, res) => {
    let file;
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw Error("404");
    } catch { res.writeHead(404).end(); return; }
    const type = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".mp4": "video/mp4" }[path.extname(file)];
    const size = fs.statSync(file).size;
    res.setHeader("Content-Type", type || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start >= size) { res.writeHead(416).end(); return; }
      res.writeHead(206, { "Content-Range": "bytes " + start + "-" + end + "/" + size, "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", size);
      fs.createReadStream(file).pipe(res);
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const api = "https://gisoblzonuzpowkwrwnq.supabase.co";
  const officialEmail = "usenandaboutiquee@gmail.com";
  const makeUser = (email, id) => ({ id, email, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false, user_metadata: { name: email === officialEmail ? "Nanda" : "Cliente Teste", full_name: email === officialEmail ? "Nanda" : "Cliente Teste" } });
  const users = { admin: makeUser(officialEmail, "11111111-1111-4111-8111-111111111111"), client: makeUser("cliente@example.com", "22222222-2222-4222-8222-222222222222") };
  const seedStore = () => ({ products: [
    { id: 41, nome: "Vestido Aurora", descricao: "Tecido leve e delicado", categoria: "Conjuntos & Macacões", tamanhos: "P, M, G", estoquePorTamanho: { P: 3, M: 2, G: 0 }, limiteReposicao: 2, preco: 129.9, midias: ["./img/look-listras-rosa-1.jpg", "./img/look-listras-rosa-2.jpg", "./img/look-listras-rosa-4.mp4"], guiaMedidas: api + "/storage/v1/object/public/boutique-media/guia-original.jpg" },
    { id: 42, nome: "Saia Coração", descricao: "Saia para todos os momentos", categoria: "Conjuntos & Macacões", tamanhos: "P, M", estoquePorTamanho: { P: 4, M: 0 }, limiteReposicao: 2, preco: 80, midias: ["./img/conjunto-renda-1.jpg"] }
  ], story: "História cadastrada no Supabase.", content: {}, sections: [] });
  const fixture = { configured: true, store: seedStore(), version: 1, reviews: [], calls: [], rpcAdmin: true, readDelay: 0, readError: false, saveError: false };
  const updatedAt = () => "2026-09-12T12:00:" + String(fixture.version).padStart(2, "0") + ".000Z";
  const resetFixture = () => { Object.assign(fixture, { configured: true, store: seedStore(), version: 1, reviews: [], calls: [], rpcAdmin: true, readDelay: 0, readError: false, saveError: false }); };
  const fulfill = (requestId, payload, status = 200, type = "application/json") => send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: type }, { name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, PUT, OPTIONS" }], body: Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)).toString("base64") });
  const intercept = async event => {
    const { requestId, request } = event;
    const url = new URL(request.url);
    if (url.pathname.endsWith("/config.js")) return fulfill(requestId, "globalThis.NANDA_CONFIG=Object.freeze(" + JSON.stringify(fixture.configured ? { supabaseUrl: api, supabaseAnonKey: "sb_publishable_nanda_test_public_key_only_123456789" } : { supabaseUrl: "", supabaseAnonKey: "" }) + ");", 200, "text/javascript");
    if (url.origin !== api) return send("Fetch.continueRequest", { requestId });
    if (request.method === "OPTIONS") return fulfill(requestId, "");
    let body = {}; try { body = JSON.parse(request.postData || "{}"); } catch {}
    const header = Object.entries(request.headers).find(([key]) => key.toLowerCase() === "authorization")?.[1] || "";
    const kind = header.includes("access-admin") ? "admin" : "client";
    const user = users[kind];
    fixture.calls.push({ path: url.pathname, method: request.method, body, kind });
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "refresh_token") { const role = body.refresh_token?.includes("admin") ? "admin" : "client"; return fulfill(requestId, { access_token: "access-" + role, refresh_token: "refresh-" + role, expires_in: 3600, user: users[role] }); }
      if (body.password !== (body.email === officialEmail ? "nanda100239" : "SenhaTeste!123") || ![officialEmail, "cliente@example.com"].includes(body.email)) return fulfill(requestId, { msg: "Invalid login credentials" }, 400);
      const role = body.email === officialEmail ? "admin" : "client";
      return fulfill(requestId, { access_token: "access-" + role, refresh_token: "refresh-" + role, expires_in: 3600, user: users[role] });
    }
    if (url.pathname === "/auth/v1/user") return fulfill(requestId, user);
    if (url.pathname === "/auth/v1/signup") return fulfill(requestId, { user: { ...users.client, email: body.email, email_confirmed_at: null }, session: null });
    if (["/auth/v1/recover", "/auth/v1/logout"].includes(url.pathname)) return fulfill(requestId, {});
    if (url.pathname === "/rest/v1/rpc/is_store_admin") return fulfill(requestId, kind === "admin" && fixture.rpcAdmin);
    if (url.pathname === "/rest/v1/boutique_store") {
      if (["POST", "PATCH"].includes(request.method)) {
        if (kind !== "admin" || !fixture.rpcAdmin) return fulfill(requestId, { message: "Forbidden" }, 403);
        if (fixture.saveError) return fulfill(requestId, { message: "Falha de teste ao salvar" }, 500);
        if (request.method === "PATCH" && url.searchParams.get("updated_at") !== "eq." + updatedAt()) return fulfill(requestId, []);
        if (request.method === "POST" && fixture.store) return fulfill(requestId, { message: "Conflict" }, 409);
        fixture.store = body.payload; fixture.version++;
        return fulfill(requestId, [{ id: "main", payload: fixture.store, updated_at: updatedAt() }]);
      }
      if (fixture.readDelay) await delay(fixture.readDelay);
      if (fixture.readError) return fulfill(requestId, { message: "Falha de teste ao carregar" }, 500);
      return fulfill(requestId, fixture.store ? [{ payload: fixture.store, updated_at: updatedAt() }] : []);
    }
    if (url.pathname === "/rest/v1/rpc/boutique_list_reviews") return fulfill(requestId, fixture.reviews.map(review => ({ ...review, owner_id: header && review.owner_id === user.id ? user.id : null })));
    if (url.pathname === "/rest/v1/rpc/boutique_submit_review") {
      if (fixture.reviews.some(review => review.owner_id === user.id)) return fulfill(requestId, { message: "Uma avaliação por cliente" }, 409);
      const review = { id: body.review_id, owner_id: user.id, display_name: user.user_metadata.name, stars: body.review_stars, comment: body.review_comment, created_at: new Date().toISOString() };
      fixture.reviews.unshift(review); return fulfill(requestId, [review]);
    }
    if (url.pathname === "/rest/v1/rpc/boutique_delete_review") { const owned = fixture.reviews.some(review => review.id === body.review_id && review.owner_id === user.id); fixture.reviews = fixture.reviews.filter(review => review.id !== body.review_id || review.owner_id !== user.id); return fulfill(requestId, owned); }
    if (url.pathname.startsWith("/storage/v1/object/public/") && request.method === "GET") return send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "image/jpeg" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: fs.readFileSync(path.join(root, "img", "look-listras-rosa-1.jpg")).toString("base64") });
    if (url.pathname.startsWith("/storage/v1/object/")) return fulfill(requestId, { Key: url.pathname.replace("/storage/v1/object/", "") });
    return fulfill(requestId, { message: "Endpoint não simulado: " + url.pathname }, 404);
  };
  chrome = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--remote-debugging-port=0", "--user-data-dir=" + profile, base], { windowsHide: true, stdio: "ignore" });
  const activePort = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 150 && !fs.existsSync(activePort); i++) await delay(100);
  assert(fs.existsSync(activePort), "O navegador não iniciou a depuração.");
  const port = fs.readFileSync(activePort, "utf8").split("\n")[0];
  console.log("Chrome iniciou. Conectando ao DevTools na porta " + port);
  const pages = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
  console.log("Conectando à página de teste...");
  ws = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id);
      if (callback) {
        pending.delete(message.id);
        message.error ? callback.reject(Error(JSON.stringify(message.error))) : callback.resolve(message.result);
      }
    } else if (message.method === "Fetch.requestPaused") intercept(message.params).catch(error => errors.push({ mock: error.message }));
    else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    else if (message.method === "Network.responseReceived") responses.push(message.params.response);
    else if (message.method === "Network.requestWillBeSent") requests.push({ type: message.params.type, url: message.params.request.url });
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout: " + method)); }, 20000); pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  console.log("DevTools conectado. Abrindo a loja...");
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/config.js" }, { urlPattern: api + "/*" }] });
  await send("Page.navigate", { url: base });
  await until("document.readyState === 'complete' && typeof BoutiqueAuth !== 'undefined' && document.querySelector('#catalogLoading')?.hidden", "primeira abertura");
  await evaluate("localStorage.clear()");
  await reload();

  const browser = (callback, ...args) => evaluate("(" + callback.toString() + ")(..." + JSON.stringify(args) + ")");
  const fresh = async (prepare) => { resetFixture(); prepare?.(fixture); await browser(() => { localStorage.clear(); sessionStorage.clear(); }); await reload(); await until("BoutiqueAuth.mode() === 'supabase'", "Supabase configurado"); };
  const click = selector => browser(selector => { const el = document.querySelector(selector); if (!el) throw Error("Alvo inexistente: " + selector); el.click(); }, selector);
  const change = (selector, value) => browser((selector, value) => { const el = document.querySelector(selector); if (!el) throw Error("Campo inexistente: " + selector); el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, selector, value);
  const closeDialogs = async () => { await browser(() => document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close())); await delay(60); };
  const submit = selector => browser(selector => document.querySelector(selector).requestSubmit(), selector);
  const cart = () => browser(() => JSON.parse(localStorage.getItem(BoutiqueData.KEYS.cart) || '[]'));
  const add = async (id = 41, size = "P", count = 1) => { await change('.product-card[data-id="' + id + '"] .product-size-select', size); await browser((id, count) => { const button = document.querySelector('.product-card[data-id="' + id + '"] .product-action'); for (let i = 0; i < count; i++) button.click(); }, id, count); };
  const login = async (email = officialEmail) => {
    if (await evaluate("!!BoutiqueAuth.getState().user")) { await click("#accountToggle"); await until("!BoutiqueAuth.getState().user", "logout"); }
    await click("#accountToggle"); await change("#adminUsername", email); await change("#adminPassword", email === officialEmail ? "nanda100239" : "SenhaTeste!123"); await submit("#loginForm");
    await until("BoutiqueAuth.getState().user?.email === " + JSON.stringify(email) + " && !document.querySelector('#loginModal').open", "login remoto");
  };
  const upload = async selector => {
    const dom = await send("DOM.getDocument"), input = await send("DOM.querySelector", { nodeId: dom.root.nodeId, selector });
    assert(input.nodeId, selector); await send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [uploadFile] });
  };

  await check("Supabase alimenta catálogo, menu completo e perfil forjado não libera painel", async () => {
    await fresh();
    assert.deepEqual(await browser(() => [...document.querySelectorAll('.product-card h3')].map(el => el.textContent)), ["Vestido Aurora", "Saia Coração"]);
    const links = await browser(() => [...document.querySelectorAll('.store-header a[href^="#"]')].map(el => ({ text: el.textContent.trim(), target: !!document.querySelector(el.getAttribute('href')) })));
    for (const name of ["Coleção", "Elas Usam", "Inauguração", "Nossa História"]) assert(links.some(link => link.text === name && link.target), name);
    await browser(() => { localStorage.setItem('userRole', 'admin'); localStorage.setItem('nanda-boutique-perfil-v1', JSON.stringify({ role: 'admin', email: 'usenandaboutiquee@gmail.com' })); });
    await reload(); assert.notEqual(await evaluate("BoutiqueAuth.getState().role"), "admin"); assert.equal(await evaluate("document.querySelector('#adminToggle').hidden"), true);
    assert(fixture.calls.some(call => call.path === '/rest/v1/boutique_store' && call.method === 'GET'));
  });
  await check("cliente recebe saudação, sessão restaurada e cadastro solicita confirmação", async () => {
    await fresh(); await login('cliente@example.com');
    assert.match(await evaluate("document.querySelector('#customerGreeting').textContent"), /Olá.*Cliente Teste/);
    assert.equal(await evaluate("document.querySelector('#adminToggle').hidden"), true);
    await reload(); await until("BoutiqueAuth.getState().role === 'client'", "sessão de cliente restaurada");
    assert.equal(await evaluate("/SenhaTeste!123|nanda100239/.test(JSON.stringify(localStorage) + JSON.stringify(sessionStorage))"), false);
    await click('#accountToggle'); await until("!BoutiqueAuth.getState().user", "saída cliente");
    await click('#accountToggle'); await click('#registerTab'); await until("!document.querySelector('#registerPanel').hidden", 'aba de cadastro');
    for (const [id, value] of Object.entries({ registerName: 'Cliente Teste', registerEmail: 'cliente@example.com', registerCPF: '529.982.247-25', registerPassword: 'SenhaTeste!123', registerConfirmPassword: 'SenhaTeste!123' })) await change('#' + id, value);
    await submit('#registerForm'); await until("document.querySelector('#signupSuccessModal').open", "confirmação de cadastro");
    assert.match(await evaluate("document.querySelector('#signupSuccessText').textContent"), /e-mail|email/i);
    assert.equal(await evaluate("BoutiqueAuth.getState().role"), 'guest');
  });
  await check("loader, erro recuperável e estados vazios não mostram catálogo antigo", async () => {
    await fresh(); fixture.readDelay = 1200;
    await send('Page.reload'); await until("document.querySelector('#catalogLoading') && !document.querySelector('#catalogLoading').hidden", "skeleton visível");
    assert.equal(await evaluate("document.querySelectorAll('.product-card').length"), 0);
    await until("document.querySelector('#catalogLoading').hidden && document.querySelectorAll('.product-card').length === 2", "catálogo carregou");
    fixture.readDelay = 0; fixture.readError = true; await reload();
    assert.equal(await evaluate("document.querySelector('#catalogError').hidden"), false);
    fixture.readError = false; await click('#catalogRetry'); await until("document.querySelectorAll('.product-card').length === 2 && document.querySelector('#catalogError').hidden", "repetição bem sucedida");
    fixture.store = { products: [], content: {}, story: '', sections: [] }; fixture.version++; await reload();
    assert.equal(await evaluate("document.querySelectorAll('.product-card').length"), 0);
    for (const section of ['#colecao', '#elas-usam', '#inauguracao']) assert.match(await browser(selector => document.querySelector(selector).textContent, section), /breve|novidades/i);
  });
  await check("estoque exato, guia individual e mensagens dinâmicas de atendimento", async () => {
    await fresh(); await click('.product-card[data-id="41"] .product-action'); assert.equal((await cart()).length, 0);
    await change('.product-card[data-id="41"] .product-size-select', 'P');
    assert.match(await evaluate("document.querySelector('.product-card[data-id=\"41\"]').textContent"), /3.*(?:dispon|estoque|unidade)/i);
    await click('.product-card[data-id="41"] .size-guide-link');
    assert.equal(await evaluate("document.querySelector('#sizeGuideModal img').getAttribute('src')"), fixture.store.products[0].guiaMedidas);
    await closeDialogs(); await click('.product-card[data-id="42"] .size-guide-link');
    assert.equal(await evaluate("document.querySelector('#sizeGuideModal img')?.getClientRects().length || 0"), 0); await closeDialogs();
    await change('.product-card[data-id="41"] .product-size-select', 'G');
    assert.equal(await evaluate("document.querySelector('.product-card[data-id=\"41\"] .restock-btn').hidden"), false);
    const links = await browser(() => [...document.querySelectorAll('.product-card[data-id="41"] a[href*="wa.me"]')].map(el => ({ text: el.textContent, message: new URL(el.href).searchParams.get('text') })));
    for (const label of ['Avisar quando chegar', 'Tire Dúvidas']) assert(links.some(link => link.text.includes(label) && link.message.includes('Vestido Aurora')), label);
    await add(41, 'P', 8); assert.equal((await cart())[0].quantity, 3);
  });
  await check("checkout detalha valores e pagamento, bloqueia quantidade acima do estoque", async () => {
    await fresh(); await add(41, 'P', 2); await add(42, 'P'); await reload(); await click('#shoppingBag');
    for (const action of ['click', 'Enter']) {
      await browser(action => { const el = document.querySelector('#checkoutButton'); if (action === 'click') el.click(); else el.dispatchEvent(new KeyboardEvent('keydown', { key: action, bubbles: true, cancelable: true })); }, action);
      assert.equal(await evaluate("document.querySelector('#checkoutButton').hasAttribute('href')"), false); assert.equal(await evaluate("document.querySelector('#paymentError').hidden"), false);
    }
    await change('#paymentMethod', 'Pix');
    const message = new URL(await evaluate("document.querySelector('#checkoutButton').href")).searchParams.get('text');
    for (const text of ['Vestido Aurora', 'Saia Coração', '129,90', '259,80', '80,00', '339,80', 'Pix']) assert(message.includes(text), text);
    assert.match(await evaluate("document.querySelector('#cartTotal').textContent"), /339,80/);
    await change('#deliveryMethod', 'osasco');
    const deliveryMessage = new URL(await evaluate("document.querySelector('#checkoutButton').href")).searchParams.get('text');
    for (const text of ['Taxa de entrega', '10,00', '349,80', 'Entrega em Osasco']) assert(deliveryMessage.includes(text), text);
    assert.match(await evaluate("document.querySelector('#cartFinalTotal').textContent"), /349,80/);
    await browser(() => { window.__checkoutDestination = ''; window.open = () => ({ closed: false, close() {}, set opener(value) {}, location: { replace(url) { window.__checkoutDestination = url; } } }); });
    await click('#checkoutButton'); await until("String(window.__checkoutDestination).includes('wa.me')", 'pré-checagem de estoque antes do WhatsApp');
    assert.match(await evaluate("decodeURIComponent(window.__checkoutDestination)"), /Taxa de entrega|Entrega em Osasco/);
    await click('.cart-item button[data-change="1"]'); await click('.cart-item button[data-change="1"]'); assert.equal((await cart())[0].quantity, 3);
    await screenshot('sacola-pagamento');
  });
  await check("admin remoto, erro de gravação sem falso sucesso e edição persistente", async () => {
    await fresh(); await login(); assert.equal(await evaluate("BoutiqueAuth.getState().role"), 'admin');
    await click('[data-edit-content="story"]'); const text = 'História atualizada <img src=x onerror="window.__xss=1">';
    await change('#contentEditorValue', text); fixture.saveError = true; await submit('#contentEditorForm');
    await until("!document.querySelector('#contentEditorError').hidden", 'erro de gravação');
    assert.equal(fixture.store.story, 'História cadastrada no Supabase.'); fixture.saveError = false; await submit('#contentEditorForm');
    await until("!document.querySelector('#contentEditorModal').open", 'história salva'); assert.equal(fixture.store.story, text);
    await reload(); await until("BoutiqueAuth.getState().role === 'admin'", 'admin restaurado');
    assert.equal(await evaluate("document.querySelector('#storyText').textContent"), text); assert.equal(await evaluate("!!window.__xss || !!document.querySelector('#storyText img')"), false);
    assert(fixture.calls.some(call => call.path === '/rest/v1/boutique_store' && call.method === 'PATCH'));
    assert.equal(await evaluate("localStorage.getItem('nanda-boutique-produtos-v1')"), null);
    assert.equal(await evaluate("document.querySelectorAll('#brandEditableCluster .edit-pencil').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('.brand .edit-pencil,[data-edit-content=\"logoHeader\"],[data-edit-content=\"storeName\"],[data-edit-content=\"headerCaption\"]').length"), 0);
    await click('#editBrand'); await change('#brandName', 'Nanda Atualizada'); await change('#brandCaption', '@nanda.atualizada'); await submit('#brandEditorForm');
    await until("!document.querySelector('#brandEditorModal').open", 'marca salva');
    assert.equal(fixture.store.content.storeName, 'Nanda Atualizada'); assert.equal(await evaluate("document.querySelector('.brand-name').textContent"), 'Nanda Atualizada');
  });
  await check("painel salva quantidades, alerta de reposição e upload/remoção do guia da peça", async () => {
    await fresh(); await login(); await click('#adminToggle');
    assert.match(await evaluate("document.querySelector('#stockAlertsList').textContent"), /Vestido Aurora/);
    await click('[data-admin-action="edit"][data-id="41"]');
    await change('#productStockFields [data-stock-size="P"]', '1'); await change('#productStockFields [data-stock-size="M"]', '0');
    await upload('#productSizeGuideUpload'); await until("!document.querySelector('#productSizeGuidePreview').hidden && document.querySelector('#productSizeGuidePreview').src.startsWith('blob:')", 'prévia do guia');
    await submit('#productForm');
    await until("document.querySelector('#editingProductId').value === '' || !document.querySelector('#productError').hidden", 'estoque salvo');
    assert.equal(await evaluate("document.querySelector('#productError').hidden ? '' : document.querySelector('#productError').textContent"), '');
    const guide = fixture.store.products.find(product => product.id === 41).guiaMedidas;
    assert.deepEqual(fixture.store.products.find(p => p.id === 41).estoquePorTamanho, { P: 1, M: 0, G: 0 }); assert.equal(fixture.store.products.find(p => p.id === 41).guiaMedidas, guide);
    await click('[data-admin-action="edit"][data-id="41"]'); await click('#removeProductSizeGuide'); await submit('#productForm');
    await until("document.querySelector('#editingProductId').value === ''", 'guia removido'); assert(!fixture.store.products.find(p => p.id === 41).guiaMedidas);
    assert(!fixture.store.products.find(p => p.id === 42).guiaMedidas);
  });
  await check("borboleta usa URL atual após edição da foto, com movimento reduzido respeitado", async () => {
    await fresh(); await login(); await click('#adminToggle'); await click('[data-admin-action="edit"][data-id="41"]');
    const current = api + '/storage/v1/object/public/boutique-media/foto-atual.jpg?v=20260912';
    await change('#productMedia', current); await submit('#productForm'); await until("document.querySelector('#editingProductId').value === ''", 'foto atualizada'); await closeDialogs();
    await browser(() => document.querySelector('.product-card[data-id="41"]').scrollIntoView({ block: 'center', behavior: 'instant' })); await add();
    assert.equal(await evaluate("document.querySelector('.courier-product')?.getAttribute('src')"), current);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    try { await until("document.querySelectorAll('.butterfly-courier,.flying-emoji,.falling-particle').length === 0", 'movimento reduzido'); await add(); assert.equal((await cart())[0].quantity, 2); }
    finally { await send('Emulation.setEmulatedMedia', { features: [] }); }
  });
  await check("seções criam, editam, publicam e apagam conteúdo pelo Supabase", async () => {
    await fresh(); await login(); await click('#adminToggle');
    for (const section of ['elas-usam', 'inauguracao', 'sobre']) {
      await click('#cancelContentEdit'); await change('#contentSection', section); await change('#contentTitle', 'Publicação ' + section); await change('#contentDescription', 'Descrição da publicação.');
      await change('#contentMediaUrl', api + '/storage/v1/object/public/boutique-media/' + section + '.jpg'); await change('#contentAlt', 'Cliente usando peça da loja'); await change('#contentPosition', '1');
      await browser(() => { document.querySelector('#contentPublished').checked = true; }); await submit('#contentForm');
      await until("document.querySelector('#contentStatus').textContent.toLowerCase().includes('sucesso')", 'publicação salva');
      assert(fixture.store.sections.some(item => item.secao === section && item.titulo === 'Publicação ' + section));
    }
    assert.equal(fixture.store.sections.length, 3); await closeDialogs();
    for (const section of ['elas-usam', 'inauguracao', 'sobre']) assert.match(await browser(section => document.querySelector('#' + section).textContent, section), new RegExp('Publicação ' + section));
    assert.equal(await evaluate("[...document.querySelectorAll('#elas-usam img,#inauguracao img')].every(img => img.loading === 'lazy' && !!img.alt)"), true);
    await click('#adminToggle');
    await browser(() => [...document.querySelectorAll('#adminContentList button')].find(button => button.textContent.trim() === 'Editar').click());
    await change('#contentTitle', 'Publicação alterada'); await submit('#contentForm'); await until("document.querySelector('#adminContentList').textContent.includes('Publicação alterada')", 'publicação editada');
    await browser(() => [...document.querySelectorAll('#adminContentList button')].find(button => /Excluir|Apagar/.test(button.textContent)).click()); await click('#confirmContentDelete');
    await until("document.querySelector('#contentDeletePrompt').hidden", 'exclusão concluída'); assert.equal(fixture.store.sections.length, 2);
  });
  await check("controles e diálogos acessíveis em 320, 390, 768, 1024, 1440 e 1920 px", async () => {
    await fresh(); await login();
    for (const width of widths) {
      await closeDialogs(); await viewport(width); assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, 'página ' + width);
      await click('#adminToggle');
      const undersized = await browser(() => [...document.querySelectorAll('dialog[open] button,dialog[open] input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),dialog[open] select')].filter(el => el.getClientRects().length).map(el => ({ id: el.id || el.textContent.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })).filter(el => el.width < 43.9 || el.height < 43.9));
      assert.deepEqual(undersized, [], 'alvos de toque ' + width);
      assert.equal(await evaluate("[...document.querySelectorAll('dialog[open]')].every(el => el.scrollWidth <= el.clientWidth + 1)"), true, 'painel ' + width);
      await click('[data-admin-action="edit"][data-id="41"]'); assert.equal(await evaluate("[...document.querySelectorAll('dialog[open]')].every(el => el.scrollWidth <= el.clientWidth + 1)"), true, 'editor ' + width);
      if ([390, 1440].includes(width)) await screenshot('admin-' + width);
      await key('Escape', 'Escape', 27); await closeDialogs();
    }
    await click('#shoppingBag'); await key('Escape', 'Escape', 27); await until("document.activeElement.id === 'shoppingBag'", 'retorno de foco');
  });
  await check("PWA com nome correto, ícones locais, service worker e instalação guiada", async () => {
    await fresh();
    const manifest = await browser(async () => { const link = document.querySelector('link[rel="manifest"]'); return { href: link.href, data: await (await fetch(link.href)).json() }; });
    assert.equal(manifest.data.name, 'UseNandaBoutique'); assert.equal(manifest.data.display, 'standalone');
    for (const size of ['192x192', '512x512']) assert(manifest.data.icons.some(icon => icon.sizes.includes(size)), size);
    for (const icon of manifest.data.icons) assert.equal((await fetch(new URL(icon.src, manifest.href))).status, 200);
    await until("navigator.serviceWorker.getRegistration().then(registration=>!!registration?.active)", 'service worker ativo');
    assert.equal(await evaluate("!!document.querySelector('link[rel=\"apple-touch-icon\"]')"), true);
  });
  await check("nenhum erro JS, recurso local ausente ou envio ao WhatsApp", async () => {
    await fresh();
    for (const [width, name] of [[1440, 'desktop'], [768, 'tablet'], [390, 'mobile']]) { await viewport(width); await browser(() => document.querySelector('#colecao').scrollIntoView({ block: 'start', behavior: 'instant' })); await screenshot(name + '-colecao'); }
    assert.deepEqual(errors, []);
    assert.deepEqual(responses.filter(response => response.url.startsWith(base) && response.status >= 400).map(response => response.url), []);
    assert.deepEqual(requests.filter(request => ['wa.me', 'api.whatsapp.com'].includes(new URL(request.url).hostname)), []);
  });
  fs.writeFileSync(path.join(artifacts, 'resultado.json'), JSON.stringify({ ranAt: new Date().toISOString(), fixture: 'Supabase HTTP simulado; sem serviços reais', failures, browserErrors: errors, screenshots: fs.readdirSync(artifacts).filter(file => file.endsWith('.png')) }, null, 2));
  console.log(failures.length ? '\n' + failures.length + ' verificação(ões) falharam.' : '\nTodas as verificações passaram.'); process.exitCode = failures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (send) { try { await send('Browser.close'); } catch {} }
  ws?.close(); chrome?.kill(); server?.close(); setTimeout(() => process.exit(process.exitCode || 0), 300).unref();
});
