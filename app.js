const state = {
  words: [],
  filter: "all",
  query: "",
  mastered: new Set(JSON.parse(localStorage.getItem("vocab-mastered") || "[]")),
  studyDeck: [],
  studyIndex: 0,
};

const fields = {
  "词性/类型": "type",
  "含义": "meaning",
  "使用场景": "scene",
  "例句": "example",
  "例句翻译": "translation",
  "常见搭配": "collocations",
  "补充": "notes",
};

function plainText(value = "") {
  return value.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
}

function parseVocabulary(markdown) {
  const body = markdown.split("<!--")[0];
  return body.split(/^### /m).slice(1).map((section) => {
    const [rawTitle, ...lines] = section.trim().split("\n");
    const word = { title: rawTitle.trim() };
    lines.forEach((line) => {
      const match = line.match(/^- \*\*(.+?)\*\*[：:]\s*(.*)$/);
      if (match && fields[match[1]]) word[fields[match[1]]] = plainText(match[2]);
    });
    return word;
  }).filter((word) => word.title && word.meaning);
}

function escapeHtml(value = "") {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function wordKey(word) { return word.title.toLowerCase(); }

function saveMastery() {
  localStorage.setItem("vocab-mastered", JSON.stringify([...state.mastered]));
  updateStats();
}

function updateStats() {
  const mastered = state.words.filter((word) => state.mastered.has(wordKey(word))).length;
  document.querySelector("#total-count").textContent = state.words.length;
  document.querySelector("#mastered-count").textContent = mastered;
  document.querySelector("#review-count").textContent = state.words.length - mastered;
}

function visibleWords() {
  return state.words.filter((word) => {
    const isMastered = state.mastered.has(wordKey(word));
    const matchesFilter = state.filter === "all" || (state.filter === "mastered" ? isMastered : !isMastered);
    const haystack = [word.title, word.meaning, word.scene, word.example, word.translation].join(" ").toLowerCase();
    return matchesFilter && haystack.includes(state.query.toLowerCase());
  });
}

function renderWords() {
  const grid = document.querySelector("#word-grid");
  const words = visibleWords();
  grid.innerHTML = words.map((word) => {
    const key = wordKey(word);
    const mastered = state.mastered.has(key);
    const extras = [
      word.collocations ? `<p><strong>常见搭配：</strong>${escapeHtml(word.collocations)}</p>` : "",
      word.notes ? `<p><strong>补充：</strong>${escapeHtml(word.notes)}</p>` : "",
    ].join("");
    return `
      <article class="word-card${mastered ? " mastered" : ""}" data-key="${escapeHtml(key)}">
        <div class="card-top">
          <div><h3 class="word-title">${escapeHtml(word.title)}</h3><p class="word-type">${escapeHtml(word.type || "英语表达")}</p></div>
          <button class="speak-button" type="button" data-speak="${escapeHtml(word.title.split(" / ")[0])}" aria-label="朗读 ${escapeHtml(word.title)}">♪</button>
        </div>
        <p class="meaning">${escapeHtml(word.meaning)}</p>
        <p class="scene">${escapeHtml(word.scene || "")}</p>
        <div class="example"><p class="example-en">“${escapeHtml(word.example || "")}”</p><p class="example-zh">${escapeHtml(word.translation || "")}</p></div>
        <div class="card-footer">
          <button class="details-toggle" type="button" aria-expanded="false">更多笔记 ＋</button>
          <button class="master-toggle" type="button" aria-pressed="${mastered}">${mastered ? "✓ 已掌握" : "标记掌握"}</button>
        </div>
        <div class="extra-details" hidden>${extras || "<p>这个词暂时没有额外笔记。</p>"}</div>
      </article>`;
  }).join("");
  document.querySelector("#empty-state").hidden = words.length !== 0;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.86;
  speechSynthesis.speak(utterance);
}

function setupCollectionEvents() {
  document.querySelector("#search").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderWords();
  });
  document.querySelector(".filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderWords();
  });
  document.querySelector("#word-grid").addEventListener("click", (event) => {
    const speakButton = event.target.closest("[data-speak]");
    if (speakButton) return speak(speakButton.dataset.speak);
    const card = event.target.closest(".word-card");
    if (!card) return;
    if (event.target.closest(".details-toggle")) {
      const details = card.querySelector(".extra-details");
      const button = card.querySelector(".details-toggle");
      details.hidden = !details.hidden;
      button.setAttribute("aria-expanded", String(!details.hidden));
      button.textContent = details.hidden ? "更多笔记 ＋" : "收起笔记 −";
    }
    if (event.target.closest(".master-toggle")) {
      state.mastered.has(card.dataset.key) ? state.mastered.delete(card.dataset.key) : state.mastered.add(card.dataset.key);
      saveMastery();
      renderWords();
    }
  });
}

const dialog = document.querySelector("#study-dialog");
function renderStudyCard() {
  const word = state.studyDeck[state.studyIndex];
  if (!word) return dialog.close();
  document.querySelector("#study-progress").textContent = `${state.studyIndex + 1} / ${state.studyDeck.length}`;
  document.querySelector("#progress-fill").style.width = `${((state.studyIndex + 1) / state.studyDeck.length) * 100}%`;
  document.querySelector("#study-word").textContent = word.title;
  document.querySelector("#study-meaning").textContent = word.meaning;
  document.querySelector("#study-example").textContent = `“${word.example || ""}”`;
  document.querySelector("#study-translation").textContent = word.translation || "";
  document.querySelector("#study-answer").hidden = true;
  document.querySelector("#reveal-answer").hidden = false;
  document.querySelector("#study-actions").hidden = true;
}

function nextStudy(mastered) {
  const word = state.studyDeck[state.studyIndex];
  if (mastered) state.mastered.add(wordKey(word)); else state.mastered.delete(wordKey(word));
  saveMastery();
  state.studyIndex += 1;
  if (state.studyIndex >= state.studyDeck.length) {
    dialog.close();
    renderWords();
    return;
  }
  renderStudyCard();
}

function setupStudyEvents() {
  document.querySelector("#start-study").addEventListener("click", () => {
    const due = state.words.filter((word) => !state.mastered.has(wordKey(word)));
    state.studyDeck = (due.length ? due : [...state.words]).sort(() => Math.random() - .5);
    state.studyIndex = 0;
    renderStudyCard();
    dialog.showModal();
  });
  document.querySelector("#close-study").addEventListener("click", () => dialog.close());
  document.querySelector("#reveal-answer").addEventListener("click", () => {
    document.querySelector("#study-answer").hidden = false;
    document.querySelector("#reveal-answer").hidden = true;
    document.querySelector("#study-actions").hidden = false;
  });
  document.querySelector("#speak-study").addEventListener("click", () => speak(state.studyDeck[state.studyIndex].title.split(" / ")[0]));
  document.querySelector("#study-again").addEventListener("click", () => nextStudy(false));
  document.querySelector("#study-know").addEventListener("click", () => nextStudy(true));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
}

async function init() {
  try {
    const response = await fetch("./英语单词本.md");
    if (!response.ok) throw new Error("无法读取单词本");
    state.words = parseVocabulary(await response.text());
    updateStats();
    renderWords();
    setupCollectionEvents();
    setupStudyEvents();
  } catch (error) {
    document.querySelector("#word-grid").innerHTML = `<p class="empty-state">单词本暂时没有加载成功，请刷新页面重试。</p>`;
    console.error(error);
  }
}

init();
