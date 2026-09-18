import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore, type Message } from '@/stores/useChatStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
  registerActionTypes,
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useRealtimeMessages() {
  const { addMessage, updateUserStatus } = useChatStore();
  const { user } = useAuthStore();

  useEffect(() => {
    let unlistenNotif: (() => void) | undefined;

    // ── Configuração de notificações nativas ──────────────────────────────────
    const setupNotifications = async () => {
      try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }

        if (permissionGranted) {
          await registerActionTypes([
            {
              id: 'open_chat',
              actions: [{ id: 'open', title: 'Abrir Chat' }],
            },
          ]);

          unlistenNotif = await onAction((notification) => {
            // Quando o usuário clica na notificação, traz o app para frente
            const appWindow = getCurrentWindow();
            appWindow.show().catch(() => {});
            appWindow.unminimize().catch(() => {});
            appWindow.setFocus().catch(() => {});

            const extra = notification.extra as Record<string, any> | undefined;
            if (extra?.chat_id) {
              const state = useChatStore.getState();
              const authState = useAuthStore.getState();

              const existingTab = state.openTabs.find((t) => t.id === extra.chat_id);
              if (existingTab) {
                state.setActiveTab(extra.chat_id);
              } else if (extra.sender_id && authState.user) {
                const sender = state.usersList.find((u) => u.id === extra.sender_id);
                if (sender) {
                  state.startDirectChat(authState.user.id, sender);
                }
              }
            }
          });
        }
      } catch {
        // Silenciosamente ignora se não está rodando no Tauri (ex: browser dev)
      }
    };

    setupNotifications();

    // ── Canal 1: Mensagens em tempo real ─────────────────────────────────────
    const messagesChannel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMessage = payload.new as Message;
          const state = useChatStore.getState();
          const tab = state.openTabs.find((t) => t.id === newMessage.chat_id);

          let jaExiste = false;

          if (tab) {
            jaExiste = tab.messages.some((m) => m.id === newMessage.id);
            if (!jaExiste) {
              addMessage(newMessage.chat_id, newMessage);
            }
          } else if (user) {
            // Blindagem de privacidade: só notifica se eu sou membro do chat
            const { data: membership } = await supabase
              .from('chat_members')
              .select('id')
              .eq('chat_id', newMessage.chat_id)
              .eq('user_id', user.id)
              .single();

            if (!membership) return;
          }

          // Incrementa badge de não-lidas se não for minha mensagem e não estou vendo esse chat
          if (user && newMessage.sender_id !== user.id) {
            if (!tab || state.activeTabId !== newMessage.chat_id) {
              useChatStore.getState().incrementUnreadForUser(newMessage.sender_id);
            }
          }

          // Notificação nativa para mensagens de outros usuários
          if (!jaExiste && user && newMessage.sender_id !== user.id) {
            try {
              if (await isPermissionGranted()) {
                const sender = useChatStore
                  .getState()
                  .usersList.find((u) => u.id === newMessage.sender_id);
                const senderName = sender?.name ?? 'Nova mensagem';
                const bodyText = newMessage.file_name
                  ? `📎 Anexo: ${newMessage.file_name}`
                  : newMessage.content || 'Enviou um arquivo';

                sendNotification({
                  title: `Nova mensagem de ${senderName}`,
                  body: bodyText,
                  actionTypeId: 'open_chat',
                  extra: {
                    chat_id: newMessage.chat_id,
                    sender_id: newMessage.sender_id,
                  },
                });
              }
            } catch {
              // Ignora no navegador web
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            useChatStore.getState().deleteMessageById(deletedId);
          }
        }
      )
      .subscribe();

    // ── Canal 2: Status dos usuários em tempo real ───────────────────────────
    // IMPORTANTE: Habilite Realtime para a tabela `users` no painel do Supabase:
    // Database → Replication → Habilitar para a tabela `users`
    const usersStatusChannel = supabase
      .channel('public:users:status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          if (updated?.id && updated?.status) {
            updateUserStatus(updated.id, updated.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(usersStatusChannel);
      if (unlistenNotif) unlistenNotif();
    };
  }, [addMessage, user, updateUserStatus]);
}
