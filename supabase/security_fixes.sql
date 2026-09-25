-- =====================================================
-- CORREÇÕES DE SEGURANÇA E CONSISTÊNCIA
-- Execute no SQL Editor do Supabase (pode ser executado mais de uma vez).
-- =====================================================

-- 1. Sistema de aprovação de usuários (removido do app)
-- A tabela não é mais usada pelo código, e a policy de INSERT permitia que
-- qualquer usuário criasse o próprio registro já com status 'approved'.
-- Ela guarda e-mails de usuários sem necessidade, então é removida.
DROP TABLE IF EXISTS public.user_approvals;

-- 2. Data de nascimento: supabase_setup.sql criava a coluna como DATE e
-- update_preferences_table.sql como TEXT. O app grava no formato AAAA-MM-DD,
-- então padroniza como DATE (valores vazios ou inválidos viram NULL).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_preferences'
      AND column_name = 'birth_date' AND data_type <> 'date'
  ) THEN
    ALTER TABLE public.user_preferences
      ALTER COLUMN birth_date TYPE DATE
      USING CASE WHEN birth_date ~ '^\d{4}-\d{2}-\d{2}$' THEN birth_date::date ELSE NULL END;
  END IF;
END $$;

-- 3. Forçar a API a reconhecer as mudanças de esquema
NOTIFY pgrst, 'reload schema';
