// auth.js
// Lógica de Autenticação (Supabase Auth) e Sincronização de Dados na Nuvem

// E-mail do administrador (único com poder de aprovar usuários)
const ADMIN_EMAIL = "nogueira.analytics@gmail.com";

// Estado de sincronização atual
const syncState = {
  isLoggedIn: false,
  currentUser: null,
  syncPendingCount: 0,
  isApproved: false,
  isAdmin: false
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
// Funções individuais de salvamento para confirmação de leitura
// ----------------------------------------------------
async function cloudSaveReadVerse(verseKey, isAdding) {
  if (!supabase || !syncState.isLoggedIn || !syncState.currentUser) return;
  try {
    if (isAdding) {
      await supabase.from("read_verses").upsert({
        user_id: syncState.currentUser.id,
        verse_key: verseKey
      }, { onConflict: "user_id,verse_key" });
    } else {
      await supabase.from("read_verses")
        .delete()
        .match({ user_id: syncState.currentUser.id, verse_key: verseKey });
    }
  } catch (error) {
    console.error("Erro ao sincronizar versículo lido:", error);
  }
}

async function cloudSaveReadBook(bookKey, isAdding) {
  if (!supabase || !syncState.isLoggedIn || !syncState.currentUser) return;
  try {
    if (isAdding) {
      await supabase.from("read_books").upsert({
        user_id: syncState.currentUser.id,
        book_key: bookKey
      }, { onConflict: "user_id,book_key" });
    } else {
      await supabase.from("read_books")
        .delete()
        .match({ user_id: syncState.currentUser.id, book_key: bookKey });
    }
  } catch (error) {
    console.error("Erro ao sincronizar livro lido:", error);
  }
}

async function cloudSaveReadChapter(chapterKey, isAdding) {
  if (!supabase || !syncState.isLoggedIn || !syncState.currentUser) return;
  try {
    if (isAdding) {
      await supabase.from("read_chapters").upsert({
        user_id: syncState.currentUser.id,
        chapter_key: chapterKey
      }, { onConflict: "user_id,chapter_key" });
    } else {
      await supabase.from("read_chapters")
        .delete()
        .match({ user_id: syncState.currentUser.id, chapter_key: chapterKey });
    }
  } catch (error) {
    console.error("Erro ao sincronizar capítulo lido:", error);
  }
}

async function cloudSaveReadingPlanDay(planId, dayKey, isCompleted) {
  if (!supabase || !syncState.isLoggedIn || !syncState.currentUser) return;
  try {
    await supabase.from("reading_plans").upsert({
      user_id: syncState.currentUser.id,
      plan_id: planId,
      day_key: dayKey,
      completed: isCompleted
    }, { onConflict: "user_id,plan_id,day_key" });
  } catch (error) {
    console.error("Erro ao sincronizar progresso do plano:", error);
  }
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
      // Mesclar os planos do banco com os planos locais para garantir que todos apareçam
      window.READING_PLANS = { ...(window.READING_PLANS || {}), ...plansObj };
      
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
      try {
        updateSyncIndicator("working");
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        userDropdown.style.display = "none";
        showToast("Você saiu da sua conta.", "success");
      } catch (error) {
        console.error("Erro ao sair da conta:", error);
        showToast("Erro ao sair da conta.", "error");
      }
    });
  }

  // Sincronizar manualmente agora
  if (btnSyncNow) {
    btnSyncNow.addEventListener("click", async () => {
      if (syncState.isLoggedIn) {
        try {
          updateSyncIndicator("working");
          await syncCloudData();
          showToast("Sincronização em nuvem concluída!", "success");
        } catch (error) {
          console.error("Erro na sincronização:", error);
          showToast("Erro ao sincronizar dados com a nuvem.", "error");
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
      
      if (typeof saveStateToLocalStorage === "function") {
        saveStateToLocalStorage();
      }
      
      if (syncState.isLoggedIn) {
        try {
          updateSyncIndicator("working");
          await cloudSavePreferences();
          updateSyncIndicator("online");
          showToast("Perfil atualizado com sucesso!", "success");
        } catch (error) {
          console.error("Erro ao salvar dados do perfil:", error);
          showToast("Erro: " + (error.message || "Erro ao sincronizar dados com o Supabase."), "error");
          updateSyncIndicator("offline");
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
}

// Processa e faz o upload do avatar (redimensiona para 96x96px JPEG e salva no estado/Supabase)
function processAndSaveAvatar(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Por favor, selecione uma imagem válida.", "error");
    return;
  }

  updateSyncIndicator("working");

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
        cloudSavePreferences().then(() => {
          updateSyncIndicator("online");
          showToast("Foto de perfil atualizada!", "success");
        }).catch(err => {
          console.error("Erro ao salvar foto de perfil no Supabase:", err);
          showToast("Erro ao sincronizar foto de perfil.", "error");
          updateSyncIndicator("online");
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


// Ouvir alterações no estado de Autenticação do Supabase
function listenToAuthChanges() {
  if (!supabase) return;

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(`Evento de Auth: ${event}`);
    
    if (session) {
      syncState.isLoggedIn = true;
      syncState.currentUser = session.user;
      syncState.isAdmin = (session.user.email === ADMIN_EMAIL);
      
      // Atualizar UI do cabeçalho
      const userEmailEl = document.getElementById("user-email");
      if (userEmailEl) userEmailEl.textContent = session.user.email;
      
      const btnAuth = document.getElementById("btn-auth");
      if (btnAuth) btnAuth.title = `Conectado como ${session.user.email}`;

      updateSyncIndicator("working");
      
      try {
        // Verificar se o usuário tem registro de aprovação
        const approvalStatus = await checkUserApproval(session.user);
        
        if (approvalStatus === "approved") {
          syncState.isApproved = true;
          hidePendingScreen();
          
          // Sincronizar / Carregar dados da nuvem
          await syncCloudData();
          updateSyncIndicator("online");
          
          // Se for admin, mostrar botão e carregar painel
          if (syncState.isAdmin) {
            showAdminButton();
          }
        } else {
          // Usuário pendente ou rejeitado
          syncState.isApproved = false;
          showPendingScreen(session.user.email);
          updateSyncIndicator("offline");
        }
      } catch (err) {
        console.error("Erro durante a verificação de aprovação:", err);
        updateSyncIndicator("offline");
      }
    } else {
      syncState.isLoggedIn = false;
      syncState.currentUser = null;
      syncState.isApproved = false;
      syncState.isAdmin = false;
      
      const btnAuth = document.getElementById("btn-auth");
      if (btnAuth) btnAuth.title = "Entrar / Criar Conta";

      updateSyncIndicator("offline");
      hidePendingScreen();
      hideAdminButton();
      
      // Se acabou de deslogar (SIGNED_OUT), recarregar a página para limpar o estado em memória
      if (event === "SIGNED_OUT") {
        // Limpar dados locais que pertenciam à conta
        localStorage.removeItem("bible_reader_state");
        window.location.reload();
      }
    }
  });
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
    if (statusLabel) statusLabel.innerHTML = "🟢 Sincronizado";
  } else if (status === "working") {
    indicator.classList.add("sync-working");
    indicator.title = "Sincronizando com a nuvem...";
    if (statusLabel) statusLabel.innerHTML = "🟡 Sincronizando...";
  } else {
    indicator.classList.add("sync-offline");
    indicator.title = "Modo Local / Desconectado";
    if (statusLabel) statusLabel.innerHTML = "⚫ Modo Local / Desconectado";
  }
}

// ==========================================================================
// FUNÇÕES DE SINCRONIZAÇÃO DE DADOS COM O SUPABASE
// ==========================================================================

// Sincroniza dados empurrando itens locais do LocalStorage e puxando dados da nuvem
async function syncCloudData() {
  if (!supabase || !syncState.currentUser) return;
  const userId = syncState.currentUser.id;

  // 1. Obter o estado local da aplicação
  // NOTA: 'state' é a variável global de estado definida em app.js
  if (typeof state === "undefined") return;

  try {
    // 2. Mesclar dados locais de localStorage para a nuvem
    // Se o usuário já tiver dados no LocalStorage antes de logar, nós fazemos o upload deles.
    await uploadLocalDataToCloud(userId);

    // 3. Puxar todos os dados mais recentes do Supabase para o estado local
    await pullDataFromCloud(userId);

    // 4. Salvar estado atualizado no LocalStorage e recarregar componentes visuais
    if (typeof saveStateToLocalStorage === "function") {
      saveStateToLocalStorage();
    }
    
    // Atualizar UI ativa
    if (typeof loadActiveChapter === "function") {
      await loadActiveChapter();
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
  } catch (error) {
    console.error("Falha ao sincronizar dados com o Supabase:", error);
    throw error;
  }
}

// Envia dados salvos localmente (Highlights, Notes, Favorites, History, Plans) para a nuvem
async function uploadLocalDataToCloud(userId) {
  // Marcações
  if (state.highlights && Object.keys(state.highlights).length > 0) {
    const rows = Object.entries(state.highlights).map(([key, val]) => ({
      user_id: userId,
      verse_key: key,
      color_class: val
    }));
    await supabase.from("highlights").upsert(rows, { onConflict: "user_id,verse_key" });
  }

  // Notas
  if (state.notes && Object.keys(state.notes).length > 0) {
    const rows = Object.entries(state.notes).map(([key, val]) => ({
      user_id: userId,
      verse_key: key,
      content: val
    }));
    await supabase.from("notes").upsert(rows, { onConflict: "user_id,verse_key" });
  }

  // Favoritos
  if (state.favorites && state.favorites.length > 0) {
    const rows = state.favorites.map(key => ({
      user_id: userId,
      verse_key: key
    }));
    await supabase.from("favorites").upsert(rows, { onConflict: "user_id,verse_key" });
  }

  // Versículos Lidos
  if (state.readStatus && state.readStatus.verses && state.readStatus.verses.length > 0) {
    const rows = state.readStatus.verses.map(key => ({
      user_id: userId,
      verse_key: key
    }));
    await supabase.from("read_verses").upsert(rows, { onConflict: "user_id,verse_key" });
  }

  // Capítulos Lidos
  if (state.readStatus && state.readStatus.chapters && state.readStatus.chapters.length > 0) {
    const rows = state.readStatus.chapters.map(key => ({
      user_id: userId,
      chapter_key: key
    }));
    await supabase.from("read_chapters").upsert(rows, { onConflict: "user_id,chapter_key" });
  }

  // Livros Lidos
  if (state.readStatus && state.readStatus.books && state.readStatus.books.length > 0) {
    const rows = state.readStatus.books.map(key => ({
      user_id: userId,
      book_key: key
    }));
    await supabase.from("read_books").upsert(rows, { onConflict: "user_id,book_key" });
  }

  // Progresso dos Planos de Leitura
  if (state.readingPlans && state.readingPlans.progress) {
    const progressEntries = Object.entries(state.readingPlans.progress);
    if (progressEntries.length > 0) {
      const rows = progressEntries.map(([key, val]) => {
        // A chave no localstorage é 'planId-dayNumber', e salvamos se está completed (boolean)
        const lastDashIndex = key.lastIndexOf("-");
        const planId = lastDashIndex > 0 ? key.substring(0, lastDashIndex) : key;
        return {
          user_id: userId,
          plan_id: planId,
          day_key: key,
          completed: !!val
        };
      });
      await supabase.from("reading_plans").upsert(rows, { onConflict: "user_id,plan_id,day_key" });
    }
  }

  // Histórico
  if (state.history && state.history.length > 0) {
    const rows = state.history.map(item => ({
      user_id: userId,
      book_code: item.book,
      chapter: item.chapter,
      read_at: item.time || new Date().toISOString()
    }));
    // O histórico não tem restrição de chave única estrita de conflito na inserção
    await supabase.from("reading_history").upsert(rows);
  }

  // Preferências
  await supabase.from("user_preferences").upsert({
    user_id: userId,
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
  }, { onConflict: "user_id" });
}

// Puxa os dados da nuvem para preencher o estado local da aplicação
async function pullDataFromCloud(userId) {
  // 1. Buscar Marcações (Highlights)
  const { data: highlights } = await supabase.from("highlights").select("verse_key, color_class").eq("user_id", userId);
  state.highlights = {};
  if (highlights) {
    highlights.forEach(row => {
      state.highlights[row.verse_key] = row.color_class;
    });
  }

  // 2. Buscar Notas (Notes)
  const { data: notes } = await supabase.from("notes").select("verse_key, content").eq("user_id", userId);
  state.notes = {};
  if (notes) {
    notes.forEach(row => {
      state.notes[row.verse_key] = row.content;
    });
  }

  // 3. Buscar Favoritos (Favorites)
  const { data: favorites } = await supabase.from("favorites").select("verse_key").eq("user_id", userId);
  state.favorites = [];
  if (favorites) {
    state.favorites = favorites.map(row => row.verse_key);
  }

  // 3.1 Buscar Versículos Lidos
  const { data: readVerses } = await supabase.from("read_verses").select("verse_key").eq("user_id", userId);
  if (!state.readStatus) state.readStatus = { verses: [], chapters: [] };
  if (!state.readStatus.verses) state.readStatus.verses = [];
  if (readVerses) {
    state.readStatus.verses = readVerses.map(row => row.verse_key);
  }

  // 3.2 Buscar Capítulos Lidos
  const { data: readChapters } = await supabase.from("read_chapters").select("chapter_key").eq("user_id", userId);
  if (!state.readStatus.chapters) state.readStatus.chapters = [];
  if (readChapters) {
    state.readStatus.chapters = readChapters.map(row => row.chapter_key);
  }

  // 3.3 Buscar Livros Lidos
  const { data: readBooks } = await supabase.from("read_books").select("book_key").eq("user_id", userId);
  if (!state.readStatus.books) state.readStatus.books = [];
  if (readBooks) {
    state.readStatus.books = readBooks.map(row => row.book_key);
  }

  // 4. Buscar Plano de Leitura
  const { data: plans } = await supabase.from("reading_plans").select("plan_id, day_key, completed").eq("user_id", userId);
  state.readingPlans = { activePlanId: state.readingPlans.activePlanId || "", progress: {} };
  if (plans) {
    plans.forEach(row => {
      state.readingPlans.progress[row.day_key] = row.completed;
      if (row.plan_id && !state.readingPlans.activePlanId) {
        state.readingPlans.activePlanId = row.plan_id;
      }
    });
  }

  // 5. Buscar Histórico (ordenado pelo lido mais recentemente)
  const { data: history } = await supabase.from("reading_history")
    .select("book_code, chapter, read_at")
    .eq("user_id", userId)
    .order("read_at", { ascending: false })
    .limit(15);
  
  state.history = [];
  if (history) {
    state.history = history.map(row => {
      // Procurar nome amigável do livro
      const bookObj = typeof BIBLE_BOOKS !== "undefined" ? BIBLE_BOOKS.find(b => b.abbrev === row.book_code) : null;
      return {
        book: row.book_code,
        bookName: bookObj ? bookObj.name : row.book_code.toUpperCase(),
        chapter: row.chapter,
        time: row.read_at
      };
    });
  }

  // 6. Buscar Preferências do Usuário
  const { data: pref, error } = await supabase.from("user_preferences").select("theme, font_family, font_size, current_translation, avatar_url, full_name, bio, social_name, birth_date, marital_status, gender").eq("user_id", userId).maybeSingle();
  
  if (error) {
    alert("Erro ao puxar dados: " + error.message);
  }

  if (pref) {
    // Alerta de debug para ver o que veio da nuvem ao carregar a página
    // Remover depois!
    alert("Ao carregar a página, Supabase retornou o Nome: " + pref.full_name);

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
    
    // Atualiza a exibição da foto de perfil
    updateAvatarUI(state.avatarUrl);
    
    // Aplicar as preferências baixadas no layout do app
    if (typeof applyPreferences === "function") {
      applyPreferences();
    }
  } else {
    // Garante que o avatar local é desenhado na UI se não tiver prefs no Supabase
    updateAvatarUI(state.avatarUrl);
  }
}

// ==========================================================================
// FUNÇÕES AUXILIARES DE SINCRONIZAÇÃO EM TEMPO REAL (Para usar em app.js)
// ==========================================================================

// Envia uma única alteração de marcação em tempo real
async function cloudSaveHighlight(verseKey, colorClass) {
  if (!supabase || !syncState.isLoggedIn) return;
  try {
    const userId = syncState.currentUser.id;
    if (colorClass) {
      await supabase.from("highlights").upsert({
        user_id: userId,
        verse_key: verseKey,
        color_class: colorClass
      }, { onConflict: "user_id,verse_key" });
    } else {
      await supabase.from("highlights").delete().eq("user_id", userId).eq("verse_key", verseKey);
    }
  } catch (error) {
    console.error("Erro ao salvar marcação em tempo real na nuvem:", error);
  }
}

// Envia uma única nota em tempo real
async function cloudSaveNote(verseKey, content) {
  if (!supabase || !syncState.isLoggedIn) return;
  try {
    const userId = syncState.currentUser.id;
    if (content && content.trim() !== "") {
      await supabase.from("notes").upsert({
        user_id: userId,
        verse_key: verseKey,
        content: content.trim()
      }, { onConflict: "user_id,verse_key" });
    } else {
      await supabase.from("notes").delete().eq("user_id", userId).eq("verse_key", verseKey);
    }
  } catch (error) {
    console.error("Erro ao salvar anotação em tempo real na nuvem:", error);
  }
}

// Envia uma única alteração de favorito em tempo real
async function cloudSaveFavorite(verseKey, isAdding) {
  if (!supabase || !syncState.isLoggedIn) return;
  try {
    const userId = syncState.currentUser.id;
    if (isAdding) {
      await supabase.from("favorites").upsert({
        user_id: userId,
        verse_key: verseKey
      }, { onConflict: "user_id,verse_key" });
    } else {
      await supabase.from("favorites").delete().eq("user_id", userId).eq("verse_key", verseKey);
    }
  } catch (error) {
    console.error("Erro ao salvar favorito em tempo real na nuvem:", error);
  }
}

// Envia uma navegação de histórico em tempo real
async function cloudAddHistory(book, chapter) {
  if (!supabase || !syncState.isLoggedIn) return;
  try {
    const userId = syncState.currentUser.id;
    await supabase.from("reading_history").insert({
      user_id: userId,
      book_code: book,
      chapter: chapter
    });
  } catch (error) {
    console.error("Erro ao salvar histórico de leitura na nuvem:", error);
  }
}

// Envia progresso do plano de leitura em tempo real
async function cloudSaveReadingPlanDay(planId, dayKey, completed) {
  if (!supabase || !syncState.isLoggedIn) return;
  try {
    const userId = syncState.currentUser.id;
    await supabase.from("reading_plans").upsert({
      user_id: userId,
      plan_id: planId,
      day_key: dayKey,
      completed: completed
    }, { onConflict: "user_id,plan_id,day_key" });
  } catch (error) {
    console.error("Erro ao salvar progresso do plano de leitura na nuvem:", error);
  }
}

// Envia preferências visuais do usuário em tempo real
async function cloudSavePreferences() {
  if (!supabase || !syncState.isLoggedIn) return;
  try {
    const userId = syncState.currentUser.id;
    const payload = {
      user_id: userId,
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
    };
    
    const { data, error } = await supabase.from("user_preferences").upsert(payload, { onConflict: "user_id" }).select();
    
    if (error) {
      console.error("Supabase Error ao salvar prefs:", error);
      alert("Erro do Banco de Dados: " + error.message + " (Detalhes: " + error.details + ")");
      throw error;
    }

    if (data && data.length > 0) {
      console.log("Upsert Success Data:", data[0]);
      alert("Supabase salvou: Nome = " + data[0].full_name + " | Avatar_Url existe? " + !!data[0].avatar_url);
    }
  } catch (error) {
    console.error("Erro ao salvar preferências visuais na nuvem:", error);
    throw error;
  }
}

// Atualiza a exibição da foto de perfil nos elementos HTML do avatar
function updateAvatarUI(avatarUrl) {
  const avatarSvg = document.getElementById("user-avatar-svg");
  const avatarImgHeader = document.getElementById("user-avatar-img");
  const avatarImgDropdown = document.getElementById("dropdown-avatar-img");
  const avatarImgProfile = document.getElementById("profile-avatar-img");

  if (avatarUrl && avatarUrl.trim() !== "") {
    if (avatarSvg) avatarSvg.style.display = "none";
    if (avatarImgHeader) {
      avatarImgHeader.src = avatarUrl;
      avatarImgHeader.style.display = "block";
    }
    if (avatarImgDropdown) {
      avatarImgDropdown.src = avatarUrl;
    }
    if (avatarImgProfile) {
      avatarImgProfile.src = avatarUrl;
    }
  } else {
    if (avatarSvg) avatarSvg.style.display = "block";
    if (avatarImgHeader) {
      avatarImgHeader.style.display = "none";
      avatarImgHeader.src = "";
    }
    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
    if (avatarImgDropdown) {
      avatarImgDropdown.src = placeholder;
    }
    if (avatarImgProfile) {
      avatarImgProfile.src = placeholder;
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

// ==========================================================================
// SISTEMA DE APROVAÇÃO DE USUÁRIOS
// ==========================================================================

// Verifica o status de aprovação do usuário. Se não existir registro, cria um como 'pending'.
async function checkUserApproval(user) {
  if (!supabase || !user) return "pending";
  
  // Admin é sempre aprovado
  if (user.email === ADMIN_EMAIL) return "approved";
  
  try {
    // Verificar se já existe um registro de aprovação
    const { data, error } = await supabase
      .from("user_approvals")
      .select("status")
      .eq("user_id", user.id)
      .single();
    
    if (error && error.code === "PGRST116") {
      // Não encontrou registro — criar um novo como 'pending'
      await supabase.from("user_approvals").insert({
        user_id: user.id,
        email: user.email,
        status: "pending"
      });
      return "pending";
    }
    
    if (error) {
      console.error("Erro ao verificar aprovação:", error);
      return "pending";
    }
    
    return data.status || "pending";
  } catch (err) {
    console.error("Erro inesperado ao verificar aprovação:", err);
    return "pending";
  }
}

// Mostra a tela de "Aguardando Aprovação"
function showPendingScreen(email) {
  const screen = document.getElementById("pending-approval-screen");
  if (screen) {
    screen.style.display = "flex";
    const emailEl = document.getElementById("pending-user-email");
    if (emailEl) emailEl.textContent = email;
  }
  
  // Botão de logout na tela de pendente
  const btnPendingLogout = document.getElementById("btn-pending-logout");
  if (btnPendingLogout) {
    btnPendingLogout.onclick = async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Erro ao sair:", e);
      }
    };
  }
}

// Esconde a tela de "Aguardando Aprovação"
function hidePendingScreen() {
  const screen = document.getElementById("pending-approval-screen");
  if (screen) screen.style.display = "none";
}

// ==========================================================================
// PAINEL ADMINISTRATIVO
// ==========================================================================

function showAdminButton() {
  const btnAdmin = document.getElementById("btn-admin");
  if (btnAdmin) {
    btnAdmin.style.display = "flex";
    btnAdmin.addEventListener("click", () => {
      if (typeof openDrawer === "function") {
        openDrawer("admin-drawer");
      }
      loadAdminPanel();
    });
  }
  // Carregar contagem de pendentes
  loadAdminPendingCount();
}

function hideAdminButton() {
  const btnAdmin = document.getElementById("btn-admin");
  if (btnAdmin) btnAdmin.style.display = "none";
}

async function loadAdminPendingCount() {
  if (!supabase || !syncState.isAdmin) return;
  try {
    const { data } = await supabase
      .from("user_approvals")
      .select("status")
      .eq("status", "pending");
    
    const count = data ? data.length : 0;
    const badge = document.getElementById("admin-badge");
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Erro ao carregar contagem de pendentes:", err);
  }
}

async function loadAdminPanel() {
  if (!supabase || !syncState.isAdmin) return;
  
  try {
    const { data: allUsers, error } = await supabase
      .from("user_approvals")
      .select("*")
      .order("requested_at", { ascending: false });
    
    if (error) {
      console.error("Erro ao carregar painel admin:", error);
      return;
    }
    
    const pending = allUsers.filter(u => u.status === "pending");
    const approved = allUsers.filter(u => u.status === "approved");
    const rejected = allUsers.filter(u => u.status === "rejected");
    
    // Atualizar contadores
    const statPending = document.getElementById("admin-stat-pending");
    if (statPending) statPending.textContent = pending.length;
    const statApproved = document.getElementById("admin-stat-approved");
    if (statApproved) statApproved.textContent = approved.length;
    const statRejected = document.getElementById("admin-stat-rejected");
    if (statRejected) statRejected.textContent = rejected.length;
    
    // Renderizar lista de pendentes
    const pendingList = document.getElementById("admin-pending-list");
    if (pendingList) {
      if (pending.length === 0) {
        pendingList.innerHTML = '<div style="text-align: center; padding: 20px 0; color: var(--text-muted); font-size: 13px;">Nenhum usuário pendente</div>';
      } else {
        pendingList.innerHTML = pending.map(u => `
          <div class="admin-user-card" data-user-id="${u.user_id}">
            <div class="admin-user-info">
              <div class="admin-user-email">${u.email}</div>
              <div class="admin-user-date">${new Date(u.requested_at).toLocaleDateString('pt-BR')} às ${new Date(u.requested_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</div>
            </div>
            <div class="admin-user-actions">
              <button class="admin-btn-approve" onclick="adminApproveUser('${u.user_id}')">Aprovar</button>
              <button class="admin-btn-reject" onclick="adminRejectUser('${u.user_id}')">Rejeitar</button>
            </div>
          </div>
        `).join("");
      }
    }
    
    // Renderizar lista de aprovados
    const approvedList = document.getElementById("admin-approved-list");
    if (approvedList) {
      if (approved.length === 0) {
        approvedList.innerHTML = '<div style="text-align: center; padding: 20px 0; color: var(--text-muted); font-size: 13px;">Nenhum usuário aprovado</div>';
      } else {
        approvedList.innerHTML = approved.map(u => `
          <div class="admin-user-card">
            <div class="admin-user-info">
              <div class="admin-user-email">${u.email}</div>
              <div class="admin-user-date">Aprovado em ${u.approved_at ? new Date(u.approved_at).toLocaleDateString('pt-BR') : '---'}</div>
            </div>
            <div class="admin-user-actions">
              <button class="admin-btn-reject" onclick="adminRejectUser('${u.user_id}')">Revogar</button>
            </div>
          </div>
        `).join("");
      }
    }
    
    // Atualizar badge
    const badge = document.getElementById("admin-badge");
    if (badge) {
      if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Erro ao carregar dados do painel admin:", err);
  }
}

// Aprovar um usuário
window.adminApproveUser = async function(userId) {
  if (!supabase || !syncState.isAdmin) return;
  try {
    const { error } = await supabase
      .from("user_approvals")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("user_id", userId);
    
    if (error) throw error;
    
    if (typeof showToast === "function") showToast("Usuário aprovado com sucesso!", "success");
    loadAdminPanel();
  } catch (err) {
    console.error("Erro ao aprovar usuário:", err);
    if (typeof showToast === "function") showToast("Erro ao aprovar usuário.", "error");
  }
};

// Rejeitar um usuário
window.adminRejectUser = async function(userId) {
  if (!supabase || !syncState.isAdmin) return;
  try {
    const { error } = await supabase
      .from("user_approvals")
      .update({ status: "rejected", approved_at: null })
      .eq("user_id", userId);
    
    if (error) throw error;
    
    if (typeof showToast === "function") showToast("Usuário rejeitado.", "success");
    loadAdminPanel();
  } catch (err) {
    console.error("Erro ao rejeitar usuário:", err);
    if (typeof showToast === "function") showToast("Erro ao rejeitar usuário.", "error");
  }
};
