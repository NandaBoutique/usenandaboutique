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
  let store = null, version = 1;
  const updatedAt = () => "2026-09-12T12:00:" + String(version).padStart(2, "0") + ".000Z";
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
    else if (parsed.pathname === "/rest/v1/boutique_store") {
      if (["POST", "PATCH"].includes(options.method)) { store = body.payload; version++; }
      payload = store ? [{ id: "main", payload: store, updated_at: updatedAt() }] : [];
    }
    else if (parsed.pathname.startsWith("/storage/v1/object/")) payload = { Key: parsed.pathname };
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
  await check("sem configuração não cria contas, catálogo ou privilégio local", async () => {
    const local = storage(); local.setItem("userRole", "admin"); local.setItem("nanda-boutique-perfil-v1", JSON.stringify({ email: official, role: "admin" }));
    const { A, calls } = create({ local });
    assert.equal(A.mode(), "unconfigured"); assert.equal(A.configured(), false);
    await A.restore(); assert.equal(A.getState().role, "guest");
    await assert.rejects(A.requireAdmin()); await assert.rejects(A.signIn(official, samplePassword));
    await assert.rejects(A.signUp({ name: "Cliente", email: "cliente@example.com", password: samplePassword }));
    await assert.rejects(A.loadStore()); await assert.rejects(A.saveStore({ products: [] }));
    await assert.rejects(A.resetPassword("cliente@example.com")); assert.equal(calls.length, 0);
  });
  await check("upload verifica assinatura e gera URL distinta a cada envio", async () => {
    const { A, calls } = create({ config: publicConfig }); await A.signIn(official, samplePassword);
    await assert.rejects(A.uploadImage(new Blob(["<script>executavel</script>"], { type: "image/jpeg" })));
    await assert.rejects(A.uploadImage(new Blob(["<svg></svg>"], { type: "image/svg+xml" })));
    const bytes = fs.readFileSync(path.join(__dirname, "..", "img", "look-listras-rosa-1.jpg"));
    const one = await A.uploadImage(new Blob([bytes], { type: "image/png" })), two = await A.uploadImage(new Blob([bytes], { type: "image/png" }));
    assert(one.startsWith(publicConfig.supabaseUrl + "/storage/v1/object/public/boutique-media/")); assert.notEqual(one, two);
    assert.equal(calls.filter(call => call.path.startsWith("/storage/v1/object/")).length, 2);
  });
  await check("sessão remota restaura, não guarda senha e valida token no servidor", async () => {
    const first = create({ config: publicConfig }); await first.A.signIn(official, samplePassword);
    assert(!JSON.stringify([...first.local.values, ...first.session.values]).includes(samplePassword));
    const second = create({ config: publicConfig, local: first.local, session: first.session }); await second.A.restore();
    assert.equal(second.A.getState().role, "admin"); assert(second.calls.some(call => call.path === "/auth/v1/user"));
    await second.A.signOut(); assert.equal(second.A.getState().role, "guest"); await assert.rejects(second.A.requireAdmin());
  });
  await check("Supabase confirma usuário e RPC antes de autorizar o e-mail oficial", async () => {
    const { A, calls } = create({ config: publicConfig });
    assert.equal(A.mode(), "supabase"); await A.signIn(official, samplePassword);
    assert.equal(A.getState().role, "admin"); assert.equal(A.getState().verified, true);
    assert.deepEqual(calls.slice(0, 3).map(call => call.path), ["/auth/v1/token", "/auth/v1/user", "/rest/v1/rpc/is_store_admin"]);
    await assert.rejects(A.saveStore({ story: "Leitura inicial obrigatória." }));
    assert.equal(await A.loadStore(), null);
    await A.saveStore({ story: "Persistência remota simulada." });
    await A.saveStore({ story: "Edição com versão." });
    assert(calls.some(call => call.method === "PATCH" && call.query.includes("updated_at=eq.")));
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
    assert.equal(calls.find(call => call.path === "/auth/v1/signup").body.data.role, undefined);
    await assert.rejects(A.updatePassword("NovaSenhaTeste!123"));
  });
  await check("conflito não sobrescreve edição feita em outra sessão", async () => {
    let rejectUpdate = false;
    const { A, calls } = create({ config: publicConfig, fetchHook: async (url, options) => {
      if (rejectUpdate && options.method === "PATCH") return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    } });
    await A.signIn(official, samplePassword); await A.loadStore(); await A.saveStore({ story: "Primeira versão" }); rejectUpdate = true;
    await assert.rejects(A.saveStore({ story: "Alteração obsoleta" }), /alter|versão|recarreg|outr/i);
    assert.equal(calls.filter(call => call.path === "/rest/v1/boutique_store" && call.method === "POST").length, 1);
  });
  console.log("\n" + passed + " grupos de autenticação aprovados; " + failures.length + " falha(s). Nenhum serviço real foi acessado.");
  process.exitCode = failures.length ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
