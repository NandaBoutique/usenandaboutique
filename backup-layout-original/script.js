"use strict";

(() => {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatBRL = (cents) => money.format(cents / 100);
  const WHATSAPP_URL = "https://wa.me/5511989423365?text=";
  const cart = new Map();
  // Template: { id: 1, nome: "Nome do Produto", preco: "199,90" (ou null), categoria: "Categoria", midias: ["foto.jpg", "video.mp4"] }
  const produtos = [];
  function priceInCents(value) {
    if (value == null || String(value).trim() === "") return null;
    const raw = String(value).trim();
    const number = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
  }
  const products = new Map(produtos.map((product) => [String(product.id), { ...product, preco: priceInCents(product.preco) }]));
  const productsGrid = document.getElementById("productsGrid");
  const categoryNav = document.querySelector(".category-nav");
  const catalogStatus = document.getElementById("catalogStatus");
  const cartBar = document.getElementById("cartBar");
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");
  const cartItems = document.getElementById("cartItems");
  const checkoutTotal = document.getElementById("checkoutTotal");
  const checkoutButton = document.getElementById("checkoutButton");
  const emptyCart = document.getElementById("emptyCart");
  const modal = document.getElementById("checkoutModal");
  const viewOrder = document.getElementById("viewOrder");
  const closeCheckout = document.getElementById("closeCheckout");
  const toast = document.getElementById("toast");
  const paymentSelect = document.getElementById("paymentSelect");
  const paymentOptions = document.getElementById("paymentOptions");
  const paymentHint = document.getElementById("paymentHint");
  const payments = { pix: "Pix", cash: "Dinheiro", debit: "Cartão de Débito", credit: "Cartão de Crédito" };
  const deliverySelect = document.getElementById("deliverySelect");
  const deliveryOptions = document.getElementById("deliveryOptions");
  const shippingNote = document.getElementById("shippingNote");
  const shippingValue = document.getElementById("shippingValue");
  const productsSubtotal = document.getElementById("productsSubtotal");
  const totalLabel = document.getElementById("totalLabel");
  const deliveryHint = document.getElementById("deliveryHint");
  const deliveries = {
    osasco: { label: "Frete Osasco", fee: 1000 },
    other: { label: "Envio para São Paulo e demais estados", fee: null },
  };
  let toastTimer;

  // A logo é opcional; o monograma mantém a marca legível se o arquivo faltar.
  document.querySelectorAll(".avatar img").forEach((img) => {
    const hideMissingImage = () => { img.hidden = true; };
    img.addEventListener("error", hideMissingImage);
    if (img.complete && img.naturalWidth === 0) hideMissingImage();
  });

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toast.textContent = "";
    }, 2000);
  }

  function getSummary() {
    let count = 0;
    let total = 0;
    for (const [id, quantity] of cart) {
      count += quantity;
      total += products.get(id).preco * quantity;
    }
    return { count, total };
  }

  function createQuantityButton(id, change, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = change === 1 ? "+" : "−";
    button.dataset.id = id;
    button.dataset.change = String(change);
    button.setAttribute("aria-label", `${change === 1 ? "Aumentar" : "Diminuir"} quantidade de ${title}`);
    return button;
  }

  function getDelivery() {
    return Object.hasOwn(deliveries, deliverySelect.value) ? deliveries[deliverySelect.value] : null;
  }

  function getPayment() {
    return Object.hasOwn(payments, paymentSelect.value) ? payments[paymentSelect.value] : null;
  }

  function updateTotals() {
    const { count, total } = getSummary();
    if (count === 0) {
      deliverySelect.value = "";
      paymentSelect.value = "";
    }
    const delivery = getDelivery();
    const finalTotal = total + (delivery?.fee ?? 0);
    cartBar.hidden = count === 0;
    document.body.classList.toggle("has-cart", count > 0);
    cartCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
    document.getElementById("bagCount").textContent = count;
    document.getElementById("shoppingBag").setAttribute("aria-label", `Abrir sacola: ${count} itens`);
    cartTotal.textContent = formatBRL(finalTotal);
    checkoutTotal.textContent = formatBRL(finalTotal);
    productsSubtotal.textContent = formatBRL(total);
    shippingValue.textContent = !delivery ? "Selecione a entrega" : delivery.fee === null ? "Taxa a consultar" : formatBRL(delivery.fee);
    totalLabel.textContent = !delivery ? "Total dos produtos" : delivery.fee === null ? "Total sem frete" : "Total com frete";
    shippingNote.textContent = !delivery ? "Escolha a entrega no pedido" : delivery.fee === null ? "Frete a consultar" : "Frete de Osasco incluído";
    deliveryHint.textContent = !delivery
      ? "Escolha uma opção para continuar. Enviamos para todo o Brasil."
      : delivery.fee === null
        ? "O frete será informado no WhatsApp e somado ao valor dos produtos."
        : "O frete fixo de R$ 10,00 já está incluído no total.";
    deliveryOptions.disabled = count === 0;
    const payment = getPayment();
    paymentOptions.disabled = count === 0;
    checkoutButton.disabled = count === 0 || !delivery || !payment;
    checkoutButton.textContent = paymentSelect.value === "pix" ? "Finalizar e Pagar com Pix" : "Finalizar pelo WhatsApp";
    paymentHint.textContent = payment
      ? `Pagamento escolhido: ${payment}. A conclusão do pagamento será combinada pelo WhatsApp.`
      : "Escolha a forma de pagamento para finalizar seu pedido pelo WhatsApp.";
    emptyCart.hidden = count > 0;
  }

  deliverySelect.addEventListener("change", updateTotals);
  paymentSelect.addEventListener("change", updateTotals);

  function updateCart() {
    updateTotals();
    cartItems.replaceChildren();
    for (const [id, quantity] of cart) {
      const product = products.get(id);
      const item = document.createElement("li");
      item.className = "cart-item";
      const details = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = product.nome;
      const subtotal = document.createElement("p");
      subtotal.textContent = `${formatBRL(product.preco)} × ${quantity} = ${formatBRL(product.preco * quantity)}`;
      details.append(title, subtotal);
      const controls = document.createElement("div");
      controls.className = "quantity-controls";
      const amount = document.createElement("span");
      amount.textContent = quantity;
      amount.setAttribute("aria-label", `${quantity} unidades`);
      controls.append(createQuantityButton(id, -1, product.nome), amount, createQuantityButton(id, 1, product.nome));
      item.append(details, controls);
      cartItems.append(item);
    }
  }

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
      amount.textContent = formatBRL(product.preco);
      price.append(amount);
      const button = document.createElement(product.preco === null ? "a" : "button");
      if (product.preco !== null) button.type = "button";
      else button.href = "https://api.whatsapp.com/send?phone=5511989423365&text=" + encodeURIComponent(`Olá! Vi o produto ${product.nome} no site e gostaria de saber os valores e modelos disponíveis.`);
      button.className = "primary-btn product-action";
      button.dataset.id = product.id;
      button.textContent = product.preco === null ? "Consultar Valor" : "Comprar";
      button.setAttribute("aria-label", `${button.textContent}: ${product.nome}`);
      content.append(categoryLabel, title, price, button);
      card.append(imageFrame, content);
      fragment.append(card);
    }

    productsGrid.replaceChildren(fragment);
    catalogStatus.textContent = `${filtered.length} ${filtered.length === 1 ? "peça disponível" : "peças disponíveis"} · ${category}`;
  }

  categoryNav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    renderProducts(button.dataset.category);
  });

  // Delegação mantém os botões funcionando após qualquer troca de categoria.
  productsGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".product-action");
    if (!button || !products.has(button.dataset.id)) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const flight = flyToBag(button.closest(".product-card"));
    if (products.get(button.dataset.id).preco === null) {
      flight.finally(() => window.location.assign(button.href));
      return;
    }
    const id = button.dataset.id;
    cart.set(id, (cart.get(id) || 0) + 1);
    updateCart();
    showToast("Produto adicionado ao carrinho");
  });

  cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-change]");
    if (!button) return;
    const { id, change } = button.dataset;
    if (!cart.has(id)) return;
    const quantity = cart.get(id) + Number(change);
    if (quantity <= 0) cart.delete(id);
    else cart.set(id, quantity);
    updateCart();
    // Preserva o foco após atualizar a lista ou remover o último item.
    const nextButton = Array.from(cartItems.querySelectorAll("button")).find(
      (candidate) => candidate.dataset.id === id && candidate.dataset.change === change
    );
    (nextButton || cartItems.querySelector("button") || closeCheckout).focus();
  });

  viewOrder.addEventListener("click", () => {
    if (!cart.size || modal.open) return;
    modal.showModal();
    document.body.classList.add("modal-open");
  });
  document.getElementById("shoppingBag").addEventListener("click", () => {
    if (modal.open) return;
    modal.showModal();
    document.body.classList.add("modal-open");
  });
  closeCheckout.addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    const bounds = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) modal.close();
  });
  // O dialog nativo permite Escape e mantém a navegação por teclado no modal.
  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    document.getElementById("shoppingBag").focus();
  });

  function buildOrderMessage() {
    const lines = ["Olá, Nanda Boutique! Gostaria de fazer este pedido:", ""];
    for (const [id, quantity] of cart) {
      const product = products.get(id);
      lines.push(`${product.nome} — Quantidade: ${quantity} — ${formatBRL(product.preco)} cada — Subtotal: ${formatBRL(product.preco * quantity)}`);
    }
    const { total } = getSummary();
    const delivery = getDelivery();
    lines.push(
      "",
      `Subtotal dos produtos: ${formatBRL(total)}`,
      `Entrega escolhida: ${delivery.label}`,
      delivery.fee === null ? "Frete: Taxa a consultar" : `Frete: ${formatBRL(delivery.fee)}`,
      delivery.fee === null
        ? `Total sem frete: ${formatBRL(total)} (frete a consultar e acrescentar)`
        : `Total com frete: ${formatBRL(total + delivery.fee)}`,
      "",
      `Forma de pagamento escolhida: ${getPayment()}`,
      "Formas de pagamento aceitas: Pix, Dinheiro, Cartão de Débito ou Crédito.",
      "",
      paymentSelect.value === "pix" ? "Aguardo a chave Pix!" : "Aguardo a confirmação do pedido e as orientações para pagamento!"
    );
    return lines.join("\n");
  }

  checkoutButton.addEventListener("click", () => {
    if (!cart.size || !getDelivery() || !getPayment()) return;
    window.location.assign(WHATSAPP_URL + encodeURIComponent(buildOrderMessage()));
  });

  categoryNav.replaceChildren();
  for (const category of ["Todos", ...new Set(produtos.map(product => product.categoria).filter(Boolean))]) {
    if (category === "Todos" && categoryNav.children.length) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-btn";
    button.dataset.category = category;
    button.textContent = category;
    button.setAttribute("aria-controls", "productsGrid");
    categoryNav.append(button);
  }
  renderProducts();
  updateCart();
})();
