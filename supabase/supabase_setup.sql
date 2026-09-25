-- Script de Configuração do Banco de Dados no Supabase
-- Copie este script e cole no "SQL Editor" do painel do seu projeto no Supabase, depois clique em "Run".

-- 1. Tabela de Marcações (Highlights)
CREATE TABLE IF NOT EXISTS public.highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    verse_key TEXT NOT NULL,
    color_class TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, verse_key)
);

-- Ativar RLS (Row Level Security) - Segurança a nível de linha
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso: Apenas o próprio usuário autenticado pode ler/escrever seus dados
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.highlights
    FOR ALL USING (auth.uid() = user_id);


-- 2. Tabela de Anotações (Notes)
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    verse_key TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, verse_key)
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.notes
    FOR ALL USING (auth.uid() = user_id);


-- 3. Tabela de Favoritos (Favorites)
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    verse_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, verse_key)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.favorites
    FOR ALL USING (auth.uid() = user_id);


-- 4. Tabela de Histórico de Leitura (Reading History)
CREATE TABLE IF NOT EXISTS public.reading_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    book_code TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.reading_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.reading_history
    FOR ALL USING (auth.uid() = user_id);


-- 5. Tabela de Progresso dos Planos de Leitura (Reading Plans)
CREATE TABLE IF NOT EXISTS public.reading_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    completed BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, plan_id, day_key)
);

ALTER TABLE public.reading_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.reading_plans
    FOR ALL USING (auth.uid() = user_id);


-- 6. Tabela de Preferências do Usuário (Preferences)
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    theme TEXT DEFAULT 'azul' NOT NULL,
    font_family TEXT DEFAULT 'serif' NOT NULL,
    font_size TEXT DEFAULT 'md' NOT NULL,
    current_translation TEXT DEFAULT 'nvi' NOT NULL,
    avatar_url TEXT,
    full_name TEXT,
    bio TEXT,
    social_name TEXT,
    birth_date DATE,
    marital_status TEXT,
    gender TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.user_preferences
    FOR ALL USING (auth.uid() = user_id);

-- NOTA DE ATUALIZAÇÃO (MIGRAÇÃO DE VERSÕES ANTERIORES):
-- Se você já executou este script antes e já tem a tabela user_preferences criada,
-- execute apenas as linhas abaixo no SQL Editor do Supabase para adicionar os novos campos:
-- 
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS full_name TEXT;
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS bio TEXT;
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS social_name TEXT;
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS birth_date DATE;
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS marital_status TEXT;
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS gender TEXT;

-- 7. Tabela de Versículos Lidos (Read Verses)
CREATE TABLE IF NOT EXISTS public.read_verses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    verse_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, verse_key)
);

ALTER TABLE public.read_verses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.read_verses
    FOR ALL USING (auth.uid() = user_id);

-- 8. Tabela de Livros Lidos (Read Books)
CREATE TABLE IF NOT EXISTS public.read_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    book_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, book_key)
);

ALTER TABLE public.read_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.read_books
    FOR ALL USING (auth.uid() = user_id);

-- 8.1. Tabela de Capítulos Lidos (Read Chapters)
CREATE TABLE IF NOT EXISTS public.read_chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    chapter_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, chapter_key)
);

ALTER TABLE public.read_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.read_chapters
    FOR ALL USING (auth.uid() = user_id);



-- 9. Catálogo de Planos de Leitura
-- Criado e preenchido por reading_plans_catalog.sql (gerado a partir de reading_plans.js).
-- Execute aquele arquivo depois deste.
