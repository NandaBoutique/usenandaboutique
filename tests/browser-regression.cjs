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
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
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
  await send("Page.navigate", { url: base });
  await until("document.readyState === 'complete' && document.querySelectorAll('.product-card').length > 0", "primeira abertura");
  await evaluate("localStorage.clear()");
  await reload();

  // Testes de interface usam eventos reais de formulário, com estado isolado.
  const browser = (callback, ...args) => evaluate("(" + callback.toString() + ")(..." + JSON.stringify(args) + ")");
  const fresh = async () => { await browser(() => localStorage.clear()); await reload(); };
  const closeDialogs = () => browser(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()));
  const click = selector => browser(selector => { const target = document.querySelector(selector); if (!target) throw Error("Alvo inexistente: " + selector); target.click(); }, selector);
  const change = (selector, value) => browser((selector, value) => { const field = document.querySelector(selector); field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); }, selector, value);
  const stored = key => browser(key => JSON.parse(localStorage.getItem(BoutiqueData.KEYS[key]) || "null"), key);
  const add = async (id = 1, size = "40", times = 1) => {
    await change('.product-card[data-id="' + id + '"] .product-size-select', size);
    await browser((id, times) => { const action = document.querySelector('.product-card[data-id="' + id + '"] .product-action'); for (let i = 0; i < times; i++) action.click(); }, id, times);
  };
  const admin = async () => {
    await click("#accountToggle");
    await change("#adminUsername", "usenandaboutique");
    await change("#adminPassword", "Nanda100239");
    await browser(() => document.querySelector("#loginForm").requestSubmit());
    await until("localStorage.getItem('userRole') === 'admin'", "login administrativo");
    await closeDialogs();
  };
  const fillReview = async (email, comment = "Atendimento excelente e peças lindas!") => {
    await click("#writeReview");
    await change("#reviewEmail", email);
    await change("#reviewCPF", "123.456.789-01");
    await change("#reviewComment", comment);
    await browser(() => { document.querySelector('input[name="rating"][value="5"]').checked = true; document.querySelector("#reviewForm").requestSubmit(); });
  };

  await check("entrada livre, conta no cabeçalho e seis âncoras de navegação", async () => {
    await fresh();
    const audit = await browser(() => ({
      dialogs: document.querySelectorAll('dialog[open]').length,
      account: !!document.querySelector(".store-header #accountToggle"),
      adminVisible: [...document.querySelectorAll("button,a")].some(el => el.getClientRects().length && el.textContent.trim() === "Acesso Administrativo"),
      links: [...document.querySelectorAll(".store-header a[href^='#']")].map(el => ({ text: el.textContent.trim(), href: el.getAttribute("href"), exists: !!document.querySelector(el.getAttribute("href")) })),
      smooth: getComputedStyle(document.documentElement).scrollBehavior,
      admin: document.querySelector("#adminToggle").hidden
    }));
    assert.equal(audit.dialogs, 0);
    assert(audit.account && !audit.adminVisible && audit.admin);
    for (const text of ["Início", "Coleção", "Nossa História", "Avaliações", "Informações", "Contatos"]) assert(audit.links.some(link => link.text === text && link.exists), text);
    assert.equal(audit.smooth, "smooth");
    await click("#accountToggle");
    assert.equal(await evaluate("document.querySelector('#loginModal').open"), true);
    await click("#registerTab");
    assert.equal(await evaluate("document.querySelector('#registerForm').hidden"), false);
    for (const id of ["registerName", "registerEmail", "registerCPF", "registerPassword"]) assert.equal(await evaluate("document.getElementById('" + id + "').required"), true, id);
    await click("#anonymousContinue");
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
    assert.notEqual((await stored("profile"))?.role, "admin");
  });

  await check("cards mostram título, descrição, preço e tamanhos; indisponíveis oferecem aviso", async () => {
    await fresh();
    const cards = await browser(() => [...document.querySelectorAll(".product-card")].map(card => {
      const title = card.querySelector("h3"), rect = title.getBoundingClientRect();
      return { id: Number(card.dataset.id), text: card.textContent, title: title.textContent, visibleTitle: rect.width > 1 && rect.height > 1 && getComputedStyle(title).visibility !== "hidden", select: !!card.querySelector(".product-size-select"), options: [...card.querySelectorAll(".product-size-select option")].map(option => option.value), notify: !!card.querySelector(".restock-btn") };
    }));
    assert.deepEqual(cards.map(card => card.title), expectedNames);
    assert(cards.every(card => card.visibleTitle && card.select));
    assert(cards[0].text.includes("169,90") && cards[0].text.includes("detalhes de brilho"));
    assert.deepEqual(cards[0].options.filter(Boolean), ["36", "40", "42", "46"]);
    assert(cards.filter(card => [2, 3, 5].includes(card.id)).every(card => card.notify));
    await click('.product-card[data-id="1"] .product-action');
    assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "0");
    await add();
    assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "1");
    assert.deepEqual(await stored("cart"), [{ id: 1, size: "40", quantity: 1 }]);
    assert.equal(await evaluate("[...document.querySelectorAll('#colecao a')].some(a => a.textContent.includes('Dúvidas')) || [...document.querySelectorAll('a')].some(a => /Fale com a loja/.test(a.textContent))"), true);
  });

  await check("sacola por tamanho persiste e pagamento bloqueia clique, Enter e Espaço", async () => {
    await fresh();
    await add(1, "40", 2);
    await add(1, "42");
    await reload();
    assert.deepEqual(await stored("cart"), [{ id: 1, size: "40", quantity: 2 }, { id: 1, size: "42", quantity: 1 }]);
    await click("#shoppingBag");
    assert.equal(await evaluate("document.querySelectorAll('.cart-item').length"), 2);
    for (const action of ["click", "Enter", " "]) {
      await browser(action => { const button = document.querySelector("#checkoutButton"); button.focus(); if (action === "click") button.click(); else button.dispatchEvent(new KeyboardEvent("keydown", { key: action, bubbles: true, cancelable: true })); }, action);
      assert.equal(await evaluate("document.querySelector('#checkoutButton').hasAttribute('href')"), false);
      assert.equal(await evaluate("document.querySelector('#paymentError').hidden"), false);
      assert.equal(await evaluate("document.activeElement.id"), "paymentMethod");
    }
    const payments = await evaluate("[...document.querySelector('#paymentMethod').options].map(option => option.value).filter(Boolean)");
    assert.equal(payments.length, 4);
    for (const payment of payments) {
      await change("#paymentMethod", payment);
      const href = await evaluate("document.querySelector('#checkoutButton').href");
      const url = new URL(href);
      assert(["wa.me", "api.whatsapp.com"].includes(url.hostname));
      const message = url.searchParams.get("text");
      assert(message.startsWith("Olá Nanda Boutique! Tenho interesse nas seguintes peças:"));
      assert(message.includes("Calça Jeans com Brilho - Tamanho 40") && message.includes("Calça Jeans com Brilho - Tamanho 42"));
      assert(message.includes("2") && message.endsWith("Pagamento: " + payment + ". Poderia confirmar a disponibilidade?"));
    }
    await click('.cart-item button[data-change="1"]');
    assert.equal((await stored("cart"))[0].quantity, 3);
    await click(".cart-item .remove-item");
    assert.deepEqual(await stored("cart"), [{ id: 1, size: "42", quantity: 1 }]);
    await change("#paymentMethod", "");
    assert.equal(await evaluate("document.querySelector('#checkoutButton').hasAttribute('href')"), false);
    await screenshot("sacola-pagamento");
  });

  await check("login administrativo estrito, lápis e persistência de sessão", async () => {
    await fresh();
    await click("#accountToggle");
    for (const [username, password] of [["usenandaboutique", "errada"], [" usenandaboutique", "Nanda100239"], ["Usenandaboutique", "Nanda100239"], ["usenandaboutique", "Nanda100239 "]]) {
      await change("#adminUsername", username);
      await change("#adminPassword", password);
      await browser(() => document.querySelector("#loginForm").requestSubmit());
      await until("!document.querySelector('#loginSubmit').disabled && !document.querySelector('#loginError').hidden", "rejeição de credenciais");
      assert.notEqual(await evaluate("localStorage.getItem('userRole')"), "admin");
    }
    await closeDialogs();
    await admin();
    await reload();
    assert.equal(await evaluate("document.querySelector('#adminToggle').hidden"), false);
    assert(await evaluate("[...document.querySelectorAll('[data-edit-key]')].filter(el => el.getClientRects().length).length >= 3"));
    assert.equal(await evaluate("JSON.stringify(localStorage).includes('Nanda100239')"), false);
    await click("#adminToggle");
    assert.equal(await evaluate("document.querySelector('#adminModal').open"), true);
    await click("#adminLogout");
    assert.notEqual(await evaluate("localStorage.getItem('userRole')"), "admin");
    assert.equal(await evaluate("document.querySelector('#adminToggle').hidden"), true);
  });

  await check("CMS edita história e campos de contato com persistência", async () => {
    await fresh(); await admin();
    await click('[data-edit-content="story"]');
    assert.equal(await evaluate("document.querySelector('#contentEditorModal').open"), true);
    const text = 'História atualizada <img src=x onerror="window.__xss=1">';
    await change("#contentEditorValue", text);
    await browser(() => document.querySelector("#contentEditorForm").requestSubmit());
    await until("!document.querySelector('#contentEditorModal').open", "salvar história");
    await reload();
    assert.equal(await evaluate("document.querySelector('#storyText').textContent"), text);
    assert.equal(await evaluate("!!window.__xss || !!document.querySelector('#storyText img')"), false);
    const contactKey = await evaluate("document.querySelector('#contatos [data-edit-key]')?.dataset.editKey");
    assert(contactKey, "lápis editável nos contatos");
    await click('[data-edit-content="' + contactKey + '"]');
    assert.equal(await evaluate("document.querySelector('#contentEditorModal').open"), true);
    await closeDialogs();
  });

  await check("CMS adiciona, edita, esgota e exclui produto, incluindo tamanho indisponível", async () => {
    await fresh(); await admin(); await click("#adminToggle");
    const fields = { productName: "Vestido de Teste", productDescription: "Descrição da peça de teste.", productMedia: "./img/look-listras-rosa-1.jpg", productMediaType: "auto", productSizes: "P, M, G", productUnavailableSizes: "G", productPrice: "89,90" };
    for (const [id, value] of Object.entries(fields)) await change("#" + id, value);
    await browser(() => document.querySelector("#productForm").requestSubmit());
    await until("document.querySelectorAll('.product-card').length === 6", "criação de produto");
    let created = (await stored("products")).find(product => product.nome === "Vestido de Teste");
    assert(created && created.preco === 89.9);
    await closeDialogs();
    await change('.product-card[data-id="' + created.id + '"] .product-size-select', "G");
    assert.equal(await evaluate("!!document.querySelector('.product-card[data-id=\"" + created.id + "\"] .restock-btn')"), true);
    await add(created.id, "P");
    await click("#adminToggle");
    await click('[data-admin-action="edit"][data-id="' + created.id + '"]');
    await change("#productName", "Vestido Atualizado");
    await browser(() => document.querySelector("#productForm").requestSubmit());
    assert((await stored("products")).some(product => product.id === created.id && product.nome === "Vestido Atualizado"));
    await click('[data-admin-action="stock"][data-id="' + created.id + '"]');
    assert.equal((await stored("products")).find(product => product.id === created.id).esgotado, true);
    assert.equal((await stored("cart")).length, 0);
    await click('[data-admin-action="delete"][data-id="' + created.id + '"]');
    await click("#confirmDelete");
    assert.equal((await stored("products")).some(product => product.id === created.id), false);
    await reload();
    assert.equal(await evaluate("document.querySelectorAll('.product-card').length"), 5);
  });

  await check("cadastro local exige os campos, não persiste senha/CPF brutos e permite entrar novamente", async () => {
    await fresh(); await click("#accountToggle"); await click("#registerTab");
    for (const [id, value] of Object.entries({ registerName: "Cliente de Teste", registerEmail: "Cliente.Teste@Example.com", registerCPF: "123.456.789-01", registerPassword: "TesteLocal987!" })) await change("#" + id, value);
    await browser(() => document.querySelector("#registerForm").requestSubmit());
    await until("!document.querySelector('#loginModal').open", "cadastro de cliente");
    const profile = await stored("profile");
    assert.equal(profile.email, "cliente.teste@example.com");
    assert.equal(profile.role, "customer");
    assert.equal(await evaluate("/TesteLocal987!|12345678901|123\\.456\\.789-01/.test(JSON.stringify(localStorage))"), false);
    await click("#accountToggle"); await click("#accountLogout");
    await closeDialogs(); await click("#accountToggle"); await click("#loginTab");
    await change("#adminUsername", "cliente.teste@example.com"); await change("#adminPassword", "TesteLocal987!");
    await browser(() => document.querySelector("#loginForm").requestSubmit());
    await until("!document.querySelector('#loginModal').open", "login de cliente cadastrado");
    assert.equal((await stored("profile")).email, profile.email);
    assert.equal((await stored("profile")).ownerId, profile.ownerId);
  });

  await check("avaliação privada, uma por e-mail, persistência e exclusão apenas pelo dono local", async () => {
    await fresh();
    await click("#writeReview");
    assert.equal(await evaluate("document.querySelector('#reviewEmail').required && document.querySelector('#reviewCPF').required"), true);
    await closeDialogs();
    await fillReview("Privada@Example.com");
    await until("document.querySelectorAll('.review-card').length === 1 && !document.querySelector('#reviewModal').open", "salvar avaliação");
    const owner = await evaluate("localStorage.getItem(BoutiqueData.KEYS.reviewOwner)");
    assert(owner);
    assert.equal(await evaluate("/privada@example.com|12345678901|Cliente da Nanda/i.test(document.querySelector('.review-card').textContent)"), false);
    assert.equal(await evaluate("document.querySelectorAll('.review-delete').length"), 1);
    assert.equal(await evaluate("/12345678901|123\\.456\\.789-01/.test(localStorage.getItem(BoutiqueData.KEYS.reviews))"), false);
    await reload();
    await fillReview("privada@example.com", "Segundo comentário que deve ser impedido.");
    await until("!document.querySelector('#reviewError').hidden", "e-mail duplicado rejeitado");
    assert.equal((await stored("reviews")).length, 1);
    await closeDialogs();
    await browser(() => { localStorage.removeItem(BoutiqueData.KEYS.profile); localStorage.removeItem(BoutiqueData.KEYS.role); localStorage.removeItem(BoutiqueData.KEYS.reviewOwner); });
    await reload();
    assert.equal(await evaluate("document.querySelectorAll('.review-delete').length"), 0);
    await fillReview("PRIVADA@example.com", "Digitar o e-mail não transfere a autoria.");
    await until("!document.querySelector('#reviewError').hidden", "duplicação por outra visita rejeitada");
    await closeDialogs();
    assert.equal(await evaluate("document.querySelectorAll('.review-delete').length"), 0);
    await browser(owner => localStorage.setItem(BoutiqueData.KEYS.reviewOwner, owner), owner);
    await reload(); await click(".review-delete");
    await until("document.querySelectorAll('.review-card').length === 0", "exclusão própria");
    assert.deepEqual(await stored("reviews"), []);
  });

  await check("vídeos têm controles, playsinline e nunca iniciam automaticamente; carrossel usa teclado", async () => {
    await fresh();
    const audit = await browser(() => [...document.querySelectorAll("video")].map(video => ({ controls: video.controls, inline: video.playsInline && video.hasAttribute("playsinline"), autoplay: video.autoplay || video.hasAttribute("autoplay"), paused: video.paused, src: video.getAttribute("src") })));
    assert(audit.length >= 4);
    assert(audit.every(video => video.controls && video.inline && !video.autoplay && video.paused && video.src.startsWith("./img/")));
    const selector = '.product-card[data-id="1"] .media-track';
    await browser(selector => { const track = document.querySelector(selector); track.scrollIntoView({ behavior: "instant", block: "center" }); track.focus(); }, selector);
    await key("ArrowRight", "ArrowRight", 39);
    await until("document.querySelector('.product-card[data-id=\"1\"] .media-track').dataset.activeIndex === '1'", "carrossel pelo teclado");
    assert.equal(await evaluate("document.querySelectorAll('.product-card[data-id=\"1\"] .media-slide[data-active=\"true\"]').length"), 1);
  });

  await check("quatro borboletas com carga, pétalas e entrega do produto sem interceptar cliques", async () => {
    await fresh(); await viewport(1440);
    const decoration = await browser(() => ({
      butterflies: [...document.querySelectorAll(".flying-butterfly")].map(el => ({ text: el.textContent, pointer: getComputedStyle(el).pointerEvents, animations: el.getAnimations().length })),
      branches: [...document.querySelectorAll(".cherry-side img")].map(el => getComputedStyle(el).animationName),
      petals: document.querySelector("#fallingScene").children.length,
      layers: ["#flightLayer", "#fallingScene"].map(selector => getComputedStyle(document.querySelector(selector)).pointerEvents)
    }));
    assert.equal(decoration.butterflies.length, 4);
    for (const glyph of ["👜", "👚", "💍", "👖"]) assert(decoration.butterflies.some(item => item.text.includes(glyph)), glyph);
    assert(decoration.butterflies.every(item => item.pointer === "none"));
    assert(decoration.branches.length >= 2 && decoration.branches.every(name => name !== "none"));
    assert(decoration.petals > 0 && decoration.layers.every(pointer => pointer === "none"));
    await browser(() => document.querySelector('.product-card[data-id="1"]').scrollIntoView({ block: "center", behavior: "instant" }));
    await add(1, "40", 11);
    assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "11");
    const flight = await browser(() => ({ couriers: document.querySelectorAll(".butterfly-courier").length, product: document.querySelector(".courier-product")?.getAttribute("src"), emojis: [...document.querySelectorAll(".flying-emoji")].map(el => el.textContent) }));
    assert(flight.couriers > 0 && flight.couriers <= 4);
    assert(flight.product?.includes("calca-jeans-brilho"));
    for (const glyph of ["💍", "👗", "👠", "👜", "🌸"]) assert(flight.emojis.includes(glyph), glyph);
    await screenshot("borboleta-entrega");
    await until("!document.querySelector('.butterfly-courier') && !document.querySelector('.flying-emoji')", "limpeza dos efeitos", 8000);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await add();
    assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "12");
    assert.equal(await evaluate("document.querySelectorAll('.butterfly-courier,.flying-emoji,.falling-particle').length"), 0);
    await send("Emulation.setEmulatedMedia", { features: [] });
  });

  await check("responsividade de 320 a 1920 px, foco e decorações deixam os controles clicáveis", async () => {
    await fresh();
    for (const width of widths) {
      await viewport(width);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "página em " + width);
      for (const selector of ["#accountToggle", "#shoppingBag", ".product-size-select", ".product-action"]) {
        const hit = await browser(async selector => { const target = [...document.querySelectorAll(selector)].find(el => el.getClientRects().length && !el.disabled); target.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const rect = target.getBoundingClientRect(), top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return top === target || target.contains(top); }, selector);
        assert(hit, selector + " em " + width);
      }
      await click("#accountToggle"); await click("#registerTab");
      assert.equal(await evaluate("document.querySelector('#loginModal').scrollWidth <= document.querySelector('#loginModal').clientWidth + 1"), true, "cadastro em " + width);
      await screenshot("conta-" + width);
      await key("Escape", "Escape", 27);
      assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
      assert.equal(await evaluate("document.activeElement.id"), "accountToggle");
      await add(); await click("#shoppingBag");
      assert.equal(await evaluate("document.querySelector('#checkoutModal').scrollWidth <= document.querySelector('#checkoutModal').clientWidth + 1"), true, "sacola em " + width);
      await closeDialogs();
    }
  });

  await check("armazenamento bloqueado mantém compra na visita e avisa sobre persistência", async () => {
    const injected = await send("Page.addScriptToEvaluateOnNewDocument", { source: "Storage.prototype.getItem=function(){throw new Error('Storage unavailable')};Storage.prototype.setItem=function(){throw new Error('Storage unavailable')}" });
    try {
      await reload(); await add();
      assert.equal(await evaluate("document.querySelector('#bagCount').textContent"), "1");
      assert.equal(await evaluate("document.querySelector('#storageNotice').hidden"), false);
      await click("#shoppingBag"); await change("#paymentMethod", "Pix");
      assert.equal(await evaluate("document.querySelector('#checkoutButton').hasAttribute('href')"), true);
    } finally { await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injected.identifier }); await reload(); }
  });

  await check("capturas finais e ausência de erros de JavaScript ou recursos locais", async () => {
    await fresh();
    for (const [width, name] of [[1440, "desktop"], [768, "tablet"], [390, "mobile"]]) {
      await viewport(width);
      for (const [selector, section] of [["#inicio", "topo"], ["#colecao", "colecao"], ["#informacoes", "informacoes"], ["#contatos", "contatos"]]) {
        await browser(selector => document.querySelector(selector).scrollIntoView({ behavior: "instant", block: "start" }), selector);
        await delay(150); await screenshot(name + "-" + section);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(responses.filter(response => response.url.startsWith(base) && response.status >= 400).map(response => response.url), []);
    assert.deepEqual(requests.filter(request => /whatsapp|wa\.me/.test(request.url)), [], "nenhuma mensagem ou navegação ao WhatsApp");
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

