import { useEffect } from "react";
import { MessageCircle, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastStore, type IncomingMessageToast } from "@/stores/useToastStore";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";

export function MessageToast() {
  const { toasts, removeToast } = useToastStore();
  const { openTabs, setActiveTab, usersList, startDirectChat } = useChatStore();
  const { user } = useAuthStore();

  // Auto-dismiss após 6 segundos para cada toast
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        removeToast(toast.id);
      }, 6000)
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [toasts, removeToast]);

  const handleOpen = (toast: IncomingMessageToast) => {
    const existingTab = openTabs.find((t) => t.id === toast.chatId);
    if (existingTab) {
      setActiveTab(toast.chatId);
    } else if (toast.senderId && user) {
      const sender = usersList.find((u) => u.id === toast.senderId);
      if (sender) {
        startDirectChat(user.id, sender);
      }
    }
    removeToast(toast.id);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto select-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => handleOpen(toast)}
          className="group relative bg-card/95 backdrop-blur-md border border-primary/30 shadow-2xl rounded-2xl p-3.5 flex flex-col gap-2 cursor-pointer hover:border-primary transition-all duration-200 animate-in slide-in-from-bottom-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.avatarUrl ? (
                <img
                  src={toast.avatarUrl}
                  alt={toast.senderName}
                  className="h-9 w-9 rounded-full object-cover border border-primary/20 flex-shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 font-bold text-sm">
                  {toast.senderName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <p className="text-xs font-bold text-primary truncate">
                    {toast.senderName}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">Nova mensagem recebida</p>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-foreground/90 line-clamp-2 px-1 bg-muted/30 py-1 rounded-lg border border-border/40">
            {toast.content}
          </p>

          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                handleOpen(toast);
              }}
              className="text-xs h-7 gap-1 px-3 shadow-sm group-hover:bg-primary/90"
            >
              Abrir conversa
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
