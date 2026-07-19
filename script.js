/* ============================================================
   NOX — Ứng dụng học từ vựng (Thẻ / Viết / Quizz / Kho)
   ============================================================ */

const STORAGE_KEY = "nox_app_data_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function defaultList(name) {
  return { id: uid(), name, items: [] };
}
function defaultDiaryList(name) {
  return { id: uid(), name, content: "" };
}

function defaultState() {
  return {
    themeLevel: 1,
    categories: {
      flashcard: [defaultList("Danh sách 1")],
      writing: [defaultList("Danh sách 1")],
      dictionary: [defaultList("Danh sách 1")],
      diary: [defaultDiaryList("Nhật ký 1")],
    },
    selected: { flashcard: [], writing: [] },
    activeWhList: { flashcard: null, writing: null, dictionary: null, diary: null },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // basic shape guard
    if (!parsed.categories) return defaultState();
    if (!parsed.selected) parsed.selected = { flashcard: [], writing: [] };
    if (!parsed.activeWhList) parsed.activeWhList = { flashcard: null, writing: null, dictionary: null, diary: null };
    if (!parsed.categories.diary || !parsed.categories.diary.length) {
      parsed.categories.diary = [defaultDiaryList("Nhật ký 1")];
    }
    if (!("diary" in parsed.activeWhList)) parsed.activeWhList.diary = null;
    if (!parsed.themeLevel) {
      // migrate from old light/dark boolean theme if present
      parsed.themeLevel = parsed.theme === "dark" ? 4 : 1;
    }
    if (parsed.themeLevel > 4) parsed.themeLevel = 4; // migrate from old 5-level scale
    return parsed;
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ------------------------------------------------------------
   Helpers on categories/lists/items
   ------------------------------------------------------------ */
function getCategory(cat) {
  return state.categories[cat];
}
function getList(cat, listId) {
  return getCategory(cat).find((l) => l.id === listId);
}
function ensureSelected(cat) {
  const ids = state.categories[cat].map((l) => l.id);
  state.selected[cat] = state.selected[cat].filter((id) => ids.includes(id));
  if (state.selected[cat].length === 0 && ids.length) state.selected[cat] = [ids[0]];
}
function itemsFromLists(cat, listIds) {
  const lists = getCategory(cat).filter((l) => listIds.includes(l.id));
  let items = [];
  lists.forEach((l) => (items = items.concat(l.items)));
  return items;
}
function allItems(cat) {
  let items = [];
  getCategory(cat).forEach((l) => (items = items.concat(l.items)));
  return items;
}
function statusLabel(cat, status) {
  if (cat === "writing") {
    return { new: "Chưa làm", known: "Làm đúng", difficult: "Làm sai" }[status];
  }
  return { new: "Đang học", known: "Đã biết", difficult: "Khó" }[status];
}
function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */
const tabButtons = document.querySelectorAll(".main-tab-btn");
const sidebarPanels = document.querySelectorAll(".sidebar-panel");
const tabContents = document.querySelectorAll(".tab-content");

function switchTab(tab) {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  sidebarPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
  tabContents.forEach((c) => c.classList.toggle("hidden", c.dataset.content !== tab));
  if (tab === "flashcard") renderFlashcardTab();
  if (tab === "writing") renderWritingTab();
  if (tab === "warehouse") renderWarehouseTab();
}
tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

/* ============================================================
   THEME TOGGLE
   ============================================================ */
/* ============================================================
   THEME LEVELS — 4 distinct fixed palettes (not interpolated)
   1 = Trắng, 2 = Ngả vàng, 3 = Hồng, 4 = Đen
   ============================================================ */
const THEME_PALETTES = {
  1: { // Trắng
    bg: "#f5f5f7", panel: "#ffffff", border: "#1f1f24", borderSoft: "#d8d8de",
    text: "#17171b", textMuted: "#6b6b76", accent: "#7c3aed", accentSoft: "#efe6ff",
    learningSoft: "#fff2dc", knownSoft: "#dff7ec", difficultSoft: "#fde3e2",
  },
  2: { // Ngả vàng
    bg: "#f5ecd7", panel: "#fbf4e4", border: "#3a2f18", borderSoft: "#e0d3ad",
    text: "#2b2410", textMuted: "#7d6d44", accent: "#7c3aed", accentSoft: "#f0e2c0",
    learningSoft: "#f7e0a8", knownSoft: "#dcead0", difficultSoft: "#f5d3bd",
  },
  3: { // Hồng
    bg: "#fbe0ea", panel: "#fff3f7", border: "#3a1a26", borderSoft: "#f0c9d8",
    text: "#2b0e18", textMuted: "#8a5a6c", accent: "#7c3aed", accentSoft: "#fbd9e8",
    learningSoft: "#fde0c0", knownSoft: "#dcefe0", difficultSoft: "#fbccd6",
  },
  4: { // Đen
    bg: "#111114", panel: "#1a1a1f", border: "#3a3a44", borderSoft: "#2c2c34",
    text: "#f2f2f5", textMuted: "#9a9aa6", accent: "#9d6bff", accentSoft: "#2c2140",
    learningSoft: "#3a2c12", knownSoft: "#0f2e22", difficultSoft: "#3a1616",
  },
};
function cssVarName(key) {
  return "--" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
}
function applyThemeLevel(level, persist = true) {
  level = Math.min(4, Math.max(1, Math.round(level)));
  const palette = THEME_PALETTES[level];
  Object.keys(palette).forEach((key) => {
    document.body.style.setProperty(cssVarName(key), palette[key]);
  });
  document.body.dataset.themeLevel = level;
  document.querySelectorAll(".theme-dot").forEach((d) => d.classList.toggle("active", parseInt(d.dataset.level, 10) === level));
  if (persist) {
    state.themeLevel = level;
    saveState();
  }
}
document.querySelectorAll(".theme-dot").forEach((dot) => {
  dot.addEventListener("click", () => applyThemeLevel(parseInt(dot.dataset.level, 10)));
});
applyThemeLevel(Math.min(4, state.themeLevel || 1), false);

/* ============================================================
   LIST PICKER POPUP (used by Thẻ + Viết "Chọn danh sách")
   ============================================================ */
const listPickerOverlay = document.getElementById("list-picker-overlay");
const listPickerBody = document.getElementById("list-picker-body");
const listPickerTitle = document.getElementById("list-picker-title");
let listPickerCat = null;

function openListPicker(cat) {
  listPickerCat = cat;
  listPickerTitle.textContent = cat === "flashcard" ? "Thẻ" : "Viết";
  ensureSelected(cat);
  renderListPickerBody();
  listPickerOverlay.classList.remove("hidden");
}
function renderListPickerBody() {
  listPickerBody.innerHTML = "";
  getCategory(listPickerCat).forEach((list) => {
    const row = document.createElement("div");
    const selected = state.selected[listPickerCat].includes(list.id);
    row.className = "popup-list-item" + (selected ? " selected" : "");
    row.innerHTML = `<span class="dot"></span><span>${escapeHtml(list.name)}</span>`;
    row.addEventListener("click", () => {
      const arr = state.selected[listPickerCat];
      const idx = arr.indexOf(list.id);
      if (idx >= 0) {
        if (arr.length > 1) arr.splice(idx, 1);
      } else {
        arr.push(list.id);
      }
      saveState();
      renderListPickerBody();
      if (listPickerCat === "flashcard") renderFlashcardTab();
      if (listPickerCat === "writing") renderWritingTab();
    });
    listPickerBody.appendChild(row);
  });
}
document.getElementById("list-picker-close").addEventListener("click", () => listPickerOverlay.classList.add("hidden"));
listPickerOverlay.addEventListener("click", (e) => {
  if (e.target === listPickerOverlay) listPickerOverlay.classList.add("hidden");
});
document.getElementById("fc-choose-list").addEventListener("click", () => openListPicker("flashcard"));
document.getElementById("wr-choose-list").addEventListener("click", () => openListPicker("writing"));

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

/* ============================================================
   GENERIC UI UTILITIES: toast / prompt modal / confirm modal
   (replace native alert/confirm/prompt for a consistent look)
   ============================================================ */
function showToast(message, duration = 2000) {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

function showPrompt(title, defaultValue = "") {
  return new Promise((resolve) => {
    const overlay = document.getElementById("generic-prompt-overlay");
    const input = document.getElementById("generic-prompt-input");
    const okBtn = document.getElementById("generic-prompt-ok");
    const cancelBtn = document.getElementById("generic-prompt-cancel");
    const cancelX = document.getElementById("generic-prompt-cancel-x");
    document.getElementById("generic-prompt-title").textContent = title;
    input.value = defaultValue;
    overlay.classList.remove("hidden");
    setTimeout(() => { input.focus(); input.select(); }, 50);

    function cleanup(val) {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      cancelX.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
      resolve(val);
    }
    function onOk() { cleanup(input.value.trim()); }
    function onCancel() { cleanup(null); }
    function onKey(e) {
      if (e.key === "Enter") { e.preventDefault(); onOk(); }
      if (e.key === "Escape") onCancel();
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    cancelX.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKey);
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("generic-confirm-overlay");
    const okBtn = document.getElementById("generic-confirm-ok");
    const cancelBtn = document.getElementById("generic-confirm-cancel");
    document.getElementById("generic-confirm-message").textContent = message;
    overlay.classList.remove("hidden");

    function cleanup(val) {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(val);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

/* ============================================================
   TAB 1: THẺ (FLASHCARD)
   ============================================================ */
const fc = {
  filter: "all",
  search: "",
  queue: [],
  index: 0,
  direction: "e-v", // e-v = show English first, v-e = show Vietnamese first
  showingBack: false,
};

function statusFromFilter(f) {
  if (f === "learning") return "new";
  return f; // "all", "known", "difficult"
}

function fcCurrentItems() {
  ensureSelected("flashcard");
  let items = itemsFromLists("flashcard", state.selected.flashcard);
  if (fc.filter !== "all") items = items.filter((i) => i.status === statusFromFilter(fc.filter));
  if (fc.search.trim()) {
    const q = fc.search.trim().toLowerCase();
    items = items.filter((i) => i.en.toLowerCase().includes(q) || i.vi.toLowerCase().includes(q));
  }
  return items;
}

function rebuildFcQueue(keepIndex) {
  const items = fcCurrentItems();
  fc.queue = items.map((i) => i.id);
  if (!keepIndex || fc.index >= fc.queue.length) fc.index = 0;
  fc.showingBack = false;
}

function renderFlashcardTab() {
  ensureSelected("flashcard");
  const lists = getCategory("flashcard").filter((l) => state.selected.flashcard.includes(l.id));
  document.getElementById("fc-active-label").textContent = "Danh sách: " + (lists.map((l) => l.name).join(", ") || "—");

  const all = itemsFromLists("flashcard", state.selected.flashcard);
  document.getElementById("fc-stat-total").textContent = all.length;
  document.getElementById("fc-stat-learning").textContent = all.filter((i) => i.status === "new").length;
  document.getElementById("fc-stat-known").textContent = all.filter((i) => i.status === "known").length;
  document.getElementById("fc-stat-difficult").textContent = all.filter((i) => i.status === "difficult").length;

  rebuildFcQueue(true);
  renderFcCard();
}

function fcItemById(id) {
  for (const l of getCategory("flashcard")) {
    const found = l.items.find((i) => i.id === id);
    if (found) return found;
  }
  return null;
}

function renderFcCard() {
  const total = fc.queue.length;
  const counter = document.getElementById("fc-counter");
  const textEl = document.getElementById("fc-card-text");
  const hintEl = document.querySelector("#fc-card .card-hint");
  const statusPill = document.getElementById("fc-card-status");

  if (!total) {
    counter.textContent = "0 / 0";
    textEl.textContent = "Không có thẻ nào";
    hintEl.textContent = "Hãy chọn danh sách hoặc thêm thẻ trong Kho";
    statusPill.textContent = "";
    statusPill.className = "card-status-pill";
    return;
  }
  if (fc.index >= total) fc.index = 0;
  const item = fcItemById(fc.queue[fc.index]);
  counter.textContent = `${fc.index + 1} / ${total}`;

  let showEnglishSide;
  if (fc.direction === "e-v") showEnglishSide = !fc.showingBack;
  else showEnglishSide = fc.showingBack;

  textEl.textContent = showEnglishSide ? item.en : item.vi;
  hintEl.textContent = "Nhấp hoặc nhấn Space để lật thẻ";

  statusPill.textContent = statusLabel("flashcard", item.status);
  statusPill.className = "card-status-pill" + (item.status === "known" ? " known" : item.status === "difficult" ? " difficult" : "");
}

/* ---- Flip sound (Web Audio API, no external asset) ---- */
let fcAudioCtx = null;
function playFlipSound() {
  try {
    fcAudioCtx = fcAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = fcAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.13);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (e) {
    /* audio not available, ignore */
  }
}

function flipFcCard() {
  if (!fc.queue.length) return;
  const cardEl = document.getElementById("fc-card");
  playFlipSound();
  cardEl.classList.remove("flipping");
  void cardEl.offsetWidth; // restart animation
  cardEl.classList.add("flipping");
  setTimeout(() => {
    fc.showingBack = !fc.showingBack;
    renderFcCard();
  }, 160);
  setTimeout(() => cardEl.classList.remove("flipping"), 380);
}

document.getElementById("fc-card").addEventListener("click", flipFcCard);

function isTypingTarget() {
  const tag = document.activeElement && document.activeElement.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}
function flashcardTabVisible() {
  const el = document.querySelector('.tab-content[data-content="flashcard"]');
  return el && !el.classList.contains("hidden");
}
document.addEventListener("keydown", (e) => {
  if (!flashcardTabVisible() || isTypingTarget()) return;
  if (e.code === "Space") {
    e.preventDefault();
    flipFcCard();
  } else if (e.code === "KeyA" || e.code === "ArrowLeft") {
    e.preventDefault();
    document.getElementById("fc-prev").click();
  } else if (e.code === "KeyD" || e.code === "ArrowRight") {
    e.preventDefault();
    document.getElementById("fc-next").click();
  }
});

document.getElementById("fc-prev").addEventListener("click", () => {
  if (!fc.queue.length) return;
  fc.index = (fc.index - 1 + fc.queue.length) % fc.queue.length;
  fc.showingBack = false;
  renderFcCard();
});
document.getElementById("fc-next").addEventListener("click", () => {
  if (!fc.queue.length) return;
  fc.index = (fc.index + 1) % fc.queue.length;
  fc.showingBack = false;
  renderFcCard();
});

function fcMark(status) {
  if (!fc.queue.length) return;
  const item = fcItemById(fc.queue[fc.index]);
  item.status = status;
  saveState();
  renderFlashcardTab();
  if (fc.queue.length) {
    fc.index = fc.index % fc.queue.length;
  }
}
document.getElementById("fc-mark-difficult").addEventListener("click", () => fcMark("difficult"));
document.getElementById("fc-mark-learning").addEventListener("click", () => fcMark("new"));
document.getElementById("fc-mark-known").addEventListener("click", () => fcMark("known"));

document.getElementById("fc-dir-toggle").addEventListener("click", (e) => {
  fc.direction = fc.direction === "e-v" ? "v-e" : "e-v";
  e.currentTarget.textContent = fc.direction === "e-v" ? "E - V" : "V - E";
  fc.showingBack = false;
  renderFcCard();
});

document.querySelectorAll('[data-filter]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    fc.filter = btn.dataset.filter;
    rebuildFcQueue(false);
    renderFcCard();
  });
});
document.getElementById("fc-search").addEventListener("input", (e) => {
  fc.search = e.target.value;
  rebuildFcQueue(false);
  renderFcCard();
});
document.getElementById("fc-sort-az").addEventListener("click", () => {
  fc.queue.sort((a, b) => fcItemById(a).en.localeCompare(fcItemById(b).en));
  fc.index = 0;
  renderFcCard();
});
document.getElementById("fc-shuffle").addEventListener("click", () => {
  fc.queue = shuffleArr(fc.queue);
  fc.index = 0;
  renderFcCard();
});
document.getElementById("fc-reset-status").addEventListener("click", () => {
  itemsFromLists("flashcard", state.selected.flashcard).forEach((i) => (i.status = "new"));
  saveState();
  renderFlashcardTab();
});

/* ============================================================
   TAB 2: VIẾT (WRITING)
   ============================================================ */
const wr = {
  filter: "undone",
  queue: [],
  index: 0,
  checked: false, // has current question been checked via Enter/Đáp án?
  hidePreview: false, // "Ẩn xem trước" mode: don't reveal letter/word-count structure
  charHintCount: 0,
  wordHintCount: 0,
  flashTimeout: null,
};

const PUNCT_REGEX = /[.,!?;:"'()…“”‘’\-]/g;
function stripPunct(str) {
  return str.replace(PUNCT_REGEX, "");
}
function normalizeAnswer(str) {
  return stripPunct(str).replace(/\s+/g, " ").trim().toLowerCase();
}
function wrCharHintLimit() {
  return wr.hidePreview ? 5 : 3;
}
function wrWordHintLimit() {
  return wr.hidePreview ? 3 : 1;
}

function wrStatusFromFilter(f) {
  if (f === "undone") return "new";
  if (f === "correct") return "known";
  if (f === "wrong") return "difficult";
  return f; // "all"
}

function wrCurrentItems() {
  ensureSelected("writing");
  let items = itemsFromLists("writing", state.selected.writing);
  if (wr.filter !== "all") items = items.filter((i) => i.status === wrStatusFromFilter(wr.filter));
  return items;
}
function rebuildWrQueue(keep) {
  const items = wrCurrentItems();
  wr.queue = items.map((i) => i.id);
  if (!keep || wr.index >= wr.queue.length) wr.index = 0;
  wr.checked = false;
  wr.charHintCount = 0;
  wr.wordHintCount = 0;
}
function wrItemById(id) {
  for (const l of getCategory("writing")) {
    const found = l.items.find((i) => i.id === id);
    if (found) return found;
  }
  return null;
}

function renderWritingTab() {
  ensureSelected("writing");
  const lists = getCategory("writing").filter((l) => state.selected.writing.includes(l.id));
  document.getElementById("wr-active-label").textContent = "Danh sách: " + (lists.map((l) => l.name).join(", ") || "—");

  const all = itemsFromLists("writing", state.selected.writing);
  document.getElementById("wr-stat-total").textContent = all.length;
  document.getElementById("wr-stat-undone").textContent = all.filter((i) => i.status === "new").length;
  document.getElementById("wr-stat-correct").textContent = all.filter((i) => i.status === "known").length;
  document.getElementById("wr-stat-wrong").textContent = all.filter((i) => i.status === "difficult").length;

  rebuildWrQueue(true);
  document.getElementById("wr-answer-input").value = "";
  renderWrQuestion();
}

function currentWrItem() {
  if (!wr.queue.length) return null;
  if (wr.index >= wr.queue.length) wr.index = 0;
  return wrItemById(wr.queue[wr.index]);
}

function resetWrQuestionState() {
  wr.checked = false;
  wr.charHintCount = 0;
  wr.wordHintCount = 0;
  document.getElementById("wr-answer-input").value = "";
}

function wrGoNext() {
  if (!wr.queue.length) return;
  wr.index = (wr.index + 1) % wr.queue.length;
  resetWrQuestionState();
  renderWrQuestion();
}

function renderWrQuestion() {
  const item = currentWrItem();
  const promptEl = document.getElementById("wr-prompt");
  if (!item) {
    promptEl.textContent = "Không có câu nào";
    document.getElementById("wr-feedback-grid").innerHTML = "";
    return;
  }
  promptEl.textContent = item.vi;
  renderWrFeedback();
}

function renderWrFeedback() {
  const item = currentWrItem();
  const grid = document.getElementById("wr-feedback-grid");
  const missBadge = document.getElementById("wr-missing-badge");
  grid.innerHTML = "";
  if (!item) return;
  const answer = item.en;
  const typedRaw = document.getElementById("wr-answer-input").value;
  const typedClean = stripPunct(typedRaw);
  let tPtr = 0;
  let anyMissing = false;
  let lastReached = true; // whether the previous position had visible info (governs punctuation visibility)

  for (let i = 0; i < answer.length; i++) {
    const ch = answer[i];

    if (ch === " ") {
      const hasTypedHere = tPtr < typedClean.length;
      if (hasTypedHere || !wr.hidePreview) {
        const sp = document.createElement("span");
        sp.className = "feedback-char space";
        grid.appendChild(sp);
      }
      if (hasTypedHere && typedClean[tPtr] === " ") tPtr++;
      lastReached = hasTypedHere;
      continue;
    }

    if (PUNCT_REGEX.test(ch)) {
      PUNCT_REGEX.lastIndex = 0;
      if (lastReached || !wr.hidePreview) {
        const sp = document.createElement("span");
        sp.className = "feedback-char space";
        sp.textContent = ch;
        sp.style.color = "var(--text-muted)";
        sp.style.borderBottom = "none";
        grid.appendChild(sp);
      }
      continue; // punctuation doesn't need to be typed, doesn't consume tPtr or change lastReached
    }

    const hasTypedHere = tPtr < typedClean.length;
    if (hasTypedHere) {
      const typedCh = typedClean[tPtr];
      const span = document.createElement("span");
      span.className = "feedback-char";
      span.textContent = typedCh;
      span.classList.add(typedCh.toLowerCase() === ch.toLowerCase() ? "correct" : "wrong");
      grid.appendChild(span);
      tPtr++;
      lastReached = true;
    } else {
      anyMissing = true;
      lastReached = false;
      if (!wr.hidePreview) {
        const span = document.createElement("span");
        span.className = "feedback-char";
        span.textContent = "_";
        grid.appendChild(span);
      }
      // in hidePreview mode, nothing is rendered for un-reached letters at all
    }
  }
  missBadge.classList.toggle("hidden", !anyMissing);
}

function renderWritingStatsOnly() {
  const all = itemsFromLists("writing", state.selected.writing);
  document.getElementById("wr-stat-undone").textContent = all.filter((i) => i.status === "new").length;
  document.getElementById("wr-stat-correct").textContent = all.filter((i) => i.status === "known").length;
  document.getElementById("wr-stat-wrong").textContent = all.filter((i) => i.status === "difficult").length;
}

function flashAnswerFeedback(isCorrect) {
  const cls = isCorrect ? "flash-correct" : "flash-wrong";
  const targets = [document.querySelector(".writing-card"), document.querySelector(".writing-feedback-block")];
  targets.forEach((el) => {
    if (!el) return;
    el.classList.remove("flash-correct", "flash-wrong");
    void el.offsetWidth; // restart transition
    el.classList.add(cls);
  });
  clearTimeout(wr.flashTimeout);
  wr.flashTimeout = setTimeout(() => {
    targets.forEach((el) => el && el.classList.remove("flash-correct", "flash-wrong"));
  }, 2000);
}

function wrCheckAnswer() {
  const item = currentWrItem();
  if (!item) return;
  const typed = document.getElementById("wr-answer-input").value;
  const isCorrect = normalizeAnswer(typed) === normalizeAnswer(item.en);
  item.status = isCorrect ? "known" : "difficult";
  saveState();
  renderWritingStatsOnly();
  renderWrFeedback();
  wr.checked = true;
  flashAnswerFeedback(isCorrect);
}

document.getElementById("wr-answer-input").addEventListener("input", () => {
  wr.checked = false;
  renderWrFeedback();
});
document.getElementById("wr-answer-input").addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    revealNextChar();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (!wr.checked) {
      wrCheckAnswer();
    } else {
      wrGoNext();
    }
  }
});
function revealNextChar() {
  const item = currentWrItem();
  if (!item) return;
  const input = document.getElementById("wr-answer-input");
  if (input.value.length < item.en.length) {
    input.value = item.en.slice(0, input.value.length + 1);
  }
  wr.checked = false;
  wr.charHintCount++;
  renderWrFeedback();
  if (wr.charHintCount > wrCharHintLimit()) {
    item.status = "difficult";
    saveState();
    renderWritingStatsOnly();
    flashAnswerFeedback(false);
  }
}
function revealNextWord() {
  const item = currentWrItem();
  if (!item) return;
  const input = document.getElementById("wr-answer-input");
  const cur = input.value.length;
  let nextSpace = item.en.indexOf(" ", cur);
  if (nextSpace === -1) nextSpace = item.en.length;
  else nextSpace += 1;
  input.value = item.en.slice(0, Math.max(nextSpace, cur + 1));
  wr.checked = false;
  wr.wordHintCount++;
  renderWrFeedback();
  if (wr.wordHintCount > wrWordHintLimit()) {
    item.status = "difficult";
    saveState();
    renderWritingStatsOnly();
    flashAnswerFeedback(false);
  }
}
document.getElementById("wr-show-char").addEventListener("click", revealNextChar);
document.getElementById("wr-show-word").addEventListener("click", revealNextWord);
document.getElementById("wr-hide-preview-toggle").addEventListener("click", (e) => {
  wr.hidePreview = !wr.hidePreview;
  e.currentTarget.classList.toggle("active", wr.hidePreview);
  renderWrFeedback();
});
document.getElementById("wr-translate").addEventListener("click", () => {
  const bar = document.getElementById("quick-translate-bar");
  const nowHidden = bar.classList.toggle("hidden");
  if (!nowHidden) {
    setTimeout(() => document.getElementById("qt-input").focus(), 50);
  }
});
document.getElementById("wr-answer").addEventListener("click", () => {
  const item = currentWrItem();
  if (!item) return;
  item.status = "difficult";
  saveState();
  document.getElementById("wr-answer-input").value = item.en;
  wr.checked = true;
  renderWritingStatsOnly();
  renderWrFeedback();
  flashAnswerFeedback(false);
  showToast("Đáp án: " + item.en);
  setTimeout(() => wrGoNext(), 1400);
});

document.querySelectorAll('[data-wfilter]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-wfilter]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    wr.filter = btn.dataset.wfilter;
    rebuildWrQueue(false);
    resetWrQuestionState();
    renderWrQuestion();
  });
});
document.getElementById("wr-sort-az").addEventListener("click", () => {
  wr.queue.sort((a, b) => wrItemById(a).en.localeCompare(wrItemById(b).en));
  wr.index = 0;
  resetWrQuestionState();
  renderWrQuestion();
});
document.getElementById("wr-shuffle").addEventListener("click", () => {
  wr.queue = shuffleArr(wr.queue);
  wr.index = 0;
  resetWrQuestionState();
  renderWrQuestion();
});
document.getElementById("wr-reset-status").addEventListener("click", () => {
  itemsFromLists("writing", state.selected.writing).forEach((i) => (i.status = "new"));
  saveState();
  renderWritingTab();
});

// selecting text inside the prompt auto-fills & translates it in the writing tab's quick-translate bar
document.getElementById("wr-prompt").addEventListener("mouseup", () => {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : "";
  if (!text) return;
  document.getElementById("quick-translate-bar").classList.remove("hidden");
  qtWriting.setInputAndTranslate(text);
});

/* ============================================================
   QUICK TRANSLATE BAR — reusable factory, instantiated once for
   the Viết tab ("qt") and once for the Thẻ tab ("qt2")
   ============================================================ */
function createQuickTranslateBar(prefix) {
  const qs = { dir: "vi-en", lastEn: "", lastVi: "", debounceHandle: null, requestId: 0 };
  const inputEl = document.getElementById(`${prefix}-input`);
  const dirBtn = document.getElementById(`${prefix}-dir-toggle`);
  const resultBox = document.getElementById(`${prefix}-result`);
  const saveBtn = document.getElementById(`${prefix}-save`);

  function updateDirButton() {
    dirBtn.title = qs.dir === "vi-en" ? "Đổi chiều dịch (V → E)" : "Đổi chiều dịch (E → V)";
    inputEl.placeholder = qs.dir === "vi-en" ? "Nhập từ hoặc cụm từ tiếng Việt ..." : "Nhập từ hoặc cụm từ tiếng Anh ...";
  }

  async function translate() {
    const text = inputEl.value.trim();
    resultBox.classList.remove("qt-error", "qt-loading");
    if (!text) {
      resultBox.innerHTML = "";
      qs.lastEn = "";
      qs.lastVi = "";
      return;
    }
    resultBox.textContent = "Đang dịch...";
    resultBox.classList.add("qt-loading");
    const myRequestId = ++qs.requestId;
    const langpair = qs.dir === "vi-en" ? "vi|en" : "en|vi";
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}&de=nox-app@example.com`);
      const data = await res.json();
      if (myRequestId !== qs.requestId) return; // a newer request has since started, discard this one
      resultBox.classList.remove("qt-loading");

      // Gather candidate translations: the primary result plus any alternate
      // matches MyMemory found in its translation memory (gives synonyms).
      let candidates = [];
      const primary = data && data.responseData && data.responseData.translatedText;
      if (primary) candidates.push(primary.trim());
      if (Array.isArray(data.matches)) {
        data.matches
          .slice()
          .sort((a, b) => (b.match || 0) - (a.match || 0))
          .forEach((m) => {
            const t = (m.translation || "").trim();
            if (t) candidates.push(t);
          });
      }
      const seen = new Set();
      candidates = candidates.filter((c) => {
        const key = c.toLowerCase();
        if (!c || key === text.toLowerCase() || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 6);

      if (!candidates.length) {
        resultBox.textContent = "Không tìm thấy bản dịch.";
        resultBox.classList.add("qt-error");
        qs.lastEn = "";
        qs.lastVi = "";
        return;
      }

      resultBox.innerHTML = "";
      candidates.forEach((c, idx) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "qt-candidate" + (idx === 0 ? " qt-candidate-primary qt-candidate-selected" : "");
        chip.textContent = c;
        chip.title = "Nhấn để chọn nghĩa này";
        chip.addEventListener("click", () => {
          resultBox.querySelectorAll(".qt-candidate").forEach((el) => el.classList.remove("qt-candidate-selected"));
          chip.classList.add("qt-candidate-selected");
          if (qs.dir === "vi-en") { qs.lastVi = text; qs.lastEn = c; }
          else { qs.lastEn = text; qs.lastVi = c; }
        });
        resultBox.appendChild(chip);
      });
      if (qs.dir === "vi-en") { qs.lastVi = text; qs.lastEn = candidates[0]; }
      else { qs.lastEn = text; qs.lastVi = candidates[0]; }
    } catch (err) {
      if (myRequestId !== qs.requestId) return;
      resultBox.classList.remove("qt-loading");
      resultBox.textContent = "Lỗi kết nối, thử lại sau.";
      resultBox.classList.add("qt-error");
      qs.lastEn = "";
      qs.lastVi = "";
    }
  }

  dirBtn.addEventListener("click", () => {
    const prevTranslated = qs.dir === "vi-en" ? qs.lastEn : qs.lastVi;
    qs.dir = qs.dir === "vi-en" ? "en-vi" : "vi-en";
    updateDirButton();
    if (prevTranslated) {
      inputEl.value = prevTranslated;
      resultBox.innerHTML = "";
      translate();
    }
  });
  inputEl.addEventListener("input", () => {
    clearTimeout(qs.debounceHandle);
    qs.debounceHandle = setTimeout(translate, 600);
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(qs.debounceHandle);
      translate();
    }
  });
  saveBtn.addEventListener("click", () => {
    if (!qs.lastEn || !qs.lastVi) {
      showToast("Chưa có bản dịch để lưu.");
      return;
    }
    let list = getList("dictionary", state.activeWhList.dictionary);
    if (!list) {
      list = getCategory("dictionary")[0];
      if (!list) {
        list = defaultList("Danh sách 1");
        getCategory("dictionary").push(list);
      }
      state.activeWhList.dictionary = list.id;
    }
    list.items.push({ id: uid(), en: qs.lastEn, vi: qs.lastVi, status: "new" });
    saveState();
    showToast(`Đã lưu vào Từ điển — ${list.name}`);
  });

  updateDirButton();

  return {
    setInputAndTranslate(text) {
      inputEl.value = text;
      clearTimeout(qs.debounceHandle);
      translate();
    },
  };
}

const qtWriting = createQuickTranslateBar("qt");
const qtFlashcard = createQuickTranslateBar("qt2");

/* ============================================================
   TAB 3: QUIZZ
   ============================================================ */
const quiz = {
  source: "flashcard",
  countMode: "custom",
  count: 10,
  lang: "random",
  timeMode: "infinite",
  countdownSeconds: 30,
  remaining: 0,
  running: false,
  questions: [],
  qIndex: 0,
  correct: 0,
  wrong: 0,
  timerSec: 0,
  timerHandle: null,
  paused: false,
  answered: false,
};

document.querySelectorAll('[data-source]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-source]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    quiz.source = btn.dataset.source;
  });
});
document.querySelectorAll('[data-countmode]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-countmode]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    quiz.countMode = btn.dataset.countmode;
    document.getElementById("quiz-count-row").classList.toggle("hidden", quiz.countMode === "untilWrong");
  });
});
document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-lang]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    quiz.lang = btn.dataset.lang;
  });
});
document.querySelectorAll('[data-timemode]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('[data-timemode]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    quiz.timeMode = btn.dataset.timemode;
    document.getElementById("quiz-countdown-row").classList.toggle("hidden", quiz.timeMode !== "countdown");
  });
});
document.getElementById("quiz-countdown-input").addEventListener("input", (e) => {
  quiz.countdownSeconds = Math.max(5, parseInt(e.target.value) || 30);
});
document.getElementById("quiz-count-input").addEventListener("input", (e) => {
  quiz.count = Math.max(1, parseInt(e.target.value) || 1);
});

function buildQuizQuestions() {
  const pool = allItems(quiz.source).filter((i) => i.en && i.vi);
  const shuffled = shuffleArr(pool);
  const n = quiz.countMode === "untilWrong" ? shuffled.length : Math.min(quiz.count, shuffled.length);
  const chosen = shuffled.slice(0, n);
  return chosen.map((item) => {
    let dir = quiz.lang;
    if (dir === "random") dir = Math.random() < 0.5 ? "e-v" : "v-e";
    const questionText = dir === "e-v" ? item.en : item.vi;
    const correctAnswer = dir === "e-v" ? item.vi : item.en;
    const distractPool = pool.filter((p) => p !== item).map((p) => (dir === "e-v" ? p.vi : p.en));
    const distractors = shuffleArr(distractPool).slice(0, 3);
    const choices = shuffleArr([correctAnswer, ...distractors]);
    return { questionText, correctAnswer, choices, item };
  });
}

document.getElementById("quiz-start-btn").addEventListener("click", () => {
  const pool = allItems(quiz.source).filter((i) => i.en && i.vi);
  if (pool.length < 4) {
    showToast("Cần ít nhất 4 mục có đủ nghĩa Anh - Việt trong nguồn đã chọn.");
    return;
  }
  quiz.questions = buildQuizQuestions();
  quiz.qIndex = 0;
  quiz.correct = 0;
  quiz.wrong = 0;
  quiz.timerSec = 0;
  quiz.paused = false;
  quiz.running = true;
  document.getElementById("quiz-setup-panel").classList.add("hidden");
  document.getElementById("quiz-start-btn").classList.add("hidden");
  document.getElementById("quiz-topbar").classList.remove("hidden");
  document.getElementById("quiz-empty-state").classList.add("hidden");
  document.getElementById("quiz-result-block").classList.add("hidden");
  document.getElementById("quiz-question-block").classList.remove("hidden");
  startQuizTimer();
  renderQuizQuestion();
});

function startQuizTimer() {
  clearInterval(quiz.timerHandle);
  if (quiz.timeMode === "countdown") {
    quiz.remaining = quiz.countdownSeconds;
    document.getElementById("quiz-timer-val").textContent = quiz.remaining + "s";
  } else {
    quiz.timerSec = 0;
    document.getElementById("quiz-timer-val").textContent = "0s";
  }
  quiz.timerHandle = setInterval(() => {
    if (quiz.paused) return;
    if (quiz.timeMode === "countdown") {
      if (quiz.answered) return;
      quiz.remaining--;
      document.getElementById("quiz-timer-val").textContent = Math.max(quiz.remaining, 0) + "s";
      if (quiz.remaining <= 0) handleQuizTimeout();
    } else {
      quiz.timerSec++;
      document.getElementById("quiz-timer-val").textContent = quiz.timerSec + "s";
    }
  }, 1000);
}
function handleQuizTimeout() {
  if (!quiz.running || quiz.answered) return;
  quiz.answered = true;
  const q = quiz.questions[quiz.qIndex];
  document.querySelectorAll(".quiz-choice-btn").forEach((b) => {
    b.disabled = true;
    if (b.querySelector(".choice-text").textContent === q.correctAnswer) b.classList.add("correct");
  });
  quiz.wrong++;
  q.item.status = "difficult";
  saveState();
  document.getElementById("quiz-wrong-count").textContent = quiz.wrong;
  showToast("Hết giờ!");
  setTimeout(() => {
    if (quiz.countMode === "untilWrong") {
      endQuiz();
      return;
    }
    quiz.qIndex++;
    if (quiz.qIndex >= quiz.questions.length) {
      endQuiz();
    } else {
      renderQuizQuestion();
    }
  }, 700);
}
document.getElementById("quiz-pause").addEventListener("click", (e) => {
  quiz.paused = !quiz.paused;
  e.currentTarget.textContent = quiz.paused ? "▶" : "⏸";
});

function renderQuizQuestion() {
  quiz.answered = false;
  if (quiz.timeMode === "countdown") {
    quiz.remaining = quiz.countdownSeconds;
    document.getElementById("quiz-timer-val").textContent = quiz.remaining + "s";
  }
  const total = quiz.questions.length;
  document.getElementById("quiz-current-q").textContent = Math.min(quiz.qIndex + 1, total);
  document.getElementById("quiz-total-q").textContent = total;
  document.getElementById("quiz-total-count").textContent = total;
  document.getElementById("quiz-total-count2").textContent = total;
  document.getElementById("quiz-correct-count").textContent = quiz.correct;
  document.getElementById("quiz-wrong-count").textContent = quiz.wrong;

  const q = quiz.questions[quiz.qIndex];
  document.getElementById("quiz-question-text").textContent = q.questionText;
  const btns = document.querySelectorAll(".quiz-choice-btn");
  btns.forEach((btn, i) => {
    btn.classList.remove("correct", "wrong");
    btn.querySelector(".choice-text").textContent = q.choices[i] || "";
    btn.disabled = false;
  });
}

document.querySelectorAll(".quiz-choice-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!quiz.running || quiz.answered) return;
    quiz.answered = true;
    const q = quiz.questions[quiz.qIndex];
    const chosenText = btn.querySelector(".choice-text").textContent;
    const isCorrect = chosenText === q.correctAnswer;
    document.querySelectorAll(".quiz-choice-btn").forEach((b) => {
      b.disabled = true;
      if (b.querySelector(".choice-text").textContent === q.correctAnswer) b.classList.add("correct");
    });
    if (!isCorrect) {
      btn.classList.add("wrong");
      quiz.wrong++;
      q.item.status = "difficult";
    } else {
      quiz.correct++;
      q.item.status = "known";
    }
    saveState();
    document.getElementById("quiz-correct-count").textContent = quiz.correct;
    document.getElementById("quiz-wrong-count").textContent = quiz.wrong;

    setTimeout(() => {
      if (quiz.countMode === "untilWrong" && !isCorrect) {
        endQuiz();
        return;
      }
      quiz.qIndex++;
      if (quiz.qIndex >= quiz.questions.length) {
        endQuiz();
      } else {
        renderQuizQuestion();
      }
    }, 700);
  });
});

function endQuiz() {
  quiz.running = false;
  clearInterval(quiz.timerHandle);
  document.getElementById("quiz-question-block").classList.add("hidden");
  document.getElementById("quiz-topbar").classList.add("hidden");
  document.getElementById("quiz-result-block").classList.remove("hidden");
  document.getElementById("quiz-result-score").textContent = `${quiz.correct} / ${quiz.qIndex + (quiz.correct + quiz.wrong > quiz.qIndex ? 1 : 0) || quiz.questions.length}`;
  document.getElementById("quiz-result-score").textContent = `${quiz.correct} / ${quiz.correct + quiz.wrong}`;
}
function exitQuiz() {
  quiz.running = false;
  clearInterval(quiz.timerHandle);
  document.getElementById("quiz-setup-panel").classList.remove("hidden");
  document.getElementById("quiz-start-btn").classList.remove("hidden");
  document.getElementById("quiz-topbar").classList.add("hidden");
  document.getElementById("quiz-question-block").classList.add("hidden");
  document.getElementById("quiz-result-block").classList.add("hidden");
  document.getElementById("quiz-empty-state").classList.remove("hidden");
}
document.getElementById("quiz-exit").addEventListener("click", exitQuiz);
document.getElementById("quiz-result-exit").addEventListener("click", exitQuiz);
document.getElementById("quiz-restart").addEventListener("click", () => {
  document.getElementById("quiz-start-btn").click();
});

/* ============================================================
   TAB 4: KHO (WAREHOUSE)
   ============================================================ */
const wh = { cat: "flashcard" };

function whCatLabel(cat) {
  return { flashcard: "Thẻ", writing: "Viết", dictionary: "Từ điển", diary: "Nhật Ký" }[cat];
}

document.querySelectorAll("[data-wh-cat]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-wh-cat]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    wh.cat = btn.dataset.whCat;
    renderWarehouseTab();
  });
});

function whActiveList() {
  const lists = getCategory(wh.cat);
  let activeId = state.activeWhList[wh.cat];
  if (!activeId || !lists.find((l) => l.id === activeId)) {
    activeId = lists[0] ? lists[0].id : null;
    state.activeWhList[wh.cat] = activeId;
  }
  return lists.find((l) => l.id === activeId) || null;
}

function renderWarehouseTab() {
  document.getElementById("wh-lists-title").textContent = whCatLabel(wh.cat);
  const grid = document.getElementById("wh-list-grid");
  grid.innerHTML = "";
  const activeList = whActiveList();
  getCategory(wh.cat).forEach((list) => {
    const btn = document.createElement("button");
    btn.className = "wh-list-item" + (activeList && list.id === activeList.id ? " active" : "");
    btn.textContent = list.name;
    btn.addEventListener("click", () => {
      state.activeWhList[wh.cat] = list.id;
      saveState();
      renderWarehouseTab();
    });
    grid.appendChild(btn);
  });

  const isDiary = wh.cat === "diary";
  document.getElementById("wh-table-wrap").classList.toggle("hidden", isDiary);
  document.getElementById("wh-diary-preview").classList.toggle("hidden", !isDiary);
  document.getElementById("wh-toolbar").classList.toggle("hidden", isDiary);
  document.getElementById("wh-legend").classList.toggle("hidden", isDiary);

  if (!isDiary) {
    const legendMap = {
      flashcard: ["Đang học", "Đã biết", "Khó"],
      writing: ["Chưa làm", "Làm đúng", "Làm sai"],
      dictionary: ["Đang học", "Đã biết", "Khó"],
    };
    const [l1, l2, l3] = legendMap[wh.cat];
    document.getElementById("wh-legend-1").textContent = l1;
    document.getElementById("wh-legend-2").textContent = l2;
    document.getElementById("wh-legend-3").textContent = l3;
  }

  document.getElementById("wh-current-list-title").textContent = activeList ? activeList.name : "—";
  if (isDiary) {
    renderDiaryPreview();
  } else {
    renderWhTable();
  }
}

function renderDiaryPreview() {
  const list = whActiveList();
  const box = document.getElementById("wh-diary-preview-content");
  if (!list || !list.content || !list.content.trim()) {
    box.innerHTML = `<p class="wh-diary-empty">Chưa có nội dung. Nhấn "Mở để viết" để bắt đầu ghi chép.</p>`;
  } else {
    box.innerHTML = list.content;
  }
}

let whDragSrcId = null;

function renderWhTable() {
  const table = document.getElementById("wh-table");
  table.innerHTML = "";
  const list = whActiveList();
  if (!list || !list.items.length) {
    table.innerHTML = `<div class="wh-empty-row">Chưa có mục nào trong danh sách này</div>`;
    document.getElementById("wh-progress").textContent = "Tiến độ: 0%";
    return;
  }
  list.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "wh-row";
    row.draggable = true;
    row.dataset.itemId = item.id;
    const dotClass = item.status === "known" ? "dot-known" : item.status === "difficult" ? "dot-difficult" : "dot-learning";
    row.innerHTML = `
      <span class="wh-row-handle" title="Kéo để sắp xếp lại">≡</span>
      <span class="wh-row-text">
        <span class="wh-row-en">${escapeHtml(item.en)}</span>
        <span class="wh-row-arrow">→</span>
        <span class="wh-row-vi">${escapeHtml(item.vi)}</span>
      </span>
      <span class="wh-row-dot ${dotClass}" title="${escapeHtml(statusLabel(wh.cat === "dictionary" ? "flashcard" : wh.cat, item.status))}"></span>
      <span class="wh-row-actions">
        <button data-act="edit" title="Sửa">✎</button>
        <button data-act="del" title="Xoá">🗑</button>
      </span>`;
    row.querySelector('[data-act="edit"]').addEventListener("click", () => openWhEdit(item.id));
    row.querySelector('[data-act="del"]').addEventListener("click", async () => {
      const ok = await showConfirm("Xoá mục này?");
      if (!ok) return;
      list.items = list.items.filter((i) => i.id !== item.id);
      saveState();
      renderWarehouseTab();
    });
    row.querySelector(".wh-row-dot").addEventListener("click", () => {
      const order = ["new", "known", "difficult"];
      item.status = order[(order.indexOf(item.status) + 1) % order.length];
      saveState();
      renderWhTable();
    });

    /* ---- drag & drop reordering ---- */
    row.addEventListener("dragstart", (e) => {
      whDragSrcId = item.id;
      row.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", item.id); } catch (err) { /* ignore */ }
      }
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      table.querySelectorAll(".wh-row").forEach((r) => r.classList.remove("drag-over-top", "drag-over-bottom"));
      whDragSrcId = null;
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (!whDragSrcId || whDragSrcId === item.id) return;
      const rect = row.getBoundingClientRect();
      const isAfter = e.clientY - rect.top > rect.height / 2;
      row.classList.toggle("drag-over-bottom", isAfter);
      row.classList.toggle("drag-over-top", !isAfter);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const isAfter = row.classList.contains("drag-over-bottom");
      row.classList.remove("drag-over-top", "drag-over-bottom");
      if (!whDragSrcId || whDragSrcId === item.id) return;
      const fromIdx = list.items.findIndex((i) => i.id === whDragSrcId);
      let toIdx = list.items.findIndex((i) => i.id === item.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = list.items.splice(fromIdx, 1);
      toIdx = list.items.findIndex((i) => i.id === item.id);
      list.items.splice(isAfter ? toIdx + 1 : toIdx, 0, moved);
      saveState();
      renderWhTable();
    });

    table.appendChild(row);
  });
  const known = list.items.filter((i) => i.status === "known").length;
  const pct = Math.round((known / list.items.length) * 100);
  document.getElementById("wh-progress").textContent = `Tiến độ: ${pct}%`;
}

async function addWhList() {
  const defaultName = wh.cat === "diary" ? "Nhật ký " + (getCategory(wh.cat).length + 1) : "Danh sách " + (getCategory(wh.cat).length + 1);
  const name = await showPrompt("Tên danh sách mới", defaultName);
  if (!name) return;
  const list = wh.cat === "diary" ? defaultDiaryList(name) : defaultList(name);
  getCategory(wh.cat).push(list);
  state.activeWhList[wh.cat] = list.id;
  saveState();
  renderWarehouseTab();
}
document.getElementById("wh-add-list").addEventListener("click", addWhList);

document.getElementById("wh-rename-list").addEventListener("click", async () => {
  const list = whActiveList();
  if (!list) return;
  const name = await showPrompt("Đổi tên danh sách", list.name);
  if (!name) return;
  list.name = name;
  saveState();
  renderWarehouseTab();
});
document.getElementById("wh-delete-list").addEventListener("click", async () => {
  const list = whActiveList();
  if (!list) return;
  const lists = getCategory(wh.cat);
  if (lists.length <= 1) {
    showToast("Phải có ít nhất một danh sách.");
    return;
  }
  const ok = await showConfirm(`Xoá danh sách "${list.name}"? Toàn bộ mục bên trong sẽ mất.`);
  if (!ok) return;
  state.categories[wh.cat] = lists.filter((l) => l.id !== list.id);
  state.activeWhList[wh.cat] = null;
  state.selected.flashcard = state.selected.flashcard.filter((id) => id !== list.id);
  state.selected.writing = state.selected.writing.filter((id) => id !== list.id);
  saveState();
  renderWarehouseTab();
});
document.getElementById("wh-clear-all").addEventListener("click", async () => {
  const list = whActiveList();
  if (!list || !list.items.length) return;
  const ok = await showConfirm("Xoá toàn bộ mục trong danh sách này?");
  if (!ok) return;
  list.items = [];
  saveState();
  renderWarehouseTab();
});
document.getElementById("wh-reset-status").addEventListener("click", () => {
  const list = whActiveList();
  if (!list) return;
  list.items.forEach((i) => (i.status = "new"));
  saveState();
  renderWarehouseTab();
});

/* ---- Thêm vào (bulk add) modal ---- */
const whAddOverlay = document.getElementById("wh-add-overlay");
document.getElementById("wh-add-items").addEventListener("click", () => {
  const list = whActiveList();
  if (!list) return;
  document.getElementById("wh-add-list-name").textContent = "— " + list.name;
  document.getElementById("wh-add-textarea").value = "";
  whAddOverlay.classList.remove("hidden");
});
document.getElementById("wh-add-close").addEventListener("click", () => whAddOverlay.classList.add("hidden"));
whAddOverlay.addEventListener("click", (e) => { if (e.target === whAddOverlay) whAddOverlay.classList.add("hidden"); });
document.getElementById("wh-add-clear").addEventListener("click", () => {
  document.getElementById("wh-add-textarea").value = "";
});
document.getElementById("wh-add-confirm").addEventListener("click", () => {
  const list = whActiveList();
  if (!list) return;
  const raw = document.getElementById("wh-add-textarea").value;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let added = 0;
  lines.forEach((line) => {
    const sep = line.includes("-->") ? "-->" : line.includes("\t") ? "\t" : "-";
    const idx = line.indexOf(sep);
    if (idx === -1) return;
    const en = line.slice(0, idx).trim();
    const vi = line.slice(idx + sep.length).trim();
    if (!en || !vi) return;
    list.items.push({ id: uid(), en, vi, status: "new" });
    added++;
  });
  saveState();
  whAddOverlay.classList.add("hidden");
  renderWarehouseTab();
  if (!added) showToast('Không nhận diện được dòng nào. Dùng định dạng: "Câu Tiếng Anh - Câu Tiếng Việt" mỗi dòng.');
  else showToast(`Đã thêm ${added} mục.`);
});

/* ---- Edit item modal ---- */
const whEditOverlay = document.getElementById("wh-edit-overlay");
let whEditItemId = null;
function openWhEdit(itemId) {
  const list = whActiveList();
  const item = list.items.find((i) => i.id === itemId);
  if (!item) return;
  whEditItemId = itemId;
  document.getElementById("wh-edit-en").value = item.en;
  document.getElementById("wh-edit-vi").value = item.vi;
  whEditOverlay.classList.remove("hidden");
}
document.getElementById("wh-edit-close").addEventListener("click", () => whEditOverlay.classList.add("hidden"));
whEditOverlay.addEventListener("click", (e) => { if (e.target === whEditOverlay) whEditOverlay.classList.add("hidden"); });
document.getElementById("wh-edit-save").addEventListener("click", () => {
  const list = whActiveList();
  const item = list.items.find((i) => i.id === whEditItemId);
  if (!item) return;
  item.en = document.getElementById("wh-edit-en").value.trim();
  item.vi = document.getElementById("wh-edit-vi").value.trim();
  saveState();
  whEditOverlay.classList.add("hidden");
  renderWarehouseTab();
});

/* ---- Export / Import modal ---- */
const whExportOverlay = document.getElementById("wh-export-overlay");
document.getElementById("wh-export-open").addEventListener("click", () => whExportOverlay.classList.remove("hidden"));
document.getElementById("wh-export-close").addEventListener("click", () => whExportOverlay.classList.add("hidden"));
whExportOverlay.addEventListener("click", (e) => { if (e.target === whExportOverlay) whExportOverlay.classList.add("hidden"); });

function getExportScope() {
  return document.querySelector('input[name="wh-export-scope"]:checked').value;
}
function exportData() {
  const scope = getExportScope();
  if (scope === "current") {
    const list = whActiveList();
    return list ? [list] : [];
  }
  return getCategory(wh.cat);
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
document.getElementById("wh-export-json").addEventListener("click", () => {
  download(`nox-${wh.cat}.json`, JSON.stringify(exportData(), null, 2), "application/json");
});
document.getElementById("wh-export-txt").addEventListener("click", () => {
  const lists = exportData();
  let txt = "";
  lists.forEach((l) => {
    txt += `# ${l.name}\n`;
    l.items.forEach((i) => (txt += `${i.en} - ${i.vi}\n`));
    txt += "\n";
  });
  download(`nox-${wh.cat}.txt`, txt, "text/plain");
});
document.getElementById("wh-export-copy").addEventListener("click", () => {
  const lists = exportData();
  let txt = "";
  lists.forEach((l) => {
    txt += `# ${l.name}\n`;
    l.items.forEach((i) => (txt += `${i.en} - ${i.vi}\n`));
    txt += "\n";
  });
  navigator.clipboard.writeText(txt).then(() => showToast("Đã sao chép vào clipboard!"));
});
document.getElementById("wh-import-btn").addEventListener("click", () => {
  document.getElementById("wh-import-file").click();
});

/* Parse a .txt file into blocks: a line starting with "#" starts a new
   named list; subsequent "en - vi" lines belong to that list. Lines that
   appear before any "#" header go into a null-name block (handled by
   falling back to the currently active list on import). */
function parseTxtIntoLists(text) {
  const lines = text.split("\n");
  const blocks = [];
  let current = null;
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith("#")) {
      current = { name: line.replace(/^#+/, "").trim() || "Danh sách nhập", items: [] };
      blocks.push(current);
      return;
    }
    if (!current) {
      current = { name: null, items: [] };
      blocks.push(current);
    }
    const sep = line.includes("-->") ? "-->" : line.includes("\t") ? "\t" : "-";
    const idx = line.indexOf(sep);
    if (idx === -1) return;
    const en = line.slice(0, idx).trim();
    const vi = line.slice(idx + sep.length).trim();
    if (en && vi) current.items.push({ id: uid(), en, vi, status: "new" });
  });
  return blocks;
}

document.getElementById("wh-import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let listsCreated = 0;
      if (file.name.endsWith(".json")) {
        const data = JSON.parse(reader.result);
        const lists = Array.isArray(data) ? data : [data];
        lists.forEach((l) => {
          const newList = defaultList(l.name || "Danh sách nhập");
          (l.items || []).forEach((i) => newList.items.push({ id: uid(), en: i.en, vi: i.vi, status: "new" }));
          getCategory(wh.cat).push(newList);
          state.activeWhList[wh.cat] = newList.id;
          listsCreated++;
        });
      } else {
        const blocks = parseTxtIntoLists(reader.result);
        blocks.forEach((block) => {
          if (!block.items.length) return;
          let targetList;
          if (block.name) {
            // "#Tên" header -> create (or reuse) a list with that exact name
            targetList = getCategory(wh.cat).find((l) => l.name === block.name);
            if (!targetList) {
              targetList = defaultList(block.name);
              getCategory(wh.cat).push(targetList);
              listsCreated++;
            }
          } else {
            // no header before these lines -> fall back to the active list
            targetList = whActiveList();
            if (!targetList) {
              targetList = defaultList("Danh sách nhập");
              getCategory(wh.cat).push(targetList);
              listsCreated++;
            }
          }
          targetList.items.push(...block.items);
          state.activeWhList[wh.cat] = targetList.id;
        });
      }
      saveState();
      renderWarehouseTab();
      whExportOverlay.classList.add("hidden");
      showToast(listsCreated > 0 ? `Nhập file thành công! Đã tạo ${listsCreated} danh sách mới.` : "Nhập file thành công!");
    } catch (err) {
      showToast("Không đọc được file: " + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});

/* ============================================================
   NHẬT KÝ (DIARY) — quick popup rich-text editor
   ============================================================ */
let diaryCurrentListId = null;
let diaryAutosaveHandle = null;

function diaryActiveList() {
  const lists = getCategory("diary");
  let activeId = state.activeWhList.diary;
  if (!activeId || !lists.find((l) => l.id === activeId)) {
    activeId = lists[0] ? lists[0].id : null;
    state.activeWhList.diary = activeId;
  }
  return lists.find((l) => l.id === activeId) || null;
}

function renderDiaryNoteSelect() {
  const select = document.getElementById("dy-note-select");
  select.innerHTML = "";
  getCategory("diary").forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === diaryCurrentListId) opt.selected = true;
    select.appendChild(opt);
  });
}

function openDiaryPopup(listId) {
  let target = listId ? getCategory("diary").find((l) => l.id === listId) : diaryActiveList();
  if (!target) {
    target = defaultDiaryList("Nhật ký 1");
    getCategory("diary").push(target);
  }
  diaryCurrentListId = target.id;
  state.activeWhList.diary = target.id;
  saveState();

  const content = document.getElementById("dy-content");
  content.innerHTML = target.content || "";
  content.contentEditable = "true";
  document.getElementById("dy-mode-btn").classList.remove("active-state");
  closeAllDiaryDropdowns();
  renderDiaryNoteSelect();
  document.getElementById("diary-popup-overlay").classList.remove("hidden");
  setTimeout(() => content.focus(), 60);
}

function saveDiaryContent() {
  if (!diaryCurrentListId) return;
  const list = getCategory("diary").find((l) => l.id === diaryCurrentListId);
  if (!list) return;
  list.content = document.getElementById("dy-content").innerHTML;
  saveState();
}

function closeDiaryPopup() {
  saveDiaryContent();
  closeAllDiaryDropdowns();
  document.getElementById("diary-popup-overlay").classList.add("hidden");
  const whTab = document.querySelector('.tab-content[data-content="warehouse"]');
  if (whTab && !whTab.classList.contains("hidden") && wh.cat === "diary") {
    renderWarehouseTab();
  }
}

function scheduleDiaryAutosave() {
  clearTimeout(diaryAutosaveHandle);
  diaryAutosaveHandle = setTimeout(saveDiaryContent, 800);
}

document.getElementById("diary-quick-open").addEventListener("click", () => openDiaryPopup());
document.getElementById("wh-diary-open-editor").addEventListener("click", () => {
  const list = whActiveList();
  openDiaryPopup(list ? list.id : null);
});
document.getElementById("dy-close-btn").addEventListener("click", closeDiaryPopup);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("diary-popup-overlay").classList.contains("hidden")) {
    closeDiaryPopup();
  }
});
window.addEventListener("beforeunload", () => {
  if (!document.getElementById("diary-popup-overlay").classList.contains("hidden")) {
    saveDiaryContent();
  }
});
// NOTE: clicking the backdrop intentionally does NOT close this popup (per request),
// unlike the other overlays in the app.

document.getElementById("dy-note-select").addEventListener("change", (e) => {
  saveDiaryContent();
  const list = getCategory("diary").find((l) => l.id === e.target.value);
  if (!list) return;
  diaryCurrentListId = list.id;
  state.activeWhList.diary = list.id;
  document.getElementById("dy-content").innerHTML = list.content || "";
  saveState();
});

document.getElementById("dy-content").addEventListener("input", scheduleDiaryAutosave);

/* ---- formatting commands ---- */
function diaryExec(cmd, value = null) {
  const content = document.getElementById("dy-content");
  content.focus();
  try {
    document.execCommand(cmd, false, value);
  } catch (e) {
    /* execCommand is legacy but broadly supported; fail silently if unavailable */
  }
  scheduleDiaryAutosave();
}
document.getElementById("dy-bold-btn").addEventListener("click", () => diaryExec("bold"));
document.getElementById("dy-italic-btn").addEventListener("click", () => diaryExec("italic"));
document.getElementById("dy-underline-btn").addEventListener("click", () => diaryExec("underline"));

/* undo / redo */
document.getElementById("dy-undo-btn").addEventListener("click", () => diaryExec("undo"));
document.getElementById("dy-redo-btn").addEventListener("click", () => diaryExec("redo"));

/* font size dropdown */
function closeAllDiaryDropdowns() {
  document.getElementById("dy-fontsize-menu").classList.add("hidden");
  document.getElementById("dy-align-menu").classList.add("hidden");
}
document.getElementById("dy-fontsize-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("dy-fontsize-menu");
  const wasHidden = menu.classList.contains("hidden");
  closeAllDiaryDropdowns();
  menu.classList.toggle("hidden", !wasHidden);
});
document.querySelectorAll("#dy-fontsize-menu [data-size]").forEach((btn) => {
  btn.addEventListener("click", () => {
    diaryExec("fontSize", btn.dataset.size);
    document.getElementById("dy-fontsize-btn").textContent = btn.textContent + " ▾";
    document.getElementById("dy-fontsize-menu").classList.add("hidden");
  });
});

/* alignment / list dropdown */
document.getElementById("dy-align-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("dy-align-menu");
  const wasHidden = menu.classList.contains("hidden");
  closeAllDiaryDropdowns();
  menu.classList.toggle("hidden", !wasHidden);
});
document.querySelectorAll("#dy-align-menu [data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    diaryExec(btn.dataset.cmd);
    document.getElementById("dy-align-menu").classList.add("hidden");
  });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".diary-dd-wrap")) closeAllDiaryDropdowns();
});

/* text color */
document.getElementById("dy-color-btn").addEventListener("click", () => {
  document.getElementById("dy-color-input").click();
});
document.getElementById("dy-color-input").addEventListener("input", (e) => {
  diaryExec("foreColor", e.target.value);
  document.getElementById("dy-color-btn").style.color = e.target.value;
  document.getElementById("dy-color-btn").style.borderColor = e.target.value;
});

/* ---- Highlight & Đóng khung: custom toggle-on/toggle-off spans ----
   (not using execCommand hiliteColor, since it can't reliably be
   detected/removed on re-selection — these need real toggle behaviour) */
function unwrapSpan(span) {
  const parent = span.parentNode;
  if (!parent) return;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
}
function wrapRangeInSpan(range, className) {
  const span = document.createElement("span");
  span.className = className;
  try {
    range.surroundContents(span);
  } catch (err) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  return span;
}
function toggleInlineSpanClass(className, emptyMessage) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) {
    showToast(emptyMessage);
    return;
  }
  const range = sel.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentElement;
  const existing = container && container.closest ? container.closest("." + className) : null;
  if (existing) {
    unwrapSpan(existing);
  } else {
    wrapRangeInSpan(range, className);
  }
  sel.removeAllRanges();
  scheduleDiaryAutosave();
}
document.getElementById("dy-highlight-btn").addEventListener("click", () => {
  toggleInlineSpanClass("diary-highlight", "Hãy bôi đen đoạn chữ cần highlight trước.");
});
document.getElementById("dy-box-btn").addEventListener("click", () => {
  toggleInlineSpanClass("diary-boxed", "Hãy bôi đen đoạn chữ cần đóng khung trước.");
});

/* edit / view mode toggle */
document.getElementById("dy-mode-btn").addEventListener("click", () => {
  const content = document.getElementById("dy-content");
  const isCurrentlyEditable = content.contentEditable === "true";
  if (isCurrentlyEditable) {
    saveDiaryContent();
    content.contentEditable = "false";
  } else {
    content.contentEditable = "true";
    content.focus();
  }
  document.getElementById("dy-mode-btn").classList.toggle("active-state", isCurrentlyEditable);
});

/* keyboard shortcuts while editing */
document.getElementById("dy-content").addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;
  const key = e.key.toLowerCase();
  if (!e.shiftKey && key === "b") { e.preventDefault(); diaryExec("bold"); }
  else if (!e.shiftKey && key === "i") { e.preventDefault(); diaryExec("italic"); }
  else if (!e.shiftKey && key === "u") { e.preventDefault(); diaryExec("underline"); }
  else if (!e.shiftKey && key === "z") { e.preventDefault(); diaryExec("undo"); }
  else if (!e.shiftKey && key === "y") { e.preventDefault(); diaryExec("redo"); }
  else if (e.shiftKey && key === "h") { e.preventDefault(); document.getElementById("dy-highlight-btn").click(); }
  else if (e.shiftKey && key === "d") { e.preventDefault(); document.getElementById("dy-box-btn").click(); }
  else if (e.shiftKey && key === "l") { e.preventDefault(); diaryExec("justifyLeft"); }
  else if (e.shiftKey && key === "e") { e.preventDefault(); diaryExec("justifyCenter"); }
  else if (e.shiftKey && key === "r") { e.preventDefault(); diaryExec("justifyRight"); }
  else if (e.shiftKey && key === "m") { e.preventDefault(); document.getElementById("dy-mode-btn").click(); }
  else if (e.shiftKey && e.code === "Digit7") { e.preventDefault(); diaryExec("insertOrderedList"); }
  else if (e.shiftKey && e.code === "Digit8") { e.preventDefault(); diaryExec("insertUnorderedList"); }
  else if (e.key === ">") { e.preventDefault(); diaryExec("fontSize", "5"); document.getElementById("dy-fontsize-btn").textContent = "Lớn ▾"; }
  else if (e.key === "<") { e.preventDefault(); diaryExec("fontSize", "2"); document.getElementById("dy-fontsize-btn").textContent = "Nhỏ ▾"; }
});


/* ============================================================
   INIT
   ============================================================ */
ensureSelected("flashcard");
ensureSelected("writing");
renderFlashcardTab();
saveState();
