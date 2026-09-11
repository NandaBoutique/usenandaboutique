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
  await until("document.readyState === 'complete' && document.querySelectorAll('.product-card').length > 0", "carregamento");
}
async function main() { console.log("Iniciando verificações no navegador...");
  fs.mkdirSync(artifacts, { recursive: true });
  const browserPath = process.env.CHROME_PATH || [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].find(file => fs.existsSync(file));
  assert(browserPath, "Chrome ou Edge não encontrado.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nanda-boutique-test-"));
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
  const api = "https://nanda-test.supabase.co";
  const officialEmail = "usenandaboutiquee@gmail.com";
  const makeUser = (email, id) => ({ id, email, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false, user_metadata: { name: email === officialEmail ? "Nanda" : "Cliente Teste", full_name: email === officialEmail ? "Nanda" : "Cliente Teste" } });
  const users = { admin: makeUser(officialEmail, "11111111-1111-4111-8111-111111111111"), client: makeUser("cliente@example.com", "22222222-2222-4222-8222-222222222222") };
  const fixture = { configured: false, store: null, reviews: [], calls: [], rpcAdmin: true };
  const resetFixture = () => { fixture.store = null; fixture.reviews = []; fixture.calls = []; fixture.rpcAdmin = true; fixture.configured = false; };
  const fulfill = (requestId, payload, status = 200, type = "application/json") => send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: type }, { name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, PUT, OPTIONS" }], body: Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)).toString("base64") });
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
      if (body.password !== "SenhaTeste!123" || ![officialEmail, "cliente@example.com"].includes(body.email)) return fulfill(requestId, { msg: "Invalid login credentials" }, 400);
      const role = body.email === officialEmail ? "admin" : "client";
      return fulfill(requestId, { access_token: "access-" + role, refresh_token: "refresh-" + role, expires_in: 3600, user: users[role] });
    }
    if (url.pathname === "/auth/v1/user") return fulfill(requestId, user);
    if (url.pathname === "/auth/v1/signup") return fulfill(requestId, { user: { ...users.client, email: body.email, email_confirmed_at: null }, session: null });
    if (["/auth/v1/recover", "/auth/v1/logout"].includes(url.pathname)) return fulfill(requestId, {});
    if (url.pathname === "/rest/v1/rpc/is_store_admin") return fulfill(requestId, kind === "admin" && fixture.rpcAdmin);
    if (url.pathname === "/rest/v1/boutique_store") {
      if (request.method === "POST") { if (kind !== "admin" || !fixture.rpcAdmin) return fulfill(requestId, { message: "Forbidden" }, 403); fixture.store = body.payload; return fulfill(requestId, [{ id: "main", payload: fixture.store }]); }
      return fulfill(requestId, fixture.store ? [{ payload: fixture.store }] : []);
    }
    if (url.pathname === "/rest/v1/rpc/boutique_list_reviews") return fulfill(requestId, fixture.reviews.map(review => ({ ...review, owner_id: header && review.owner_id === user.id ? user.id : null })));
    if (url.pathname === "/rest/v1/rpc/boutique_submit_review") {
      if (fixture.reviews.some(review => review.owner_id === user.id)) return fulfill(requestId, { message: "Uma avaliação por cliente" }, 409);
      const review = { id: body.review_id, owner_id: user.id, display_name: user.user_metadata.name, stars: body.review_stars, comment: body.review_comment, created_at: new Date().toISOString() };
      fixture.reviews.unshift(review); return fulfill(requestId, [review]);
    }
    if (url.pathname === "/rest/v1/rpc/boutique_delete_review") { fixture.reviews = fixture.reviews.filter(review => review.id !== body.review_id || review.owner_id !== user.id); return fulfill(requestId, null); }
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
  await until("document.readyState === 'complete' && document.querySelectorAll('.product-card').length > 0", "primeira abertura");
  await evaluate("localStorage.clear()");
  await reload();

  const browser = (callback, ...args) => evaluate("(" + callback.toString() + ")(..." + JSON.stringify(args) + ")");
  const fresh = async () => { resetFixture(); await browser(() => { localStorage.clear(); sessionStorage.clear(); }); await reload(); await until("typeof BoutiqueAuth !== 'undefined' && BoutiqueAuth.mode() === 'local'", "modo local disponível"); };
  const click = selector => browser(selector => { const el = document.querySelector(selector); if (!el) throw Error("Alvo inexistente: " + selector); el.click(); }, selector);
  const change = (selector, value) => browser((selector, value) => { const el = document.querySelector(selector); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, selector, value);
  const closeDialogs = async () => { await browser(() => document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close())); await delay(70); };
  const submit = selector => browser(selector => document.querySelector(selector).requestSubmit(), selector);
  const products = () => browser(() => JSON.parse(localStorage.getItem(BoutiqueData.KEYS.products)));
  const cart = () => browser(() => JSON.parse(localStorage.getItem(BoutiqueData.KEYS.cart)));
  const add = async (id = 1, size = "40", count = 1) => { await change('.product-card[data-id="' + id + '"] .product-size-select', size); await browser((id, count) => { const button = document.querySelector('.product-card[data-id="' + id + '"] .product-action'); for (let i = 0; i < count; i++) button.click(); }, id, count); };
  const register = async (email = "cliente@example.com", name = "Cliente Teste") => {
    await click("#accountToggle"); await click("#registerTab");
    for (const [id, value] of Object.entries({ registerName: name, registerEmail: email, registerCPF: "123.456.789-01", registerPassword: "SenhaTeste!123", registerConfirmPassword: "SenhaTeste!123" })) await change("#" + id, value);
    await submit("#registerForm");
    await until("document.querySelector('#signupSuccessModal').open", "confirmação de cadastro");
    await closeDialogs();
  };
  const login = async (email = "cliente@example.com") => {
    if (await evaluate("!!BoutiqueAuth.getState().user")) { await click("#accountToggle"); await until("!BoutiqueAuth.getState().user", "logout pré-login"); }
    await click("#accountToggle"); await change("#adminUsername", email); await change("#adminPassword", "SenhaTeste!123"); await submit("#loginForm");
    await until("BoutiqueAuth.getState().user?.email === " + JSON.stringify(email) + " && !document.querySelector('#loginModal').open", "login local");
  };
  const admin = async () => { await register(officialEmail, "Nanda"); await login(officialEmail); };
  const writeReview = async comment => {
    await click("#writeReview"); await change("#reviewComment", comment);
    await browser(() => { document.querySelector('input[name="rating"][value="5"]').checked = true; document.querySelector("#reviewForm").requestSubmit(); });
  };

  await check("loja abre livre, navegação completa e papel legado não autoriza edição", async () => {
    await fresh();
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
    const links = await browser(() => [...document.querySelectorAll(".store-header a[href^='#']")].map(el => ({ text: el.textContent.trim(), target: !!document.querySelector(el.getAttribute("href")) })));
    for (const text of ["Início", "Coleção", "Nossa História", "Avaliações", "Informações", "Contatos"]) assert(links.some(link => link.text === text && link.target), text);
    await browser(() => { localStorage.setItem("userRole", "admin"); localStorage.setItem(BoutiqueData.KEYS.profile, JSON.stringify({ role: "admin", email: "usenandaboutiquee@gmail.com", name: "Nanda" })); });
    await reload();
    assert.notEqual(await evaluate("BoutiqueAuth.getState().role"), "admin");
    assert.equal(await evaluate("document.querySelector('#adminToggle').hidden"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('.edit-pencil,.product-edit')].filter(el=>el.getClientRects().length).length"), 0);
    await click("#accountToggle"); await click("#anonymousContinue");
    await until("!document.querySelector('#loginModal').open", "entrada anônima");
  });

  await check("cadastro confirma senha, sucesso local, login e Sair sem senha/CPF brutos", async () => {
    await fresh(); await click("#accountToggle"); await click("#registerTab");
    for (const [id, value] of Object.entries({ registerName: "Cliente Teste", registerEmail: "cliente@example.com", registerCPF: "123.456.789-01", registerPassword: "SenhaTeste!123", registerConfirmPassword: "Diferente!123" })) await change("#" + id, value);
    await submit("#registerForm");
    await until("!document.querySelector('#registerError').hidden", "senhas diferentes rejeitadas");
    assert.equal(await evaluate("document.querySelector('#signupSuccessModal').open"), false);
    await change("#registerConfirmPassword", "SenhaTeste!123"); await submit("#registerForm");
    await until("document.querySelector('#signupSuccessModal').open", "cadastro confirmado");
    assert(await evaluate("document.querySelector('#signupSuccessText').textContent.length > 10"));
    await closeDialogs(); await login();
    assert.equal(await evaluate("BoutiqueAuth.getState().role"), "client");
    assert(await evaluate("document.querySelector('#accountToggle').textContent.includes('Sair')"));
    assert.equal(await evaluate("/SenhaTeste!123|12345678901|123\\.456\\.789-01/.test(JSON.stringify(localStorage))"), false);
    await reload(); await until("BoutiqueAuth.getState().role === 'client'", "sessão restaurada");
    await click("#accountToggle"); await until("!BoutiqueAuth.getState().user", "Sair encerra sessão");
    assert.equal(fixture.calls.length, 0, "modo local não envia cadastro ou login a serviços externos");
  });

  await check("recuperação de senha offline sinaliza simulação", async () => {
    await fresh(); await click("#accountToggle"); await click("#forgotPassword");
    assert.equal(await evaluate("document.querySelector('#resetModal').open"), true);
    await change("#resetEmail", "cliente@example.com"); await submit("#resetForm");
    await until("document.querySelector('#resetStatus').textContent.length > 10", "aviso de recuperação local");
    assert(await evaluate("/simula|demonstra|local|configur/i.test(document.querySelector('#resetStatus').textContent)"));
    assert.equal(fixture.calls.length, 0);
  });

  await check("cards mostram dados, tamanhos e guia; compra sem tamanho é bloqueada", async () => {
    await fresh();
    const cards = await browser(() => [...document.querySelectorAll(".product-card")].map(card => ({ title: card.querySelector("h3").textContent, titleWidth: card.querySelector("h3").getBoundingClientRect().width, text: card.textContent, select: !!card.querySelector(".product-size-select") })));
    assert.deepEqual(cards.map(card => card.title), expectedNames);
    assert(cards.every(card => card.titleWidth > 1 && card.select));
    assert(cards[0].text.includes("169,90") && cards[0].text.includes("brilho"));
    await click('.product-card[data-id="1"] .product-action');
    assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "0");
    await click(".size-guide-link");
    assert.equal(await evaluate("document.querySelector('#sizeGuideModal').open"), true);
    assert(await evaluate("document.querySelector('#sizeGuideModal').textContent.length > 40"));
    await closeDialogs(); await add();
    assert.deepEqual(await cart(), [{ id: 1, size: "40", quantity: 1 }]);
    assert.equal(await evaluate("!!document.querySelector('.product-card[data-id=\"2\"] .restock-btn')"), true);
  });

  await check("sacola separa variantes, persiste e exige pagamento por clique e teclado", async () => {
    await fresh(); await add(1, "40", 2); await add(1, "42"); await reload();
    assert.deepEqual(await cart(), [{ id: 1, size: "40", quantity: 2 }, { id: 1, size: "42", quantity: 1 }]);
    await click("#shoppingBag");
    for (const action of ["click", "Enter", " "]) {
      await browser(action => { const el = document.querySelector("#checkoutButton"); el.focus(); if (action === "click") el.click(); else el.dispatchEvent(new KeyboardEvent("keydown", { key: action, bubbles: true, cancelable: true })); }, action);
      assert.equal(await evaluate("document.querySelector('#checkoutButton').hasAttribute('href')"), false);
      assert.equal(await evaluate("document.querySelector('#paymentError').hidden"), false);
      assert.equal(await evaluate("document.activeElement.id"), "paymentMethod");
    }
    const payments = await evaluate("[...document.querySelector('#paymentMethod').options].map(option=>option.value).filter(Boolean)");
    assert.equal(payments.length, 4);
    for (const payment of payments) {
      await change("#paymentMethod", payment);
      const url = new URL(await evaluate("document.querySelector('#checkoutButton').href"));
      assert(["wa.me", "api.whatsapp.com"].includes(url.hostname));
      const message = url.searchParams.get("text");
      assert(message.includes("Calça Jeans com Brilho - Tamanho 40") && message.includes("Calça Jeans com Brilho - Tamanho 42"));
      assert(message.endsWith("Pagamento: " + payment + ". Poderia confirmar a disponibilidade?"));
    }
    await click('.cart-item button[data-change="1"]'); assert.equal((await cart())[0].quantity, 3);
    await click(".cart-item .remove-item"); assert.deepEqual(await cart(), [{ id: 1, size: "42", quantity: 1 }]);
    await screenshot("sacola-pagamento");
  });

  await check("admin local exige conta oficial autenticada; CMS edita textos e contato", async () => {
    await fresh(); await admin();
    assert.equal(await evaluate("BoutiqueAuth.getState().role"), "admin");
    assert.equal(await evaluate("document.querySelector('#adminToggle').hidden"), false);
    await click('[data-edit-content="story"]');
    const text = 'História atualizada <img src=x onerror="window.__xss=1">';
    await change("#contentEditorValue", text); await submit("#contentEditorForm");
    await until("!document.querySelector('#contentEditorModal').open", "história salva");
    assert.equal(await evaluate("document.querySelector('#toast').textContent"), "Alteração salva com sucesso!");
    await reload(); await until("BoutiqueAuth.getState().role === 'admin'", "admin restaurado");
    assert.equal(await evaluate("document.querySelector('#storyText').textContent"), text);
    assert.equal(await evaluate("!!window.__xss || !!document.querySelector('#storyText img')"), false);
    await click('[data-edit-content="contactPhone"]'); await change("#contentEditorValue", "(11) 99999-0000"); await submit("#contentEditorForm");
    await until("!document.querySelector('#contentEditorModal').open", "contato salvo");
    assert(await evaluate("document.querySelector('#contactPhoneText').closest('a').href.includes('5511999990000')"));
    await browser(() => document.querySelector("#informacoes").scrollIntoView({ block: "start", behavior: "instant" })); await screenshot("admin-informacoes");
  });

  await check("CMS cria/edita produto, poucas unidades, upload local, esgotado e exclusão", async () => {
    await fresh(); await admin(); await click("#adminAddProduct");
    for (const [id, value] of Object.entries({ productName: "Vestido Teste", productDescription: "Descrição da peça.", productMedia: "./img/look-listras-rosa-1.jpg", productMediaType: "auto", productSizes: "P, M, G", productUnavailableSizes: "G", productPrice: "89,90" })) await change("#" + id, value);
    await browser(() => { document.querySelector("#productLowStock").checked = true; document.querySelector("#productForm").requestSubmit(); });
    await until("document.querySelectorAll('.product-card').length === 6", "produto criado");
    const created = (await products()).find(product => product.nome === "Vestido Teste"); assert(created && created.poucasUnidades);
    await closeDialogs();
    assert(await evaluate("document.querySelector('.product-card[data-id=\"" + created.id + "\"] .product-low-stock').textContent.length > 3"));
    await change('.product-card[data-id="' + created.id + '"] .product-size-select', "G");
    assert.equal(await evaluate("document.querySelector('.product-card[data-id=\"" + created.id + "\"] .restock-btn').hidden"), false);
    await add(created.id, "P"); await click("#adminToggle"); await click('[data-admin-action="edit"][data-id="' + created.id + '"]');
    await change("#productName", "Vestido Atualizado"); await submit("#productForm");
    await until("document.querySelector('.product-card[data-id=\"" + created.id + "\"] h3').textContent === 'Vestido Atualizado'", "produto editado");
    await click('[data-admin-action="stock"][data-id="' + created.id + '"]');
    await until("document.querySelector('#bagCount').textContent === '0'", "esgotado remove da sacola");
    await click('[data-admin-action="delete"][data-id="' + created.id + '"]'); await click("#confirmDelete");
    await until("document.querySelectorAll('.product-card').length === 5", "produto excluído");
    // Arquivo real fornecido ao input nativo; não há envio de dados externos.
    const dom = await send("DOM.getDocument");
    const input = await send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: "#productUpload" });
    await send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [path.join(root, "img", "look-listras-rosa-1.jpg")] });
    await until("document.querySelector('#productUploadPreview').querySelector('img')", "prévia de upload");
    assert(await evaluate("document.querySelector('#productMedia').value.includes('data:image/') || document.querySelector('#productUploadPreview img').src.startsWith('data:image/')"));
    assert.equal(fixture.calls.length, 0);
  });

  await check("avaliações exigem conta e mostram nome/estrelas/comentário, com exclusão própria", async () => {
    await fresh(); await click("#writeReview");
    assert.equal(await evaluate("document.querySelector('#loginModal').open"), true);
    assert.equal(await evaluate("document.querySelector('#reviewModal').open"), false);
    await closeDialogs(); await register(); await login();
    await writeReview("Atendimento excelente e peças lindas!");
    await until("document.querySelectorAll('.review-card').length === 1 && !document.querySelector('#reviewModal').open", "avaliação salva");
    assert(await evaluate("document.querySelector('.review-card').textContent.includes('Cliente Teste')"));
    assert.equal(await evaluate("/cliente@example.com|12345678901/.test(document.querySelector('.review-card').textContent)"), false);
    await reload(); await until("document.querySelectorAll('.review-delete').length === 1", "autoria restaurada");
    await writeReview("Segundo comentário não deve duplicar.");
    await until("!document.querySelector('#reviewError').hidden", "avaliação duplicada impedida");
    assert.equal(await evaluate("document.querySelectorAll('.review-card').length"), 1);
    await closeDialogs(); await click("#accountToggle"); await until("!BoutiqueAuth.getState().user", "logout cliente");
    assert.equal(await evaluate("document.querySelectorAll('.review-delete').length"), 0);
    await login(); await click(".review-delete"); await until("document.querySelectorAll('.review-card').length === 0", "exclusão própria");
  });

  await check("vídeos preservam controles/playsinline sem autoplay e carrossel funciona por teclado", async () => {
    await fresh();
    const videos = await browser(() => [...document.querySelectorAll("video")].map(video => ({ controls: video.controls, inline: video.playsInline && video.hasAttribute("playsinline"), autoplay: video.autoplay, paused: video.paused })));
    assert(videos.length >= 4 && videos.every(video => video.controls && video.inline && !video.autoplay && video.paused));
    await browser(() => { const track = document.querySelector('.product-card[data-id="1"] .media-track'); track.scrollIntoView({ behavior: "instant", block: "center" }); track.focus(); });
    await key("ArrowRight", "ArrowRight", 39);
    await until("document.querySelector('.product-card[data-id=\"1\"] .media-track').dataset.activeIndex === '1'", "carrossel pelo teclado");
  });

  await check("borboletas, pétalas, entrega da foto com cinco emojis e movimento reduzido", async () => {
    await fresh(); await viewport(1440);
    const decorations = await browser(() => ({ butterflies: [...document.querySelectorAll(".flying-butterfly")].map(el => ({ text: el.textContent, pointer: getComputedStyle(el).pointerEvents })), branches: [...document.querySelectorAll(".cherry-side img")].map(el => getComputedStyle(el).animationName), petals: document.querySelector("#fallingScene").children.length }));
    assert.equal(decorations.butterflies.length, 4);
    for (const glyph of ["👜", "👚", "💍", "👖"]) assert(decorations.butterflies.some(item => item.text.includes(glyph)));
    assert(decorations.butterflies.every(item => item.pointer === "none") && decorations.branches.every(name => name !== "none") && decorations.petals > 0);
    await browser(() => document.querySelector('.product-card[data-id="1"]').scrollIntoView({ block: "center", behavior: "instant" })); await add(1, "40", 11);
    assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "11");
    const flight = await browser(() => ({ count: document.querySelectorAll(".butterfly-courier").length, image: document.querySelector(".courier-product")?.src, emojis: [...document.querySelectorAll(".flying-emoji")].map(el => el.textContent) }));
    assert(flight.count > 0 && flight.count <= 4 && flight.image?.includes("calca-jeans-brilho"));
    for (const glyph of ["💍", "👗", "👠", "👜", "🌸"]) assert(flight.emojis.includes(glyph));
    await screenshot("borboleta-entrega");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    try { await until("document.querySelectorAll('.butterfly-courier,.flying-emoji,.falling-particle').length === 0", "redução de movimento aplicada"); await add(); assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "12"); }
    finally { await send("Emulation.setEmulatedMedia", { features: [] }); }
  });

  await check("página e diálogos responsivos de 320 a 1920 px, foco e cliques livres", async () => {
    await fresh();
    for (const width of widths) {
      await viewport(width);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "página " + width);
      for (const selector of ["#accountToggle", "#shoppingBag", ".product-size-select", ".product-action"]) {
        const hit = await browser(async selector => { const target = [...document.querySelectorAll(selector)].find(el => el.getClientRects().length && !el.disabled); target.scrollIntoView({ behavior: "instant", block: "center" }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const rect = target.getBoundingClientRect(), top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return top === target || target.contains(top); }, selector);
        assert(hit, selector + " em " + width);
      }
      await click("#accountToggle"); await click("#registerTab");
      assert.equal(await evaluate("document.querySelector('#loginModal').scrollWidth <= document.querySelector('#loginModal').clientWidth + 1"), true, "cadastro " + width);
      await screenshot("conta-" + width); await key("Escape", "Escape", 27);
      await until("document.activeElement.id === 'accountToggle' && !document.querySelector('#loginModal').open", "foco retorna à conta");
      await add(); await click("#shoppingBag");
      assert.equal(await evaluate("document.querySelector('#checkoutModal').scrollWidth <= document.querySelector('#checkoutModal').clientWidth + 1"), true, "sacola " + width);
      await closeDialogs();
    }
  });

  await check("PWA possui manifest, ícones locais e service worker registrado", async () => {
    await fresh();
    const manifest = await browser(async () => { const link = document.querySelector('link[rel="manifest"]'); return { href: link.href, data: await (await fetch(link.href)).json() }; });
    assert.equal(manifest.data.display, "standalone");
    for (const size of ["192x192", "512x512"]) assert(manifest.data.icons.some(icon => icon.sizes.includes(size)), size);
    for (const icon of manifest.data.icons) { const response = await fetch(new URL(icon.src, manifest.href)); assert.equal(response.status, 200); }
    assert.equal(await evaluate("!!document.querySelector('link[rel=\"apple-touch-icon\"]')"), true);
    await until("navigator.serviceWorker.getRegistration().then(registration=>!!registration?.active)", "service worker ativo");
  });

  await check("capturas finais e ausência de erros/recursos quebrados ou envio ao WhatsApp", async () => {
    await fresh();
    for (const [width, name] of [[1440, "desktop"], [768, "tablet"], [390, "mobile"]]) {
      await viewport(width);
      for (const [selector, section] of [["#inicio", "topo"], ["#colecao", "colecao"], ["#informacoes", "informacoes"], ["#contatos", "contatos"]]) {
        await browser(selector => document.querySelector(selector).scrollIntoView({ behavior: "instant", block: "start" }), selector); await delay(150); await screenshot(name + "-" + section);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(responses.filter(response => response.url.startsWith(base) && response.status >= 400).map(response => response.url), []);
    assert.deepEqual(requests.filter(request => ["wa.me", "api.whatsapp.com"].includes(new URL(request.url).hostname)), []);
  });
  fs.writeFileSync(path.join(artifacts, "resultado.json"), JSON.stringify({ ranAt: new Date().toISOString(), failures, browserErrors: errors, screenshots: fs.readdirSync(artifacts).filter(file => file.endsWith(".png")) }, null, 2));
  console.log(failures.length ? "\n" + failures.length + " verificação(ões) falharam." : "\nTodas as verificações passaram.");
  process.exitCode = failures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (send) { try { await send("Browser.close"); } catch {} }
  ws?.close(); chrome?.kill(); server?.close();
  setTimeout(() => process.exit(process.exitCode || 0), 300).unref();
});
