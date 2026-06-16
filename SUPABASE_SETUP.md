# Guia de Configuração do Supabase para o Bíblia Live ⚡

Como escolhemos a **Opção Supabase**, não precisamos programar nenhum servidor backend do zero! O Supabase cuida de toda a segurança, banco de dados e autenticação na nuvem.

Siga os passos simples abaixo para configurar a sua conta e conectar o site ao banco de dados:

---

## Passo 1: Criar a Conta e o Projeto no Supabase
1. Acesse [Supabase.com](https://supabase.com) e crie uma conta gratuita (pode usar sua conta do GitHub ou Google).
2. No painel, clique em **New Project** (Novo Projeto).
3. Selecione a organização padrão e preencha os dados:
   * **Name**: `Bíblia Live`
   * **Database Password**: Digite uma senha forte e anote-a em algum lugar (você não precisará dela no dia a dia, mas guarde-a(tB6N6^Zq8-aqaGx) .
   * **Region**: Selecione uma região próxima (ex: `South America (São Paulo)` para melhor performance no Brasil).
   * **Pricing Plan**: Escolha o plano **Free** (Gratuito).
4. Clique em **Create new project** e aguarde alguns minutos enquanto o Supabase cria a infraestrutura.

---

## Passo 2: Criar as Tabelas no Banco de Dados
1. No menu lateral esquerdo do painel do Supabase, clique no ícone **SQL Editor** (um ícone com `SQL`).
2. Clique em **New query** (Nova Consulta).
3. Abra o arquivo [supabase_setup.sql](file:///c:/Users/francisco.junior/Desktop/Biblia/supabase_setup.sql) gerado na pasta do seu projeto.
4. Copie todo o conteúdo desse arquivo SQL e cole-o no campo de texto do editor no Supabase.
5. Clique no botão **Run** (Executar) no canto inferior direito do editor.
6. Você verá uma mensagem de sucesso indicando que as tabelas e políticas de segurança foram criadas!

---

## Passo 3: Ativar o Login com o Google (Opcional, mas Recomendado)
1. No menu lateral esquerdo, clique no ícone **Authentication** (ícone de cadeado/usuário) e vá na aba **Providers**.
2. Procure por **Google** na lista de provedores e ative-o.
3. Para configurar completamente o login com o Google, você precisará criar credenciais no *Google Cloud Console* e colar o `Client ID` e `Client Secret` no painel do Supabase.
   > **Nota**: Se quiser começar mais rápido, o login tradicional por **E-mail e Senha** já estará funcionando imediatamente sem nenhuma configuração extra! Podemos configurar o Google juntos depois.

---

## Passo 4: Conectar as Chaves ao Site
1. No painel do seu projeto no Supabase, clique no ícone de **Settings** (Engrenagem no canto inferior esquerdo) e acesse a seção **API**.
2. Em **Project API keys**, copie os seguintes valores:
   * **Project URL**: Uma URL que começa com `https://...`
   * **anon/public key**: Uma chave longa contendo letras e números.
3. Crie um arquivo no seu computador chamado `config.js` na mesma pasta do projeto e adicione o seguinte código com as chaves que você copiou:

```javascript
// config.js
const SUPABASE_URL = "SUA_PROJECT_URL_AQUI";
const SUPABASE_ANON_KEY = "SUA_ANON_PUBLIC_KEY_AQUI";
```

*(Não se preocupe, adicionaremos o suporte a esse arquivo de chaves de forma segura no projeto!).*
