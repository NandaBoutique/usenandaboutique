// Autenticação real em VM: armazenamento isolado e respostas HTTP simuladas.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
const official = "usenandaboutiquee@gmail.com";
const samplePassword = "SenhaDeTesteIsolado!983";
const publicConfig = { supabaseUrl: "https://nanda-test.supabase.co", supabaseAnonKey: "sb_publishable_nanda_test_public_key_only_123456789" };
const failures = [];
let passed = 0;
function storage(seed = new Map()) { return { getItem: key => seed.get(key) ?? null, setItem: (key, value) => seed.set(key, String(value)), removeItem: key => seed.delete(key), clear: () => seed.clear(), key: index => [...seed.keys()][index] ?? null, get length() { return seed.size; }, values: seed }; }
function create({ config = {}, local = storage(), session = storage(), remoteUser, rpcAdmin = true, fetchHook } = {}) {
  const calls = [];
  let user = remoteUser || { id: "11111111-1111-4111-8111-111111111111", email: official, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false, user_metadata: { name: "Nanda", role: "admin" } };
  let store = null;
  const fetchMock = async (url, options = {}) => {
    const parsed = new URL(url), body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    calls.push({ path: parsed.pathname, query: parsed.search, method: options.method, body, headers: options.headers });
    if (fetchHook) { const response = await fetchHook(parsed, options, body); if (response) return response; }
    let payload;
    if (parsed.pathname === "/auth/v1/token") payload = { access_token: "access-test", refresh_token: "refresh-test", expires_in: 3600, user: { ...user, user_metadata: { role: "admin" } } };
    else if (parsed.pathname === "/auth/v1/user") payload = user;
    else if (parsed.pathname === "/rest/v1/rpc/is_store_admin") payload = rpcAdmin;
    else if (parsed.pathname === "/auth/v1/signup") payload = { user: { ...user, email_confirmed_at: null } };
    else if (["/auth/v1/recover", "/auth/v1/logout"].includes(parsed.pathname)) payload = {};
    else if (parsed.pathname === "/rest/v1/boutique_store") { if (options.method === "POST") store = body.payload; payload = store ? [{ id: "main", payload: store }] : []; }
    else if (parsed.pathname === "/rest/v1/rpc/boutique_list_reviews") payload = [];
    else throw Error("Endpoint inesperado no teste: " + parsed.pathname);
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const location = { href: "http://127.0.0.1:8000/index.html" };
  const context = vm.createContext({ NANDA_CONFIG: config, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: webcrypto, localStorage: local, sessionStorage: session, Blob, File, Response, Uint8Array, AbortController, fetch: fetchMock, atob, btoa, setTimeout, clearTimeout, setInterval, clearInterval, location, history: { replaceState: (_state, _title, url) => { location.href = new URL(url, location.href).href; } }, addEventListener() {}, removeEventListener() {} });
  vm.runInContext("window = globalThis", context);
  vm.runInContext(source, context, { filename: "auth.js" });
  return { A: context.BoutiqueAuth, local, session, calls, setUser(value) { user = value; } };
}
async function check(name, callback) {
  try { await callback(); passed++; console.log("PASS " + name); }
  catch (error) { failures.push(name); console.error("FAIL " + name + ": " + error.message); }
}
async function main() {
  await check("sem configuração usa modo local e ignora papel/perfil legado forjados", async () => {
    const local = storage(); local.setItem("userRole", "admin"); local.setItem("nanda-boutique-perfil-v1", JSON.stringify({ email: official, role: "admin" }));
    const { A, calls } = create({ local });
    assert.equal(A.mode(), "local"); assert.equal(A.configured(), false);
    await A.restore(); assert.equal(A.getState().role, "guest");
    await assert.rejects(A.requireAdmin()); await assert.rejects(A.signIn(official, samplePassword));
    assert.equal(calls.length, 0);
    assert.equal((await A.resetPassword("cliente@example.com")).simulated, true);
  });
  await check("cadastro/login local normaliza e-mail, guarda hash e restaura sessão opaca", async () => {
    const { A, local, session, calls } = create();
    await A.signUp({ name: "Cliente Teste", email: "Cliente@Example.com", password: samplePassword });
    await A.signOut(); await A.signIn("CLIENTE@example.com", samplePassword);
    assert.equal(A.getState().role, "client"); assert.equal(A.getState().user.email, "cliente@example.com");
    const id = A.getState().user.id;
    assert(!JSON.stringify([...local.values]).includes(samplePassword));
    assert(!JSON.stringify([...session.values]).includes(samplePassword));
    const second = create({ local, session }); await second.A.restore();
    assert.equal(second.A.getState().user.id, id);
    await assert.rejects(A.signUp({ name: "Duplicada", email: "CLIENTE@example.com", password: samplePassword }));
    await A.signOut(); await assert.rejects(A.signIn("cliente@example.com", "senha-diferente"));
    assert.equal(A.getState().role, "guest"); assert.equal(calls.length, 0);
  });
  await check("admin offline exige conta oficial e senha escolhida; cliente não pode salvar loja", async () => {
    const { A } = create();
    await A.signUp({ name: "Cliente", email: "cliente@example.com", password: samplePassword }); await A.signIn("cliente@example.com", samplePassword);
    await assert.rejects(A.requireAdmin()); await assert.rejects(A.saveStore({ products: [] }));
    await A.signOut(); await A.signUp({ name: "Nanda", email: official, password: samplePassword }); await A.signIn(official, samplePassword);
    assert.equal((await A.requireAdmin()).role, "admin");
    await A.saveStore({ products: [{ id: 1, nome: "Teste" }], story: "História local." });
    assert.equal((await A.loadStore()).story, "História local.");
    await A.signOut(); await assert.rejects(A.saveStore({ products: [] }));
  });
  await check("avaliações locais exigem login, autoria e uma por conta", async () => {
    const { A } = create();
    await assert.rejects(A.submitReview({ id: 1, estrelas: 5, comentario: "Comentário de teste." }));
    await A.signUp({ name: "Primeira Cliente", email: "primeira@example.com", password: samplePassword }); await A.signIn("primeira@example.com", samplePassword);
    await A.submitReview({ id: 1, estrelas: 5, comentario: "Comentário de teste." });
    await assert.rejects(A.submitReview({ id: 2, estrelas: 4, comentario: "Não pode duplicar." }));
    let reviews = await A.loadReviews(); assert.equal(reviews.length, 1); assert.equal(reviews[0].name, "Primeira Cliente");
    const firstOwner = reviews[0].ownerId;
    await A.signOut(); await A.signUp({ name: "Segunda Cliente", email: "segunda@example.com", password: samplePassword }); await A.signIn("segunda@example.com", samplePassword);
    assert.notEqual(A.getState().user.id, firstOwner); await assert.rejects(A.deleteReview(1));
    await A.signOut(); await A.signIn("primeira@example.com", samplePassword); await A.deleteReview(1); reviews = await A.loadReviews(); assert.equal(reviews.length, 0);
  });
  await check("upload local valida o conteúdo real do arquivo", async () => {
    const { A } = create(); await A.signUp({ name: "Nanda", email: official, password: samplePassword }); await A.signIn(official, samplePassword);
    await assert.rejects(A.uploadImage(new Blob(["<script>executavel</script>"], { type: "image/jpeg" })));
    await assert.rejects(A.uploadImage(new Blob(["<svg></svg>"], { type: "image/svg+xml" })));
    const bytes = fs.readFileSync(path.join(__dirname, "..", "img", "look-listras-rosa-1.jpg"));
    const url = await A.uploadImage(new Blob([bytes], { type: "image/jpeg" }));
    assert(url.startsWith("data:image/jpeg;base64,"));
  });
  await check("Supabase confirma usuário e RPC antes de autorizar o e-mail oficial", async () => {
    const { A, calls } = create({ config: publicConfig });
    assert.equal(A.mode(), "supabase"); await A.signIn(official, samplePassword);
    assert.equal(A.getState().role, "admin"); assert.equal(A.getState().verified, true);
    assert.deepEqual(calls.slice(0, 3).map(call => call.path), ["/auth/v1/token", "/auth/v1/user", "/rest/v1/rpc/is_store_admin"]);
    await A.saveStore({ story: "Persistência remota simulada." });
    assert(calls.some(call => call.path === "/rest/v1/boutique_store" && call.method === "POST"));
  });
  await check("e-mail oficial sem RPC, outra conta ou metadata admin não recebem edição remota", async () => {
    const denied = create({ config: publicConfig, rpcAdmin: false }); await denied.A.signIn(official, samplePassword);
    assert.equal(denied.A.getState().role, "client"); await assert.rejects(denied.A.requireAdmin());
    const client = create({ config: publicConfig, remoteUser: { id: "client-id", email: "cliente@example.com", email_confirmed_at: "2026-01-01", user_metadata: { role: "admin", name: "Cliente" } } });
    await client.A.signIn("cliente@example.com", samplePassword); assert.equal(client.A.getState().role, "client");
    await assert.rejects(client.A.saveStore({ story: "Não deve salvar" }));
    assert(!client.calls.some(call => call.path === "/rest/v1/boutique_store" && call.method === "POST"));
  });
  await check("Supabase rejeita e-mail não confirmado e perde autorização quando backend falha", async () => {
    const unconfirmed = create({ config: publicConfig, remoteUser: { id: "admin-id", email: official, email_confirmed_at: null, user_metadata: { role: "admin" } } });
    await assert.rejects(unconfirmed.A.signIn(official, samplePassword)); assert.equal(unconfirmed.A.getState().role, "guest");
    let offline = false;
    const denied = create({ config: publicConfig, fetchHook: async () => { if (offline) throw Error("Offline"); } });
    await denied.A.signIn(official, samplePassword); offline = true;
    await assert.rejects(denied.A.requireAdmin()); assert.equal(denied.A.getState().role, "guest");
  });
  await check("recuperação remota usa endpoint simulado e registro não antecipa confirmação", async () => {
    const { A, calls } = create({ config: publicConfig });
    const signup = await A.signUp({ name: "Cliente", email: "cliente@example.com", password: samplePassword });
    assert.equal(signup.confirmationRequired, true); assert.equal(A.getState().role, "guest");
    assert.equal((await A.resetPassword("cliente@example.com")).simulated, false);
    assert(calls.some(call => call.path === "/auth/v1/recover"));
    assert.equal(calls.find(call => call.path === "/auth/v1/signup").body.data.userRole, "client");
    await assert.rejects(A.updatePassword("NovaSenhaTeste!123"));
  });
  console.log("\n" + passed + " grupos de autenticação aprovados; " + failures.length + " falha(s). Nenhum serviço real foi acessado.");
  process.exitCode = failures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
