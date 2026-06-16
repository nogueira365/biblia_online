-- =====================================================
-- TABELA DE APROVAÇÃO DE USUÁRIOS (user_approvals)
-- Execute este script no SQL Editor do Supabase
-- =====================================================

-- 1. Criar a tabela
CREATE TABLE IF NOT EXISTS user_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

-- 2. Habilitar Row Level Security
ALTER TABLE user_approvals ENABLE ROW LEVEL SECURITY;

-- 3. Qualquer usuário autenticado pode inserir seu próprio registro
CREATE POLICY "Users can insert own approval" ON user_approvals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Qualquer usuário autenticado pode ler seu próprio status
CREATE POLICY "Users can read own status" ON user_approvals
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Admin (nogueira.analytics@gmail.com) pode ler TODOS os registros
CREATE POLICY "Admin can read all" ON user_approvals
  FOR SELECT USING (
    (auth.jwt() ->> 'email') = 'nogueira.analytics@gmail.com'
  );

-- 6. Admin pode atualizar qualquer registro (aprovar/rejeitar)
CREATE POLICY "Admin can update all" ON user_approvals
  FOR UPDATE USING (
    (auth.jwt() ->> 'email') = 'nogueira.analytics@gmail.com'
  );

-- 7. Admin pode deletar registros
CREATE POLICY "Admin can delete all" ON user_approvals
  FOR DELETE USING (
    (auth.jwt() ->> 'email') = 'nogueira.analytics@gmail.com'
  );

-- 8. Auto-aprovar o admin caso ele já tenha conta
-- (Substitua o e-mail abaixo se necessário)
INSERT INTO user_approvals (user_id, email, status, approved_at)
SELECT id, email, 'approved', NOW()
FROM auth.users
WHERE email = 'nogueira.analytics@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET status = 'approved', approved_at = NOW();
