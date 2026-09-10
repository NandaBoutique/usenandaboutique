"use strict";

(() => {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatBRL = (cents) => money.format(cents / 100);
  const WHATSAPP_URL = "https://wa.me/5511989423365?text=";
  const cart = new Map();
  // Precos em reais; null indica preco ainda nao informado. Template: { id: 1, nome: "Nome do Produto", preco: "199,90" (ou null), categoria: "Categoria", midias: ["foto.jpg", "video.mp4"] }
  const produtos = [
  {
    "id": "calca-jeans-brilho",
    "nome": "Calça jeans com brilho",
    "preco": "169,90",
    "categoria": "Calças & Shorts",
    "midias": [
      "calca-jeans-brilho-1.jpg",
      "calca-jeans-brilho-2.jpg",
      "calca-jeans-brilho-3.mp4"
    ],
    "descricao": "Modelagem reta com detalhes em brilho. Tamanhos informados: 36, 40, 42 e 46. Confirme a disponibilidade."
  },
  {
    "id": "calca-listrada",
    "nome": "Calça listrada",
    "preco": "139,90",
    "categoria": "Calças & Shorts",
    "midias": [
      "calca-listrada-1.jpg",
      "calca-listrada-2.jpg",
      "calca-listrada-3.jpg",
      "calca-listrada-4.jpg"
    ],
    "descricao": "Listras atemporais, leves e fáceis de combinar. Cores verde e rosa. Confirme a disponibilidade."
  },
  {
    "id": "conjunto-renda",
    "nome": "Conjunto de renda",
    "preco": "249,90",
    "categoria": "Conjuntos & Macacões",
    "midias": [
      "conjunto-renda-1.jpg",
      "conjunto-renda-2.mp4",
      "conjunto-renda-3.jpg",
      "conjunto-renda-4.jpg",
      "conjunto-renda-5.jpg",
      "conjunto-renda-6.jpg"
    ],
    "descricao": "Saia e camisa com detalhes em renda. Peças que também combinam com outros looks. Tamanhos informados: preto P e caramelo M. Confirme a disponibilidade."
  },
  {
    "id": "cintos-colecao",
    "nome": "Cintos da coleção",
    "preco": null,
    "categoria": "Bolsas & Acessórios",
    "midias": [
      "cintos-colecao-1.jpg",
      "cintos-colecao-2.mp4"
    ],
    "descricao": "O toque final para marcar a cintura e valorizar a silhueta."
  },
  {
    "id": "look-listras-rosa",
    "nome": "Look listras rosa",
    "preco": null,
    "categoria": "Conjuntos & Macacões",
    "midias": [
      "look-listras-rosa-1.jpg",
      "look-listras-rosa-2.jpg",
      "look-listras-rosa-3.jpg",
      "look-listras-rosa-4.mp4"
    ],
    "descricao": "Listras e rosa: leveza, elegância e feminilidade para o verão."
  }
];
  function priceInCents(value) {
    if (value == null || String(value).trim() === "") return null;
    const raw = String(value).trim();
    const number = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
  }
  const products = new Map(produtos.map((product) => [String(product.id), { ...product, preco: priceInCents(product.preco) }]));
  function renderProducts(category = "Todos") {
    const isEmpty = produtos.length === 0;
    document.getElementById("colecao").hidden = isEmpty;
    document.getElementById("collectionEmpty").hidden = !isEmpty;
    document.querySelectorAll('a[href="#colecao"], a[href="#collectionEmpty"]').forEach(link => { link.href = isEmpty ? "#collectionEmpty" : "#colecao"; });
    categoryNav.querySelectorAll("button[data-category]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.category === category));
    });

    if (produtos.length === 0) {
      productsGrid.replaceChildren();
      catalogStatus.textContent = "";
      return;
    }

    const filtered = [...products.values()].filter((product) => category === "Todos" || product.categoria === category);
    const fragment = document.createDocumentFragment();

    for (const product of filtered) {
      const card = document.createElement("article");
      card.className = "product-card";
      const imageFrame = createMediaCarousel(product);

      const content = document.createElement("div");
      content.className = "product-content";
      const categoryLabel = document.createElement("p");
      categoryLabel.className = "product-category";
      categoryLabel.textContent = product.categoria;
      const title = document.createElement("h3");
      title.textContent = product.nome;
      const price = document.createElement("div");
      price.className = "product-price";
      price.hidden = product.preco === null;
      const amount = document.createElement("strong");
      amount.textContent = product.preco === null ? "" : formatBRL(product.preco);
      price.append(amount);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "primary-btn product-action";
      button.dataset.id = product.id;
      button.textContent = "Adicionar à Sacola";
      button.setAttribute("aria-label", `${button.textContent}: ${product.nome}`);
      const description = document.createElement("p");
      description.className = "product-description";
      description.textContent = product.descricao || "";
      content.append(categoryLabel, title, description, price, button);
      card.append(imageFrame, content);
      fragment.append(card);
    }

    BoutiqueMedia.clear();
    productsGrid.replaceChildren(fragment);
    BoutiqueMedia.observe(productsGrid);
    catalogStatus.textContent = `${filtered.length} ${filtered.length === 1 ? "peça disponível" : "peças disponíveis"} · ${category}`;
  }


  const productsGrid = document.getElementById('productsGrid');
  const categoryNav = document.querySelector('.category-nav');
  const catalogStatus = document.getElementById('catalogStatus');
  const modal = document.getElementById('checkoutModal');
  const cartItems = document.getElementById('cartItems');
  const checkoutButton = document.getElementById('checkoutButton');
  const bag = document.getElementById('shoppingBag');
  const closeCheckout = document.getElementById('closeCheckout');
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
    const lines = ['Olá, Nanda Boutique! Gostaria de consultar a disponibilidade das seguintes peças:', ''];
    for (const [id, quantity] of cart) {
      const product = products.get(id);
      lines.push(`• ${product.nome} — Quantidade: ${quantity}${product.preco === null ? '' : ` — ${formatBRL(product.preco)} cada`}`);
    }
    const { count, total, unknown } = getSummary();
    if (count > unknown) lines.push('', `${unknown ? 'Subtotal das peças com preço informado' : 'Subtotal dos produtos'}: ${formatBRL(total)} (sem frete).`);
    lines.push('', 'Poderia confirmar os tamanhos, valores e disponibilidade? Obrigada!');
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
    document.getElementById('cartCount').textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
    document.getElementById('cartTotal').textContent = unknown ? 'Disponibilidade a confirmar' : formatBRL(total);
    document.getElementById('cartBar').hidden = !count;
    document.body.classList.toggle('has-cart', count > 0);
    document.getElementById('emptyCart').hidden = count > 0;
    document.getElementById('pricedSummary').hidden = count === unknown;
    document.getElementById('totalLabel').textContent = unknown ? 'Subtotal com preços informados' : 'Subtotal dos produtos';
    document.getElementById('checkoutTotal').textContent = formatBRL(total);
    document.getElementById('priceNote').textContent = !count ? '' : unknown ? 'Há peças com preço a confirmar com a boutique.' : 'Frete não incluído. Disponibilidade sujeita à confirmação.';
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

  productsGrid.addEventListener('click', event => {
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
  document.getElementById('viewOrder').addEventListener('click', openBag);
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
  categoryNav.replaceChildren();
  for (const category of ['Todos', ...new Set(produtos.map(p => p.categoria))]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-btn';
    button.dataset.category = category;
    button.textContent = category;
    button.setAttribute('aria-controls', 'productsGrid');
    categoryNav.append(button);
  }
  categoryNav.addEventListener('click', event => {
    const button = event.target.closest('button[data-category]');
    if (button) renderProducts(button.dataset.category);
  });
  document.getElementById('motionToggle').addEventListener('click', event => {
    const paused = document.body.classList.toggle('motion-paused');
    event.currentTarget.setAttribute('aria-pressed', String(paused));
    event.currentTarget.textContent = paused ? 'Retomar animações' : 'Pausar animações';
    BoutiqueMedia.refresh();
  });
  document.querySelector('.avatar img').addEventListener('error', event => { event.target.hidden = true; });
  renderProducts();
  updateCart();
})();
