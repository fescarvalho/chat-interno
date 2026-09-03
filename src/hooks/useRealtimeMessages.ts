import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/useChatStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { isPermissionGranted, requestPermission, sendNotification, onAction } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useRealtimeMessages() {
  const { addMessage, openTabs } = useChatStore();
  const { user } = useAuthStore();

  useEffect(() => {
    let unlistenAction: any;
    
    // Pede permissão do sistema para Notificações, se ainda não tiver
    const setupNotifications = async () => {
      // Como esse código roda também na Web, envolvemos em try/catch pois o plugin Tauri só existe no Desktop
      try {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }

        if (permissionGranted) {
          // Escuta quando o usuário CLICAR na notificação do Windows
          unlistenAction = await onAction(async (notification: any) => {
            // Traz a janela do app para a frente!
            await getCurrentWindow().unminimize();
            await getCurrentWindow().show();
            await getCurrentWindow().setFocus();
            
            // O actionTypeId vai conter o ID do rementente (sender_id)
            if (notification.actionTypeId) {
              const state = useChatStore.getState();
              const sender = state.usersList.find(u => u.id === notification.actionTypeId);
              if (sender && state.user) {
                state.startDirectChat(state.user.id, sender);
              }
            }
          });
        }
      } catch (err) {
        // Ignora o erro se estiver rodando no navegador Web (npx vite dev)
      }
    };
    
    setupNotifications();

    console.log("📡 Conectando ao Supabase Realtime...");
    
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new;
          const state = useChatStore.getState();
          const tab = state.openTabs.find(t => t.id === newMessage.chat_id);
          
          let jaExiste = false;
          if (tab) {
            jaExiste = tab.messages.some(m => m.id === newMessage.id);
            if (!jaExiste) {
              addMessage(newMessage.chat_id, newMessage);
            }
          } else if (user) {
            // BLINDAGEM DE PRIVACIDADE:
            // Como o Supabase Realtime pode vazar o evento na rede pública, 
            // verificamos se o usuário atual REALMENTE é membro deste chat antes de notificar.
            const { data: membership } = await supabase
              .from('chat_members')
              .select('id')
              .eq('chat_id', newMessage.chat_id)
              .eq('user_id', user.id)
              .single();
              
            if (!membership) {
              // Se eu não sou membro desse chat (ex: Matheus mandando pra Laís), 
              // eu ignoro a mensagem silenciosamente e evito vazar a notificação.
              return; 
            }
          }

          // Se a mensagem for de outra pessoa e não estiver na aba ativa, incrementa a "bolinha vermelha"
          if (user && newMessage.sender_id !== user.id) {
            if (!tab || state.activeTabId !== newMessage.chat_id) {
               useChatStore.getState().incrementUnreadForUser(newMessage.sender_id);
            }
          }

          // Notificação Nativa: Se a mensagem NÃO foi enviada por mim e ainda não foi processada
          if (!jaExiste && user && newMessage.sender_id !== user.id) {
            try {
              if (await isPermissionGranted()) {
                // Tenta buscar o nome de quem enviou (pode usar o cache de contatos do store)
                const sender = state.usersList.find(u => u.id === newMessage.sender_id);
                const senderName = sender ? sender.name : "Nova mensagem";

                let bodyText = newMessage.content || "Enviou um arquivo";
                if (newMessage.file_name) {
                  bodyText = `Anexo: ${newMessage.file_name}`;
                }

                sendNotification({
                  title: `Nova mensagem de ${senderName}`,
                  body: bodyText,
                  icon: "default",
                  actionTypeId: newMessage.sender_id // Guardamos o ID do remetente aqui para o clique!
                });
              }
            } catch (err) {
              // Ignora no navegador web
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (unlistenAction) unlistenAction();
    };
  }, [addMessage, user]);
}
