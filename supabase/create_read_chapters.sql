-- =====================================================
-- CRIA A TABELA DE CAPÍTULOS LIDOS (read_chapters)
-- Ela faz parte do supabase_setup.sql (seção 8.1), mas foi adicionada depois
-- que o banco já tinha sido criado. Sem ela, a sincronização fica travada.
-- Execute no SQL Editor do Supabase (pode ser executado mais de uma vez).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.read_chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    chapter_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, chapter_key)
);

ALTER TABLE public.read_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo apenas para o próprio usuário" ON public.read_chapters;
CREATE POLICY "Permitir tudo apenas para o próprio usuário" ON public.read_chapters
    FOR ALL USING (auth.uid() = user_id);

-- Forçar a API a reconhecer a nova tabela
NOTIFY pgrst, 'reload schema';
