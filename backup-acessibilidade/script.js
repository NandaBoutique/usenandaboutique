"use strict";

(() => {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatBRL = (cents) => money.format(cents / 100);
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
  createBoutiqueCart(products, productsGrid);
})();
