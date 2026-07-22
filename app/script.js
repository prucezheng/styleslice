const deck = document.querySelector("#deck");
const nextButton = document.querySelector("#nextCard");
const explodeButton = document.querySelector("#explodeDeck");

const styleCards = {
  quiet: {
    title: "Quiet Interface",
    score: "0.96",
    summary: "高留白、低饱和背景、硬朗信息层级与少量酸性色块，适合 AI 工具、资料库和编辑器界面。",
    colors: ["#161616", "#f4f1ea", "#d8ff66", "#62c7ff", "#ff8f70"],
    type: "Aa 风格规范",
    detail: "Title 32 / Body 15 / Tag 11",
  },
  mono: {
    title: "Mono Utility",
    score: "0.94",
    summary: "单色信息结构、窄间距控件和清晰边框，让视觉规则更像可执行的工具参数。",
    colors: ["#111111", "#f7f7f2", "#dadada", "#8e8e86", "#d7fb54"],
    type: "Ag 参数面板",
    detail: "Title 30 / Body 14 / Tag 10",
  },
  glass: {
    title: "Glass Index",
    score: "0.91",
    summary: "透明层、低对比阴影和冷调高光，用于表现证据帧、来源图和可追溯分析。",
    colors: ["#16202a", "#eff8ff", "#8fd3ff", "#d6e8f2", "#ffffff"],
    type: "Aa 证据索引",
    detail: "Title 31 / Body 15 / Tag 11",
  },
  soft: {
    title: "Soft Bazaar",
    score: "0.86",
    summary: "柔和圆角、轻盈糖果色与大字号标题，适合做个人风格资料库的浏览入口。",
    colors: ["#1d1b1f", "#fff7ed", "#98e8b6", "#ffd166", "#f9a8d4"],
    type: "Aa 灵感切片",
    detail: "Title 34 / Body 15 / Tag 11",
  },
  paper: {
    title: "Paper Studio",
    score: "0.83",
    summary: "纸张底色、粗字重和少量颗粒感，让输出的 MD 规范更接近可收藏的设计档案。",
    colors: ["#18120d", "#f3eadc", "#d8c8a8", "#ff9a76", "#6f8f72"],
    type: "Aa 视觉档案",
    detail: "Title 32 / Body 16 / Tag 11",
  },
  neon: {
    title: "Neon Console",
    score: "0.71",
    summary: "深色底、酸性色和仪表化信息块，适合展示冲突检测、置信度与下游调用状态。",
    colors: ["#0c0f11", "#d7fb54", "#55e6c1", "#7f5cff", "#f5f0e8"],
    type: "Aa 调用控制台",
    detail: "Title 29 / Body 14 / Tag 10",
  },
};

let isAnimating = false;

function renderMiniCard(card) {
  const data = styleCards[card.dataset.styleId];
  card.innerHTML = `
    <div class="mini-title">
      <strong>${data.title}</strong>
      <span>${data.score}</span>
    </div>
  `;
}

function renderActiveCard(card) {
  const data = styleCards[card.dataset.styleId];
  const swatches = data.colors.map((color) => `<span style="--swatch: ${color}"></span>`).join("");

  card.innerHTML = `
    <div class="card-head">
      <div>
        <p class="eyebrow">STYLE CARD</p>
        <h2>${data.title}</h2>
      </div>
      <span class="score">${data.score}</span>
    </div>
    <p class="description">${data.summary}</p>
    <div class="swatches" aria-label="Palette">${swatches}</div>
    <div class="type-sample">
      <strong>${data.type}</strong>
      <span>${data.detail}</span>
    </div>
    <div class="rule-strip">
      <span>MD</span>
      <span>证据帧</span>
      <span>可编辑</span>
    </div>
    <div class="gesture-hint" aria-hidden="true">
      <span></span>
    </div>
  `;
}

function hydrateDeck() {
  [...deck.children].forEach((card) => {
    if (card.classList.contains("is-exiting")) return;

    if (card.classList.contains("card-1")) {
      renderActiveCard(card);
    } else {
      renderMiniCard(card);
    }
  });
}

function applyStackClasses() {
  const cards = [...deck.children];
  cards.forEach((card, index) => {
    card.className = card.className.replace(/\bcard-\d\b/g, "").trim();
    const position = cards.length - index;
    card.classList.add("slice-card", `card-${position}`);
    card.classList.toggle("is-active", position === 1);
  });
}

function rotateDeck(direction = 1) {
  if (isAnimating) return;
  isAnimating = true;

  const outgoing = deck.querySelector(".card-1");
  outgoing.classList.add("is-exiting");
  outgoing.style.zIndex = "20";
  outgoing.style.transition = "transform 640ms cubic-bezier(0.16, 1, 0.3, 1), opacity 420ms ease, filter 420ms ease";

  requestAnimationFrame(() => {
    outgoing.style.transform = `translate3d(${direction * 126}%, -14px, 150px) scale(0.96) rotate(${direction * 15}deg)`;
    outgoing.style.opacity = "0";
    outgoing.style.filter = "blur(0.8px)";

    deck.prepend(outgoing);
    applyStackClasses();
    hydrateDeck();
  });

  window.setTimeout(() => {
    outgoing.classList.remove("is-exiting");
    outgoing.style.transition = "none";
    outgoing.style.transform = "";
    outgoing.style.opacity = "";
    outgoing.style.filter = "";
    outgoing.style.zIndex = "";
    renderMiniCard(outgoing);
    requestAnimationFrame(() => {
      outgoing.style.transition = "";
    });
    isAnimating = false;
  }, 660);
}

nextButton.addEventListener("click", () => rotateDeck(1));

explodeButton.addEventListener("click", () => {
  deck.classList.toggle("is-expanded");
  explodeButton.textContent = deck.classList.contains("is-expanded") ? "收起" : "展开";
});

let dragStartX = 0;
let dragStartY = 0;
let draggingCard = null;

deck.addEventListener("pointerdown", (event) => {
  const activeCard = deck.querySelector(".card-1");
  if (!activeCard || !event.target.closest(".card-1")) return;

  draggingCard = activeCard;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  draggingCard.setPointerCapture(event.pointerId);
  draggingCard.classList.add("is-dragging");
});

deck.addEventListener("pointermove", (event) => {
  if (!draggingCard) return;
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  const rotation = Math.max(-13, Math.min(13, dx / 15));

  draggingCard.style.transform = `translate3d(${dx}px, ${dy * 0.35}px, 110px) rotate(${rotation}deg)`;
});

deck.addEventListener("pointerup", (event) => {
  if (!draggingCard) return;
  const dx = event.clientX - dragStartX;
  const card = draggingCard;

  card.classList.remove("is-dragging");
  card.releasePointerCapture(event.pointerId);
  draggingCard = null;

  if (Math.abs(dx) > 84) {
    rotateDeck(Math.sign(dx) || 1);
  } else {
    card.classList.add("is-settling");
    card.style.transform = "";
    window.setTimeout(() => {
      card.classList.remove("is-settling");
    }, 560);
  }
});

window.setInterval(() => {
  if (!draggingCard && !isAnimating && document.visibilityState === "visible") {
    deck.classList.toggle("is-expanded");
  }
}, 3600);

hydrateDeck();
