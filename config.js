/* UseNandaBoutique — configuração pública do projeto Supabase.
 * Execute supabase/setup.sql e provisione a dona em Authentication > Users.
 * Catálogo, conteúdos, estoque e contas utilizam exclusivamente o Supabase.
 * Use somente a chave publicável (sb_publishable_...) ou a antiga chave anon.
 * Nunca coloque senhas, service_role ou sb_secret neste arquivo.
 * Cadastre a URL exata do site em Authentication > URL Configuration no Supabase.
 */
globalThis.NANDA_CONFIG = Object.freeze({
    supabaseUrl: 'https://gisoblzonuzpowkwrwnq.supabase.co',
    supabaseAnonKey: 'sb_publishable_g-x4FSEoG4W2M0K4vUCxXg_eWGAGJza',
    // Vazio utiliza a própria página, sem parâmetros nem fragmentos.
    passwordResetRedirect: ''
});
