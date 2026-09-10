/* Mídias locais; os nomes dos arquivos são relativos a ./img/. */
function createMediaCarousel(product) {
  const frame = document.createElement('div');
  frame.className = 'product-image';
  const track = document.createElement('div');
  track.className = 'media-track';
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
      media.autoplay = true;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      ['autoplay', 'muted', 'loop', 'playsinline'].forEach(attr => media.setAttribute(attr, ''));
      media.preload = 'metadata';
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
    track.addEventListener('scroll', () => { count.textContent = `${Math.round(track.scrollLeft / track.clientWidth) + 1} / ${files.length}`; }, { passive: true });
    track.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    let drag;
    track.addEventListener('pointerdown', event => {
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

async function flyToBag(card) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const source = card.querySelector('.media-track img') || card.querySelector('.media-track video');
  const bag = document.getElementById('shoppingBag');
  if (!source || !source.animate) return;
  const start = card.querySelector('.product-image').getBoundingClientRect();
  const end = bag.getBoundingClientRect();
  const clone = source.cloneNode(true);
  clone.removeAttribute('id');
  clone.removeAttribute('loading');
  clone.setAttribute('aria-hidden', 'true');
  clone.className = 'flying-product';
  clone.style.left = `${start.left + start.width / 2 - 30}px`;
  clone.style.top = `${start.top + start.height / 2 - 36}px`;
  document.body.append(clone);
  const dx = end.left + end.width / 2 - start.left - start.width / 2;
  const dy = end.top + end.height / 2 - start.top - start.height / 2;
  const frames = Array.from({ length: 41 }, (_, index) => {
    const t = index / 40;
    return { transform: `translate(${dx * t}px, ${dy * t - Math.sin(Math.PI * t) * 150}px) scale(${1 - t * .85}) rotate(${t * 20}deg)`, opacity: t > .9 ? (1 - t) * 10 : 1 };
  });
  try {
    await clone.animate(frames, { duration: 800, easing: 'ease-in-out', fill: 'forwards' }).finished;
    bag.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16) rotate(-6deg)' }, { transform: 'scale(1)' }], { duration: 300 });
  } finally { clone.remove(); }
}
