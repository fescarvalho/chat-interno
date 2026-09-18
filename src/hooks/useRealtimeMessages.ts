import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore, type Message } from '@/stores/useChatStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
  registerActionTypes,
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { type PluginListener } from '@tauri-apps/api/core';

export function useRealtimeMessages() {
  const { addMessage, updateUserStatus } = useChatStore();
  const { user } = useAuthStore();
  const lastNotifiedChatRef = useRef<{ chatId: string; senderId: string; time: number } | null>(null);

  useEffect(() => {
    let unlistenNotif: PluginListener | undefined;
    let unlistenFocus: UnlistenFn | undefined;

    // Abre a conversa do chat e ativa a aba
    const openChatFromNotification = (chatId: string, senderId?: string) => {
      const state = useChatStore.getState();
      const authState = useAuthStore.getState();

      const existingTab = state.openTabs.find((t) => t.id === chatId);
      if (existingTab) {
        state.setActiveTab(chatId);
      } else if (senderId && authState.user) {
        const sender = state.usersList.find((u) => u.id === senderId);
        if (sender) {
          state.startDirectChat(authState.user.id, sender);
        }
      }
    };

    // ── Escuta ativação da janela via clique em notificação no Windows ─────────
    listen('notification-window-focus', () => {
      if (lastNotifiedChatRef.current) {
        const { chatId, senderId, time } = lastNotifiedChatRef.current;
        // Abre o chat se a notificação foi recebida nos últimos 2 minutos
        if (Date.now() - time < 120000) {
          openChatFromNotification(chatId, senderId);
        }
      }
    })
      .then((unlisten) => {
        unlistenFocus = unlisten;
      })
      .catch(() => {});

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
            // Quando o usuário clica na notificação nativa (suportado no Mobile)
            const appWindow = getCurrentWindow();
            appWindow.show().catch(() => {});
            appWindow.unminimize().catch(() => {});
            appWindow.setFocus().catch(() => {});

            const extra = notification.extra as Record<string, any> | undefined;
            if (extra?.chat_id) {
              openChatFromNotification(extra.chat_id, extra.sender_id);
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

          // Notificação para mensagens de outros usuários
          if (!jaExiste && user && newMessage.sender_id !== user.id) {
            const sender = useChatStore
              .getState()
              .usersList.find((u) => u.id === newMessage.sender_id);
            const senderName = sender?.name ?? 'Nova mensagem';
            const bodyText = newMessage.file_name
              ? `📎 Anexo: ${newMessage.file_name}`
              : newMessage.content || 'Enviou um arquivo';

            // Guarda os dados da notificação para abrir a conversa imediatamente ao clicar
            lastNotifiedChatRef.current = {
              chatId: newMessage.chat_id,
              senderId: newMessage.sender_id,
              time: Date.now(),
            };

            // Exibe notificação flutuante in-app se o chat não for o que está aberto na tela
            if (state.activeTabId !== newMessage.chat_id) {
              useToastStore.getState().showToast({
                chatId: newMessage.chat_id,
                senderId: newMessage.sender_id,
                senderName,
                avatarUrl: sender?.avatar_url,
                content: bodyText,
              });
            }

            // Dispara notificação nativa do Windows
            try {
              if (await isPermissionGranted()) {
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
      if (unlistenFocus) unlistenFocus();
      unlistenNotif?.unregister();
    };
  }, [addMessage, user, updateUserStatus]);
}
