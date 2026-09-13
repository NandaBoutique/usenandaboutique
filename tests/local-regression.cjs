// Regras reais do catálogo em VM, sem rede ou alterações em dados.
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, ".."), source = fs.readFileSync(path.join(root, "script.js"), "utf8"), html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const context = vm.createContext({ URL, TextEncoder, TextDecoder, structuredClone, crypto: require("node:crypto").webcrypto, document: { addEventListener() {} }, addEventListener() {} });
vm.runInContext("window = globalThis", context);
vm.runInContext(source, context, { filename: "script.js", timeout: 3000 });
const { data: D, media } = vm.runInContext("({data: BoutiqueData, media: normalizeMediaURL})", context);
const plain = value => JSON.parse(JSON.stringify(value)), failures = [];
let passed = 0;
async function check(name, callback) { try { await callback(); passed++; console.log("PASS " + name); } catch (error) { failures.push(name); console.error("FAIL " + name + ": " + error.message); } }
const product = overrides => ({ id: 41, nome: "Vestido Aurora", descricao: "Tecido leve & delicado", categoria: "Conjuntos & Macacões", tamanhos: "P, M, G", estoquePorTamanho: { P: 3, M: 2, G: 0 }, limiteReposicao: 2, guiaMedidas: "https://nanda-test.supabase.co/storage/v1/object/public/boutique-media/medidas.jpg", preco: 129.9, midias: ["./img/look-listras-rosa-1.jpg"], esgotado: false, ...overrides });

async function main() {
  await check("mídias preservam URL remota atual e rejeitam protocolos/caminhos perigosos", () => {
    const remote = "https://nanda-test.supabase.co/storage/v1/object/public/boutique-media/nova.jpg?v=20260912";
    assert.equal(media(remote), remote); assert.equal(media("img/vestido.jpg"), "./img/vestido.jpg");
    for (const value of [null, {}, 42, "", "javascript:alert(1)", "blob:https://example.com/id", "http://example.com/a.jpg", "//example.com/a.jpg", "https://user:password@example.com/a.jpg", "../a.jpg", "./img/../a.jpg", "./img/%2e%2e/a.jpg", "https://example.com/a%00.jpg"]) assert.equal(media(value), null, JSON.stringify(value));
  });
  await check("catálogo vazio/corrompido não inventa produtos ou estoque local", () => {
    for (const value of [null, "[]", "null", "{}", "{invalido", "42"]) assert.deepEqual(plain(D.loadProducts(value)), []);
    assert.deepEqual(plain(D.loadProducts(JSON.stringify([product(), product(), product({ id: 42 }), { id: 43 }]))).map(item => item.id), [41, 42]);
    assert.equal(D.productHasSize(D.normalizeProduct(product({ estoquePorTamanho: undefined })), "P"), false);
  });
  await check("produto valida identidade, preços, texto e limite de mídias", () => {
    const item = plain(D.normalizeProduct(product({ nome: "N".repeat(130), descricao: "D".repeat(900), midias: Array.from({ length: 12 }, (_, i) => "./img/foto-" + i + ".jpg"), senha: "privada", preco: 0 })));
    assert.equal(item.nome.length, 100); assert.equal(item.descricao.length, 800); assert.equal(item.midias.length, 8); assert.equal(item.preco, 0); assert(!Object.hasOwn(item, "senha"));
    for (const id of [0, -1, 1.5, "41", Number.MAX_SAFE_INTEGER + 1, null, true]) assert.equal(D.normalizeProduct(product({ id })), null);
    for (const preco of [-1, Infinity, NaN, 10000001, {}]) assert.equal(D.normalizeProduct(product({ preco })), null);
    for (const midias of [[], ["javascript:alert(1)"], null, "foto.jpg"]) assert.equal(D.normalizeProduct(product({ midias })), null);
  });
  await check("estoque por tamanho e guia individual não se misturam entre peças", () => {
    const item = D.normalizeProduct(product());
    assert.deepEqual(plain(item.estoquePorTamanho), { P: 3, M: 2, G: 0 }); assert.equal(item.guiaMedidas, product().guiaMedidas);
    assert(!D.normalizeProduct(product({ id: 42, guiaMedidas: "" })).guiaMedidas);
    assert(!D.normalizeProduct(product({ guiaMedidas: "javascript:alert(1)" })).guiaMedidas);
    assert.equal(D.productHasSize(item, "P"), true);
    for (const size of ["G", "", "GG", null]) assert.equal(D.productHasSize(item, size), false);
    assert.equal(D.productHasSize(D.normalizeProduct(product({ esgotado: true })), "P"), false);
    for (const quantity of [-1, 0.5, Infinity, NaN, {}, null]) {
      const invalid = D.normalizeProduct(product({ estoquePorTamanho: { P: quantity, M: 2, G: 0 } }));
      assert(!invalid || invalid.estoquePorTamanho.P === 0, "quantidade " + String(quantity));
    }
  });
  await check("sacola agrega variantes e limita quantidades ao estoque atual", () => {
    const items = [D.normalizeProduct(product()), D.normalizeProduct(product({ id: 42, esgotado: true }))];
    const entries = [{ id: 41, size: "P", quantity: 2 }, { id: 41, size: "P", quantity: 2 }, { id: 41, size: "M", quantity: 3 }, { id: 41, size: "G", quantity: 1 }, { id: 42, size: "P", quantity: 1 }, { id: 999, size: "P", quantity: 1 }, { id: 41, quantity: 1 }];
    assert.deepEqual(plain(D.normalizeCart(entries, items)), [{ id: 41, size: "P", quantity: 3 }, { id: 41, size: "M", quantity: 2 }]);
    for (const quantity of [-1, 0, 1.5, "2", null, true, Infinity]) assert.deepEqual(plain(D.normalizeCart([{ id: 41, size: "P", quantity }], items)), []);
    assert.deepEqual(plain(D.normalizeCart(entries, [D.normalizeProduct(product({ estoquePorTamanho: { P: 1, M: 0, G: 0 } }))])), [{ id: 41, size: "P", quantity: 1 }]);
    assert.notEqual(D.cartKey({ id: 41, size: "P" }), D.cartKey({ id: 41, size: "M" }));
  });
  await check("checkout contém quantidade, unitário, subtotal, total e pagamento obrigatório", () => {
    const products = [D.normalizeProduct(product()), D.normalizeProduct(product({ id: 42, nome: "Saia Coração", preco: 80 }))], items = [{ id: 41, size: "P", quantity: 2 }, { id: 42, size: "M", quantity: 1 }];
    for (const payment of plain(D.PAYMENTS)) {
      const message = D.buildWhatsAppMessage(items, products, payment);
      for (const value of ["Vestido Aurora", "Saia Coração", "129,90", "259,80", "80,00", "339,80", payment]) assert(message.includes(value), value);
      assert(/quantidade.*2/is.test(message)); assert(/tamanho.*P/is.test(message)); assert(/total/i.test(message));
      assert.equal(new URL("https://wa.me/5511989423365?text=" + encodeURIComponent(message)).searchParams.get("text"), message);
    }
    for (const payment of ["", null, "Boleto", "<img>"]) assert.equal(D.buildWhatsAppMessage(items, products, payment), "");
    assert.equal(D.buildWhatsAppMessage([], products, "Pix"), "");
    const unknown = D.buildWhatsAppMessage([{ id: 41, size: "P", quantity: 1 }], [D.normalizeProduct(product({ preco: null }))], "Pix");
    assert(!unknown || /consult|confirmar/i.test(unknown), "preço desconhecido não equivale a gratuito");
    const delivery = D.buildWhatsAppMessage(items, products, "Pix", "osasco");
    for (const value of ["Subtotal da compra", "Taxa de entrega: R$ 10,00", "Total final: R$ 349,80", "Entrega em Osasco"]) assert(delivery.includes(value), value);
    const pickup = D.buildWhatsAppMessage(items, products, "Pix", "retirada");
    assert(pickup.includes("Taxa de entrega: R$ 0,00") && pickup.includes("Total final: R$ 339,80"));
    assert.equal(D.normalizeDelivery("desconhecida").id, "combinar");
  });
  await check("perfil serializado não concede admin e conteúdo permanece texto", () => {
    const profile = plain(D.normalizeProfile({ role: "admin", email: "Cliente@Example.com", senha: "privada", cpf: "12345678901" }));
    assert.notEqual(profile.role, "admin"); assert.equal(profile.email, "cliente@example.com"); assert(!Object.hasOwn(profile, "senha") && !Object.hasOwn(profile, "cpf"));
    const payload = '<img src=x onerror="globalThis.__xss=1">';
    assert.equal(D.normalizeProduct(product({ nome: payload })).nome, payload); assert.equal(vm.runInContext("globalThis.__xss", context), undefined);
    assert(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/.test(source));
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html)?.[1];
    assert(policy?.includes("script-src 'self'") && policy.includes("object-src 'none'"));
  });
  await check("recursos locais existem e vídeos aguardam interação", () => {
    for (const [, resource] of html.matchAll(/\b(?:src|poster)=["']([^"']+)["']/g)) if (resource.startsWith("./")) assert(fs.existsSync(path.join(root, decodeURIComponent(resource))), resource);
    assert(!/\.autoplay\s*=\s*true|setAttribute\(\s*["']autoplay["']|\.play\s*\(/.test(source)); assert(!/<video\b[^>]*\bautoplay\b/i.test(html));
    assert(/\.controls\s*=\s*true/.test(source) && /\.playsInline\s*=\s*true/.test(source));
  });
  console.log("\n" + passed + " grupos aprovados; " + failures.length + " falha(s)."); process.exitCode = failures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
