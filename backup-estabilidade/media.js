/* Mídias locais; os nomes dos arquivos são relativos a ./img/. */
function createMediaCarousel(product) {
  const frame = document.createElement('div');
  frame.className = 'product-image';
  const track = document.createElement('div');
  track.className = 'media-track';
  track.setAttribute('role', 'region');
  track.setAttribute('aria-label', `Mídias de ${product.nome}`);
  const files = (Array.isArray(product.midias) ? product.midias : []).filter(file => typeof file === 'string' && /\.(jpe?g|png|mp4)$/i.test(file) && !/[\\/]/.test(file));
  for (const [index, file] of files.entries()) {
    const slide = document.createElement('div');
    slide.className = 'media-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `${index + 1} de ${files.length}`);
    const isVideo = /\.mp4$/i.test(file);
    const media = document.createElement(isVideo ? 'video' : 'img');
    media.width = 360;
    media.height = 400;
    if (isVideo) {
      media.controls = true;
      media.autoplay = true;
      media.muted = false;
      media.loop = true;
      media.playsInline = true;
      ['controls', 'autoplay', 'loop', 'playsinline'].forEach(attr => media.setAttribute(attr, ''));
      media.preload = 'metadata';
      const sound = document.createElement('button');
      sound.type = 'button';
      sound.className = 'video-sound';
      const updateSound = () => {
        sound.textContent = media.muted ? 'Ativar som' : 'Silenciar';
        sound.setAttribute('aria-label', `${sound.textContent}: ${product.nome}`);
      };
      sound.addEventListener('click', () => {
        media.muted = !media.muted;
        if (!media.muted) media.volume = 1;
        media.play().catch(() => { /* Native controls remain available. */ });
        updateSound();
      });
      media.addEventListener('volumechange', updateSound);
      updateSound();
      slide.append(sound);
      media.setAttribute('aria-label', `${product.nome}, vídeo ${index + 1}`);
    } else {
      media.alt = `${product.nome}, foto ${index + 1}`;
      media.loading = 'lazy';
      media.decoding = 'async';
      media.draggable = false;
    }
    media.addEventListener('error', () => { slide.textContent = 'Mídia indisponível'; }, { once: true });
    media.src = './img/' + encodeURIComponent(file);
    slide.append(media);
    track.append(slide);
  }
  if (!files.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'product-placeholder';
    placeholder.textContent = 'Fotos em breve';
    track.append(placeholder);
  }
  frame.append(track);
  if (files.length > 1) {
    track.tabIndex = 0;
    track.setAttribute('aria-roledescription', 'carrossel');
    const count = document.createElement('span');
    count.className = 'media-count';
    count.textContent = `1 / ${files.length}`;
    const go = delta => {
      const index = Math.round(track.scrollLeft / track.clientWidth);
      track.scrollTo({ left: Math.max(0, Math.min(files.length - 1, index + delta)) * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    for (const [delta, label, glyph] of [[-1, 'Mídia anterior', '‹'], [1, 'Próxima mídia', '›']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `media-arrow ${delta < 0 ? 'previous' : 'next'}`;
      button.textContent = glyph;
      button.setAttribute('aria-label', `${label}: ${product.nome}`);
      button.addEventListener('click', () => go(delta));
      frame.append(button);
    }
    track.addEventListener('scroll', () => {
      count.textContent = `${Math.round(track.scrollLeft / track.clientWidth) + 1} / ${files.length}`; }, { passive: true });
    track.addEventListener('keydown', event => {
      if (event.target !== track) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    let drag;
    track.addEventListener('pointerdown', event => {
      if (event.target.closest('video, button')) return;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { x: event.clientX, left: track.scrollLeft };
      track.setPointerCapture(event.pointerId);
      track.classList.add('dragging');
      event.preventDefault();
    });
    track.addEventListener('pointermove', event => {
      if (drag) track.scrollLeft = drag.left + drag.x - event.clientX;
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      track.classList.remove('dragging');
      go(0);
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', endDrag);
    frame.append(count);
  }
  return frame;
}

// One observer follows both carousel clipping and viewport visibility.
const BoutiqueMedia = (() => {
  const states = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const blocked = () => document.hidden || document.body.classList.contains('motion-paused') || document.body.classList.contains('modal-open') || reduced.matches;
  async function start(video, state) {
    if (state.pending || !state.visible || blocked()) return;
    state.pending = true;
    try {
      await video.play();
    } catch (error) {
      if (error.name === 'NotAllowedError' && states.has(video) && state.visible && !blocked()) {
        video.muted = true;
        try { await video.play(); } catch { /* Autoplay may be disabled entirely; native Play is available. */ }
      }
    } finally {
      state.pending = false;
      if (!states.has(video) || !state.visible || blocked()) video.pause();
    }
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio >= .6;
      if (state.visible && !blocked()) start(entry.target, state);
      else entry.target.pause();
    }
  }, { threshold: [0, .6] });
  function refresh() {
    for (const [video, state] of states) {
      if (state.visible && !blocked()) start(video, state); else video.pause();
    }
  }
  document.addEventListener('visibilitychange', refresh);
  reduced.addEventListener('change', refresh);
  return {
    refresh,
    clear() {
      observer.disconnect();
      for (const video of states.keys()) video.pause();
      states.clear();
    },
    observe(root) {
      root.querySelectorAll('video').forEach(video => {
        const state = { visible: false, pending: false };
        states.set(video, state);
        video.addEventListener('play', () => {
          // Prevent the autoplay attribute from starting an offscreen slide.
          if (!state.visible || document.hidden || document.body.classList.contains('modal-open')) video.pause();
        });
        observer.observe(video);
      });
    }
  };
})();
