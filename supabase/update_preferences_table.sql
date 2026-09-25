-- =====================================================
-- ATUALIZAÇÃO DA TABELA DE PREFERÊNCIAS (user_preferences)
-- Execute este script no SQL Editor do Supabase
-- para adicionar os novos campos do "Meu Perfil"
-- =====================================================

ALTER TABLE user_preferences 
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS social_name TEXT,
  ADD COLUMN IF NOT EXISTS birth_date TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Opcional: Garantir que qualquer usuário consiga atualizar seu próprio perfil
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);
