// auth.js
// Lógica de Autenticação (Supabase Auth) e Sincronização de Dados na Nuvem

// Estado de sincronização atual
const syncState = {
  isLoggedIn: false,
  currentUser: null,
  hasPendingChanges: false,
  lastCloudError: null // último erro ao enviar alterações (para mensagens ao usuário)
};

let birthdatePicker = null;

// Ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
  initAuthUI();
  listenToAuthChanges();
  if (typeof fetchReadingPlansCatalog === "function") {
    fetchReadingPlansCatalog();
  }
});

// Ouve requisições de reset de senha na URL
function handlePasswordReset() {
  // O Supabase coloca os parâmetros no hash (#) ou na query (?)
  const paramsString = window.location.hash.includes("error=") 
    ? window.location.hash.substring(1) 
    : window.location.search.substring(1);
    
  const urlParams = new URLSearchParams(paramsString);
  const errorDesc = urlParams.get("error_description");
  
  if (errorDesc) {
    // Se o Supabase retornar um erro na URL (ex: link expirado ou já usado)
    const friendlyError = errorDesc.includes("expired") 
      ? "O link é inválido, expirou ou já foi utilizado. Solicite um novo." 
      : decodeURIComponent(errorDesc.replace(/\+/g, " "));
    showToast(friendlyError, "error");
    
    // Limpa a URL
    window.history.replaceState(null, document.title, window.location.pathname);
    return;
  }

  if (window.location.hash && window.location.hash.includes("type=recovery")) {
    showToast("Defina sua nova senha.", "success");
    const authModal = document.getElementById("auth-modal");
    if (authModal) {
      authModal.style.display = "flex";
      document.getElementById("overlay").classList.add("active");
      
      const loginSection = document.getElementById("auth-section-login");
      const registerSection = document.getElementById("auth-section-register");
      const forgotSection = document.getElementById("auth-section-forgot-password");
      const updatePasswordSection = document.getElementById("auth-section-update-password");
      
      if (loginSection) loginSection.style.display = "none";
      if (registerSection) registerSection.style.display = "none";
      if (forgotSection) forgotSection.style.display = "none";
      if (updatePasswordSection) updatePasswordSection.style.display = "block";
    }
  }
}

document.addEventListener("DOMContentLoaded", handlePasswordReset);

// ----------------------------------------------------
// Fila de sincronização (outbox)
// Toda escrita na nuvem passa por uma fila persistida no localStorage.
// Se a rede falhar, a operação fica guardada e é reenviada depois, na ordem original,
// sempre antes de baixar dados da nuvem — assim alterações locais nunca são sobrescritas.
// ----------------------------------------------------
const SYNC_OUTBOX_KEY = "bible_sync_outbox";
// Id do usuário dono dos dados locais. Ausente = dados anônimos (mesclados no primeiro login).
const SYNC_OWNER_KEY = "bible_sync_owner";

let outboxFlushPromise = null;

function loadOutbox() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_OUTBOX_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveOutbox(ops) {
  localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(ops));
}

// Limpa todos os dados locais que pertencem à conta (estado, fila e dono)
function clearLocalUserData() {
  localStorage.removeItem("bible_reader_state");
  localStorage.removeItem(SYNC_OUTBOX_KEY);
  localStorage.removeItem(SYNC_OWNER_KEY);
}

function canSyncWithCloud() {
  return !!(supabase && syncState.isLoggedIn && syncState.currentUser);
}

// Tabela ou coluna inexistente no banco: é configuração do Supabase desatualizada, que se resolve
// executando o SQL que falta. A alteração fica na fila (não é descartada) até lá.
function isSchemaCloudError(error) {
  return !!(error && typeof error.code === "string" && /^(PGRST20[45]|42P01|42703)$/.test(error.code));
}

// Erros que nunca se resolvem com nova tentativa (dado inválido, restrição violada, permissão)
function isPermanentCloudError(error) {
  return !!(error && typeof error.code === "string" && /^(22|23|42)/.test(error.code)) && !isSchemaCloudError(error);
}

// Mensagem de erro compreensível para o usuário
function describeCloudError(error) {
  if (isSchemaCloudError(error)) {
    return `O banco de dados na nuvem está desatualizado: ${error.message}. Execute os scripts da pasta supabase/ no Supabase.`;
  }
  return (error && error.message) || "Erro desconhecido.";
}

// Evita repetir o mesmo aviso de configuração a cada alteração
let schemaErrorNotified = false;

// Executa uma operação da fila. O Supabase não lança exceção: devolve { error }.
async function runCloudOp(op, userId) {
  const table = supabase.from(op.table);
  let query;
  if (op.action === "upsert") {
    const rows = (op.rows || [op.row]).map(row => ({ ...row, user_id: userId }));
    query = table.upsert(rows, { onConflict: op.onConflict });
  } else if (op.action === "insert") {
    query = table.insert({ ...op.row, user_id: userId });
  } else if (op.action === "delete") {
    query = table.delete().eq("user_id", userId);
    Object.entries(op.match || {}).forEach(([column, value]) => {
      query = query.eq(column, value);
    });
    if (op.like) query = query.like(op.like.column, op.like.pattern);
  } else {
    console.warn("Operação de sincronização desconhecida descartada:", op);
    return;
  }
  const { error } = await query;
  if (error) throw error;
}

// Envia as operações pendentes em ordem. Resolve true se a fila ficou vazia.
function flushOutbox() {
  if (!canSyncWithCloud()) return Promise.resolve(false);
  if (outboxFlushPromise) return outboxFlushPromise;

  const flushPromise = (async () => {
    const userId = syncState.currentUser.id;
    let ops = loadOutbox();
    while (ops.length > 0) {
      try {
        await runCloudOp(ops[0], userId);
      } catch (error) {
        if (!isPermanentCloudError(error)) {
          console.warn("Falha ao enviar alteração para a nuvem; ela ficará pendente:", error);
          syncState.lastCloudError = error;
          if (isSchemaCloudError(error) && !schemaErrorNotified) {
            schemaErrorNotified = true;
            showToast(describeCloudError(error), "error");
          }
          syncState.hasPendingChanges = true;
          updateSyncIndicator("pending");
          return false;
        }
        // Reenviar não adiantaria: descarta para não travar a fila
        console.error("Alteração rejeitada pelo servidor e descartada:", ops[0], error);
        showToast("Uma alteração foi rejeitada pelo servidor: " + (error.message || error.code), "error");
      }
      // Relê a fila: novas operações podem ter entrado durante o envio
      ops = loadOutbox().slice(1);
      saveOutbox(ops);
    }
    syncState.lastCloudError = null;
    if (syncState.hasPendingChanges) {
      syncState.hasPendingChanges = false;
      updateSyncIndicator("online");
    }
    return true;
  })();

  // Libera a trava ao terminar. Não usar finally dentro da função: com a fila vazia ela
  // termina de forma síncrona, antes da atribuição abaixo, e a trava ficaria presa para sempre.
  outboxFlushPromise = flushPromise;
  const release = () => {
    if (outboxFlushPromise === flushPromise) outboxFlushPromise = null;
  };
  flushPromise.then(release, release);
  return flushPromise;
}

// Enfileira operações e tenta enviá-las. Resolve true se tudo chegou à nuvem.
function cloudWrite(...ops) {
  if (!supabase) return Promise.resolve(false);
  // Sem conta vinculada os dados são apenas locais; serão mesclados no primeiro login
  if (!syncState.isLoggedIn && !localStorage.getItem(SYNC_OWNER_KEY)) return Promise.resolve(false);
  saveOutbox(loadOutbox().concat(ops));
  return flushOutbox();
}

// ----------------------------------------------------
// Funções individuais de salvamento para confirmação de leitura
// ----------------------------------------------------
function cloudSaveReadVerse(verseKey, isAdding) {
  return cloudWrite(isAdding
    ? { table: "read_verses", action: "upsert", onConflict: "user_id,verse_key", row: { verse_key: verseKey } }
    : { table: "read_verses", action: "delete", match: { verse_key: verseKey } });
}

// Marca vários versículos como lidos numa única requisição
function cloudSaveReadVerses(verseKeys) {
  if (!verseKeys || verseKeys.length === 0) return Promise.resolve(true);
  return cloudWrite({
    table: "read_verses",
    action: "upsert",
    onConflict: "user_id,verse_key",
    rows: verseKeys.map(key => ({ verse_key: key }))
  });
}

function cloudSaveReadBook(bookKey, isAdding) {
  if (isAdding) {
    return cloudWrite({ table: "read_books", action: "upsert", onConflict: "user_id,book_key", row: { book_key: bookKey } });
  }
  // Também desmarca todos os capítulos vinculados ao livro
  return cloudWrite(
    { table: "read_books", action: "delete", match: { book_key: bookKey } },
    { table: "read_chapters", action: "delete", like: { column: "chapter_key", pattern: `${bookKey}-%` } }
  );
}

function cloudSaveReadChapter(chapterKey, isAdding) {
  return cloudWrite(isAdding
    ? { table: "read_chapters", action: "upsert", onConflict: "user_id,chapter_key", row: { chapter_key: chapterKey } }
    : { table: "read_chapters", action: "delete", match: { chapter_key: chapterKey } });
}

// Marca vários capítulos como lidos numa única requisição
function cloudSaveReadChapters(chapterKeys) {
  if (!chapterKeys || chapterKeys.length === 0) return Promise.resolve(true);
  return cloudWrite({
    table: "read_chapters",
    action: "upsert",
    onConflict: "user_id,chapter_key",
    rows: chapterKeys.map(key => ({ chapter_key: key }))
  });
}

function cloudSaveReadingPlanDay(planId, dayKey, isCompleted) {
  return cloudWrite({
    table: "reading_plans",
    action: "upsert",
    onConflict: "user_id,plan_id,day_key",
    row: { plan_id: planId, day_key: dayKey, completed: isCompleted }
  });
}

async function fetchReadingPlansCatalog() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("reading_plans_catalog")
      .select("*")
      .order("created_at", { ascending: true });
      
    if (error) {
      console.error("Erro ao buscar catálogo de planos de leitura:", error);
      return;
    }
    
    if (data && data.length > 0) {
      const plansObj = {};
      data.forEach(plan => {
        plansObj[plan.plan_id] = {
          name: plan.name,
          description: plan.description,
          days: plan.days_data
        };
      });
      // Mesclar os planos do banco com os locais (reading_plans.js). Os locais prevalecem:
      // o banco só acrescenta planos novos, e um catálogo desatualizado não sobrescreve os corrigidos.
      window.READING_PLANS = { ...plansObj, ...(window.READING_PLANS || {}) };
      
      // Chamar a função para re-renderizar a gaveta caso ela esteja aberta
      if (typeof populatePlanSelect === "function") populatePlanSelect();
      if (typeof renderReadingPlan === "function") renderReadingPlan();
    }
  } catch (err) {
    console.error("Erro inesperado ao buscar catálogo de planos:", err);
  }
}

// Inicialização de Elementos de UI e Bindings de Evento
function initAuthUI() {
  const btnAuth = document.getElementById("btn-auth");
  const authModal = document.getElementById("auth-modal");
  const btnCloseAuthModal = document.getElementById("btn-close-auth-modal");
  const userDropdown = document.getElementById("user-dropdown");
  
  const linkToRegister = document.getElementById("link-to-register");
  const linkToLogin = document.getElementById("link-to-login");
  const loginSection = document.getElementById("auth-section-login");
  const registerSection = document.getElementById("auth-section-register");
  
  const forgotSection = document.getElementById("auth-section-forgot-password");
  const updatePasswordSection = document.getElementById("auth-section-update-password");
  const linkForgotPassword = document.getElementById("link-forgot-password");
  const linkBackToLogin = document.getElementById("link-back-to-login");
  const forgotForm = document.getElementById("forgot-password-form");
  const updatePasswordForm = document.getElementById("update-password-form");

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const btnGoogleLogin = document.getElementById("btn-google-login");
  const btnLogout = document.getElementById("btn-logout");
  const btnSyncNow = document.getElementById("btn-sync-now");
  const overlay = document.getElementById("overlay");

  if (!supabase) {
    // Se o Supabase não estiver configurado, desativar indicador e ocultar botões se necessário
    updateSyncIndicator("offline");
    if (btnAuth) btnAuth.title = "Modo Local (Banco de dados não configurado)";
    return;
  }

  // Abrir modal ou Toggle Dropdown
  if (btnAuth) {
    btnAuth.addEventListener("click", (e) => {
      e.stopPropagation();
      if (syncState.isLoggedIn) {
        userDropdown.style.display = userDropdown.style.display === "none" ? "flex" : "none";
      } else {
        openAuthModal();
      }
    });
  }

  // Fechar dropdown ao clicar fora
  document.addEventListener("click", () => {
    if (userDropdown) userDropdown.style.display = "none";
  });

  if (userDropdown) {
    userDropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  // Abrir Modal
  function openAuthModal() {
    authModal.style.display = "flex";
    overlay.classList.add("active");
    if (loginSection) loginSection.style.display = "block";
    if (registerSection) registerSection.style.display = "none";
    if (forgotSection) forgotSection.style.display = "none";
    if (updatePasswordSection) updatePasswordSection.style.display = "none";
  }

  // Fechar Modal
  function closeAuthModal() {
    authModal.style.display = "none";
    if (!document.querySelector(".drawer.open")) {
      overlay.classList.remove("active");
    }
  }

  if (btnCloseAuthModal) {
    btnCloseAuthModal.addEventListener("click", closeAuthModal);
  }

  // Alternar entre Login e Cadastro
  if (linkToRegister) {
    linkToRegister.addEventListener("click", (e) => {
      e.preventDefault();
      loginSection.style.display = "none";
      registerSection.style.display = "block";
    });
  }

  if (linkToLogin) {
    linkToLogin.addEventListener("click", (e) => {
      e.preventDefault();
      registerSection.style.display = "none";
      loginSection.style.display = "block";
    });
  }

  if (linkForgotPassword) {
    linkForgotPassword.addEventListener("click", (e) => {
      e.preventDefault();
      loginSection.style.display = "none";
      if (forgotSection) forgotSection.style.display = "block";
    });
  }

  if (linkBackToLogin) {
    linkBackToLogin.addEventListener("click", (e) => {
      e.preventDefault();
      if (forgotSection) forgotSection.style.display = "none";
      loginSection.style.display = "block";
    });
  }

  // Submissão do formulário de Esqueci a Senha
  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("forgot-email").value.trim();
      try {
        updateSyncIndicator("working");
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname
        });
        if (error) throw error;
        showToast("Link de recuperação enviado para seu e-mail!", "success");
        if (forgotSection) forgotSection.style.display = "none";
        if (loginSection) loginSection.style.display = "block";
      } catch (error) {
        console.error("Erro ao solicitar recuperação:", error);
        showToast(error.message || "Erro ao solicitar recuperação.", "error");
      } finally {
        updateSyncIndicator(syncState.isLoggedIn ? "online" : "offline");
      }
    });
  }

  // Submissão do formulário de Nova Senha (pós-recuperação)
  if (updatePasswordForm) {
    updatePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById("update-new-password").value;
      const confirmPassword = document.getElementById("update-confirm-password").value;

      if (newPassword !== confirmPassword) {
        showToast("As senhas não coincidem.", "error");
        return;
      }

      if (newPassword.length < 6) {
        showToast("A senha deve ter pelo menos 6 caracteres.", "error");
        return;
      }

      try {
        updateSyncIndicator("working");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        
        showToast("Senha redefinida com sucesso!", "success");
        closeAuthModal();
        
        // Remove hash from URL
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      } catch (error) {
        console.error("Erro ao redefinir senha:", error);
        showToast(error.message || "Erro ao redefinir senha.", "error");
      } finally {
        updateSyncIndicator(syncState.isLoggedIn ? "online" : "offline");
      }
    });
  }


  // Submissão do formulário de Login
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      try {
        updateSyncIndicator("working");
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) throw error;

        showToast("Login realizado com sucesso!", "success");
        closeAuthModal();
      } catch (error) {
        console.error("Erro no login:", error);
        showToast(error.message || "Erro ao realizar o login.", "error");
        updateSyncIndicator(syncState.isLoggedIn ? "online" : "offline");
      }
    });
  }

  // Submissão do formulário de Cadastro
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("register-email").value.trim();
      const password = document.getElementById("register-password").value;

      try {
        updateSyncIndicator("working");
        const { data, error } = await supabase.auth.signUp({ email, password });
        
        if (error) throw error;

        // Se a confirmação de e-mail estiver ativa no Supabase, avisa o usuário.
        // Caso contrário, ele já loga automaticamente.
        if (data.user && data.session === null) {
          showToast("Conta criada! Verifique seu e-mail para confirmação.", "success");
        } else {
          showToast("Conta criada e conectada com sucesso!", "success");
        }
        closeAuthModal();
      } catch (error) {
        console.error("Erro no cadastro:", error);
        showToast(error.message || "Erro ao criar conta.", "error");
        updateSyncIndicator(syncState.isLoggedIn ? "online" : "offline");
      }
    });
  }

  // Login com o Google
  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener("click", async () => {
      try {
        updateSyncIndicator("working");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
      } catch (error) {
        console.error("Erro ao entrar com Google:", error);
        showToast("Erro ao conectar com o Google.", "error");
        updateSyncIndicator(syncState.isLoggedIn ? "online" : "offline");
      }
    });
  }

  // Logout (Sair)
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      // Tentar enviar alterações pendentes antes de apagar os dados locais
      const flushed = await flushOutbox();
      if (!flushed && loadOutbox().length > 0) {
        const confirmed = confirm("Algumas alterações ainda não foram enviadas para a nuvem e serão perdidas ao sair.\n\nDeseja sair mesmo assim?");
        if (!confirmed) return;
      }

      // Limpeza forçada na memória local
      clearLocalUserData();

      // Feedback visual rápido
      if (typeof showToast === "function") showToast("Saindo da conta...", "success");
      
      // Tentar sair do Supabase e recarregar a página independentemente do resultado
      if (supabase) {
        supabase.auth.signOut().catch(err => console.warn(err)).finally(() => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    });
  }

  // Sincronizar manualmente agora
  if (btnSyncNow) {
    btnSyncNow.addEventListener("click", async () => {
      if (syncState.isLoggedIn) {
        try {
          await syncCloudData();
          showToast("Sincronização em nuvem concluída!", "success");
        } catch (error) {
          console.error("Erro na sincronização:", error);
          showToast("Erro ao sincronizar: " + describeCloudError(error), "error");
        }
      }
    });
  }

  // Ouvinte para upload da foto de perfil (dropdown)
  const avatarInput = document.getElementById("avatar-file-input");
  if (avatarInput) {
    avatarInput.addEventListener("change", (e) => {
      processAndSaveAvatar(e.target.files[0]);
    });
  }

  // Ouvinte para upload da foto de perfil (gaveta do perfil)
  const profileAvatarInput = document.getElementById("profile-avatar-file-input");
  if (profileAvatarInput) {
    profileAvatarInput.addEventListener("change", (e) => {
      processAndSaveAvatar(e.target.files[0]);
    });
  }

  // Inicializa o seletor de data customizado Flatpickr
  if (typeof flatpickr !== "undefined") {
    birthdatePicker = flatpickr("#profile-birthdate", {
      locale: "pt",
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      maxDate: new Date().toISOString().split("T")[0],
      disableMobile: "true",
      onOpen: function(selectedDates, dateStr, instance) {
        // Bloquear o scroll da drawer de perfil em segundo plano
        const drawerBody = document.querySelector("#profile-drawer .drawer-body");
        if (drawerBody) {
          drawerBody.style.overflow = "hidden";
        }
        setupCustomFlatpickrHeader(instance);
      },
      onClose: function(selectedDates, dateStr, instance) {
        // Reativar o scroll da drawer
        const drawerBody = document.querySelector("#profile-drawer .drawer-body");
        if (drawerBody) {
          drawerBody.style.overflow = "auto";
        }
      },
      onReady: function(selectedDates, dateStr, instance) {
        setupCustomFlatpickrHeader(instance);
      },
      onMonthChange: function(selectedDates, dateStr, instance) {
        setupCustomFlatpickrHeader(instance);
      },
      onYearChange: function(selectedDates, dateStr, instance) {
        setupCustomFlatpickrHeader(instance);
      }
    });
  }

  // Abrir a drawer de Perfil e carregar informações/estatísticas
  const btnOpenProfile = document.getElementById("btn-open-profile");
  if (btnOpenProfile) {
    btnOpenProfile.addEventListener("click", () => {
      if (syncState.isLoggedIn && syncState.currentUser) {
        // Fechar dropdown de usuário
        userDropdown.style.display = "none";
        
        // Abrir a drawer do perfil
        if (typeof openDrawer === "function") {
          openDrawer("profile-drawer");
        }
        
        // Alterar senha só faz sentido para contas com login por e-mail e senha (não Google)
        const user = syncState.currentUser;
        const hasPasswordLogin = (user.identities || []).some(identity => identity.provider === "email")
          || (user.app_metadata && user.app_metadata.provider === "email");
        const changePasswordForm = document.getElementById("change-password-form");
        if (changePasswordForm && changePasswordForm.parentElement) {
          changePasswordForm.parentElement.hidden = !hasPasswordLogin;
        }

        // Preencher e-mail readonly
        const profileEmail = document.getElementById("profile-email-readonly");
        if (profileEmail) {
          profileEmail.value = syncState.currentUser.email || "";
        }
        
        // Preencher nome completo e biografia
        const profileFullName = document.getElementById("profile-fullname");
        if (profileFullName) {
          profileFullName.value = state.fullName || "";
        }
        const profileBio = document.getElementById("profile-bio");
        if (profileBio) {
          profileBio.value = state.bio || "";
        }

        // Preencher campos adicionais
        const profileSocialName = document.getElementById("profile-socialname");
        if (profileSocialName) {
          profileSocialName.value = state.socialName || "";
        }
        if (birthdatePicker) {
          birthdatePicker.setDate(state.birthDate || "");
        }
        const profileMaritalStatus = document.getElementById("profile-maritalstatus");
        if (profileMaritalStatus) {
          profileMaritalStatus.value = state.maritalStatus || "";
          if (typeof syncCustomSelect === "function") syncCustomSelect(profileMaritalStatus);
        }
        const profileGender = document.getElementById("profile-gender");
        if (profileGender) {
          profileGender.value = state.gender || "";
          if (typeof syncCustomSelect === "function") syncCustomSelect(profileGender);
        }

        
        // Membro desde
        const profileMemberSince = document.getElementById("profile-member-since");
        if (profileMemberSince) {
          const createdAt = syncState.currentUser.created_at;
          if (createdAt) {
            const dateStr = new Date(createdAt).toLocaleDateString('pt-BR');
            profileMemberSince.textContent = `Membro desde: ${dateStr}`;
          } else {
            profileMemberSince.textContent = "Membro desde: --/--/----";
          }
        }
        
        // Estatísticas do usuário
        const statHighlights = document.getElementById("stat-highlights");
        if (statHighlights) {
          statHighlights.textContent = Object.keys(state.highlights || {}).length;
        }
        const statNotes = document.getElementById("stat-notes");
        if (statNotes) {
          statNotes.textContent = Object.keys(state.notes || {}).length;
        }
        const statFavorites = document.getElementById("stat-favorites");
        if (statFavorites) {
          statFavorites.textContent = (state.favorites || []).length;
        }
        const statHistory = document.getElementById("stat-history");
        if (statHistory) {
          statHistory.textContent = (state.history || []).length;
        }
      }
    });
  }

  // Enviar alterações do perfil
  const profileForm = document.getElementById("profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const profileFullNameVal = document.getElementById("profile-fullname").value.trim();
      const profileBioVal = document.getElementById("profile-bio").value.trim();
      const profileSocialNameVal = document.getElementById("profile-socialname").value.trim();
      const profileBirthDateVal = (birthdatePicker && birthdatePicker.selectedDates.length > 0) 
        ? birthdatePicker.formatDate(birthdatePicker.selectedDates[0], "Y-m-d") 
        : "";
      const profileMaritalStatusVal = document.getElementById("profile-maritalstatus").value;
      const profileGenderVal = document.getElementById("profile-gender").value;
      
      state.fullName = profileFullNameVal;
      state.bio = profileBioVal;
      state.socialName = profileSocialNameVal;
      state.birthDate = profileBirthDateVal;
      state.maritalStatus = profileMaritalStatusVal;
      state.gender = profileGenderVal;
      
      if (typeof updateGreeting === "function") updateGreeting();
      
      if (typeof saveStateToLocalStorage === "function") {
        saveStateToLocalStorage();
      }
      
      if (syncState.isLoggedIn) {
        const synced = await cloudSavePreferences();
        if (synced) {
          showToast("Perfil atualizado com sucesso!", "success");
        } else {
          showToast("Perfil salvo. Ele será enviado à nuvem quando a conexão voltar.", "error");
        }
      } else {
        showToast("Perfil salvo localmente!", "success");
      }
      
      if (typeof closeAllDrawers === "function") {
        closeAllDrawers();
      }
    });
  }

  // Mudar Senha do Usuário
  const changePasswordForm = document.getElementById("change-password-form");
  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      if (!syncState.isLoggedIn || !supabase) {
        showToast("Você precisa estar conectado para mudar a senha.", "error");
        return;
      }
      
      const currentPassword = document.getElementById("profile-current-password").value;
      const newPassword = document.getElementById("profile-new-password").value;
      const confirmPassword = document.getElementById("profile-confirm-password").value;
      
      if (newPassword !== confirmPassword) {
        showToast("As senhas não coincidem.", "error");
        return;
      }
      
      if (newPassword.length < 6) {
        showToast("A nova senha deve ter pelo menos 6 caracteres.", "error");
        return;
      }
      
      try {
        updateSyncIndicator("working");
        
        // 1. Re-autenticar o usuário para verificar se a senha atual está correta
        const email = syncState.currentUser.email;
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: email,
          password: currentPassword
        });
        
        if (reauthError) {
          throw new Error("Senha atual incorreta.");
        }
        
        // 2. Senha atual validada! Atualiza para a nova senha
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        
        showToast("Senha alterada com sucesso!", "success");
        
        // Limpar campos
        document.getElementById("profile-current-password").value = "";
        document.getElementById("profile-new-password").value = "";
        document.getElementById("profile-confirm-password").value = "";
        
        if (typeof closeAllDrawers === "function") {
          closeAllDrawers();
        }
      } catch (error) {
        console.error("Erro ao alterar senha:", error);
        showToast(error.message || "Erro ao alterar senha.", "error");
      } finally {
        updateSyncIndicator("online");
      }
    });
  }

  // Apagar Todos os Dados
  const btnWipeData = document.getElementById("btn-wipe-data");
  if (btnWipeData) {
    btnWipeData.addEventListener("click", async () => {
      const isConfirmed = confirm("ATENÇÃO: Você está prestes a excluir permanentemente todos os seus favoritos, notas, destaques, progresso e histórico de leitura, além do seu perfil e preferências.\n\nEssa ação não pode ser desfeita. Tem certeza de que deseja continuar?");
      
      if (isConfirmed) {
        if (syncState.isLoggedIn && syncState.currentUser && supabase) {
          try {
            updateSyncIndicator("working");
            const userId = syncState.currentUser.id;
            
            // Deletar do banco de dados (o Supabase devolve { error } em vez de lançar exceção)
            const tables = ["highlights", "notes", "favorites", "read_verses", "read_chapters", "read_books", "reading_plans", "reading_history", "user_preferences"];
            for (const table of tables) {
              const { error } = await supabase.from(table).delete().eq("user_id", userId);
              if (error) throw error;
            }

            // Limpar dados locais (inclusive alterações pendentes, que recriariam os dados)
            clearLocalUserData();
            
            alert("Todos os seus dados foram apagados com sucesso.");
            window.location.reload();
          } catch (error) {
            console.error("Erro ao apagar dados:", error);
            alert("Ocorreu um erro ao tentar apagar os dados da nuvem.");
            updateSyncIndicator("online");
          }
        } else {
          // Apenas local
          clearLocalUserData();
          alert("Todos os seus dados locais foram apagados.");
          window.location.reload();
        }
      }
    });
  }
}

// Processa e faz o upload do avatar (redimensiona para 96x96px JPEG e salva no estado/Supabase)
function processAndSaveAvatar(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Por favor, selecione uma imagem válida.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Redimensiona a foto para 96x96px para que o Base64 ocupe pouquíssimo espaço (~5KB)
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 96;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Converte para JPEG com boa compactação
      const base64Url = canvas.toDataURL("image/jpeg", 0.8);

      // Salva localmente
      state.avatarUrl = base64Url;
      if (typeof saveStateToLocalStorage === "function") {
        saveStateToLocalStorage();
      }

      // Atualiza os avatares da tela
      updateAvatarUI(base64Url);

      // Envia para a nuvem
      if (syncState.isLoggedIn) {
        cloudSavePreferences().then(synced => {
          if (synced) {
            showToast("Foto de perfil atualizada!", "success");
          } else {
            showToast("Foto salva. Ela será enviada à nuvem quando a conexão voltar.", "error");
          }
        });
      } else {
        updateSyncIndicator("offline");
        showToast("Foto de perfil salva localmente!", "success");
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}


// Resolvida quando o estado inicial de login é conhecido (sessão restaurada ou ausente)
let resolveAuthReady;
window.authReady = new Promise(resolve => { resolveAuthReady = resolve; });

// Ouvir alterações no estado de Autenticação do Supabase
function listenToAuthChanges() {
  if (!supabase) {
    resolveAuthReady();
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    // Não usar await aqui: chamar o Supabase dentro deste callback pode travar o SDK (deadlock).
    // O trabalho é despachado para fora do callback.
    setTimeout(() => handleAuthEvent(event, session), 0);
  });

  // Ao recuperar a conexão, reenviar alterações pendentes
  window.addEventListener("online", () => {
    if (canSyncWithCloud()) flushOutbox();
  });
}

// Usuário cujos dados já foram sincronizados nesta sessão da página
let lastSyncedUserId = null;

async function handleAuthEvent(event, session) {
  console.log(`Evento de Auth: ${event}`);

  if (session) {
    syncState.isLoggedIn = true;
    syncState.currentUser = session.user;

    // Atualizar UI do cabeçalho
    if (typeof updateGreeting === "function") {
      updateGreeting();
    } else {
      const userEmailEl = document.getElementById("user-email");
      if (userEmailEl) userEmailEl.textContent = session.user.email;
    }

    const btnAuth = document.getElementById("btn-auth");
    if (btnAuth) btnAuth.title = `Conectado como ${session.user.email}`;
    resolveAuthReady();

    // TOKEN_REFRESHED, USER_UPDATED e o SIGNED_IN reemitido ao voltar para a aba
    // não exigem nova sincronização completa: só reenvia o que estiver pendente.
    // Foto de perfil salva no aparelho: aparece mesmo se a sincronização falhar
    updateAvatarUI(state.avatarUrl);

    if (lastSyncedUserId === session.user.id) {
      flushOutbox();
      return;
    }
    lastSyncedUserId = session.user.id;

    try {
      await syncCloudData();
    } catch (err) {
      console.error("Erro durante o carregamento de dados após login:", err);
    }
  } else {
    lastSyncedUserId = null;
    syncState.isLoggedIn = false;
    syncState.currentUser = null;

    const btnAuth = document.getElementById("btn-auth");
    if (btnAuth) btnAuth.title = "Entrar / Criar Conta";
    resolveAuthReady();

    updateSyncIndicator("offline");

    // Se acabou de deslogar (SIGNED_OUT), recarregar a página para limpar o estado em memória
    if (event === "SIGNED_OUT") {
      clearLocalUserData();
      window.location.reload();
    }
  }
}

// Atualiza a cor e o status do indicador de sincronização visual
function updateSyncIndicator(status) {
  const indicator = document.getElementById("sync-indicator");
  const statusLabel = document.getElementById("user-sync-status");
  if (!indicator) return;

  indicator.className = "sync-indicator"; // reset

  if (status === "online") {
    indicator.classList.add("sync-online");
    indicator.title = "Conectado e Sincronizado";
    if (statusLabel) statusLabel.textContent = "🟢 Sincronizado";
  } else if (status === "working") {
    indicator.classList.add("sync-working");
    indicator.title = "Sincronizando com a nuvem...";
    if (statusLabel) statusLabel.textContent = "🟡 Sincronizando...";
  } else if (status === "pending") {
    indicator.classList.add("sync-working");
    indicator.title = "Alterações pendentes de envio";
    if (statusLabel) statusLabel.textContent = "🟠 Alterações pendentes (sem conexão)";
  } else {
    indicator.classList.add("sync-offline");
    indicator.title = "Modo Local / Desconectado";
    if (statusLabel) statusLabel.textContent = "⚫ Modo Local / Desconectado";
  }
}

// ==========================================================================
// FUNÇÕES DE SINCRONIZAÇÃO DE DADOS COM O SUPABASE
// ==========================================================================

let syncInFlight = null;

// Sincroniza com a nuvem: mescla dados anônimos (primeiro login), envia a fila pendente
// e só então baixa o estado da nuvem. Lança erro se não conseguir concluir.
function syncCloudData() {
  if (!supabase || !syncState.currentUser) return Promise.resolve();
  // NOTA: 'state' é a variável global de estado definida em app.js
  if (typeof state === "undefined") return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  const userId = syncState.currentUser.id;

  const syncPromise = (async () => {
    updateSyncIndicator("working");
    try {
      const owner = localStorage.getItem(SYNC_OWNER_KEY);
      if (owner !== userId) {
        if (owner) {
          // Dados locais de outra conta: a fila dela não pode ir para esta conta
          saveOutbox([]);
        } else {
          // Dados criados sem login: mescla com a nuvem uma única vez
          await uploadLocalDataToCloud(userId);
        }
        localStorage.setItem(SYNC_OWNER_KEY, userId);
      }

      // Nunca baixar da nuvem com alterações locais ainda não enviadas
      const flushed = await flushOutbox();
      if (!flushed) {
        throw syncState.lastCloudError || new Error("Existem alterações locais pendentes que não puderam ser enviadas.");
      }

      await pullDataFromCloud(userId);

      if (typeof saveStateToLocalStorage === "function") {
        saveStateToLocalStorage();
      }
      await refreshUIAfterSync();

      updateSyncIndicator("online");
    } catch (error) {
      console.error("Falha ao sincronizar dados com o Supabase:", error);
      updateSyncIndicator(loadOutbox().length > 0 ? "pending" : "offline");
      throw error;
    }
  })();

  // Mesma trava de flushOutbox: liberada só depois da atribuição
  syncInFlight = syncPromise;
  const release = () => {
    if (syncInFlight === syncPromise) syncInFlight = null;
  };
  syncPromise.then(release, release);
  return syncPromise;
}

// Re-renderiza a interface com os dados baixados, preservando a posição de leitura
async function refreshUIAfterSync() {
  const translationSelect = document.getElementById("translation-select");
  if (translationSelect && translationSelect.value !== state.currentTranslation) {
    translationSelect.value = state.currentTranslation;
    if (typeof syncCustomSelect === "function") syncCustomSelect(translationSelect);
  }

  if (typeof loadActiveChapter === "function") {
    const readerPane = document.getElementById("reader-pane");
    const previousScroll = readerPane ? readerPane.scrollTop : 0;
    await loadActiveChapter();
    if (readerPane) readerPane.scrollTop = previousScroll;
  }

  // Se o painel de favoritos/anotações estiver aberto, renderizar novamente
  const favDrawer = document.getElementById("favorites-drawer");
  if (favDrawer && favDrawer.classList.contains("open") && typeof renderFavoritesAndNotes === "function") {
    renderFavoritesAndNotes();
  }
  // Atualizar planos de leitura se abertos
  const planDrawer = document.getElementById("reading-plan-drawer");
  if (planDrawer && planDrawer.classList.contains("open") && typeof renderReadingPlan === "function") {
    renderReadingPlan();
  }
}

// Upsert em lotes, verificando o erro de cada lote
async function upsertInChunks(table, rows, onConflict) {
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict });
    if (error) throw error;
  }
}

// Envia para a nuvem os dados criados sem login (Highlights, Notes, Favorites, Leituras, Planos).
// Usado apenas no primeiro login do aparelho; depois disso toda alteração passa pela fila.
async function uploadLocalDataToCloud(userId) {
  if (!state) return;

  const readStatus = state.readStatus || {};
  const progress = (state.readingPlans && state.readingPlans.progress) || {};

  await upsertInChunks("highlights",
    Object.entries(state.highlights || {}).map(([key, val]) => ({ user_id: userId, verse_key: key, color_class: val })),
    "user_id,verse_key");

  await upsertInChunks("notes",
    Object.entries(state.notes || {}).map(([key, val]) => ({ user_id: userId, verse_key: key, content: val })),
    "user_id,verse_key");

  await upsertInChunks("favorites",
    (state.favorites || []).map(key => ({ user_id: userId, verse_key: key })),
    "user_id,verse_key");

  await upsertInChunks("read_verses",
    (readStatus.verses || []).map(key => ({ user_id: userId, verse_key: key })),
    "user_id,verse_key");

  await upsertInChunks("read_chapters",
    (readStatus.chapters || []).map(key => ({ user_id: userId, chapter_key: key })),
    "user_id,chapter_key");

  await upsertInChunks("read_books",
    (readStatus.books || []).map(key => ({ user_id: userId, book_key: key })),
    "user_id,book_key");

  // A chave no localStorage é 'planId-dayNumber', e salvamos se está completed (boolean)
  await upsertInChunks("reading_plans",
    Object.entries(progress).map(([key, val]) => {
      const lastDashIndex = key.lastIndexOf("-");
      const planId = lastDashIndex > 0 ? key.substring(0, lastDashIndex) : key;
      return { user_id: userId, plan_id: planId, day_key: key, completed: !!val };
    }),
    "user_id,plan_id,day_key");

  // NOTA: O histórico não é enviado (não tem chave única e geraria duplicatas), e as
  // preferências (user_preferences) também não: isso sobrescreveria o perfil da nuvem
  // com dados locais vazios num aparelho novo. Elas vão via cloudSavePreferences().
}

// Tamanho de página das consultas. O Supabase limita cada resposta a 1000 linhas (max_rows).
const CLOUD_PAGE_SIZE = 1000;

// Busca todas as linhas do usuário numa tabela, paginando além do limite do servidor
async function fetchAllUserRows(table, columns, userId) {
  const rows = [];
  for (let from = 0; ; from += CLOUD_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order("id")
      .range(from, from + CLOUD_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < CLOUD_PAGE_SIZE) return rows;
  }
}

// Puxa os dados da nuvem para preencher o estado local da aplicação.
// Tudo é baixado antes de alterar o estado: se qualquer consulta falhar, o estado local fica intacto.
async function pullDataFromCloud(userId) {
  const [
    highlights, notes, favorites, readVerses, readChapters, readBooks, plans, historyResult, prefResult
  ] = await Promise.all([
    fetchAllUserRows("highlights", "verse_key, color_class", userId),
    fetchAllUserRows("notes", "verse_key, content", userId),
    fetchAllUserRows("favorites", "verse_key", userId),
    fetchAllUserRows("read_verses", "verse_key", userId),
    fetchAllUserRows("read_chapters", "chapter_key", userId),
    fetchAllUserRows("read_books", "book_key", userId),
    fetchAllUserRows("reading_plans", "plan_id, day_key, completed", userId),
    // Histórico ordenado pelo lido mais recentemente
    supabase.from("reading_history")
      .select("book_code, chapter, read_at")
      .eq("user_id", userId)
      .order("read_at", { ascending: false })
      .limit(100),
    supabase.from("user_preferences")
      .select("theme, font_family, font_size, current_translation, avatar_url, full_name, bio, social_name, birth_date, marital_status, gender")
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  if (historyResult.error) throw historyResult.error;
  if (prefResult.error) throw prefResult.error;

  // 1. Marcações, notas e favoritos
  state.highlights = {};
  highlights.forEach(row => { state.highlights[row.verse_key] = row.color_class; });

  state.notes = {};
  notes.forEach(row => { state.notes[row.verse_key] = row.content; });

  state.favorites = favorites.map(row => row.verse_key);

  // 2. Status de leitura
  state.readStatus = {
    verses: readVerses.map(row => row.verse_key),
    chapters: readChapters.map(row => row.chapter_key),
    books: readBooks.map(row => row.book_key)
  };

  // 3. Planos de leitura (o plano ativo continua sendo o escolhido neste aparelho)
  const activePlanId = (state.readingPlans && state.readingPlans.activePlanId) || "";
  state.readingPlans = { activePlanId, progress: {} };
  plans.forEach(row => {
    state.readingPlans.progress[row.day_key] = row.completed;
    if (row.plan_id && !state.readingPlans.activePlanId) {
      state.readingPlans.activePlanId = row.plan_id;
    }
  });

  // 4. Histórico: o banco guarda uma linha por visita, então mantém só a mais recente de cada capítulo
  state.history = [];
  const seenChapters = new Set();
  (historyResult.data || []).forEach(row => {
    const chapterKey = `${row.book_code}-${row.chapter}`;
    if (seenChapters.has(chapterKey) || state.history.length >= 15) return;
    seenChapters.add(chapterKey);
    // Procurar nome amigável do livro
    const bookObj = typeof BIBLE_BOOKS !== "undefined" ? BIBLE_BOOKS.find(b => b.abbrev === row.book_code) : null;
    state.history.push({
      book: row.book_code,
      bookName: bookObj ? bookObj.name : row.book_code.toUpperCase(),
      chapter: row.chapter,
      time: row.read_at
    });
  });

  // 5. Preferências do usuário
  const pref = prefResult.data;
  if (pref) {
    state.theme = pref.theme || state.theme;
    state.fontFamily = pref.font_family || state.fontFamily;
    state.fontSize = pref.font_size || state.fontSize;
    state.currentTranslation = pref.current_translation || state.currentTranslation;
    state.avatarUrl = pref.avatar_url || "";
    state.fullName = pref.full_name || "";
    state.bio = pref.bio || "";
    state.socialName = pref.social_name || "";
    state.birthDate = pref.birth_date || "";
    state.maritalStatus = pref.marital_status || "";
    state.gender = pref.gender || "";

    if (typeof updateGreeting === "function") updateGreeting();

    // Aplicar as preferências baixadas no layout do app
    if (typeof applyPreferences === "function") {
      applyPreferences();
    }
  }
  // Atualiza a exibição da foto de perfil (a local, se não houver prefs no Supabase)
  updateAvatarUI(state.avatarUrl);
}

// ==========================================================================
// FUNÇÕES AUXILIARES DE SINCRONIZAÇÃO EM TEMPO REAL (Para usar em app.js)
// Todas passam pela fila (cloudWrite) e resolvem true quando a alteração chegou à nuvem.
// ==========================================================================

// Envia uma única alteração de marcação
function cloudSaveHighlight(verseKey, colorClass) {
  return cloudWrite(colorClass
    ? { table: "highlights", action: "upsert", onConflict: "user_id,verse_key", row: { verse_key: verseKey, color_class: colorClass } }
    : { table: "highlights", action: "delete", match: { verse_key: verseKey } });
}

// Envia uma única nota
function cloudSaveNote(verseKey, content) {
  const text = content ? content.trim() : "";
  return cloudWrite(text
    ? { table: "notes", action: "upsert", onConflict: "user_id,verse_key", row: { verse_key: verseKey, content: text } }
    : { table: "notes", action: "delete", match: { verse_key: verseKey } });
}

// Envia uma única alteração de favorito
function cloudSaveFavorite(verseKey, isAdding) {
  return cloudWrite(isAdding
    ? { table: "favorites", action: "upsert", onConflict: "user_id,verse_key", row: { verse_key: verseKey } }
    : { table: "favorites", action: "delete", match: { verse_key: verseKey } });
}

// Envia uma navegação de histórico
function cloudAddHistory(book, chapter) {
  return cloudWrite({
    table: "reading_history",
    action: "insert",
    row: { book_code: book, chapter: chapter, read_at: new Date().toISOString() }
  });
}

// Envia as preferências visuais e os dados do perfil
function cloudSavePreferences() {
  return cloudWrite({
    table: "user_preferences",
    action: "upsert",
    onConflict: "user_id",
    row: {
      theme: state.theme,
      font_family: state.fontFamily,
      font_size: state.fontSize,
      current_translation: state.currentTranslation,
      avatar_url: state.avatarUrl || null,
      full_name: state.fullName || null,
      bio: state.bio || null,
      social_name: state.socialName || null,
      birth_date: state.birthDate || null,
      marital_status: state.maritalStatus || null,
      gender: state.gender || null
    }
  });
}

// Atualiza as imagens de avatar na interface
function updateAvatarUI(base64Url) {
  const avatarHeader = document.getElementById("user-avatar-img");
  const avatarDropdown = document.getElementById("dropdown-avatar-img");
  const avatarProfile = document.getElementById("profile-avatar-img");
  const avatarSvg = document.getElementById("user-avatar-svg");

  if (base64Url) {
    if (avatarHeader) {
      avatarHeader.src = base64Url;
      avatarHeader.style.display = "block";
    }
    if (avatarSvg) avatarSvg.style.display = "none";
    if (avatarProfile) avatarProfile.src = base64Url;
    if (avatarDropdown) avatarDropdown.src = base64Url;
  } else {
    if (avatarSvg) avatarSvg.style.display = "block";
    if (avatarHeader) {
      avatarHeader.style.display = "none";
      avatarHeader.src = "";
    }
    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
    if (avatarDropdown) {
      avatarDropdown.src = placeholder;
    }
    if (avatarProfile) {
      avatarProfile.src = placeholder;
    }
  }
}

// Gerencia a criação e sincronização dos seletores de mês e ano 100% customizados do Flatpickr
function setupCustomFlatpickrHeader(instance) {
  if (!instance.calendarContainer) return;
  
  const currentMonthEl = instance.calendarContainer.querySelector(".flatpickr-current-month");
  if (!currentMonthEl) return;
  
  // Ocultar elementos originais do Flatpickr
  const monthSelectWrapper = currentMonthEl.querySelector(".flatpickr-monthDropdown-wrapper");
  if (monthSelectWrapper) monthSelectWrapper.style.display = "none";
  
  const yearInputWrapper = currentMonthEl.querySelector(".numInputWrapper");
  if (yearInputWrapper) yearInputWrapper.style.display = "none";
  
  const oldYearSelect = currentMonthEl.querySelector(".flatpickr-monthDropdown-years");
  if (oldYearSelect) oldYearSelect.style.display = "none";
  
  // Verifica se já criamos o cabeçalho customizado
  let customSelectors = currentMonthEl.querySelector(".custom-flatpickr-selectors");
  
  if (!customSelectors) {
    customSelectors = document.createElement("div");
    customSelectors.className = "custom-flatpickr-selectors";
    customSelectors.style.display = "flex";
    customSelectors.style.alignItems = "center";
    customSelectors.style.justifyContent = "center";
    customSelectors.style.gap = "8px";
    
    // 1. Criar select nativo para o Mês
    const monthSelect = document.createElement("select");
    monthSelect.id = "fp-month-select";
    monthSelect.className = "auto-custom-select";
    monthSelect.dataset.csClass = "cs-flatpickr";
    
    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    
    monthNames.forEach((mName, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = mName;
      monthSelect.appendChild(opt);
    });
    
    monthSelect.addEventListener("change", (e) => {
      instance.changeMonth(parseInt(e.target.value));
    });
    
    customSelectors.appendChild(monthSelect);
    
    // 2. Criar select nativo para o Ano
    const yearSelect = document.createElement("select");
    yearSelect.id = "fp-year-select";
    yearSelect.className = "auto-custom-select";
    yearSelect.dataset.csClass = "cs-flatpickr";
    
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    
    yearSelect.addEventListener("change", (e) => {
      instance.changeYear(parseInt(e.target.value));
    });
    
    customSelectors.appendChild(yearSelect);
    
    // Adiciona o container customizado no cabeçalho
    currentMonthEl.appendChild(customSelectors);
    
    // Inicializar os seletores customizados (cs-wrapper)
    if (typeof createCustomSelect === "function") {
      createCustomSelect(monthSelect);
      createCustomSelect(yearSelect);
    }
  }
  
  // Sincronizar dados selecionados ativos
  const monthSelect = customSelectors.querySelector("#fp-month-select");
  if (monthSelect) {
    monthSelect.value = instance.currentMonth;
    if (typeof syncCustomSelect === "function") syncCustomSelect(monthSelect);
  }
  
  const yearSelect = customSelectors.querySelector("#fp-year-select");
  if (yearSelect) {
    yearSelect.value = instance.currentYear;
    if (typeof syncCustomSelect === "function") syncCustomSelect(yearSelect);
  }
}

// Atualiza a saudação do usuário no cabeçalho
window.updateGreeting = function() {
  const greetingEl = document.getElementById("user-email");
  if (!greetingEl) return;
  
  let displayName = "";
  if (typeof state !== "undefined") {
    displayName = state.socialName || state.fullName;
  }
  
  if (!displayName && syncState && syncState.currentUser) {
    const emailParts = syncState.currentUser.email.split('@');
    if (emailParts.length > 0) displayName = emailParts[0];
  }
  
  if (!displayName) {
    if (syncState && syncState.currentUser) {
      greetingEl.textContent = syncState.currentUser.email;
    }
    return;
  }
  
  const hour = new Date().getHours();
  let greeting = "Boa noite";
  if (hour >= 5 && hour < 12) greeting = "Bom dia";
  else if (hour >= 12 && hour < 18) greeting = "Boa tarde";
  
  greetingEl.innerHTML = `
    <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">
      ${greeting}, ${escapeHTML(displayName)}!
    </div>
    <div style="font-size: 11px; font-weight: 400; color: var(--text-muted); line-height: 1.2; word-break: normal; white-space: normal;">
      Que a paz do Senhor Jesus Cristo esteja com você!
    </div>
  `;
};
