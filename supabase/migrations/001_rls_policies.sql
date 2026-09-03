-- =====================================================
-- ChatPC — Row-Level Security Policies
-- =====================================================
-- Regra essencial: Um usuário autenticado só pode
-- SELECT/INSERT em chats onde é membro (chat_members).
-- =====================================================

-- -----------------------------------------------
-- 0. Função auxiliar: verifica membership
--    SECURITY DEFINER evita recursão infinita no RLS
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.is_chat_member(p_chat_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.chat_members
    WHERE chat_id = p_chat_id
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------
-- 1. Tabela: users
-- -----------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ver outros usuários
-- (necessário para buscar contatos e exibir avatares)
CREATE POLICY "users_select_authenticated"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- Usuário só pode atualizar seu próprio perfil
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------
-- 2. Tabela: chats
-- -----------------------------------------------
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Usuário só vê chats dos quais é membro
CREATE POLICY "chats_select_member"
  ON public.chats
  FOR SELECT
  TO authenticated
  USING (public.is_chat_member(id));

-- Qualquer usuário autenticado pode criar um chat
CREATE POLICY "chats_insert_authenticated"
  ON public.chats
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Apenas membros podem atualizar o chat (ex: nome do grupo)
CREATE POLICY "chats_update_member"
  ON public.chats
  FOR UPDATE
  TO authenticated
  USING (public.is_chat_member(id))
  WITH CHECK (public.is_chat_member(id));

-- -----------------------------------------------
-- 3. Tabela: chat_members
-- -----------------------------------------------
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas membros de chats onde ele participa
CREATE POLICY "chat_members_select"
  ON public.chat_members
  FOR SELECT
  TO authenticated
  USING (public.is_chat_member(chat_id));

-- Usuário autenticado pode adicionar membros
-- (em produção, considere restringir a admins do grupo)
CREATE POLICY "chat_members_insert"
  ON public.chat_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chat_member(chat_id) OR user_id = auth.uid());

-- Usuário pode sair de um chat (deletar própria membership)
CREATE POLICY "chat_members_delete_own"
  ON public.chat_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------
-- 4. Tabela: messages
-- -----------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Usuário só lê mensagens de chats onde é membro
CREATE POLICY "messages_select_member"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.is_chat_member(chat_id));

-- Usuário só insere mensagens em chats onde é membro
-- E o sender_id deve ser o próprio usuário
CREATE POLICY "messages_insert_member"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_chat_member(chat_id)
    AND sender_id = auth.uid()
  );

-- -----------------------------------------------
-- 5. Índice de performance para RLS
-- -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_members_user_chat
  ON public.chat_members (user_id, chat_id);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created
  ON public.messages (chat_id, created_at DESC);

-- -----------------------------------------------
-- 6. Trigger: auto-criar usuário na tabela users
--    quando um novo registro é criado no Supabase Auth
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, avatar_url, status, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    'OFFLINE',
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger no schema auth (Supabase)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------
-- 7. Storage: Bucket para arquivos do chat
-- -----------------------------------------------
-- Executar via Supabase Dashboard ou SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS no Storage: apenas membros do chat podem acessar
-- Os arquivos seguem o padrão: chat-files/{chat_id}/{filename}
CREATE POLICY "storage_select_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND public.is_chat_member((storage.foldername(name))[1]::UUID)
  );

CREATE POLICY "storage_insert_member"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND public.is_chat_member((storage.foldername(name))[1]::UUID)
  );
