let deferredPrompt;

// Registra o Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('Service Worker registrado com sucesso!', reg);
    }).catch(err => {
      console.log('Falha ao registrar Service Worker:', err);
    });
  });
}

// Ouve o evento de prompt de instalação
window.addEventListener('beforeinstallprompt', (e) => {
  // Impede que o Chrome mostre o prompt padrão na hora errada
  e.preventDefault();
  // Guarda o evento para usarmos no botão
  deferredPrompt = e;
  
  // Verifica se o usuário já dispensou antes
  const dismissed = localStorage.getItem('pwa_dismissed');
  
  // Verifica se já não estamos no modo standalone (PWA instalado)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // Se estiver no mobile e ainda não foi instalado nem dispensado, mostra o banner
  if (!dismissed && !isStandalone && window.innerWidth <= 768) {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.style.display = 'flex';
      // Pequeno delay para a transição de CSS
      setTimeout(() => banner.classList.add('show'), 100);
    }
  }
});

// Ações do botão Instalar
const btnInstall = document.getElementById('pwa-btn-install');
if (btnInstall) {
  btnInstall.addEventListener('click', async () => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('show');
    
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Escolha do usuário: ${outcome}`);
      deferredPrompt = null;
    }
    
    setTimeout(() => {
      if (banner) banner.style.display = 'none';
    }, 300);
  });
}

// Ações do botão Agora não
const btnDismiss = document.getElementById('pwa-btn-dismiss');
if (btnDismiss) {
  btnDismiss.addEventListener('click', () => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('show');
    localStorage.setItem('pwa_dismissed', 'true');
    
    setTimeout(() => {
      if (banner) banner.style.display = 'none';
    }, 300);
  });
}
