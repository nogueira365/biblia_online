# Guia de Configuração do Supabase para o Bíblia Live ⚡

O Supabase cuida do banco de dados, da autenticação e da segurança (RLS) na nuvem. Não há servidor próprio.

> **Nunca coloque senhas neste repositório.** Tudo aqui é publicado junto com o site.
> A única chave que vai no código é a chave pública (`anon`/publishable), que é protegida pelas políticas RLS.

---

## Passo 1: Criar o projeto
1. Acesse [supabase.com](https://supabase.com) e crie uma conta.
2. Clique em **New Project** e preencha:
   * **Name**: `Bíblia Live`
   * **Database Password**: uma senha forte, guardada em um gerenciador de senhas (fora deste repositório).
   * **Region**: `South America (São Paulo)`.
   * **Pricing Plan**: Free.

---

## Passo 2: Criar as tabelas
No **SQL Editor** do Supabase, execute, nesta ordem, os arquivos da pasta [`supabase/`](supabase/):

1. [`supabase_setup.sql`](supabase/supabase_setup.sql): tabelas do usuário (marcações, notas, favoritos, leituras, planos, histórico, preferências) e políticas RLS.
2. [`reading_plans_catalog.sql`](supabase/reading_plans_catalog.sql): catálogo de planos de leitura.
3. [`security_fixes.sql`](supabase/security_fixes.sql): remove a tabela antiga de aprovação de usuários e padroniza a coluna `birth_date`.
4. [`create_read_chapters.sql`](supabase/create_read_chapters.sql): cria a tabela `read_chapters` em bancos criados antes de ela existir. Se ela faltar, a sincronização avisa que o banco está desatualizado e segura as alterações até a tabela ser criada.

Todos podem ser executados mais de uma vez.

### Planos de leitura
Os planos são definidos em [`reading_plans.js`](reading_plans.js), a fonte única usada pelo app.
Depois de alterar um plano, gere o SQL do catálogo e execute-o no Supabase:

```bash
node scripts/generate_plans_sql.js
```

---

## Passo 3: Login com o Google (opcional)
1. Em **Authentication → Providers**, ative **Google**.
2. Crie as credenciais no *Google Cloud Console* e cole o `Client ID` e o `Client Secret` no Supabase.
3. Em **Authentication → URL Configuration**, cadastre o domínio do site (ex.: `https://biblialive.com`) como URL de redirecionamento.

O login por e-mail e senha funciona sem configuração extra.

---

## Passo 4: Conectar o site
Em **Settings → API**, copie a **Project URL** e a chave **anon/publishable** para o [`config.js`](config.js):

```javascript
const CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_CHAVE_PUBLICA"
};
```

Sem essas chaves, o app funciona em modo local (sem conta e sem sincronização).
