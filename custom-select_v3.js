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
        selectValue(opt.value);
        closePanel();
      });

      panelInner.appendChild(item);
    });

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

      // Scroll para o item selecionado
      const selected = panel.querySelector(".cs-option.cs-selected");
      if (selected) {
        requestAnimationFrame(() => {
          selected.scrollIntoView({ block: "nearest" });
        });
      }
    }

    function closePanel() {
      wrapper.classList.remove("cs-open");
      trigger.setAttribute("aria-expanded", "false");
    }

    function selectValue(value) {
      // Sincronizar com o select original
      selectEl.value = value;

      // Disparar evento "change" para que os listeners do app.js funcionem
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));

      syncFromOriginal();
    }

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

    // Fechar com Escape
    wrapper.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    // Expor referência ao wrapper a partir do select original
    selectEl._csWrapper = wrapper;
    selectEl._csSync = syncFromOriginal;
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

    const wrapper = selectEl._csWrapper;
    const panelInner = wrapper.querySelector(".cs-panel-inner");
    if (!panelInner) return;

    // Limpar as opções antigas
    panelInner.innerHTML = "";

    // Recriar opções
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
        
        // selectValue logic
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        if (selectEl._csSync) selectEl._csSync();

        // closePanel logic
        wrapper.classList.remove("cs-open");
        const trigger = wrapper.querySelector(".cs-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });

      panelInner.appendChild(item);
    });

    // Sincronizar texto e estado ativo
    if (selectEl._csSync) selectEl._csSync();
  };

})();
