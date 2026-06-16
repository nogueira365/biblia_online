// supabase.js
// Inicialização do cliente Supabase de forma segura e resiliente.

// Sobrescreve a biblioteca global 'supabase' com a instância do cliente configurada,
// ou define como 'null' se não estiver configurado/carregado.
window.supabase = (function() {
  const hasValidConfig = 
    typeof CONFIG !== "undefined" && 
    CONFIG.SUPABASE_URL && 
    CONFIG.SUPABASE_ANON_KEY && 
    CONFIG.SUPABASE_URL !== "https://seu-projeto.supabase.co" && 
    CONFIG.SUPABASE_ANON_KEY !== "sua-chave-public-anon-aqui";

  if (hasValidConfig) {
    try {
      // A biblioteca SDK do Supabase é exposta sob 'supabasejs' ou 'supabase'
      const lib = window.supabasejs || window.supabase;
      
      if (lib && typeof lib.createClient === "function") {
        const client = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log("⚡ Supabase inicializado com sucesso.");
        return client;
      } else {
        console.warn("⚠️ SDK do Supabase não foi encontrado na janela global. Rodando em modo Local/Offline.");
      }
    } catch (error) {
      console.error("❌ Erro ao tentar inicializar o cliente Supabase:", error);
    }
  } else {
    console.log("ℹ️ Supabase não configurado ou chaves padrão detectadas. Rodando em modo Local/Offline.");
  }
  
  return null;
})();
