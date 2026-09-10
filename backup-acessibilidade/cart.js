"use strict";

function createBoutiqueCart(products, catalogRoot) {
  const cart = new Map();
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatBRL = cents => money.format(cents / 100);
  const WHATSAPP_URL = "https://wa.me/5511989423365?text=";
  const modal = document.getElementById('checkoutModal');
  const cartItems = modal.querySelector('#cartItems');
  const checkoutButton = modal.querySelector('#checkoutButton');
  const bag = document.getElementById('shoppingBag');
  const closeCheckout = modal.querySelector('#closeCheckout');
  const storageKey = 'nanda-boutique-sacola-v1';
  let returnFocus = bag;
  let toastTimer;

  // Persist only product IDs and quantities; prices always come from the catalog.
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) for (const entry of saved) {
      if (!Array.isArray(entry)) continue;
      const [id, quantity] = entry;
      if (products.has(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 99) cart.set(id, quantity);
    }
  } catch { /* Storage can be unavailable; the in-memory bag still works. */ }

  function getSummary() {
    let count = 0, total = 0, unknown = 0;
    for (const [id, quantity] of cart) {
      const price = products.get(id).preco;
      count += quantity;
      if (price === null) unknown += quantity;
      else total += price * quantity;
    }
    return { count, total, unknown };
  }

  function buildOrderMessage() {
    const lines = ['Olá, Nanda Boutique! Gostaria de finalizar meu pedido.', '', '*MINHA SACOLA*'];
    for (const [id, quantity] of cart) {
      const product = products.get(id);
      lines.push(`• ${product.nome}`, `  Quantidade: ${quantity}`, product.preco === null
        ? '  Valor: a confirmar'
        : `  Unitário: ${formatBRL(product.preco)} | Subtotal: ${formatBRL(product.preco * quantity)}`);
    }
    const { count, total, unknown } = getSummary();
    lines.push('', '*RESUMO DO PEDIDO*', `Quantidade de peças: ${count}`);
    lines.push(unknown
      ? `Subtotal dos itens com preço informado: ${count === unknown ? 'nenhum valor informado' : formatBRL(total)}`
      : `Total dos produtos (sem frete): ${formatBRL(total)}`);
    lines.push('Frete: R$ 10,00 para Osasco. Outras regiões a consultar');
    if (!unknown) lines.push(`Total se a entrega for em Osasco: ${formatBRL(total + 1000)}`);
    else lines.push('Total final a confirmar: há peças sem preço informado.');
    lines.push('', 'Por favor, confirme a disponibilidade, os tamanhos e as orientações de pagamento. Obrigada!');
    return lines.join('\n');
  }

  function quantityButton(id, change, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = id;
    button.dataset.change = change;
    button.textContent = change > 0 ? '+' : '−';
    button.setAttribute('aria-label', `${change > 0 ? 'Aumentar' : 'Diminuir'} quantidade de ${title}`);
    button.disabled = change > 0 && cart.get(id) >= 99;
    return button;
  }

  function updateCart() {
    const { count, total, unknown } = getSummary();
    document.getElementById('bagCount').textContent = count;
    bag.setAttribute('aria-label', `Abrir sacola: ${count} ${count === 1 ? 'item' : 'itens'}`);
    modal.querySelector('#emptyCart').hidden = count > 0;
    modal.querySelector('#pricedSummary').hidden = false;
    modal.querySelector('#totalLabel').textContent = unknown ? 'Subtotal com preços informados' : 'Subtotal dos produtos';
    modal.querySelector('#checkoutTotal').textContent = count > 0 && count === unknown ? 'A confirmar' : formatBRL(total);
    modal.querySelector('#priceNote').textContent = !count ? '' : unknown ? 'Há peças com preço a confirmar com a boutique.' : 'Frete não incluído. Disponibilidade sujeita à confirmação.';
    checkoutButton.setAttribute('aria-disabled', String(!count));
    checkoutButton.tabIndex = count ? 0 : -1;
    if (count) checkoutButton.href = WHATSAPP_URL + encodeURIComponent(buildOrderMessage());
    else checkoutButton.removeAttribute('href');
    cartItems.replaceChildren();
    for (const [id, quantity] of cart) {
      const product = products.get(id);
      const item = document.createElement('li');
      item.className = 'cart-item';
      const details = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = product.nome;
      const subtotal = document.createElement('p');
      subtotal.textContent = product.preco === null ? 'Preço a confirmar' : `${formatBRL(product.preco)} × ${quantity} = ${formatBRL(product.preco * quantity)}`;
      details.append(title, subtotal);
      const controls = document.createElement('div');
      controls.className = 'quantity-controls';
      const amount = document.createElement('span');
      amount.textContent = quantity;
      amount.setAttribute('aria-label', `${quantity} unidades`);
      controls.append(quantityButton(id, -1, product.nome), amount, quantityButton(id, 1, product.nome));
      item.append(details, controls);
      cartItems.append(item);
    }
    try { localStorage.setItem(storageKey, JSON.stringify([...cart])); } catch { /* Memory fallback. */ }
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => { toast.classList.remove('show'); toast.textContent = ''; }, 3500);
  }

  catalogRoot.addEventListener('click', event => {
    const button = event.target.closest('button.product-action');
    if (!button || !products.has(button.dataset.id)) return;
    const id = button.dataset.id;
    if ((cart.get(id) || 0) >= 99) { showToast('Limite de 99 unidades por peça.'); return; }
    cart.set(id, (cart.get(id) || 0) + 1);
    updateCart();
    showToast(`${products.get(id).nome} adicionada à sacola.`);
  });
  cartItems.addEventListener('click', event => {
    const button = event.target.closest('button[data-change]');
    if (!button || !cart.has(button.dataset.id)) return;
    const { id, change } = button.dataset;
    const quantity = Math.min(99, cart.get(id) + Number(change));
    if (quantity <= 0) cart.delete(id); else cart.set(id, quantity);
    updateCart();
    const next = [...cartItems.querySelectorAll('button')].find(b => b.dataset.id === id && b.dataset.change === change && !b.disabled);
    (next || cartItems.querySelector('button') || closeCheckout).focus();
  });
  function openBag(event) {
    if (modal.open) return;
    returnFocus = event.currentTarget;
    modal.showModal();
    document.body.classList.add('modal-open');
    BoutiqueMedia.refresh();
  }
  bag.addEventListener('click', openBag);
  closeCheckout.addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    const rect = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) modal.close();
  });
  modal.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    BoutiqueMedia.refresh();
    (returnFocus.getClientRects().length ? returnFocus : bag).focus();
  });
  checkoutButton.addEventListener('click', event => { if (!cart.size) event.preventDefault(); });
  updateCart();
}
