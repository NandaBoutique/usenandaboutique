/* Instalação progressiva, instruções Safari/iOS e atualização com consentimento.
 * sessionStorage guarda apenas a preferência de exibição do tutorial nesta aba.
 * Produtos, estoque e conteúdo pertencem ao Supabase e não são gravados aqui.
 */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const modal = byId('installModal');
  const installButton = byId('installApp');
  if (!modal || !installButton) return;

  const userAgent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = ios && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/.test(userAgent);
  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  const standalone = () => standaloneMedia.matches || navigator.standalone === true;
  let deferredPrompt = null;
  let registration = null;
  let requestedUpdate = false;
  let reloading = false;
  let returnFocus = null;
  const tutorialKey = 'usenandaboutique-install-tutorial-session';

  function rememberTutorial() {
    try { sessionStorage.setItem(tutorialKey, 'shown'); } catch { /* Navegação privada: nenhuma dependência de armazenamento. */ }
  }
  function tutorialSeen() {
    try { return sessionStorage.getItem(tutorialKey) === 'shown'; } catch { return false; }
  }
  function syncInstallation() {
    installButton.hidden = standalone();
    byId('installNative').hidden = !deferredPrompt || standalone();
    byId('installIos').hidden = !ios || standalone();
    byId('installSafariHint').hidden = safari;
    byId('installOther').hidden = ios || !!deferredPrompt || standalone();
    if (standalone()) byId('installAppStatus').textContent = 'UseNandaBoutique já está instalado neste aparelho.';
  }
  function openInstallInstructions(trigger = installButton) {
    // O tutorial automático nunca interrompe login, compra ou edição em andamento.
    if (document.querySelector('dialog[open]') && !modal.open) return;
    returnFocus = trigger;
    syncInstallation();
    if (!standalone()) byId('installAppStatus').textContent = '';
    if (!modal.open) modal.showModal();
    document.body.classList.add('modal-open');
    rememberTutorial();
  }
  installButton.addEventListener('click', () => openInstallInstructions());
  modal.querySelectorAll('[data-close="installModal"]').forEach(button => button.addEventListener('click', () => modal.close()));
  modal.addEventListener('close', () => {
    rememberTutorial();
    if (!document.querySelector('dialog[open]')) {
      document.body.classList.remove('modal-open');
      if (returnFocus?.isConnected && !returnFocus.hidden) returnFocus.focus({ preventScroll: true });
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    syncInstallation();
  });
  byId('installNative').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const promptEvent = deferredPrompt;
    const button = byId('installNative');
    button.disabled = true;
    try {
      // Deve acontecer na interação direta da pessoa, conforme a API do navegador.
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      byId('installAppStatus').textContent = choice.outcome === 'accepted'
        ? 'Instalação solicitada. A boutique estará na sua tela inicial.'
        : 'Tudo bem! Você pode instalar a boutique quando quiser.';
    } catch {
      byId('installAppStatus').textContent = 'Use o menu do navegador para adicionar a boutique à tela inicial.';
    } finally {
      deferredPrompt = null;
      button.disabled = false;
      syncInstallation();
    }
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installButton.hidden = true;
    byId('installNative').hidden = true;
    byId('installAppStatus').textContent = 'UseNandaBoutique instalado. Nos vemos na sua tela inicial!';
  });
  standaloneMedia.addEventListener?.('change', syncInstallation);
  syncInstallation();

  function syncConnection() {
    byId('offlineNotice').hidden = navigator.onLine;
    if (navigator.onLine && registration) registration.update().catch(() => {});
  }
  window.addEventListener('online', syncConnection);
  window.addEventListener('offline', syncConnection);
  syncConnection();

  function showUpdate() {
    if (!registration?.waiting || !navigator.serviceWorker.controller) return;
    byId('appUpdateNotice').hidden = false;
    byId('applyAppUpdate').disabled = false;
  }
  byId('dismissAppUpdate').addEventListener('click', () => { byId('appUpdateNotice').hidden = true; });
  byId('applyAppUpdate').addEventListener('click', () => {
    if (!registration?.waiting) { byId('appUpdateNotice').hidden = true; return; }
    requestedUpdate = true;
    byId('applyAppUpdate').disabled = true;
    byId('appUpdateMessage').textContent = 'Atualizando a boutique…';
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A primeira instalação e atualizações em outra aba não descartam formulários.
      if (!requestedUpdate || reloading) return;
      reloading = true;
      window.location.reload();
    });
    window.addEventListener('load', async () => {
      try {
        registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
        showUpdate();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed') showUpdate(); });
        });
      } catch {
        // A vitrine e o atendimento continuam disponíveis sem a instalação offline.
        byId('installAppStatus').textContent = 'A instalação ficará disponível quando a conexão com a boutique estiver estável.';
      }
    }, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine && registration) registration.update().catch(() => {});
    });
  }

  // Safari não oferece beforeinstallprompt: explicamos o caminho visual uma vez.
  if (safari && !standalone() && !tutorialSeen()) {
    window.setTimeout(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]') && !standalone()) {
        openInstallInstructions(document.activeElement);
      }
    }, 6500);
  }
})();
