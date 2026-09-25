/**
 * custom-select.js
 * Sistema de dropdowns customizados — flat, minimalista, com tema do site.
 *
 * Uso: Chame initCustomSelects() depois que o DOM estiver pronto.
 * Qualquer <select> com a classe .auto-custom-select será automaticamente
 * substituído por um dropdown estilizado que dispara eventos "change"
 * idênticos ao <select> original.
 */

(function () {

  // ─────────────────────────────────────────────────────────────
  //  initCustomSelects
  //  Converte todos os <select> com .auto-custom-select na página.
  //  Deve ser chamado após o DOM estar pronto (DOMContentLoaded).
  // ─────────────────────────────────────────────────────────────
  function initCustomSelects() {
    document.querySelectorAll("select.auto-custom-select").forEach(createCustomSelect);
  }

  // ─────────────────────────────────────────────────────────────
  //  createCustomSelect(selectEl)
  //  Substitui um <select> por um componente customizado.
  //  O <select> original fica oculto mas mantém seu valor sincronizado.
  // ─────────────────────────────────────────────────────────────
  function createCustomSelect(selectEl) {
    // Evitar duplicação
    if (selectEl._customSelectInitialized) return;
    selectEl._customSelectInitialized = true;

    // Ocultar o select original (mantido para compatibilidade de valor)
    selectEl.style.display = "none";

    // ── Wrapper ──────────────────────────────────────────────
    const wrapper = document.createElement("div");
    wrapper.className = "cs-wrapper";

    // Herdar classes extras como 'pill-select', 'translation-select' etc.
    const extraClasses = selectEl.dataset.csClass || "";
    if (extraClasses) wrapper.classList.add(...extraClasses.split(" "));

    // ── Trigger (botão visível) ───────────────────────────────
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cs-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const triggerText = document.createElement("span");
    triggerText.className = "cs-trigger-text";

    const triggerChevron = document.createElement("span");
    triggerChevron.className = "cs-chevron";
    triggerChevron.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    trigger.appendChild(triggerText);
    trigger.appendChild(triggerChevron);

    // ── Dropdown panel ────────────────────────────────────────
    const panel = document.createElement("div");
    panel.className = "cs-panel";
    panel.setAttribute("role", "listbox");

    // ── Inner scroll container ────────────────────────────────
    const panelInner = document.createElement("div");
    panelInner.className = "cs-panel-inner";

    // ── Montar opções ─────────────────────────────────────────
    buildOptions(selectEl, panelInner);

    // ── Montar wrapper ────────────────────────────────────────
    panel.appendChild(panelInner);
    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);

    // Inserir após o select original
    selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);

    // ── Inicializar valor atual ───────────────────────────────
    syncFromOriginal();

    // ── Eventos ───────────────────────────────────────────────
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains("cs-open");
      closeAllPanels();
      if (!isOpen) openPanel();
    });

    // ── Funções locais ────────────────────────────────────────
    function openPanel() {
      wrapper.classList.add("cs-open");
      trigger.setAttribute("aria-expanded", "true");

      // Destacar e rolar até o item selecionado
      const selected = panel.querySelector(".cs-option.cs-selected");
      setActiveOption(selected || panel.querySelector(".cs-option"));
    }

    function closePanel() {
      wrapper.classList.remove("cs-open");
      trigger.setAttribute("aria-expanded", "false");
      setActiveOption(null);
    }

    // Opção destacada pela navegação por teclado
    function setActiveOption(item) {
      panel.querySelectorAll(".cs-option.cs-active").forEach(el => el.classList.remove("cs-active"));
      if (!item) return;
      item.classList.add("cs-active");
      requestAnimationFrame(() => item.scrollIntoView({ block: "nearest" }));
    }

    // Teclado: setas/Home/End navegam, Enter/Espaço selecionam, Esc fecha
    trigger.addEventListener("keydown", (e) => {
      const options = Array.from(panel.querySelectorAll(".cs-option"));
      if (options.length === 0) return;
      const isOpen = wrapper.classList.contains("cs-open");
      const active = panel.querySelector(".cs-option.cs-active");
      const index = options.indexOf(active);

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          closeAllPanels();
          openPanel();
          return;
        }
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = index < 0 ? 0 : Math.min(options.length - 1, Math.max(0, index + step));
        setActiveOption(options[next]);
      } else if ((e.key === "Home" || e.key === "End") && isOpen) {
        e.preventDefault();
        setActiveOption(e.key === "Home" ? options[0] : options[options.length - 1]);
      } else if ((e.key === "Enter" || e.key === " ") && isOpen && active) {
        e.preventDefault();
        selectValue(active.dataset.value);
        closePanel();
      } else if (e.key === "Tab" && isOpen) {
        closePanel();
      }
    });

    function selectValue(value) {
      // Sincronizar com o select original
      selectEl.value = value;

      // Disparar evento "change" para que os listeners do app.js funcionem
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));

      syncFromOriginal();
    }
    selectEl._csSelect = (value) => {
      selectValue(value);
      closePanel();
    };

    function syncFromOriginal() {
      const selectedOpt = selectEl.options[selectEl.selectedIndex];
      triggerText.textContent = selectedOpt
        ? selectedOpt.textContent
        : "Selecione...";

      // Marcar opção ativa no painel
      panel.querySelectorAll(".cs-option").forEach((item) => {
        item.classList.toggle(
          "cs-selected",
          item.dataset.value === selectEl.value
        );
        item.setAttribute(
          "aria-selected",
          item.dataset.value === selectEl.value ? "true" : "false"
        );
      });
    }

    // Permitir que código externo atualize o valor e reflita no custom select
    // Ex: translationSelect.value = "nvi" → dispatchEvent(new Event("_sync"))
    selectEl.addEventListener("_sync", syncFromOriginal);

    // Fechar com Escape, devolvendo o foco ao botão
    wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrapper.classList.contains("cs-open")) {
        closePanel();
        trigger.focus();
      }
    });

    // Expor referência ao wrapper a partir do select original
    selectEl._csWrapper = wrapper;
    selectEl._csSync = syncFromOriginal;
  }

  // ─────────────────────────────────────────────────────────────
  //  buildOptions(selectEl, panelInner)
  //  Cria os itens do painel a partir das <option> do select original.
  // ─────────────────────────────────────────────────────────────
  function buildOptions(selectEl, panelInner) {
    panelInner.innerHTML = "";
    Array.from(selectEl.options).forEach((opt) => {
      const item = document.createElement("div");
      item.className = "cs-option";
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;

      if (opt.value === "") {
        item.classList.add("cs-option-placeholder");
      }

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (selectEl._csSelect) selectEl._csSelect(opt.value);
      });

      panelInner.appendChild(item);
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  closeAllPanels — fecha todos os dropdowns abertos
  // ─────────────────────────────────────────────────────────────
  function closeAllPanels() {
    document.querySelectorAll(".cs-wrapper.cs-open").forEach((w) => {
      w.classList.remove("cs-open");
      const t = w.querySelector(".cs-trigger");
      if (t) t.setAttribute("aria-expanded", "false");
    });
  }

  // Fechar ao clicar fora
  document.addEventListener("click", closeAllPanels);

  // ─────────────────────────────────────────────────────────────
  //  Expor globalmente
  // ─────────────────────────────────────────────────────────────
  window.initCustomSelects = initCustomSelects;
  window.createCustomSelect = createCustomSelect;

  // ─────────────────────────────────────────────────────────────
  //  syncCustomSelect(selectEl)
  //  Utilitário para sincronizar manualmente um custom select
  //  quando seu valor original for alterado via JS.
  // ─────────────────────────────────────────────────────────────
  window.syncCustomSelect = function (selectEl) {
    if (selectEl && selectEl._csSync) selectEl._csSync();
  };

  // ─────────────────────────────────────────────────────────────
  //  updateCustomSelect(selectEl)
  //  Utilitário para reconstruir as opções do custom select
  //  quando as opções do <select> original são alteradas.
  // ─────────────────────────────────────────────────────────────
  window.updateCustomSelect = function (selectEl) {
    if (!selectEl || !selectEl._customSelectInitialized || !selectEl._csWrapper) return;

    const panelInner = selectEl._csWrapper.querySelector(".cs-panel-inner");
    if (!panelInner) return;

    // Recriar opções
    buildOptions(selectEl, panelInner);

    // Sincronizar texto e estado ativo
    if (selectEl._csSync) selectEl._csSync();
  };

})();
