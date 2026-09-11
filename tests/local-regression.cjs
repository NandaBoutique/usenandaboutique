// Funções reais, sem navegador, rede ou alterações no armazenamento.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const events = [];
const context = vm.createContext({ URL, TextEncoder, TextDecoder, structuredClone, crypto: webcrypto, document: { addEventListener: name => events.push(name) }, addEventListener() {} });
vm.runInContext("window = globalThis", context);
vm.runInContext(source, context, { filename: "script.js", timeout: 3000 });
const { data: D, media } = vm.runInContext("({ data: BoutiqueData, media: normalizeMediaURL })", context);
const plain = value => JSON.parse(JSON.stringify(value));
const failures = [];
let passed = 0;
async function check(name, callback) {
  try { await callback(); passed++; console.log("PASS " + name); }
  catch (error) { failures.push(name); console.error("FAIL " + name + ": " + error.message); }
}
const product = overrides => ({ id: 41, nome: "Vestido Aurora", descricao: "Tecido leve & delicado", categoria: "Conjuntos & Macacões", tamanhos: "P, M e G", preco: 129.9, midias: ["./img/look-listras-rosa-1.jpg"], esgotado: false, ...overrides });
const review = overrides => ({ id: 7, estrelas: 5, comentario: "Atendimento excelente!", criadoEm: Date.now(), ...overrides });

async function main() {
  await check("script carrega sem executar a interface", () => {
    assert(events.includes("DOMContentLoaded"));
    for (const method of ["normalizeProduct", "loadProducts", "parseSizes", "productHasSize", "cartKey", "normalizeEmail", "normalizeCPF", "normalizeReview", "loadReviews", "normalizeProfile", "normalizeCart", "buildWhatsAppMessage"]) assert.equal(typeof D[method], "function", method);
  });
  await check("mídias válidas e caminhos perigosos", () => {
    assert.equal(media("img/vestido.jpg"), "./img/vestido.jpg");
    assert.equal(media("./img/foto verão.png"), "./img/foto%20ver%C3%A3o.png");
    assert.equal(media("./img/foto%20ver%C3%A3o.png"), "./img/foto%20ver%C3%A3o.png");
    for (const ext of ["jpg", "png", "webp", "avif", "gif", "mp4", "webm"]) assert.equal(media("./img/peca." + ext), "./img/peca." + ext);
    const remote = "https://cdn.example.com/catalogo/vestido.jpg?width=600&fit=cover";
    assert.equal(media(remote), remote);
    for (const invalid of [null, {}, 42, "", "javascript:alert(1)", "data:image/png;base64,AA==", "blob:https://example.com/id", "http://example.com/a.jpg", "//example.com/a.jpg", "https://user:password@example.com/a.jpg", "../a.jpg", "./img/../a.jpg", "a/b.jpg", "/etc/a.jpg", "a.svg", "./img/%2e%2e/a.jpg", "https://example.com/%2e%2e/a.jpg", "https://example.com/a%00.jpg", "./img/a%2Fb.jpg", "./img/<script>.jpg"]) assert.equal(media(invalid), null, JSON.stringify(invalid));
  });
  await check("catálogo inicial preserva arquivos, IDs e tamanhos conhecidos", () => {
    const defaults = plain(D.loadProducts(null));
    assert.equal(defaults.length, 5);
    assert.equal(new Set(defaults.map(item => item.id)).size, defaults.length);
    for (const item of defaults) for (const file of item.midias) {
      const normalized = media(file);
      assert(normalized.startsWith("./img/"));
      assert(fs.existsSync(path.join(root, decodeURIComponent(normalized))), normalized);
    }
    assert.deepEqual(plain(D.parseSizes(defaults.find(item => item.id === 1).tamanhos)), ["36", "40", "42", "46"]);
    assert.deepEqual(plain(D.parseSizes(defaults.find(item => item.id === 2).tamanhos)), []);
    assert.equal(D.productHasSize(defaults.find(item => item.id === 2), "M"), false);
  });
  await check("produtos validam identidade, preço, mídias e texto", () => {
    const normalized = plain(D.normalizeProduct(product({ nome: "N".repeat(130), descricao: "D".repeat(900), midias: Array.from({ length: 12 }, (_, i) => "./img/foto-" + i + ".jpg"), senha: "nao-persistir", preco: 0 })));
    assert.equal(normalized.nome.length, 100);
    assert.equal(normalized.descricao.length, 800);
    assert.equal(normalized.midias.length, 8);
    assert.equal(normalized.preco, 0);
    assert(!Object.hasOwn(normalized, "senha"));
    for (const id of [0, -1, 1.5, "41", Number.MAX_SAFE_INTEGER + 1, null, true]) assert.equal(D.normalizeProduct(product({ id })), null);
    for (const nome of ["", "   ", null, {}]) assert.equal(D.normalizeProduct(product({ nome })), null);
    for (const midias of [[], ["javascript:alert(1)"], null, "foto.jpg"]) assert.equal(D.normalizeProduct(product({ midias })), null);
    for (const preco of [-1, Infinity, NaN, 10000001, {}]) assert.equal(D.normalizeProduct(product({ preco })), null);
  });
  await check("catálogo vazio e recuperação de armazenamento corrompido", () => {
    assert.deepEqual(plain(D.loadProducts("[]")), []);
    for (const invalid of ["{invalido", "null", "{}", "42"]) assert.deepEqual(plain(D.loadProducts(invalid)), plain(D.loadProducts(null)));
    assert.deepEqual(plain(D.loadProducts(JSON.stringify([product(), product(), product({ id: 42 }), { id: 43 }]))).map(item => item.id), [41, 42]);
  });
  await check("tamanhos explícitos e chaves distintas por variante", () => {
    assert.deepEqual(plain(D.parseSizes("P, M e G")), ["P", "M", "G"]);
    assert.deepEqual(plain(D.parseSizes("Preto (P), Caramelo (M)")), ["Preto (P)", "Caramelo (M)"]);
    assert.deepEqual(plain(D.parseSizes("P, P, M")), ["P", "M"]);
    assert.deepEqual(plain(D.parseSizes("")), []);
    const item = D.normalizeProduct(product());
    assert.equal(D.productHasSize(item, "P"), true);
    for (const size of ["", "GG", null, "<script>"]) assert.equal(D.productHasSize(item, size), false);
    assert.equal(D.productHasSize(D.normalizeProduct(product({ esgotado: true })), "P"), false);
    assert.notEqual(D.cartKey({ id: 41, size: "P" }), D.cartKey({ id: 41, size: "M" }));
  });
  await check("sacola agrega variantes iguais e rejeita legado sem tamanho", () => {
    const products = [D.normalizeProduct(product()), D.normalizeProduct(product({ id: 42, esgotado: true }))];
    const entries = [{ id: 41, size: "P", quantity: 70 }, { id: 41, size: "P", quantity: 50 }, { id: 41, size: "M", quantity: 2 }, { id: 42, size: "P", quantity: 1 }, { id: 999, size: "P", quantity: 1 }, { id: 41, quantity: 1 }, { id: 41, size: "GG", quantity: 1 }];
    assert.deepEqual(plain(D.normalizeCart(entries, products)), [{ id: 41, size: "P", quantity: 99 }, { id: 41, size: "M", quantity: 2 }]);
    for (const quantity of [-1, 0, 1.5, "2", null, true, Infinity]) assert.deepEqual(plain(D.normalizeCart([{ id: 41, size: "P", quantity }], products)), []);
    for (const entries of [null, {}, [[41, 2]], [{ id: 41, quantity: 2 }]]) assert.deepEqual(plain(D.normalizeCart(entries, products)), []);
    assert.equal(D.KEYS.cart, "nanda-boutique-sacola-v4");
    assert.equal(D.KEYS.role, "userRole");
    assert.deepEqual(plain(D.normalizeCart([{ id: 41, size: "P", quantity: 1, preco: 100, payment: "Pix" }], products)), [{ id: 41, size: "P", quantity: 1 }]);
  });
  await check("WhatsApp inclui peça, tamanho e pagamento obrigatório", () => {
    const products = [D.normalizeProduct(product()), D.normalizeProduct(product({ id: 42, nome: "Saia Coração" }))];
    const items = [{ id: 41, size: "P", quantity: 1 }, { id: 42, size: "G", quantity: 1 }];
    for (const payment of plain(D.PAYMENTS)) assert.equal(D.buildWhatsAppMessage(items, products, payment), "Olá Nanda Boutique! Tenho interesse nas seguintes peças: [Vestido Aurora - Tamanho P], [Saia Coração - Tamanho G]. Pagamento: " + payment + ". Poderia confirmar a disponibilidade?");
    assert.equal(D.PAYMENTS.length, 4);
    assert(D.PAYMENTS.includes("Pix") && D.PAYMENTS.includes("Dinheiro"));
    const quantityMessage = D.buildWhatsAppMessage([{ id: 41, size: "M", quantity: 2 }], products, "Pix");
    assert(quantityMessage.includes("Vestido Aurora - Tamanho M") && quantityMessage.includes("2"));
    assert.equal(new URL("https://wa.me/5511989423365?text=" + encodeURIComponent(quantityMessage)).searchParams.get("text"), quantityMessage);
    for (const payment of ["", null, "Boleto", "<img>"]) assert.equal(D.buildWhatsAppMessage(items, products, payment), "");
    assert.equal(D.buildWhatsAppMessage([], products, "Pix"), "");
  });
  await check("normalização de e-mail e formato de CPF", () => {
    assert.equal(D.normalizeEmail("  Cliente@Example.com  "), "cliente@example.com");
    for (const email of [null, "invalido", "a@", "<a>@example.com"]) assert.equal(D.normalizeEmail(email), "");
    assert.equal(D.normalizeCPF("123.456.789-01"), "12345678901");
    for (const cpf of [null, "", "123", "123456789012", "1234567890x"]) assert.equal(D.normalizeCPF(cpf), "");
    const profile = plain(D.normalizeProfile({ role: "customer", name: "Cliente Teste", email: "Cliente@Example.com", senha: "privada", cpf: "12345678901" }));
    assert.equal(profile.email, "cliente@example.com");
    assert(!Object.hasOwn(profile, "senha") && !Object.hasOwn(profile, "cpf"));
    assert.equal(D.normalizeProfile(null).role, "guest");
  });
  await check("avaliações validam nota e comentário sem importar CPF/senha brutos", () => {
    for (const estrelas of [1, 2, 3, 4, 5]) {
      const normalized = plain(D.normalizeReview(review({ estrelas, email: "Cliente@Example.com", cpf: "12345678901", senha: "privada" })));
      assert.equal(normalized.estrelas, estrelas);
      assert.equal(normalized.comentario, "Atendimento excelente!");
      assert(!Object.hasOwn(normalized, "cpf") && !Object.hasOwn(normalized, "senha"));
    }
    for (const invalid of [{ estrelas: 0 }, { estrelas: 6 }, { estrelas: 2.5 }, { estrelas: "5" }, { comentario: " " }, { comentario: null }, { id: "7" }, { criadoEm: Infinity }]) assert.equal(D.normalizeReview(review(invalid)), null);
    assert.equal(D.normalizeReview(review({ comentario: "A".repeat(700) })).comentario.length, 600);
    for (const serialized of [null, "{invalido", "null", "{}", "[]"]) assert.deepEqual(plain(D.loadReviews(serialized)), []);
    const list = plain(D.loadReviews(JSON.stringify([review(), review(), ...Array.from({ length: 220 }, (_, index) => review({ id: index + 1 }))])));
    assert(list.length <= 200);
    assert.equal(new Set(list.map(item => item.id)).size, list.length);
  });
  await check("o catálogo não contém senha nem autenticação administrativa local", () => {
    assert.equal(D.verifyAdminCredentials, undefined);
    assert(!/verifyAdminCredentials|passwordHash|PBKDF2/.test(source));
    assert(/BoutiqueAuth/.test(source));
  });
  await check("edições permanecem texto e CSP impede scripts externos", () => {
    assert(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/.test(source));
    assert(/\.textContent\s*=/.test(source));
    const payload = '<img src=x onerror="globalThis.__xss=1">';
    assert.equal(D.normalizeProduct(product({ nome: payload })).nome, payload);
    assert.equal(vm.runInContext("globalThis.__xss", context), undefined);
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html)?.[1];
    assert(policy?.includes("script-src 'self'") && policy.includes("object-src 'none'") && policy.includes("base-uri 'none'"));
  });
  await check("recursos estáticos existem e vídeos mantêm reprodução manual", () => {
    for (const [, resource] of html.matchAll(/\b(?:src|poster)=["']([^"']+)["']/g)) {
      assert(resource.startsWith("./img/") || ["./script.js", "./config.js", "./auth.js", "./pwa.js"].includes(resource), resource);
      assert(fs.existsSync(path.join(root, decodeURIComponent(resource))), resource);
    }
    for (const [, resource] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      assert(resource.startsWith("./img/"), resource);
      assert(fs.existsSync(path.join(root, decodeURIComponent(resource))), resource);
    }
    assert(!/\.autoplay\s*=\s*true|setAttribute\(\s*["']autoplay["']|\.play\s*\(/.test(source));
    assert(!/<video\b[^>]*\bautoplay\b/i.test(html));
    assert(/\.controls\s*=\s*true/.test(source) && /\.playsInline\s*=\s*true/.test(source));
    assert(/\.pause\s*\(/.test(source));
  });
  console.log("\n" + passed + " grupos aprovados; " + failures.length + " falha(s). Layout e interação exigem a suíte de navegador.");
  process.exitCode = failures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
