-- =====================================================
-- Migration 002: Permitir exclusão de mensagens
-- =====================================================
-- Permite que o autor da mensagem possa deletá-la (Apagar para todos).
-- Se a foreign key com message_reads existir, garante exclusão em cascata.

-- 1. Política de DELETE para messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'messages' 
      AND policyname = 'messages_delete_own'
  ) THEN
    CREATE POLICY "messages_delete_own"
      ON public.messages
      FOR DELETE
      TO authenticated
      USING (sender_id = auth.uid());
  END IF;
END $$;

-- 2. Política de DELETE para message_reads caso exista RLS ativado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'message_reads'
  ) THEN
    EXECUTE 'ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename = 'message_reads' 
        AND policyname = 'message_reads_delete'
    ) THEN
      CREATE POLICY "message_reads_delete"
        ON public.message_reads
        FOR DELETE
        TO authenticated
        USING (true);
    END IF;
  END IF;
END $$;

-- 3. Habilitar REPLICA IDENTITY FULL na tabela messages
-- CRÍTICO: Sem isso, ao deletar um registro com RLS ativo, o Postgres não inclui
-- as colunas antigas (como chat_id) no evento do WAL. Como a política de SELECT 
-- depende de chat_id, o Supabase Realtime descarta o evento DELETE para os outros usuários!
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 4. Garantir que a tabela messages esteja incluída na publicação realtime do Supabase
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
