// app.js
// Lógica principal do site Bíblia Live

// Estado inicial da aplicação
const state = {
  currentBook: "pv",       // Provérbios (Padrão)
  currentChapter: 28,      // Capítulo 28 (Padrão)
  currentTranslation: "nvi", // NVI (Padrão)
  fontSize: "md",          // sm, md, lg, xl
  fontFamily: "serif",     // serif, sans
  theme: "azul",           // azul, claro, sepia, noturno
  apiToken: "",            // Token do usuário para a API
  highlights: {},          // { "book-chapter-verse": "hl-color" }
  notes: {},               // { "book-chapter-verse": "texto da nota" }
  favorites: [],           // [ "book-chapter-verse", ... ]
  history: [],             // [ { book: "pv", chapter: 28, time: Date }, ... ]
  activeVerseKey: null,    // Versículo selecionado atualmente
  activeFilterVerseKey: null, // Versículo filtrado no drawer
  comparisonActive: false, // Modo de comparação ativo
  comparisonTranslation: "acf", // Versão secundária para comparação
  readingPlans: {
    activePlanId: "",
    progress: {} // key: "planId-dayNumber", value: true/false
  },
  avatarUrl: "",           // Foto de perfil do usuário (Base64)
  fullName: "",            // Nome completo do usuário
  bio: "",                 // Descrição/Biografia curta
  socialName: "",          // Nome social/Apelido
  birthDate: "",           // Data de nascimento
  maritalStatus: "",       // Estado civil
  gender: "",              // Sexo
  readStatus: {            // Status de leitura
    verses: [],            // ["book-chapter-verse", ...]
    books: []              // ["book", ...]
  }
};

// Flag para garantir que o versículo do dia seja renderizado apenas uma vez por sessão
let vodAlreadyRendered = false;


// Inicialização da aplicação
document.addEventListener("DOMContentLoaded", () => {
  loadStateFromLocalStorage();
  applyPreferences();
  initUI();
  // Inicializa os dropdowns customizados (substitui <select> nativos)
  if (typeof initCustomSelects === "function") initCustomSelects();
  loadActiveChapter();

  // Landing Page — Botão "Começar a Ler"
  const btnEnterApp = document.getElementById("btn-enter-app");
  if (btnEnterApp) {
    btnEnterApp.addEventListener("click", () => {
      // Verifica se o usuário está logado
      if (typeof syncState !== "undefined" && !syncState.isLoggedIn) {
        showToast("Por favor, crie uma conta ou faça login para continuar.", "error");
        
        // Abre o modal de autenticação (se a função existir globalmente ou clicando no botão)
        const btnAuth = document.getElementById("btn-auth");
        if (btnAuth) {
          btnAuth.click(); // Dispara o clique para abrir o modal de login/cadastro
        }
        return; // Interrompe a execução, não esconde a landing page
      }

      // Se estiver logado, prossegue removendo a landing page
      const landingPage = document.getElementById("landing-page");
      if (landingPage) {
        landingPage.classList.add("landing-exit");
        setTimeout(() => {
          landingPage.remove();
        }, 650);
      }
    });
  }
});


// Carrega os dados salvos no LocalStorage
function loadStateFromLocalStorage() {
  const savedState = localStorage.getItem("bible_reader_state");
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      state.currentBook = parsed.currentBook || "pv";
      state.currentChapter = parsed.currentChapter || 28;
      state.currentTranslation = parsed.currentTranslation || "nvi";
      state.fontSize = parsed.fontSize || "md";
      state.fontFamily = parsed.fontFamily || "serif";
      state.theme = parsed.theme || "azul";
      state.apiToken = parsed.apiToken || "";
      state.highlights = parsed.highlights || {};
      state.notes = parsed.notes || {};
      state.favorites = parsed.favorites || [];
      state.history = parsed.history || [];
      state.comparisonActive = parsed.comparisonActive || false;
      state.comparisonTranslation = parsed.comparisonTranslation || "acf";
      state.readingPlans = parsed.readingPlans || { activePlanId: "", progress: {} };
      state.avatarUrl = parsed.avatarUrl || "";
      state.fullName = parsed.fullName || "";
      state.bio = parsed.bio || "";
      state.socialName = parsed.socialName || "";
      state.birthDate = parsed.birthDate || "";
      state.maritalStatus = parsed.maritalStatus || "";
      state.gender = parsed.gender || "";
      state.readStatus = parsed.readStatus || { verses: [], chapters: [], books: [] };
      if (!state.readStatus.chapters) state.readStatus.chapters = [];
      if (!state.readStatus.books) state.readStatus.books = [];
    } catch (e) {
      console.error("Erro ao carregar estado do localStorage:", e);
    }
  }
}

// Salva o estado atual no LocalStorage
function saveStateToLocalStorage() {
  const stateCopy = { ...state };
  delete stateCopy.activeVerseKey; // Não precisamos salvar o versículo temporariamente ativo
  delete stateCopy.activeFilterVerseKey; // Não precisamos salvar o filtro temporário ativo
  localStorage.setItem("bible_reader_state", JSON.stringify(stateCopy));
}

// Aplica as preferências visuais (tema, fonte, tamanho) no DOM
function applyPreferences() {
  // Aplicar tema
  document.documentElement.setAttribute("data-theme", state.theme);

  // Aplicar tamanho de fonte e família de fontes no painel de leitura
  const readerElement = document.getElementById("reader-pane");
  if (readerElement) {
    readerElement.className = "reader-pane"; // reset
    readerElement.classList.add(`size-${state.fontSize}`);
    readerElement.classList.add(`font-${state.fontFamily}`);
  }

  // Atualizar botões visuais nos seletores de configurações
  updateSettingsButtonsUI();
}

// ==========================================
// FUNÇÕES AUXILIARES DE LEITURA (CASCATA)
// ==========================================

window.isBookRead = function(bookKey) {
  if (state.readStatus && state.readStatus.books && state.readStatus.books.includes(bookKey)) return true;
  // Derivado: verificar se todos os capítulos foram lidos um a um
  const bookData = typeof BIBLE_BOOKS !== "undefined" ? BIBLE_BOOKS.find(b => b.abbrev === bookKey) : null;
  if (bookData && state.readStatus && state.readStatus.chapters) {
    let allChaptersRead = true;
    for (let i = 1; i <= bookData.chapters; i++) {
      if (!state.readStatus.chapters.includes(`${bookKey}-${i}`)) {
        allChaptersRead = false;
        break;
      }
    }
    return allChaptersRead;
  }
  return false;
};

window.isChapterRead = function(bookKey, chapter) {
  // Cascata superior
  if (state.readStatus && state.readStatus.books && state.readStatus.books.includes(bookKey)) return true;
  // Próprio nível
  if (state.readStatus && state.readStatus.chapters && state.readStatus.chapters.includes(`${bookKey}-${chapter}`)) return true;
  return false;
};

window.isVerseRead = function(verseKey) {
  const parts = verseKey.split("-");
  if (parts.length < 3) return false;
  const bookKey = parts[0];
  const chapter = parseInt(parts[1], 10);
  
  // Cascatas superiores
  if (state.readStatus && state.readStatus.books && state.readStatus.books.includes(bookKey)) return true;
  if (state.readStatus && state.readStatus.chapters && state.readStatus.chapters.includes(`${bookKey}-${chapter}`)) return true;
  // Próprio nível
  if (state.readStatus && state.readStatus.verses && state.readStatus.verses.includes(verseKey)) return true;
  return false;
};

window.toggleVerseReadState = function(verseKey, verseEl, forceState) {
  const parts = verseKey.split("-");
  const currentBook = parts[0];
  const currentChapter = parseInt(parts[1], 10);
  
  const isCurrentlyRead = window.isVerseRead(verseKey);
  const targetState = forceState !== undefined ? forceState : !isCurrentlyRead;
  if (isCurrentlyRead === targetState) return; // already in target state

  if (!targetState) { // Desmarcando
    if (window.isChapterRead(currentBook, currentChapter)) {
      // Remover marcação do capítulo
      const chIdx = state.readStatus.chapters.indexOf(`${currentBook}-${currentChapter}`);
      if (chIdx > -1) {
        state.readStatus.chapters.splice(chIdx, 1);
        if (typeof cloudSaveReadChapter === "function") cloudSaveReadChapter(`${currentBook}-${currentChapter}`, false);
      }
      // E remover marcação do livro se existir
      const bkIdx = state.readStatus.books.indexOf(currentBook);
      if (bkIdx > -1) {
        state.readStatus.books.splice(bkIdx, 1);
        if (typeof cloudSaveReadBook === "function") cloudSaveReadBook(currentBook, false);
      }
      
      // Agora marcar todos os outros versículos como lidos individualmente
      const totalVerses = document.querySelectorAll('.verse-item').length;
      for(let i=1; i<=totalVerses; i++) {
        const vk = `${currentBook}-${currentChapter}-${i}`;
        if (vk !== verseKey && !state.readStatus.verses.includes(vk)) {
          state.readStatus.verses.push(vk);
        }
      }
    }
    
    const index = state.readStatus.verses.indexOf(verseKey);
    if (index > -1) state.readStatus.verses.splice(index, 1);
    if (verseEl) verseEl.classList.remove("is-read");
    const cb = verseEl ? verseEl.querySelector(".verse-read-checkbox") : null;
    if (cb) cb.checked = false;
    
    if (typeof cloudSaveReadVerse === "function") cloudSaveReadVerse(verseKey, false);
  } else { // Marcando
    if (!state.readStatus.verses.includes(verseKey)) {
      state.readStatus.verses.push(verseKey);
    }
    if (verseEl) verseEl.classList.add("is-read");
    const cb = verseEl ? verseEl.querySelector(".verse-read-checkbox") : null;
    if (cb) cb.checked = true;
    
    if (typeof cloudSaveReadVerse === "function") cloudSaveReadVerse(verseKey, true);
  }
  
  saveStateToLocalStorage();
  
  // Check se todos os versículos do capítulo foram lidos agora
  const totalVerses = document.querySelectorAll('.verse-item').length;
  let allRead = true;
  for(let i=1; i<=totalVerses; i++) {
    if (!window.isVerseRead(`${currentBook}-${currentChapter}-${i}`)) {
      allRead = false;
      break;
    }
  }
  if (allRead && !window.isChapterRead(currentBook, currentChapter)) {
    state.readStatus.chapters.push(`${currentBook}-${currentChapter}`);
    if (typeof cloudSaveReadChapter === "function") cloudSaveReadChapter(`${currentBook}-${currentChapter}`, true);
    saveStateToLocalStorage();
    
    // Atualiza botoes
    const btnMarkBookRead = document.getElementById("btn-mark-book-read");
    if (btnMarkBookRead) {
      btnMarkBookRead.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"></path>
        </svg>
        <span class="btn-text">Desmarcar Capítulo</span>
      `;
      btnMarkBookRead.className = "btn-secondary btn-read-active";
    }
    
    const searchBookInput = document.getElementById("search-book-input");
    renderBooksList(searchBookInput ? searchBookInput.value : "");
  }
};

// Atualiza os botões do painel de configurações para refletir o estado
function updateSettingsButtonsUI() {
  // Temas
  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-theme-opt") === state.theme);
  });

  // Fontes
  document.querySelectorAll(".font-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-font") === state.fontFamily);
  });

  // Tamanhos de fonte
  document.querySelectorAll(".size-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-size-opt") === state.fontSize);
  });

  // Token Input
  const tokenInput = document.getElementById("token-input");
  if (tokenInput) {
    tokenInput.value = state.apiToken;
  }
}

// Inicializa os elementos da interface e escuta eventos
function initUI() {
  // Renderizar a lista de livros no sidebar
  renderBooksList();

  // Seletor de Tradução
  const translationSelect = document.getElementById("translation-select");
  if (translationSelect) {
    translationSelect.value = state.currentTranslation;
    // Sincronizar o custom select após definir o valor via JS
    if (typeof syncCustomSelect === "function") syncCustomSelect(translationSelect);
    translationSelect.addEventListener("change", (e) => {
      state.currentTranslation = e.target.value;
      saveStateToLocalStorage();
      loadActiveChapter();
      // Atualizar versículo do dia se ele estiver visível
      const vodContainer = document.getElementById("verse-of-day-container");
      if (vodContainer && vodContainer.style.display !== "none") {
        renderVerseOfTheDay();
      }
      // Sincroniza preferências com a nuvem
      if (typeof cloudSavePreferences === "function") cloudSavePreferences();
    });
  }


  // Escutar eventos de alteração de temas
  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.theme = btn.getAttribute("data-theme-opt");
      saveStateToLocalStorage();
      applyPreferences();
      showToast("Tema atualizado com sucesso!", "success");
      
      // Sincroniza preferências com a nuvem
      if (typeof cloudSavePreferences === "function") cloudSavePreferences();
    });
  });

  // Escutar alteração de família de fonte
  document.querySelectorAll(".font-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.fontFamily = btn.getAttribute("data-font");
      saveStateToLocalStorage();
      applyPreferences();
      
      // Sincroniza preferências com a nuvem
      if (typeof cloudSavePreferences === "function") cloudSavePreferences();
    });
  });

  // Escutar alteração de tamanho de fonte
  document.querySelectorAll(".size-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.fontSize = btn.getAttribute("data-size-opt");
      saveStateToLocalStorage();
      applyPreferences();
      
      // Sincroniza preferências com a nuvem
      if (typeof cloudSavePreferences === "function") cloudSavePreferences();
    });
  });

  // Salvamento do token de API
  const tokenInput = document.getElementById("token-input");
  if (tokenInput) {
    tokenInput.addEventListener("input", (e) => {
      state.apiToken = e.target.value.trim();
      saveStateToLocalStorage();
    });
  }

  // Filtro de Busca de Livros
  const searchBookInput = document.getElementById("search-book-input");
  if (searchBookInput) {
    searchBookInput.addEventListener("input", (e) => {
      renderBooksList(e.target.value);
    });
  }

  // Botão Modo Comparação
  const btnCompare = document.getElementById("btn-compare");
  if (btnCompare) {
    btnCompare.classList.toggle("active", state.comparisonActive);
    btnCompare.addEventListener("click", () => {
      state.comparisonActive = !state.comparisonActive;
      btnCompare.classList.toggle("active", state.comparisonActive);
      saveStateToLocalStorage();
      loadActiveChapter();
      showToast(state.comparisonActive ? "Modo comparação ativado!" : "Modo comparação desativado.", "success");
    });
  }

  // Botão Exportar Notas
  const btnExport = document.getElementById("btn-export-notes");
  if (btnExport) {
    btnExport.addEventListener("click", exportNotesToMarkdown);
  }

  // Abertura/Fechamento das Drawers (Modais Deslizantes)
  document.getElementById("btn-search").addEventListener("click", () => openDrawer("search-drawer"));
  document.getElementById("btn-favorites").addEventListener("click", () => {
    state.activeFilterVerseKey = null; // Limpa o filtro exato quando aberto manualmente
    openDrawer("favorites-drawer");
    renderFavoritesAndNotes();
  });
  
  // Filtro de Busca de Anotações/Notas no drawer de Favoritos
  const searchNotesInput = document.getElementById("search-notes-input");
  if (searchNotesInput) {
    searchNotesInput.addEventListener("input", () => {
      renderFavoritesAndNotes();
    });
  }

  document.getElementById("btn-settings").addEventListener("click", () => openDrawer("settings-drawer"));

  // Botão de Plano de Leitura
  const btnReadingPlan = document.getElementById("btn-reading-plan");
  if (btnReadingPlan) {
    btnReadingPlan.addEventListener("click", () => {
      openDrawer("reading-plan-drawer");
      renderReadingPlan();
    });
  }

  // Seletor de Plano de Leitura
  const planSelect = document.getElementById("plan-select");
  if (planSelect) {
    // Sincronizar valor inicial do estado
    if (state.readingPlans.activePlanId) {
      planSelect.value = state.readingPlans.activePlanId;
      if (typeof syncCustomSelect === "function") syncCustomSelect(planSelect);
    }
    planSelect.addEventListener("change", (e) => {
      state.readingPlans.activePlanId = e.target.value;
      saveStateToLocalStorage();
      renderReadingPlan();
    });
  }


  // Fechar gavetas
  document.querySelectorAll(".drawer-close, .overlay").forEach(el => {
    el.addEventListener("click", closeAllDrawers);
  });

  // VOD Show Logic
  document.addEventListener("click", (e) => {
    const vodShowBtn = e.target.closest("#btn-vod-show");
    if (vodShowBtn) {
      renderVerseOfTheDay();
    }
  });

  // Inicializar plano de leitura
  renderReadingPlan();

  // Eventos do Menu de Contexto do Versículo (Destaques e Anotações)
  initVerseContextMenu();

  // Lógica da Busca Bíblica (API Search)
  const searchForm = document.getElementById("search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      executeBibleSearch();
    });
  }

  // Marcar Livro como Lido
  const btnMarkBookRead = document.getElementById("btn-mark-book-read");
  if (btnMarkBookRead) {
    btnMarkBookRead.addEventListener("click", () => {
      const chapterKey = `${state.currentBook}-${state.currentChapter}`;
      const index = state.readStatus.chapters.indexOf(chapterKey);
      
      if (index > -1) {
        state.readStatus.chapters.splice(index, 1);
        showToast("Capítulo marcado como não lido.", "success");
        if (typeof cloudSaveReadChapter === "function") cloudSaveReadChapter(chapterKey, false);
      } else {
        state.readStatus.chapters.push(chapterKey);
        showToast("Capítulo marcado como lido!", "success");
        if (typeof cloudSaveReadChapter === "function") cloudSaveReadChapter(chapterKey, true);
      }
      
      saveStateToLocalStorage();
      loadActiveChapter(); // Recarrega para aplicar os estilos
      
      // Também renderizar novamente a lista de livros no sidebar
      const searchBookInput = document.getElementById("search-book-input");
      renderBooksList(searchBookInput ? searchBookInput.value : "");
    });
  }

  // Marcar Livro Inteiro como Lido
  const btnMarkEntireBookRead = document.getElementById("btn-mark-entire-book-read");
  if (btnMarkEntireBookRead) {
    btnMarkEntireBookRead.addEventListener("click", () => {
      const bookKey = state.currentBook;
      const index = state.readStatus.books.indexOf(bookKey);
      
      if (index > -1) {
        state.readStatus.books.splice(index, 1);
        showToast("Livro marcado como não lido.", "success");
        if (typeof cloudSaveReadBook === "function") cloudSaveReadBook(bookKey, false);
      } else {
        state.readStatus.books.push(bookKey);
        showToast("Livro marcado como lido!", "success");
        if (typeof cloudSaveReadBook === "function") cloudSaveReadBook(bookKey, true);
      }
      
      saveStateToLocalStorage();
      loadActiveChapter(); // Recarrega para aplicar os estilos
      
      const searchBookInput = document.getElementById("search-book-input");
      renderBooksList(searchBookInput ? searchBookInput.value : "");
    });
  }

  // Botões de navegação inferior
  document.getElementById("btn-prev-chapter").addEventListener("click", navigatePrevChapter);
  document.getElementById("btn-next-chapter").addEventListener("click", navigateNextChapter);

  // Responsividade: Botão para abrir o menu lateral no mobile
  const btnMenuMobile = document.getElementById("btn-mobile-menu");
  if (btnMenuMobile) {
    btnMenuMobile.addEventListener("click", () => {
      const sidebar = document.querySelector(".sidebar-pane");
      sidebar.classList.toggle("open");
      const overlay = document.getElementById("overlay");
      overlay.style.display = sidebar.classList.contains("open") ? "block" : "none";
    });
  }

  // Fechar sidebar mobile ao clicar no overlay
  document.getElementById("overlay").addEventListener("click", () => {
    const sidebar = document.querySelector(".sidebar-pane");
    if (sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
      document.getElementById("overlay").style.display = "none";
    }
  });

  // ============================================================
  // VERSÍCULO DO DIA — Botões de ação
  // ============================================================

  // Botão Fechar (dismiss)
  const vodDismissBtn = document.getElementById("vod-dismiss-btn");
  if (vodDismissBtn) {
    vodDismissBtn.addEventListener("click", () => {
      const container = document.getElementById("verse-of-day-container");
      if (container) {
        container.classList.add("vod-dismissing");
        setTimeout(() => {
          container.style.display = "none";
          container.classList.remove("vod-dismissing");
        }, 360);
      }
      // Salva que o usuário fechou hoje para não exibir novamente
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem("vod_dismissed_date", today);
    });
  }

  // Botão Ler Contexto — navega para o capítulo do versículo
  const vodNavBtn = document.getElementById("vod-navigate-btn");
  if (vodNavBtn) {
    vodNavBtn.addEventListener("click", () => {
      const container = document.getElementById("verse-of-day-container");
      if (!container || !container.dataset.verseBook) return;

      state.currentBook = container.dataset.verseBook;
      state.currentChapter = parseInt(container.dataset.verseChapter);
      saveStateToLocalStorage();

      loadActiveChapter().then(() => {
        setTimeout(() => {
          const verseNum = parseInt(container.dataset.verseNum);
          const verseEl = document.querySelector(`.verse-item[data-verse-number="${verseNum}"]`);
          const readerPane = document.getElementById("reader-pane");
          const stickyHeader = document.querySelector(".reader-header-sticky");
          if (verseEl && readerPane) {
            const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 100;
            const elementRect = verseEl.getBoundingClientRect();
            const paneRect = readerPane.getBoundingClientRect();
            const relativeTop = elementRect.top - paneRect.top + readerPane.scrollTop;
            readerPane.scrollTo({ top: relativeTop - headerHeight - 12, behavior: "smooth" });
            verseEl.style.backgroundColor = "var(--accent-muted)";
            setTimeout(() => { verseEl.style.backgroundColor = ""; }, 2000);
          }
        }, 350);
      });
    });
  }

  // Botão Compartilhar Versículo do Dia
  const vodShareBtn = document.getElementById("vod-share-btn");
  if (vodShareBtn) {
    vodShareBtn.addEventListener("click", () => {
      const container = document.getElementById("verse-of-day-container");
      if (container && container.dataset.verseText) {
        shareVerse(
          container.dataset.verseText,
          container.dataset.verseRef,
          container.dataset.versionLabel
        );
      }
    });
  }
}


// Fecha todas as gavetas/drawers
function closeAllDrawers() {
  document.querySelectorAll(".drawer").forEach(drawer => drawer.classList.remove("open"));
  document.getElementById("overlay").classList.remove("active");
  
  // Limpar campo de busca e resultados da busca ao fechar
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = "";
  }
  const searchNotesInput = document.getElementById("search-notes-input");
  if (searchNotesInput) {
    searchNotesInput.value = "";
  }
  state.activeFilterVerseKey = null; // Reseta filtro exato ao fechar as gavetas
  const resultsContainer = document.getElementById("search-results-container");
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 0; color: var(--text-muted); font-size: 14px;">
        Pesquise por palavras ou termos completos na versão ativa.
      </div>
    `;
  }
  
  // Se estiver no mobile, também fecha o sidebar
  if (window.innerWidth <= 768) {
    document.querySelector(".sidebar-pane").classList.remove("open");
    document.getElementById("overlay").style.display = "none";
  }
}

// Abre uma gaveta/drawer específica
function openDrawer(drawerId) {
  closeAllDrawers();
  document.getElementById(drawerId).classList.add("open");
  document.getElementById("overlay").classList.add("active");
}

// Mostra o Toast de notificação
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠'}</span>
    <span>${message}</span>
  `;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// Renderiza a lista de livros no sidebar, podendo filtrar por busca
function renderBooksList(filter = "") {
  const booksContainer = document.getElementById("books-list");
  if (!booksContainer) return;

  booksContainer.innerHTML = "";

  const filterNormalized = filter.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Agrupar livros por testamento
  const groups = {
    "VT": { name: "Antigo Testamento", books: [] },
    "NT": { name: "Novo Testamento", books: [] }
  };

  BIBLE_BOOKS.forEach(book => {
    const bookNameNormalized = book.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (filter === "" || bookNameNormalized.includes(filterNormalized) || book.abbrev.includes(filterNormalized)) {
      groups[book.testament].books.push(book);
    }
  });

  // Renderizar grupos
  Object.keys(groups).forEach(key => {
    const group = groups[key];
    if (group.books.length === 0) return;

    const groupDiv = document.createElement("div");
    groupDiv.className = "testament-group";
    groupDiv.innerHTML = `<div class="group-title">${group.name}</div>`;

    group.books.forEach(book => {
      const isBookRead = window.isBookRead(book.abbrev);
      const bookEl = document.createElement("div");
      bookEl.className = `book-item ${book.abbrev === state.currentBook ? "active" : ""}`;
      bookEl.innerHTML = `
        <span style="display: flex; align-items: center; gap: 6px;">
          ${book.name}
          ${isBookRead ? '<svg viewBox="0 0 24 24" width="14" height="14" stroke="var(--accent-color)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </span>
        <span class="book-meta">${book.chapters} cap.</span>
      `;
      bookEl.addEventListener("click", () => {
        selectBook(book.abbrev);
      });
      groupDiv.appendChild(bookEl);
    });

    booksContainer.appendChild(groupDiv);
  });
}

// Seleciona um livro e reconstrói o grid de capítulos
function selectBook(abbrev) {
  state.currentBook = abbrev;
  state.currentChapter = 1; // Reseta para o primeiro capítulo ao mudar de livro
  saveStateToLocalStorage();
  
  // Atualizar classe active na lista
  document.querySelectorAll(".book-item").forEach(el => el.classList.remove("active"));
  renderBooksList(document.getElementById("search-book-input").value);

  renderChaptersGrid();
  loadActiveChapter();
}

// Renderiza a grade de capítulos do livro ativo
function renderChaptersGrid() {
  const grid = document.getElementById("chapters-grid");
  if (!grid) return;

  grid.innerHTML = "";

  const bookData = BIBLE_BOOKS.find(b => b.abbrev === state.currentBook);
  if (!bookData) return;

  document.getElementById("chapters-grid-title").textContent = `Capítulos de ${bookData.name}`;

  for (let i = 1; i <= bookData.chapters; i++) {
    const btn = document.createElement("button");
    btn.className = `chapter-btn ${i === state.currentChapter ? "active" : ""}`;
    btn.textContent = i;
    btn.addEventListener("click", () => {
      state.currentChapter = i;
      saveStateToLocalStorage();

      document.querySelectorAll(".chapter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      loadActiveChapter();
      
      // No mobile, fecha o sidebar ao selecionar
      if (window.innerWidth <= 768) {
        document.querySelector(".sidebar-pane").classList.remove("open");
        document.getElementById("overlay").style.display = "none";
      }
    });
    grid.appendChild(btn);
  }
}

// Cache das traduções em memória para evitar fetches repetidos
const translationCache = {};

// Garante que a tradução está carregada na memória (compatível com protocolo file://)
async function ensureTranslationLoaded(version) {
  const v = String(version || "nvi").toLowerCase();
  const globalVarName = `BIBLE_DATA_${v.toUpperCase()}`;
  
  if (translationCache[v]) {
    return translationCache[v];
  }
  
  if (window[globalVarName]) {
    translationCache[v] = window[globalVarName];
    return translationCache[v];
  }
  
  // Carrega dinamicamente o arquivo JS correspondente à versão (evita bloqueios de CORS no file://)
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `./data/${v.toUpperCase()}.js`;
    script.onload = () => {
      if (window[globalVarName]) {
        translationCache[v] = window[globalVarName];
        resolve();
      } else {
        reject(new Error(`Dados globais ${globalVarName} não encontrados.`));
      }
    };
    script.onerror = (err) => {
      reject(new Error(`Não foi possível carregar a tradução ${v.toUpperCase()}.`));
    };
    document.head.appendChild(script);
  });
  
  return translationCache[v];
}

// Função para buscar capítulo localmente no JSON da tradução ativa
async function getChapterData(version, abbrev, chapter) {
  version = String(version || "nvi").toLowerCase();
  abbrev = String(abbrev || "gn").toLowerCase();
  chapter = parseInt(chapter) || 1;

  // Garantir que a tradução está carregada
  const bibleData = await ensureTranslationLoaded(version);
  
  // Encontrar o livro correspondente no BIBLE_BOOKS
  const bookIndex = BIBLE_BOOKS.findIndex(b => b.abbrev.toLowerCase() === abbrev);
  if (bookIndex === -1) {
    throw new Error(`Livro com abreviação "${abbrev}" não encontrado.`);
  }
  
  const bookDataInJson = bibleData[bookIndex];
  if (!bookDataInJson) {
    throw new Error(`Livro no índice ${bookIndex} não encontrado na tradução.`);
  }
  
  const chapterData = bookDataInJson.chapters[chapter - 1];
  if (!chapterData) {
    throw new Error(`Capítulo ${chapter} não encontrado no livro ${bookDataInJson.name}.`);
  }
  
  // Mapear versículos para o formato esperado pelo renderizador do DOM
  const verses = chapterData.map((text, idx) => {
    return {
      number: idx + 1,
      text: text
    };
  });
  
  const bookMeta = BIBLE_BOOKS[bookIndex];
  return {
    book: bookMeta,
    chapter: { number: chapter, verses: verses.length },
    verses: verses
  };
}

// Carrega o capítulo selecionado e renderiza na tela
async function loadActiveChapter() {
  const readerPane = document.getElementById("reader-pane");
  const versesContainer = document.getElementById("verses-container");
  
  // Limpar versículos anteriores e mostrar skeleton/carregando
  versesContainer.innerHTML = `
    <div style="padding: 40px 0; text-align: center; color: var(--text-secondary);">
      <div style="margin-bottom: 12px; font-size: 24px; animation: spin 1s linear infinite;">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>
      </div>
      Carregando escrituras sagradas...
    </div>
  `;

  // Renderizar a lista de livros e o grid de capítulos para garantir sincronia do livro ativo
  const searchBookInput = document.getElementById("search-book-input");
  renderBooksList(searchBookInput ? searchBookInput.value : "");
  renderChaptersGrid();

  // Rolar o livro ativo para visualização no menu lateral
  const activeBookEl = document.querySelector(".book-item.active");
  if (activeBookEl) {
    activeBookEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  try {
    const bookData = BIBLE_BOOKS.find(b => b.abbrev === state.currentBook);
    
    // Atualizar breadcrumbs
    const breadcrumbBook = document.getElementById("bc-book");
    const breadcrumbChapter = document.getElementById("bc-chapter");
    if (breadcrumbBook && breadcrumbChapter) {
      breadcrumbBook.textContent = bookData.name;
      breadcrumbChapter.textContent = `Capítulo ${state.currentChapter}`;
    }

    // Carregar a tradução principal
    const data = await getChapterData(state.currentTranslation, state.currentBook, state.currentChapter);
    
    // Atualizar título do capítulo e botão de marcar lido
    const chapterTitleEl = document.getElementById("chapter-title");
    const versionLabel = state.currentTranslation.toUpperCase();
    
    // Atualizar texto do botão de marcar capítulo como lido
    const btnMarkBookRead = document.getElementById("btn-mark-book-read");
    if (btnMarkBookRead) {
      const isChapterRead = window.isChapterRead(state.currentBook, state.currentChapter);
      btnMarkBookRead.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${isChapterRead ? '<path d="M18 6L6 18M6 6l12 12"></path>' : '<polyline points="20 6 9 17 4 12"></polyline>'}
        </svg>
        <span class="btn-text">${isChapterRead ? "Desmarcar Capítulo" : "Marcar Capítulo como Lido"}</span>
      `;
      btnMarkBookRead.className = isChapterRead ? "btn-secondary btn-read-active" : "btn-secondary";
    }

    // Atualizar texto do botão de marcar livro como lido
    const btnMarkEntireBookRead = document.getElementById("btn-mark-entire-book-read");
    if (btnMarkEntireBookRead) {
      const isBookReadFlag = window.isBookRead(state.currentBook);
      btnMarkEntireBookRead.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${isBookReadFlag ? '<path d="M18 6L6 18M6 6l12 12"></path>' : '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'}
        </svg>
        <span class="btn-text">${isBookReadFlag ? "Desmarcar Livro" : "Marcar Livro como Lido"}</span>
      `;
      btnMarkEntireBookRead.className = isBookReadFlag ? "btn-secondary btn-read-active" : "btn-secondary";
    }
    
    chapterTitleEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span>${bookData.name} ${state.currentChapter}</span>
        <span style="font-size: 14px; font-weight: 500; color: var(--text-muted); background-color: var(--bg-surface-hover); padding: 4px 10px; border-radius: 4px;">
          ${versionLabel} Local
        </span>
      </div>
      <button id="btn-vod-show" class="btn-icon" title="Versículo do Dia" aria-label="Versículo do Dia">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
        </svg>
      </button>
    `;

    // Atualizar Pills do cabeçalho
    document.getElementById("pill-book").textContent = bookData.name;
    document.getElementById("pill-chapter").textContent = state.currentChapter;

    // Renderizar versículos
    versesContainer.innerHTML = "";
    const compHeaderContainer = document.getElementById("comparison-header-container");
    if (compHeaderContainer) compHeaderContainer.innerHTML = "";
    
    if (state.comparisonActive) {
      // Carregar a tradução secundária para comparação
      const compData = await getChapterData(state.comparisonTranslation, state.currentBook, state.currentChapter);
      
      // Renderizar o cabeçalho da comparação
      const headerDiv = document.createElement("div");
      headerDiv.className = "comparison-header";
      headerDiv.innerHTML = `
        <div class="comparison-header-col">
          <span>Principal: ${state.currentTranslation.toUpperCase()}</span>
        </div>
        <div class="comparison-header-col">
          <span>Comparar com:</span>
          <select id="comparison-translation-select" class="translation-select" style="font-size:12px; padding: 4px 8px; margin-left: 6px;">
            <option value="acf">ACF - Corrigida e Fiel</option>
            <option value="ara">ARA - Revista e Atualizada</option>
            <option value="arc">ARC - Revista e Corrigida</option>
            <option value="as21">AS21 - Almeida Século 21</option>
            <option value="jfaa">JFAA - Ferreira de Almeida</option>
            <option value="kja">KJA - King James Atualizada</option>
            <option value="kjf">KJF - King James Fiel</option>
            <option value="naa">NAA - Nova Almeida Atualizada</option>
            <option value="nbv">NBV - Nova Bíblia Viva</option>
            <option value="ntlh">NTLH - Linguagem de Hoje</option>
            <option value="nvi">NVI - Nova Versão Internacional</option>
            <option value="nvt">NVT - Nova Versão Transformadora</option>
            <option value="tb">TB - Tradução Brasileira</option>
          </select>
        </div>
      `;
      if (compHeaderContainer) compHeaderContainer.appendChild(headerDiv);
      
      // Ajustar valor do seletor secundário e bind de evento
      const compSelect = headerDiv.querySelector("#comparison-translation-select");
      compSelect.value = state.comparisonTranslation;
      compSelect.addEventListener("change", (e) => {
        state.comparisonTranslation = e.target.value;
        saveStateToLocalStorage();
        loadActiveChapter();
      });
      
      // Combinar os versículos
      const totalVerses = Math.max(data.verses.length, compData.verses.length);
      for (let i = 0; i < totalVerses; i++) {
        const vPrimary = data.verses[i] || { number: i + 1, text: "" };
        const vSecondary = compData.verses[i] || { number: i + 1, text: "" };
        
        const rowDiv = document.createElement("div");
        rowDiv.className = "comparison-row";
        
        // Coluna Principal
        const keyPrimary = `${state.currentBook}-${state.currentChapter}-${vPrimary.number}`;
        const hlPrimary = state.highlights[keyPrimary] || "";
        const notePrimary = state.notes[keyPrimary] ? "has-note" : "";
        
        const primaryCol = document.createElement("div");
        primaryCol.className = `verse-item primary-col ${hlPrimary} ${notePrimary}`;
        primaryCol.setAttribute("data-verse-number", vPrimary.number);
        primaryCol.setAttribute("data-verse-key", keyPrimary);
        primaryCol.innerHTML = `
          <span class="verse-number">${vPrimary.number}</span>
          <span class="verse-text">${escapeHTML(vPrimary.text)}</span>
        `;
        if (state.notes[keyPrimary]) {
          addNoteButtonToVerse(primaryCol, keyPrimary);
        }
        primaryCol.addEventListener("click", (e) => {
          if (e.target.closest(".btn-verse-note")) return;
          e.stopPropagation();
          openVerseMenu(primaryCol, keyPrimary, vPrimary.number);
        });
        
        // Coluna Secundária
        const keySecondary = `${state.currentBook}-${state.currentChapter}-${vSecondary.number}`;
        const hlSecondary = state.highlights[keySecondary] || "";
        const noteSecondary = state.notes[keySecondary] ? "has-note" : "";
        
        const secondaryCol = document.createElement("div");
        secondaryCol.className = `verse-item secondary-col ${hlSecondary} ${noteSecondary}`;
        secondaryCol.setAttribute("data-verse-number", vSecondary.number);
        secondaryCol.setAttribute("data-verse-key", keySecondary);
        secondaryCol.innerHTML = `
          <span class="verse-number">${vSecondary.number}</span>
          <span class="verse-text">${escapeHTML(vSecondary.text)}</span>
        `;
        if (state.notes[keySecondary]) {
          addNoteButtonToVerse(secondaryCol, keySecondary);
        }
        secondaryCol.addEventListener("click", (e) => {
          if (e.target.closest(".btn-verse-note")) return;
          e.stopPropagation();
          openVerseMenu(secondaryCol, keySecondary, vSecondary.number);
        });
        
        rowDiv.appendChild(primaryCol);
        rowDiv.appendChild(secondaryCol);
        versesContainer.appendChild(rowDiv);
      }
    } else {
      // Renderizar versículos normalmente
      data.verses.forEach(v => {
        const verseKey = `${state.currentBook}-${state.currentChapter}-${v.number}`;
        const highlightClass = state.highlights[verseKey] || "";
        const hasNote = state.notes[verseKey] ? "has-note" : "";
        const isReadClass = window.isVerseRead(verseKey) ? "is-read" : "";

        const verseDiv = document.createElement("div");
        verseDiv.className = `verse-item ${highlightClass} ${hasNote} ${isReadClass}`;
        verseDiv.setAttribute("data-verse-number", v.number);
        verseDiv.setAttribute("data-verse-key", verseKey);
        
        verseDiv.innerHTML = `
          <input type="checkbox" class="verse-read-checkbox" ${window.isVerseRead(verseKey) ? 'checked' : ''} title="Marcar como lido" style="margin-right: 6px; cursor: pointer; accent-color: var(--accent-color);">
          <span class="verse-number">${v.number}</span>
          <span class="verse-text">${escapeHTML(v.text)}</span>
        `;

        // Checkbox click
        const checkbox = verseDiv.querySelector(".verse-read-checkbox");
        if (checkbox) {
          checkbox.addEventListener("change", (e) => {
            window.toggleVerseReadState(verseKey, verseDiv, e.target.checked);
          });
        }

        // Adicionar botão de nota clicável se tiver anotação
        if (state.notes[verseKey]) {
          addNoteButtonToVerse(verseDiv, verseKey);
        }

        // Clique no versículo para abrir menu (ignorar se clicou no botão de nota ou checkbox)
        verseDiv.addEventListener("click", (e) => {
          if (e.target.closest(".btn-verse-note")) return;
          if (e.target.classList.contains("verse-read-checkbox")) return;
          e.stopPropagation();
          openVerseMenu(verseDiv, verseKey, v.number);
        });

        versesContainer.appendChild(verseDiv);
      });
    }

    // Adicionar aos registros de histórico
    addToHistory(bookData.name, state.currentChapter);

    // O versículo do dia agora é aberto sob demanda via botão no cabeçalho.
    // Ele não é mais renderizado automaticamente aqui.


    // Scroll to top
    readerPane.scrollTop = 0;

    // Atualizar estado dos botões inferiores de navegação
    updateBottomNavigationUI();

  } catch (error) {
    console.error("Erro ao carregar capítulo:", error);
    showToast("Erro ao carregar os dados locais do capítulo.", "error");

    // Tela de Erro Amigável
    versesContainer.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; background-color: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); margin-top: 20px;">
        <h3 style="margin-bottom: 12px; color: var(--accent-color);">Erro ao carregar capítulo</h3>
        <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 15px;">
          Não foi possível carregar os arquivos locais do diretório <strong>./data/</strong>. Certifique-se de que os arquivos JS da Bíblia estão extraídos e nomeados corretamente na pasta de dados.
        </p>
      </div>
    `;
  }
}

// Navegar para um capítulo offline predefinido
window.navigateOffline = function(book, chapter) {
  state.currentBook = book;
  state.currentChapter = chapter;
  saveStateToLocalStorage();
  loadActiveChapter();
};

// Histórico de Leitura
function addToHistory(bookName, chapter) {
  // Remover duplicações recentes do mesmo capítulo
  state.history = state.history.filter(h => !(h.book === state.currentBook && h.chapter === chapter));
  
  // Inserir no topo
  state.history.unshift({
    book: state.currentBook,
    bookName: bookName,
    chapter: chapter,
    time: new Date().toISOString()
  });

  // Limitar histórico a 15 itens
  if (state.history.length > 15) {
    state.history.pop();
  }
  
  saveStateToLocalStorage();
  
  // Salva no histórico em nuvem se logado
  if (typeof cloudAddHistory === "function") cloudAddHistory(state.currentBook, chapter);
}

// Atualizar botões de navegação inferior (Voltar/Avançar capítulo)
function updateBottomNavigationUI() {
  const prevBtn = document.getElementById("btn-prev-chapter");
  const nextBtn = document.getElementById("btn-next-chapter");

  const bookData = BIBLE_BOOKS.find(b => b.abbrev === state.currentBook);
  const bookIndex = BIBLE_BOOKS.findIndex(b => b.abbrev === state.currentBook);

  // Anterior
  if (state.currentChapter === 1 && bookIndex === 0) {
    // Primeiro livro, primeiro capítulo: desabilitar anterior
    prevBtn.classList.add("disabled");
    prevBtn.querySelector(".nav-btn-text").textContent = "Início";
  } else {
    prevBtn.classList.remove("disabled");
    if (state.currentChapter > 1) {
      prevBtn.querySelector(".nav-btn-text").textContent = `${bookData.name} ${state.currentChapter - 1}`;
    } else {
      const prevBook = BIBLE_BOOKS[bookIndex - 1];
      prevBtn.querySelector(".nav-btn-text").textContent = `${prevBook.name} ${prevBook.chapters}`;
    }
  }

  // Próximo
  if (state.currentChapter === bookData.chapters && bookIndex === BIBLE_BOOKS.length - 1) {
    // Último livro, último capítulo: desabilitar próximo
    nextBtn.classList.add("disabled");
    nextBtn.querySelector(".nav-btn-text").textContent = "Fim";
  } else {
    nextBtn.classList.remove("disabled");
    if (state.currentChapter < bookData.chapters) {
      nextBtn.querySelector(".nav-btn-text").textContent = `${bookData.name} ${state.currentChapter + 1}`;
    } else {
      const nextBook = BIBLE_BOOKS[bookIndex + 1];
      nextBtn.querySelector(".nav-btn-text").textContent = `${nextBook.name} 1`;
    }
  }
}

// Lógica de navegar para trás
function navigatePrevChapter() {
  const bookIndex = BIBLE_BOOKS.findIndex(b => b.abbrev === state.currentBook);
  
  if (state.currentChapter > 1) {
    state.currentChapter--;
  } else if (bookIndex > 0) {
    const prevBook = BIBLE_BOOKS[bookIndex - 1];
    state.currentBook = prevBook.abbrev;
    state.currentChapter = prevBook.chapters;
  } else {
    return; // Primeiro capítulo da bíblia
  }

  saveStateToLocalStorage();
  loadActiveChapter();
}

// Lógica de navegar para frente
function navigateNextChapter() {
  const bookData = BIBLE_BOOKS.find(b => b.abbrev === state.currentBook);
  const bookIndex = BIBLE_BOOKS.findIndex(b => b.abbrev === state.currentBook);

  if (state.currentChapter < bookData.chapters) {
    state.currentChapter++;
  } else if (bookIndex < BIBLE_BOOKS.length - 1) {
    const nextBook = BIBLE_BOOKS[bookIndex + 1];
    state.currentBook = nextBook.abbrev;
    state.currentChapter = 1;
  } else {
    return; // Último capítulo da bíblia
  }

  saveStateToLocalStorage();
  loadActiveChapter();
}

// Menu Flutuante de Versículo (Destaques, notas, favoritos)
function initVerseContextMenu() {
  const menu = document.getElementById("verse-menu");

  // Esconder menu ao clicar fora
  document.addEventListener("click", () => {
    menu.style.display = "none";
    state.activeVerseKey = null;
  });

  // Impedir fechamento ao clicar dentro do menu
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Ações de Destaque (Cores)
  menu.querySelectorAll(".color-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      if (!state.activeVerseKey) return;

      const colorClass = dot.getAttribute("data-color-class");
      const verseEl = document.querySelector(`.verse-item[data-verse-key="${state.activeVerseKey}"]`);

      // Remover classes de cores antigas do versículo no DOM
      if (verseEl) {
        verseEl.classList.remove("hl-yellow", "hl-green", "hl-pink", "hl-blue", "hl-orange");
      }

      if (colorClass) {
        state.highlights[state.activeVerseKey] = colorClass;
        if (verseEl) verseEl.classList.add(colorClass);
        showToast("Versículo destacado!", "success");
        
        // Sincroniza com a nuvem
        if (typeof cloudSaveHighlight === "function") cloudSaveHighlight(state.activeVerseKey, colorClass);
      } else {
        // Remover destaque
        delete state.highlights[state.activeVerseKey];
        showToast("Destaque removido.", "success");
        
        // Sincroniza com a nuvem
        if (typeof cloudSaveHighlight === "function") cloudSaveHighlight(state.activeVerseKey, "");
      }

      saveStateToLocalStorage();
      menu.style.display = "none";
    });
  });

  // Ação de Favoritar/Marcar
  document.getElementById("menu-btn-favorite").addEventListener("click", () => {
    if (!state.activeVerseKey) return;

    const index = state.favorites.indexOf(state.activeVerseKey);
    if (index > -1) {
      state.favorites.splice(index, 1);
      showToast("Removido dos favoritos.", "success");
      
      // Sincroniza com a nuvem
      if (typeof cloudSaveFavorite === "function") cloudSaveFavorite(state.activeVerseKey, false);
    } else {
      state.favorites.push(state.activeVerseKey);
      showToast("Adicionado aos favoritos!", "success");
      
      // Sincroniza com a nuvem
      if (typeof cloudSaveFavorite === "function") cloudSaveFavorite(state.activeVerseKey, true);
    }

    saveStateToLocalStorage();
    menu.style.display = "none";
  });

  // Ação de Adicionar Nota/Anotação
  document.getElementById("menu-btn-note").addEventListener("click", () => {
    if (!state.activeVerseKey) return;

    openNoteEditor(state.activeVerseKey);
    menu.style.display = "none";
  });

  // Ação de Marcar como Lido
  document.getElementById("menu-btn-read").addEventListener("click", () => {
    if (!state.activeVerseKey) return;
    const verseEl = document.querySelector(`.verse-item[data-verse-key="${state.activeVerseKey}"]`);
    const isCurrentlyRead = window.isVerseRead(state.activeVerseKey);
    
    window.toggleVerseReadState(state.activeVerseKey, verseEl, !isCurrentlyRead);
    showToast(isCurrentlyRead ? "Versículo marcado como não lido." : "Versículo marcado como lido!", "success");
    
    menu.style.display = "none";
  });

  // Copiar Versículo
  document.getElementById("menu-btn-copy").addEventListener("click", () => {
    if (!state.activeVerseKey) return;

    const verseEl = document.querySelector(`.verse-item[data-verse-key="${state.activeVerseKey}"]`);
    if (verseEl) {
      const textToCopy = verseEl.querySelector(".verse-text").textContent;
      const refText = getVerseReferenceText(state.activeVerseKey);
      
      navigator.clipboard.writeText(`"${textToCopy}" (${refText})`).then(() => {
        showToast("Texto copiado para a área de transferência!", "success");
      }).catch(err => {
        showToast("Erro ao copiar texto.", "error");
      });
    }
    menu.style.display = "none";
  });

  // Compartilhar Versículo (Web Share API com fallback para clipboard)
  document.getElementById("menu-btn-share").addEventListener("click", async () => {
    if (!state.activeVerseKey) return;

    const verseEl = document.querySelector(`.verse-item[data-verse-key="${state.activeVerseKey}"]`);
    if (verseEl) {
      const verseText = verseEl.querySelector(".verse-text").textContent;
      const refText = getVerseReferenceText(state.activeVerseKey);
      await shareVerse(verseText, refText, state.currentTranslation.toUpperCase());
    }
    menu.style.display = "none";
  });
}


// Abre o menu flutuante em cima do versículo clicado
function openVerseMenu(element, verseKey, verseNumber) {
  state.activeVerseKey = verseKey;
  
  const menu = document.getElementById("verse-menu");
  menu.style.display = "flex";

  // Posicionar o menu próximo ao clique/elemento
  const rect = element.getBoundingClientRect();
  const readerRect = document.getElementById("reader-pane").getBoundingClientRect();
  
  // Calcular coordenadas relativas
  let top = rect.bottom + window.scrollY;
  let left = rect.left + window.scrollX;

  // Ajustar limites
  if (left + 220 > window.innerWidth) {
    left = window.innerWidth - 240;
  }
  
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  // Atualizar estado de "favorito" no botão do menu
  const isFav = state.favorites.includes(verseKey);
  const favBtn = document.getElementById("menu-btn-favorite");
  favBtn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    <span>${isFav ? "Remover Favorito" : "Favoritar"}</span>
  `;

  // Atualizar estado de "lido" no botão do menu
  const isRead = state.readStatus.verses.includes(verseKey);
  const readBtn = document.getElementById("menu-btn-read");
  readBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>${isRead ? "Marcar como Não Lido" : "Marcar como Lido"}</span>
  `;

  // Atualizar dot ativa de cor
  const activeColor = state.highlights[verseKey];
  menu.querySelectorAll(".color-dot").forEach(dot => {
    const isAct = (dot.getAttribute("data-color-class") === activeColor) || 
                  (!activeColor && !dot.getAttribute("data-color-class"));
    dot.classList.toggle("active", isAct);
  });
}

// Retorna uma string de referência formatada (ex: Provérbios 28:1)
function getVerseReferenceText(verseKey) {
  const parts = verseKey.split("-"); // book-chapter-verse
  const bookData = BIBLE_BOOKS.find(b => b.abbrev === parts[0]);
  return `${bookData ? bookData.name : parts[0]} ${parts[1]}:${parts[2]}`;
}

// Adiciona um botão de nota clicável dentro do versículo
function addNoteButtonToVerse(verseElement, verseKey) {
  const noteBtn = document.createElement("button");
  noteBtn.className = "btn-verse-note";
  noteBtn.setAttribute("title", "Ver anotação em Marcadores & Notas");
  noteBtn.setAttribute("aria-label", "Ver anotação deste versículo");
  noteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
  noteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openNotesDrawerFiltered(verseKey);
  });
  verseElement.appendChild(noteBtn);
}

// Abre a gaveta de Marcadores & Notas já filtrada para exibir um versículo específico
function openNotesDrawerFiltered(verseKey) {
  const refText = getVerseReferenceText(verseKey);
  
  // Preencher o campo de busca com a referência do versículo
  const searchNotesInput = document.getElementById("search-notes-input");
  if (searchNotesInput) {
    searchNotesInput.value = refText;
  }
  
  // Salvar a chave de filtro exato no estado
  state.activeFilterVerseKey = verseKey;
  
  // Abrir a gaveta de favoritos/anotações
  openDrawer("favorites-drawer");
  
  // Renderizar com o filtro já aplicado
  renderFavoritesAndNotes();
}

// Abre o modal/gaveta para escrever uma nota no versículo
async function openNoteEditor(verseKey) {
  // Tenta obter o texto do versículo do DOM ou dos dados offline
  let textVal = "";
  const verseEl = document.querySelector(`.verse-item[data-verse-key="${verseKey}"]`);
  if (verseEl) {
    textVal = verseEl.querySelector(".verse-text").textContent;
  } else {
    // Versículo não está no capítulo atual, buscar dos dados offline
    textVal = await getVerseTextLocal(verseKey);
  }
  const refText = getVerseReferenceText(verseKey);

  // Criar e abrir um container customizado ou usar modal/anotações
  openDrawer("favorites-drawer"); // focar na drawer de favoritos/anotações

  const listContainer = document.getElementById("annotations-container");
  
  // Guardar HTML atual
  const oldHTML = listContainer.innerHTML;

  // Renderizar o formulário temporário no topo da drawer
  listContainer.innerHTML = `
    <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="font-size: 13px; font-weight: 700; color: var(--accent-color); margin-bottom: 6px;">Anotação para ${refText}</div>
      <div style="font-size: 12px; color: var(--text-secondary); font-style: italic; margin-bottom: 12px;">"${textVal}"</div>
      <div class="note-editor-container">
        <textarea id="note-textarea-input" class="note-textarea" placeholder="Escreva seus pensamentos e revelações sobre este versículo...">${state.notes[verseKey] || ""}</textarea>
        <div class="btn-group">
          <button id="note-btn-cancel" class="btn-secondary">Cancelar</button>
          <button id="note-btn-save" class="btn-primary">Salvar Nota</button>
        </div>
      </div>
    </div>
    ${oldHTML}
  `;

  // Ouvintes de evento do editor de nota
  document.getElementById("note-btn-cancel").addEventListener("click", () => {
    renderFavoritesAndNotes();
  });

  document.getElementById("note-btn-save").addEventListener("click", () => {
    const noteText = document.getElementById("note-textarea-input").value.trim();
    // Re-buscar o elemento do versículo no DOM (pode ter mudado)
    const currentVerseEl = document.querySelector(`.verse-item[data-verse-key="${verseKey}"]`);
    
    if (noteText) {
      state.notes[verseKey] = noteText;
      if (currentVerseEl) {
        currentVerseEl.classList.add("has-note");
        // Adicionar botão de nota se não existir
        if (!currentVerseEl.querySelector(".btn-verse-note")) {
          addNoteButtonToVerse(currentVerseEl, verseKey);
        }
      }
      showToast("Nota salva!", "success");
      
      // Sincroniza nota com a nuvem
      if (typeof cloudSaveNote === "function") cloudSaveNote(verseKey, noteText);
    } else {
      delete state.notes[verseKey];
      if (currentVerseEl) {
        currentVerseEl.classList.remove("has-note");
        // Remover botão de nota se existir
        const noteBtn = currentVerseEl.querySelector(".btn-verse-note");
        if (noteBtn) noteBtn.remove();
      }
      showToast("Nota excluída.", "success");
      
      // Remove nota da nuvem
      if (typeof cloudSaveNote === "function") cloudSaveNote(verseKey, "");
    }

    saveStateToLocalStorage();
    renderFavoritesAndNotes();
  });
}

// Obtém o texto do versículo diretamente dos arquivos locais na memória
async function getVerseTextLocal(verseKey) {
  const parts = verseKey.split("-"); // book-chapter-verse
  const bookAbbrev = parts[0];
  const chapterNum = parseInt(parts[1]);
  const verseNum = parseInt(parts[2]);
  
  try {
    const v = String(state.currentTranslation || "nvi").toLowerCase();
    const globalVarName = `BIBLE_DATA_${v.toUpperCase()}`;
    let bibleData = window[globalVarName] || translationCache[v];
    
    if (!bibleData) {
      bibleData = await ensureTranslationLoaded(v);
    }
    
    const bookIndex = BIBLE_BOOKS.findIndex(b => b.abbrev.toLowerCase() === bookAbbrev.toLowerCase());
    if (bookIndex !== -1 && bibleData[bookIndex]) {
      const chapters = bibleData[bookIndex].chapters;
      if (chapters[chapterNum - 1] && chapters[chapterNum - 1][verseNum - 1]) {
        return chapters[chapterNum - 1][verseNum - 1];
      }
    }
  } catch (e) {
    console.error("Erro ao obter texto do versículo local:", e);
  }
  return "Texto não encontrado offline.";
}

// Renderiza a lista de Favoritos, Destaques e Anotações na Drawer
async function renderFavoritesAndNotes() {
  const container = document.getElementById("annotations-container");
  if (!container) return;

  container.innerHTML = "";

  // Reunir todas as chaves (highlights, notes, favorites)
  const allKeys = new Set([
    ...Object.keys(state.highlights),
    ...Object.keys(state.notes),
    ...state.favorites
  ]);

  if (allKeys.size === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 0; color: var(--text-muted); font-size: 14px;">
        Nenhum versículo destacado, favoritado ou com notas ainda. 
        <br/><br/>
        <small>Dica: Clique em qualquer versículo no leitor para marcá-lo.</small>
      </div>
    `;
    return;
  }

  // Ordenar chaves por Livro (ordem canônica), Capítulo e Versículo
  const sortedKeys = Array.from(allKeys).sort((a, b) => {
    const partsA = a.split("-");
    const partsB = b.split("-");
    
    const indexA = BIBLE_BOOKS.findIndex(bk => bk.abbrev === partsA[0]);
    const indexB = BIBLE_BOOKS.findIndex(bk => bk.abbrev === partsB[0]);
    
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    
    const chapA = parseInt(partsA[1]);
    const chapB = parseInt(partsB[1]);
    if (chapA !== chapB) {
      return chapA - chapB;
    }
    
    const vA = parseInt(partsA[2]);
    const vB = parseInt(partsB[2]);
    return vA - vB;
  });

  const searchInput = document.getElementById("search-notes-input");
  
  // Se o valor no input não for a referência do filtro ativo, limpamos o filtro de versículo específico
  if (state.activeFilterVerseKey) {
    const expectedRef = getVerseReferenceText(state.activeFilterVerseKey);
    if (!searchInput || searchInput.value !== expectedRef) {
      state.activeFilterVerseKey = null;
    }
  }

  const filterVal = searchInput ? searchInput.value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  let renderedCount = 0;

  for (const verseKey of sortedKeys) {
    // Se houver um filtro por versículo específico ativo, ignora todos os outros
    if (state.activeFilterVerseKey && verseKey !== state.activeFilterVerseKey) {
      continue;
    }

    const isFav = state.favorites.includes(verseKey);
    const highlight = state.highlights[verseKey];
    const noteText = state.notes[verseKey];

    // Obter o texto real do versículo de forma síncrona/assíncrona offline
    const verseText = await getVerseTextLocal(verseKey);
    const refText = getVerseReferenceText(verseKey);

    // Filtrar se houver termo de busca e não for um filtro por versículo específico
    if (!state.activeFilterVerseKey && filterVal) {
      const refTextNorm = refText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const verseTextNorm = verseText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const noteTextNorm = noteText ? noteText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
      
      if (!refTextNorm.includes(filterVal) && 
          !verseTextNorm.includes(filterVal) && 
          !noteTextNorm.includes(filterVal)) {
        continue;
      }
    }

    renderedCount++;

    const card = document.createElement("div");
    card.className = "annotation-card";
    
    let highlightColorStyle = "";
    if (highlight === "hl-yellow") highlightColorStyle = "border-left-color: #eab308;";
    else if (highlight === "hl-green") highlightColorStyle = "border-left-color: #22c55e;";
    else if (highlight === "hl-pink") highlightColorStyle = "border-left-color: #ec4899;";
    else if (highlight === "hl-blue") highlightColorStyle = "border-left-color: #3b82f6;";
    else if (highlight === "hl-orange") highlightColorStyle = "border-left-color: #f97316;";
    else if (isFav) highlightColorStyle = "border-left-color: var(--accent-color);";

    card.setAttribute("style", highlightColorStyle);

    card.innerHTML = `
      <div class="annotation-verse-ref">
        ${refText} ${isFav ? '❤️' : ''}
      </div>
      <div class="annotation-text">"${escapeHTML(verseText)}"</div>
      ${noteText ? `<div class="annotation-note"><strong>Nota:</strong> ${escapeHTML(noteText)}</div>` : ""}
      <div class="annotation-actions" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 8px;">
        <button class="annotation-btn-action btn-edit-note" style="font-weight: 600; color: var(--text-secondary); background-color: var(--bg-surface-hover); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Anotar</button>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn-go-reading btn-go-ref">Ler</button>
          <button class="btn-icon btn-delete-ref" title="Excluir marcação" style="color: #f43f5e; width: 32px; height: 32px; padding: 0; background-color: rgba(244, 63, 94, 0.1); border-radius: 6px; border: 1px solid rgba(244, 63, 94, 0.2); display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Ir para capítulo e focar no versículo correspondente
    card.querySelector(".btn-go-ref").addEventListener("click", () => {
      const parts = verseKey.split("-");
      const book = parts[0];
      const chapter = parseInt(parts[1]);
      const verseNum = parseInt(parts[2]);

      state.currentBook = book;
      state.currentChapter = chapter;
      saveStateToLocalStorage();
      
      loadActiveChapter().then(() => {
        setTimeout(() => {
          const verseEl = document.querySelector(`.verse-item[data-verse-number="${verseNum}"]`);
          const readerPane = document.getElementById("reader-pane");
          const stickyHeader = document.querySelector(".reader-header-sticky");
          if (verseEl && readerPane) {
            const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 100;
            const elementRect = verseEl.getBoundingClientRect();
            const paneRect = readerPane.getBoundingClientRect();
            const relativeTop = elementRect.top - paneRect.top + readerPane.scrollTop;
            const targetScrollTop = relativeTop - headerHeight - 12;
            readerPane.scrollTo({
              top: targetScrollTop,
              behavior: "smooth"
            });
            // Adicionar uma animação rápida de piscar
            verseEl.style.backgroundColor = "var(--accent-muted)";
            setTimeout(() => {
              verseEl.style.backgroundColor = "";
            }, 2000);
          }
        }, 300);
      });
      closeAllDrawers();
    });

    // Editar nota
    card.querySelector(".btn-edit-note").addEventListener("click", () => {
      openNoteEditor(verseKey);
    });

    // Excluir todas as marcações deste versículo
    card.querySelector(".btn-delete-ref").addEventListener("click", () => {
      if (confirm(`Deseja remover todas as marcações e notas do versículo ${refText}?`)) {
        // Remover highlights
        delete state.highlights[verseKey];
        // Remover notes
        delete state.notes[verseKey];
        // Remover favorites
        const favIndex = state.favorites.indexOf(verseKey);
        if (favIndex > -1) state.favorites.splice(favIndex, 1);

        // Atualizar o DOM se estiver na página atual
        const activeVerseEl = document.querySelector(`.verse-item[data-verse-key="${verseKey}"]`);
        if (activeVerseEl) {
          activeVerseEl.className = "verse-item";
          // Remover botão de nota se existir
          const noteBtn = activeVerseEl.querySelector(".btn-verse-note");
          if (noteBtn) noteBtn.remove();
        }

        saveStateToLocalStorage();
        renderFavoritesAndNotes();
        showToast("Marcações removidas.", "success");
      }
    });

    container.appendChild(card);
  }

  if (filterVal && renderedCount === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 0; color: var(--text-muted); font-size: 14px;">
        Nenhum resultado encontrado para "${escapeHTML(searchInput.value)}".
      </div>
    `;
  }
}

// Executa a busca textual local na tradução ativa
async function executeBibleSearch() {
  const input = document.getElementById("search-input");
  const query = input.value.trim();
  const resultsContainer = document.getElementById("search-results-container");

  if (!query) {
    showToast("Por favor, digite um termo para buscar.", "warning");
    return;
  }

  resultsContainer.innerHTML = `
    <div style="text-align: center; padding: 30px 0; color: var(--text-secondary);">
      <div style="margin-bottom: 8px; animation: spin 1s linear infinite;">⏳</div>
      Buscando na Bíblia Sagrada...
    </div>
  `;

  try {
    // Garantir que a tradução foi carregada
    const bibleData = await ensureTranslationLoaded(state.currentTranslation);
    
    // Realizar busca nos versículos
    const queryNorm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const foundVerses = [];
    
    bibleData.forEach((book, bookIdx) => {
      const bookMeta = BIBLE_BOOKS[bookIdx];
      book.chapters.forEach((chapter, chapIdx) => {
        const chapterNum = chapIdx + 1;
        chapter.forEach((verseText, verseIdx) => {
          const verseNum = verseIdx + 1;
          const verseNorm = verseText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (verseNorm.includes(queryNorm)) {
            foundVerses.push({
              book: { abbrev: bookMeta.abbrev, name: bookMeta.name },
              chapter: chapterNum,
              number: verseNum,
              text: verseText
            });
          }
        });
      });
    });
    
    const searchData = {
      occurrence: foundVerses.length,
      verses: foundVerses,
      isOffline: false
    };
    
    renderSearchResults(searchData, query);
  } catch (error) {
    console.error("Erro ao realizar busca local:", error);
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 30px 0; color: var(--text-muted);">
        Erro ao realizar busca local. Verifique se os arquivos JSON estão na pasta data.
      </div>
    `;
  }
}

// Renderiza os resultados da busca na Drawer
function renderSearchResults(data, query) {
  const container = document.getElementById("search-results-container");
  if (!container) return;

  container.innerHTML = "";

  if (!data.verses || data.verses.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 0; color: var(--text-muted);">
        Nenhum resultado encontrado para "${escapeHTML(query)}".
        ${data.isOffline ? `<br/><br/><small style="color: var(--text-muted);">Nota: Apenas buscando nos capítulos carregados offline (Gênesis 1, Salmos 23, Provérbios 28, João 3) devido ao limite da API.</small>` : ""}
      </div>
    `;
    return;
  }

  // Título com contagem
  const countDiv = document.createElement("div");
  countDiv.className = "search-count";
  countDiv.innerHTML = `
    Encontradas <strong>${data.occurrence}</strong> ocorrências para "${escapeHTML(query)}"
    ${data.isOffline ? ` (Busca Offline Local)` : ""}
  `;
  container.appendChild(countDiv);

  const listDiv = document.createElement("div");
  listDiv.className = "search-results";

  data.verses.forEach(v => {
    const resultItem = document.createElement("div");
    resultItem.className = "search-result-item";
    
    const bookName = v.book ? v.book.name : "Livro";
    const bookAbbrev = v.book ? v.book.abbrev : state.currentBook;

    resultItem.innerHTML = `
      <div class="result-ref">${bookName} ${v.chapter}:${v.number}</div>
      <div class="result-text">${highlightSearchText(v.text, query)}</div>
    `;

    // Clique para navegar ao versículo
    resultItem.addEventListener("click", () => {
      state.currentBook = bookAbbrev;
      state.currentChapter = v.chapter;
      saveStateToLocalStorage();
      
      // Ao carregar, vamos focar no leitor
      loadActiveChapter().then(() => {
        // Tentar rolar para o versículo específico
        setTimeout(() => {
          const verseEl = document.querySelector(`.verse-item[data-verse-number="${v.number}"]`);
          const readerPane = document.getElementById("reader-pane");
          const stickyHeader = document.querySelector(".reader-header-sticky");
          if (verseEl && readerPane) {
            const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 100;
            const elementRect = verseEl.getBoundingClientRect();
            const paneRect = readerPane.getBoundingClientRect();
            const relativeTop = elementRect.top - paneRect.top + readerPane.scrollTop;
            const targetScrollTop = relativeTop - headerHeight - 12;
            readerPane.scrollTo({
              top: targetScrollTop,
              behavior: "smooth"
            });
            // Adicionar uma animação rápida de piscar
            verseEl.style.backgroundColor = "var(--accent-muted)";
            setTimeout(() => {
              verseEl.style.backgroundColor = "";
            }, 2000);
          }
        }, 300);
      });

      closeAllDrawers();
    });

    listDiv.appendChild(resultItem);
  });

  container.appendChild(listDiv);
}

// Coloca tags de mark no termo buscado
function highlightSearchText(text, query) {
  if (!query) return escapeHTML(text);
  
  // Escapar caracteres especiais da regex
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  
  try {
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapeHTML(text).replace(regex, '<mark>$1</mark>');
  } catch (e) {
    return escapeHTML(text);
  }
}

// Utilitários de String
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Exporta os destaques e notas de estudo do usuário no formato Markdown
function exportNotesToMarkdown() {
  // Verificar se existem marcações ou notas
  const allKeys = new Set([
    ...Object.keys(state.highlights),
    ...Object.keys(state.notes),
    ...state.favorites
  ]);
  
  if (allKeys.size === 0) {
    showToast("Nenhuma anotação ou destaque encontrado para exportar.", "warning");
    return;
  }
  
  let mdContent = `# Bíblia Live - Minhas Anotações e Estudos\n`;
  mdContent += `Exportado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}\n\n`;
  mdContent += `---\n\n`;
  
  const favoritesList = [];
  const highlightsList = [];
  const notesList = [];
  
  allKeys.forEach(verseKey => {
    const parts = verseKey.split("-"); // book-chapter-verse
    const bookMeta = BIBLE_BOOKS.find(b => b.abbrev === parts[0]);
    const bookName = bookMeta ? bookMeta.name : parts[0];
    const refText = `${bookName} ${parts[1]}:${parts[2]}`;
    
    const isFav = state.favorites.includes(verseKey);
    const highlightColor = state.highlights[verseKey];
    const noteText = state.notes[verseKey];
    
    // Tentar obter o texto do versículo a partir do DOM se ele estiver em exibição, senão apenas a ref
    let verseText = "";
    const activeVerseEl = document.querySelector(`.verse-item[data-verse-key="${verseKey}"]`);
    if (activeVerseEl) {
      verseText = activeVerseEl.querySelector(".verse-text").textContent;
    }
    
    let itemText = `### ${refText} ${isFav ? '❤️' : ''}\n`;
    if (verseText) {
      itemText += `*Texto:* *"${verseText}"*\n\n`;
    }
    if (highlightColor) {
      let colorLabel = "Destaque";
      if (highlightColor === "hl-yellow") colorLabel = "Amarelo";
      else if (highlightColor === "hl-green") colorLabel = "Verde";
      else if (highlightColor === "hl-pink") colorLabel = "Rosa";
      else if (highlightColor === "hl-blue") colorLabel = "Azul";
      else if (highlightColor === "hl-orange") colorLabel = "Laranja";
      itemText += `* 🎨 **Marcação**: ${colorLabel}\n`;
    }
    if (noteText) {
      itemText += `* 📝 **Nota de Estudo**: ${noteText}\n`;
    }
    itemText += `\n`;
    
    if (noteText) notesList.push(itemText);
    else if (isFav) favoritesList.push(itemText);
    else highlightsList.push(itemText);
  });
  
  if (notesList.length > 0) {
    mdContent += `## 📝 Notas & Reflexões de Estudo\n\n`;
    mdContent += notesList.join("\n") + "\n";
  }
  
  if (favoritesList.length > 0) {
    mdContent += `## ❤️ Versículos Favoritados\n\n`;
    mdContent += favoritesList.join("\n") + "\n";
  }
  
  if (highlightsList.length > 0) {
    mdContent += `## 🎨 Versículos Destacados (Sem Notas)\n\n`;
    mdContent += highlightsList.join("\n") + "\n";
  }
  
  // Criar download automático
  const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `estudos_biblicos_${new Date().toISOString().split('T')[0]}.md`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast("Estudos exportados com sucesso em Markdown!", "success");
}

// Constante que define os Planos de Leitura
window.READING_PLANS = {
  gospels: {
    name: "Evangelhos em 30 Dias",
    description: "Leitura diária dos quatro Evangelhos (Mateus, Marcos, Lucas e João).",
    days: [
      { day: 1, label: "Mateus 1-3", book: "mt", chapter: 1 },
      { day: 2, label: "Mateus 4-6", book: "mt", chapter: 4 },
      { day: 3, label: "Mateus 7-9", book: "mt", chapter: 7 },
      { day: 4, label: "Mateus 10-12", book: "mt", chapter: 10 },
      { day: 5, label: "Mateus 13-15", book: "mt", chapter: 13 },
      { day: 6, label: "Mateus 16-18", book: "mt", chapter: 16 },
      { day: 7, label: "Mateus 19-21", book: "mt", chapter: 19 },
      { day: 8, label: "Mateus 22-24", book: "mt", chapter: 22 },
      { day: 9, label: "Mateus 25-26", book: "mt", chapter: 25 },
      { day: 10, label: "Mateus 27-28", book: "mt", chapter: 27 },
      { day: 11, label: "Marcos 1-3", book: "mc", chapter: 1 },
      { day: 12, label: "Marcos 4-6", book: "mc", chapter: 4 },
      { day: 13, label: "Marcos 7-9", book: "mc", chapter: 7 },
      { day: 14, label: "Marcos 10-12", book: "mc", chapter: 10 },
      { day: 15, label: "Marcos 13-16", book: "mc", chapter: 13 },
      { day: 16, label: "Lucas 1-3", book: "lc", chapter: 1 },
      { day: 17, label: "Lucas 4-6", book: "lc", chapter: 4 },
      { day: 18, label: "Lucas 7-9", book: "lc", chapter: 7 },
      { day: 19, label: "Lucas 10-12", book: "lc", chapter: 10 },
      { day: 20, label: "Lucas 13-15", book: "lc", chapter: 13 },
      { day: 21, label: "Lucas 16-18", book: "lc", chapter: 16 },
      { day: 22, label: "Lucas 19-21", book: "lc", chapter: 19 },
      { day: 23, label: "Lucas 22-24", book: "lc", chapter: 22 },
      { day: 24, label: "João 1-3", book: "jo", chapter: 1 },
      { day: 25, label: "João 4-6", book: "jo", chapter: 4 },
      { day: 26, label: "João 7-9", book: "jo", chapter: 7 },
      { day: 27, label: "João 10-12", book: "jo", chapter: 10 },
      { day: 28, label: "João 13-15", book: "jo", chapter: 13 },
      { day: 29, label: "João 16-18", book: "jo", chapter: 16 },
      { day: 30, label: "João 19-21", book: "jo", chapter: 19 }
    ]
  },
  proverbs: {
    name: "Sabedoria (Provérbios em 31 Dias)",
    description: "Leia um capítulo do Livro de Provérbios a cada dia do mês.",
    days: Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      label: `Provérbios ${i + 1}`,
      book: "pv",
      chapter: i + 1
    }))
  },
  "conhecendo-jesus": {
    name: "Conhecendo quem é Jesus",
    description: "Uma jornada de 10 dias focada na pessoa e na obra de Cristo.",
    days: [
      { day: 1, label: "João 1", book: "jo", chapter: 1 },
      { day: 2, label: "João 3", book: "jo", chapter: 3 },
      { day: 3, label: "João 6", book: "jo", chapter: 6 },
      { day: 4, label: "João 8", book: "jo", chapter: 8 },
      { day: 5, label: "João 10", book: "jo", chapter: 10 },
      { day: 6, label: "João 11", book: "jo", chapter: 11 },
      { day: 7, label: "João 14", book: "jo", chapter: 14 },
      { day: 8, label: "João 15", book: "jo", chapter: 15 },
      { day: 9, label: "João 19", book: "jo", chapter: 19 },
      { day: 10, label: "João 20", book: "jo", chapter: 20 }
    ]
  },
  "paz-excede": {
    name: "A paz que excede o entendimento",
    description: "Um plano de 5 dias focado em como lidar com a ansiedade à luz da Bíblia.",
    days: [
      { day: 1, label: "Filipenses 4", book: "fp", chapter: 4 },
      { day: 2, label: "Mateus 6", book: "mt", chapter: 6 },
      { day: 3, label: "Salmos 23", book: "sl", chapter: 23 },
      { day: 4, label: "Salmos 91", book: "sl", chapter: 91 },
      { day: 5, label: "João 14", book: "jo", chapter: 14 }
    ]
  },
  "caminho-da-volta": {
    name: "O Caminho da Volta",
    description: "Reflexões sobre experiências de retorno e transformação encontradas nas Escrituras (Plano SBB).",
    days: [
      { day: 1, label: "Lucas 5", book: "lc", chapter: 5 },
      { day: 2, label: "Lucas 15", book: "lc", chapter: 15 },
      { day: 3, label: "Jeremias 25", book: "jr", chapter: 25 },
      { day: 4, label: "Gênesis 33", book: "gn", chapter: 33 },
      { day: 5, label: "Atos 9", book: "at", chapter: 9 }
    ]
  },
  "tempo-com-palavra": {
    name: "Um tempo com a Palavra",
    description: "Especialmente planejado para pais e filhos compartilharem momentos de leitura (Plano SBB).",
    days: [
      { day: 1, label: "Provérbios 22", book: "pv", chapter: 22 },
      { day: 2, label: "Efésios 6", book: "ef", chapter: 6 },
      { day: 3, label: "Salmos 127", book: "sl", chapter: 127 },
      { day: 4, label: "Deuteronômio 6", book: "dt", chapter: 6 },
      { day: 5, label: "Colossenses 3", book: "cl", chapter: 3 }
    ]
  }
};

// Renderiza a gaveta do plano de leitura
function renderReadingPlan() {
  const planSelect = document.getElementById("plan-select");
  if (!planSelect) return;

  const planId = state.readingPlans ? state.readingPlans.activePlanId : "";
  planSelect.value = planId;

  const activePlanContainer = document.getElementById("active-plan-container");
  const noPlanSelectedMessage = document.getElementById("no-plan-selected-message");

  if (!planId || !window.READING_PLANS || !window.READING_PLANS[planId]) {
    activePlanContainer.style.display = "none";
    noPlanSelectedMessage.style.display = "block";
    return;
  }

  activePlanContainer.style.display = "block";
  noPlanSelectedMessage.style.display = "none";

  const plan = window.READING_PLANS[planId];
  document.getElementById("active-plan-title").textContent = plan.name;
  
  const descEl = document.getElementById("active-plan-description");
  if (descEl) {
    descEl.textContent = plan.description || "";
  }

  const totalDays = plan.days.length;
  let completedDays = 0;
  plan.days.forEach(d => {
    if (state.readingPlans && state.readingPlans.progress && state.readingPlans.progress[`${planId}-${d.day}`]) {
      completedDays++;
    }
  });

  const percentage = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  document.getElementById("active-plan-percentage").textContent = `${percentage}%`;
  document.getElementById("active-plan-progress").style.width = `${percentage}%`;
  document.getElementById("active-plan-stats").textContent = `${completedDays} de ${totalDays} dias concluídos`;

  const daysList = document.getElementById("reading-days-list");
  daysList.innerHTML = "";

  plan.days.forEach(d => {
    const isCompleted = !!(state.readingPlans && state.readingPlans.progress && state.readingPlans.progress[`${planId}-${d.day}`]);
    const card = document.createElement("div");
    card.className = `reading-day-card ${isCompleted ? 'completed' : ''}`;
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
        <input type="checkbox" id="check-${planId}-${d.day}" ${isCompleted ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-color);">
        <label for="check-${planId}-${d.day}" style="cursor: pointer; font-size: 14px; font-weight: 500; color: ${isCompleted ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${isCompleted ? 'line-through' : 'none'}; flex: 1;">
          Dia ${d.day}: ${d.label}
        </label>
      </div>
      <button class="btn-go-reading" data-book="${d.book}" data-chapter="${d.chapter}" data-label="${d.label}">
        Ler
      </button>
    `;

    // Evento do Checkbox
    const checkbox = card.querySelector(`#check-${planId}-${d.day}`);
    checkbox.addEventListener("change", (e) => {
      if (!state.readingPlans) {
        state.readingPlans = { activePlanId: planId, progress: {} };
      }
      if (!state.readingPlans.progress) {
        state.readingPlans.progress = {};
      }
      state.readingPlans.progress[`${planId}-${d.day}`] = e.target.checked;
      saveStateToLocalStorage();
      renderReadingPlan();
      
      // Sincroniza progresso do plano com a nuvem
      if (typeof cloudSaveReadingPlanDay === "function") {
        cloudSaveReadingPlanDay(planId, `${planId}-${d.day}`, e.target.checked);
      }
      
      if (e.target.checked) {
        showToast(`Dia ${d.day} marcado como concluído!`, "success");
      } else {
        showToast(`Dia ${d.day} desmarcado.`, "success");
      }
    });

    // Evento do Botão Ler
    const btnGo = card.querySelector(".btn-go-reading");
    btnGo.addEventListener("click", () => {
      const book = btnGo.getAttribute("data-book");
      const chapter = parseInt(btnGo.getAttribute("data-chapter"));
      const label = btnGo.getAttribute("data-label");
      
      state.currentBook = book;
      state.currentChapter = chapter;
      saveStateToLocalStorage();
      loadActiveChapter();
      closeAllDrawers();
      
      showToast(`Navegado para ${label}`, "success");
    });

    daysList.appendChild(card);
  });
}

function populatePlanSelect() {
  const planSelect = document.getElementById("plan-select");
  if (!planSelect) return;
  
  const currentVal = planSelect.value;
  planSelect.innerHTML = '<option value="">-- Escolha um Plano --</option>';
  
  if (window.READING_PLANS) {
    Object.keys(window.READING_PLANS).forEach(planId => {
      const plan = window.READING_PLANS[planId];
      const opt = document.createElement("option");
      opt.value = planId;
      opt.textContent = plan.name;
      planSelect.appendChild(opt);
    });
  }
  
  if (window.READING_PLANS && window.READING_PLANS[currentVal]) {
    planSelect.value = currentVal;
  }
  
  if (typeof updateCustomSelect === "function") {
    updateCustomSelect(planSelect);
  } else if (typeof syncCustomSelect === "function") {
    syncCustomSelect(planSelect);
  }
}

// Ouve as mudanças no select de planos
document.addEventListener("DOMContentLoaded", () => {
  populatePlanSelect(); // Inicializa com os planos locais se houver
  
  const planSelect = document.getElementById("plan-select");
  if (planSelect) {
    planSelect.addEventListener("change", (e) => {
      if (!state.readingPlans) {
        state.readingPlans = { activePlanId: "", progress: {} };
      }
      state.readingPlans.activePlanId = e.target.value;
      saveStateToLocalStorage();
      renderReadingPlan();
    });
  }
});


// ============================================================
// VERSÍCULO DO DIA
// ============================================================

// Lista curada de 94 versículos-chave que ciclam ao longo do ano
const VERSE_OF_THE_DAY_KEYS = [
  { book: "jo",  chapter: 3,   verse: 16 },
  { book: "sl",  chapter: 23,  verse: 1  },
  { book: "fp",  chapter: 4,   verse: 13 },
  { book: "rm",  chapter: 8,   verse: 28 },
  { book: "pv",  chapter: 3,   verse: 5  },
  { book: "mt",  chapter: 11,  verse: 28 },
  { book: "is",  chapter: 40,  verse: 31 },
  { book: "jr",  chapter: 29,  verse: 11 },
  { book: "sl",  chapter: 27,  verse: 1  },
  { book: "rm",  chapter: 8,   verse: 38 },
  { book: "jo",  chapter: 14,  verse: 6  },
  { book: "ef",  chapter: 2,   verse: 8  },
  { book: "fp",  chapter: 4,   verse: 7  },
  { book: "rm",  chapter: 12,  verse: 2  },
  { book: "gn",  chapter: 1,   verse: 1  },
  { book: "sl",  chapter: 119, verse: 105},
  { book: "mt",  chapter: 6,   verse: 33 },
  { book: "jo",  chapter: 15,  verse: 5  },
  { book: "is",  chapter: 43,  verse: 2  },
  { book: "sl",  chapter: 46,  verse: 1  },
  { book: "mt",  chapter: 28,  verse: 19 },
  { book: "rm",  chapter: 6,   verse: 23 },
  { book: "ef",  chapter: 4,   verse: 32 },
  { book: "tg",  chapter: 1,   verse: 17 },
  { book: "1jo", chapter: 4,   verse: 8  },
  { book: "at",  chapter: 1,   verse: 8  },
  { book: "pv",  chapter: 16,  verse: 3  },
  { book: "sl",  chapter: 37,  verse: 4  },
  { book: "mt",  chapter: 5,   verse: 16 },
  { book: "fp",  chapter: 1,   verse: 6  },
  { book: "rm",  chapter: 5,   verse: 8  },
  { book: "hb",  chapter: 11,  verse: 1  },
  { book: "is",  chapter: 26,  verse: 3  },
  { book: "sl",  chapter: 91,  verse: 1  },
  { book: "pv",  chapter: 18,  verse: 10 },
  { book: "jo",  chapter: 10,  verse: 10 },
  { book: "rm",  chapter: 10,  verse: 9  },
  { book: "ef",  chapter: 6,   verse: 10 },
  { book: "tg",  chapter: 4,   verse: 8  },
  { book: "sl",  chapter: 103, verse: 12 },
  { book: "pv",  chapter: 22,  verse: 6  },
  { book: "mt",  chapter: 22,  verse: 37 },
  { book: "jo",  chapter: 16,  verse: 33 },
  { book: "rm",  chapter: 15,  verse: 13 },
  { book: "ef",  chapter: 3,   verse: 20 },
  { book: "sl",  chapter: 34,  verse: 18 },
  { book: "pv",  chapter: 4,   verse: 23 },
  { book: "mt",  chapter: 7,   verse: 7  },
  { book: "jo",  chapter: 11,  verse: 25 },
  { book: "rm",  chapter: 1,   verse: 16 },
  { book: "gl",  chapter: 5,   verse: 22 },
  { book: "1co", chapter: 10,  verse: 13 },
  { book: "sl",  chapter: 145, verse: 3  },
  { book: "pv",  chapter: 12,  verse: 25 },
  { book: "mt",  chapter: 6,   verse: 14 },
  { book: "jo",  chapter: 13,  verse: 34 },
  { book: "rm",  chapter: 12,  verse: 18 },
  { book: "cl",  chapter: 3,   verse: 23 },
  { book: "1ts", chapter: 5,   verse: 17 },
  { book: "sl",  chapter: 139, verse: 14 },
  { book: "pv",  chapter: 19,  verse: 21 },
  { book: "mt",  chapter: 5,   verse: 44 },
  { book: "jo",  chapter: 8,   verse: 32 },
  { book: "rm",  chapter: 8,   verse: 1  },
  { book: "hb",  chapter: 12,  verse: 1  },
  { book: "sl",  chapter: 51,  verse: 10 },
  { book: "pv",  chapter: 14,  verse: 12 },
  { book: "mt",  chapter: 25,  verse: 40 },
  { book: "jo",  chapter: 17,  verse: 17 },
  { book: "rm",  chapter: 8,   verse: 37 },
  { book: "1pe", chapter: 5,   verse: 7  },
  { book: "sl",  chapter: 62,  verse: 1  },
  { book: "pv",  chapter: 10,  verse: 22 },
  { book: "mt",  chapter: 5,   verse: 8  },
  { book: "lc",  chapter: 1,   verse: 37 },
  { book: "mc",  chapter: 11,  verse: 24 },
  { book: "1co", chapter: 13,  verse: 4  },
  { book: "sl",  chapter: 118, verse: 24 },
  { book: "pv",  chapter: 27,  verse: 1  },
  { book: "jo",  chapter: 4,   verse: 24 },
  { book: "rm",  chapter: 8,   verse: 31 },
  { book: "2tm", chapter: 3,   verse: 16 },
  { book: "sl",  chapter: 1,   verse: 1  },
  { book: "pv",  chapter: 3,   verse: 6  },
  { book: "mt",  chapter: 19,  verse: 26 },
  { book: "jo",  chapter: 1,   verse: 1  },
  { book: "ef",  chapter: 2,   verse: 10 },
  { book: "1jo", chapter: 1,   verse: 9  },
  { book: "sl",  chapter: 16,  verse: 11 },
  { book: "pv",  chapter: 25,  verse: 11 },
  { book: "mt",  chapter: 5,   verse: 14 },
  { book: "jo",  chapter: 6,   verse: 35 },
  { book: "rm",  chapter: 8,   verse: 39 },
  { book: "is",  chapter: 41,  verse: 10 },
  { book: "sl",  chapter: 32,  verse: 8  },
  { book: "pv",  chapter: 17,  verse: 22 }
];

/**
 * Renderiza o card de Versículo do Dia acima do texto bíblico.
 * Determina o versículo de forma deterministicada com base no dia do ano.
 */
async function renderVerseOfTheDay() {
  const container = document.getElementById("verse-of-day-container");
  if (!container) return;

  // Removido o check de dismissedDate para que o botão sempre mostre o card.
  // if (dismissedDate === today) {
  //   container.style.display = "none";
  //   return;
  // }

  // Calcular o índice do versículo com base no dia do ano (determinístico)
  const startOfYear = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((new Date() - startOfYear) / (1000 * 60 * 60 * 24));
  const verseInfo = VERSE_OF_THE_DAY_KEYS[dayOfYear % VERSE_OF_THE_DAY_KEYS.length];

  try {
    // Carregar a tradução ativa (já deve estar em cache neste ponto)
    const bibleData = await ensureTranslationLoaded(state.currentTranslation);
    const bookIndex = BIBLE_BOOKS.findIndex(b => b.abbrev === verseInfo.book);
    const bookMeta = BIBLE_BOOKS[bookIndex];

    if (bookIndex === -1 || !bibleData[bookIndex]) {
      container.style.display = "none";
      return;
    }

    const chapterArr = bibleData[bookIndex].chapters[verseInfo.chapter - 1];
    if (!chapterArr || !chapterArr[verseInfo.verse - 1]) {
      container.style.display = "none";
      return;
    }

    const verseText  = chapterArr[verseInfo.verse - 1];
    const refText    = `${bookMeta.name} ${verseInfo.chapter}:${verseInfo.verse}`;
    const versionLbl = state.currentTranslation.toUpperCase();

    // Preencher os elementos do card
    const vodDate = document.getElementById("vod-date");
    const vodText = document.getElementById("vod-text");
    const vodRef  = document.getElementById("vod-reference");

    if (vodDate) {
      vodDate.textContent = new Date().toLocaleDateString("pt-BR", {
        weekday: "long", day: "numeric", month: "long"
      });
    }
    if (vodText) vodText.textContent = `"${verseText}"`;
    if (vodRef)  vodRef.textContent  = `— ${refText} (${versionLbl})`;

    // Armazenar dados no dataset para uso nos botões de ação
    container.dataset.verseBook    = verseInfo.book;
    container.dataset.verseChapter = verseInfo.chapter;
    container.dataset.verseNum     = verseInfo.verse;
    container.dataset.verseText    = verseText;
    container.dataset.verseRef     = refText;
    container.dataset.versionLabel = versionLbl;

    // Exibir o card com animação
    container.style.display = "block";
    container.style.animation = "none";
    // Forçar reflow para reiniciar a animação
    void container.offsetWidth;
    container.style.animation = "";

  } catch (err) {
    console.warn("Versículo do dia: erro ao carregar.", err);
    container.style.display = "none";
  }
}

// ============================================================
// COMPARTILHAR VERSÍCULO (Web Share API + fallback clipboard)
// ============================================================

/**
 * Compartilha um versículo usando a Web Share API do navegador.
 * Em navegadores sem suporte, copia para a área de transferência.
 * @param {string} verseText - Texto do versículo
 * @param {string} refText   - Referência (ex: João 3:16)
 * @param {string} versionLbl - Sigla da tradução (ex: NVI)
 */
async function shareVerse(verseText, refText, versionLbl) {
  const shareText  = `"${verseText}"\n— ${refText} (${versionLbl})`;
  const shareTitle = `Bíblia Live — ${refText}`;
  const shareUrl   = window.location.href;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      });
      // Não mostramos toast aqui — o sistema nativo já dá feedback
    } catch (err) {
      // AbortError = usuário cancelou. Para outros erros, fallback para clipboard
      if (err.name !== "AbortError") {
        await copyVerseToClipboard(shareText);
      }
    }
  } else {
    // Fallback: copiar para o clipboard
    await copyVerseToClipboard(shareText);
  }
}

/** Copia texto para clipboard e exibe toast de confirmação */
async function copyVerseToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Versículo copiado para a área de transferência!", "success");
  } catch (err) {
    showToast("Não foi possível copiar o texto.", "error");
  }
}

