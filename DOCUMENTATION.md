# Documentação do Projeto: Bíblia Live

Este documento registra as implementações, correções e padronizações visuais realizadas na plataforma.

## 1. Versículo do Dia (VOD)
- **Status:** Implementado
- **Arquivos Afetados:** `index.html`, `styles.css`, `app.js`
- **Detalhes:** 
  - Lógica baseada em um gerador determinístico a partir do ID do plano, dia do ano e número total de versículos do capítulo selecionado. Isso garante que o mesmo versículo seja apresentado ao longo do dia para o usuário.
  - Implementação do botão "Compartilhar Versículo" utilizando a `Web Share API` nativa do navegador, abrindo o seletor padrão do celular/PC (WhatsApp, Instagram, Copiar Link, etc).
  - Adicionadas animações suaves de entrada (Fade-in e Slide-up) para o componente de exibição.

## 2. Correção de Bug na Tela de Autenticação
- **Status:** Resolvido
- **Arquivos Afetados:** `auth.js`
- **Detalhes:** 
  - Corrigido problema de lógica no toggle entre "Login" e "Cadastro" onde a visibilidade dos elementos se sobrepunha.

## 3. Padronização Visual de Dropdowns (Selects Customizados)
- **Status:** Implementado
- **Arquivos Afetados:** `custom-select.js` (Novo), `index.html`, `app.js`, `auth.js`, `styles.css`
- **Detalhes:**
  - O visual padrão (grosseiro) do sistema operacional para caixas de seleção `<select>` foi totalmente substituído.
  - Foi criado um sistema robusto chamado `cs-wrapper` que detecta elementos `<select class="auto-custom-select">` e os esconde, gerando uma interface HTML estilizada e alinhada ao design minimalista do site.
  - O sistema de barra de rolagem (scrollbar) foi padronizado em todo o painel de seleção, adotando linhas finas (4px) e cores suaves (`var(--bg-surface-hover)` e `--accent-color`).
  - **Onde foi aplicado:**
    1. Seletor de Tradução da Bíblia (no cabeçalho superior).
    2. Seletor de Plano de Leitura (na aba lateral/gaveta de planos).
    3. Seletor de Estado Civil (na área "Meu Perfil").
    4. Seletor de Sexo (na área "Meu Perfil").

## 4. Integração do Flatpickr com o Padrão de Dropdowns Customizados
- **Status:** Implementado
- **Arquivos Afetados:** `auth.js`, `styles.css`
- **Detalhes:**
  - O calendário do Flatpickr (usado para escolher a data de nascimento no perfil) possuía caixas de seleção para Mês e Ano totalmente destoantes do novo design.
  - A função interna de geração do cabeçalho do Flatpickr (`setupCustomFlatpickrHeader`) foi reescrita. O código antigo que injetava `divs` estáticos foi deletado.
  - Agora, o Flatpickr gera nativamente `<select>` normais para os Meses e Anos, que invocam a mesma biblioteca padronizada que construímos (`custom-select.js`), injetando a mesmíssima rolagem com animações, design minimalista e chevron flat.

---

### Observação Técnica (Cache do Navegador)
*Ao atualizar extensivamente os arquivos `.js` e `.css`, os navegadores tendem a utilizar versões em cache para economizar memória (especialmente com uso de Live Server local).*
*Na última atualização, para forçar o navegador a descartar a UI antiga do Flatpickr (que exibia a caixa com hover azul sem cantos arredondados), introduzimos o parâmetro de cache-busting `?v=1.0.5` dentro do `<head>` do arquivo `index.html`.*
---

## 5. Revisão de qualidade e correções (setembro/2026)
- **Sincronização (`auth_v2.js`):** toda gravação na nuvem passa por uma fila persistida no `localStorage` (`bible_sync_outbox`). Alterações feitas sem conexão são reenviadas em ordem e sempre antes de baixar dados da nuvem. O download pagina além do limite de 1000 linhas do Supabase e só altera o estado local se tudo for baixado com sucesso. A sincronização completa roda uma vez por login (não a cada renovação de token).
- **Segurança:** textos do usuário (notas, nome, mensagens) nunca são inseridos como HTML. Scripts do CDN têm versão fixa e hash SRI (atualize a versão e o hash juntos). A tabela `user_approvals` foi removida (`supabase/security_fixes.sql`).
- **NTLH (`data/NTLH.js`):** 2 Samuel corrigido (24 capítulos, 23:24-39 e 24:25 restaurados). Versículos agrupados (ex.: "[9-10]") guardam o texto só no primeiro versículo do grupo; o leitor exibe o rótulo "9-10".
- **Planos de leitura:** fonte única em `reading_plans.js`. O plano de 1 ano cobre os 1189 capítulos. Para atualizar o catálogo no Supabase: `node scripts/generate_plans_sql.js` e executar `supabase/reading_plans_catalog.sql`.
- **PWA offline (`sw.js`):** arquivos do site com rede primeiro e cache como reserva; traduções, bibliotecas do CDN e fontes com cache primeiro. Ao alterar arquivos de `data/`, incremente `DATA_CACHE` no `sw.js`.
- **Links diretos:** `?livro=jo&cap=3&v=16` abre o capítulo e rola até o versículo; o compartilhamento usa esse formato.
- **Organização:** SQL em `supabase/`, scripts em `scripts/`. `biblias-main/` (fonte das traduções) não é mais versionado. `_config.yml` impede a publicação de SQL, scripts e documentação no GitHub Pages.
