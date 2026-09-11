/* Configuração pública. Deixe vazio para usar contas e dados locais offline.
 * Os dados locais pertencem apenas a este navegador; limpar os dados os apaga.
 * Contas locais não comprovam posse de e-mail. Não há senha padrão embutida.
 * Para ativar o backend, preencha após executar supabase/setup.sql no projeto.
 * Use somente a chave publicável (sb_publishable_...) ou a antiga chave anon.
 * Nunca coloque senhas, service_role ou sb_secret neste arquivo.
 * Cadastre a URL exata do site em Authentication > URL Configuration no Supabase.
 */
globalThis.NANDA_CONFIG = Object.freeze({
    supabaseUrl: '',
    supabaseAnonKey: '',
    // Vazio utiliza a própria página, sem parâmetros nem fragmentos.
    passwordResetRedirect: ''
});
