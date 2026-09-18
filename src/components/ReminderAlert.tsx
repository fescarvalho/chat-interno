import { useEffect, useState } from "react";
import { getReminders, removeReminder, type ChatReminder } from "@/lib/reminders";
import { playReminderSound } from "@/lib/sound";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { Bell, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/useChatStore";

export function ReminderAlert() {
  const [activeReminders, setActiveReminders] = useState<ChatReminder[]>([]);
  const { openTabs, setActiveTab, openChat, usersList } = useChatStore();

  useEffect(() => {
    const checkDueReminders = () => {
      const all = getReminders();
      const now = Date.now();
      const due = all.filter((r) => r.remindAt <= now);

      if (due.length > 0) {
        due.forEach((r) => {
          // Dispara som e notificação nativa
          playReminderSound();
          try {
            sendNotification({
              title: `⏰ Lembrete: ${r.senderName}`,
              body: r.messageContent || "Lembrete de mensagem",
            });
          } catch {}

          // Remove do armazenamento persistente para não disparar em loop
          removeReminder(r.id);
        });

        setActiveReminders((prev) => [...prev, ...due]);
      }
    };

    checkDueReminders();
    const interval = setInterval(checkDueReminders, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleGoToMessage = (reminder: ChatReminder) => {
    // Abre a aba se não estiver aberta
    const existingTab = openTabs.find((t) => t.id === reminder.chatId);
    if (existingTab) {
      setActiveTab(reminder.chatId);
    }

    // Fecha o alerta
    setActiveReminders((prev) => prev.filter((r) => r.id !== reminder.id));

    // Rola até a mensagem após um breve delay para garantir renderização da aba
    setTimeout(() => {
      const el = document.getElementById(`msg-${reminder.messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-4", "ring-amber-400", "ring-offset-2");
        setTimeout(() => {
          el.classList.remove("ring-4", "ring-amber-400", "ring-offset-2");
        }, 3000);
      }
    }, 200);
  };

  const handleDismiss = (id: string) => {
    setActiveReminders((prev) => prev.filter((r) => r.id !== id));
  };

  if (activeReminders.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto">
      {activeReminders.map((reminder) => (
        <div
          key={reminder.id}
          className="bg-card/95 backdrop-blur-md border-2 border-amber-500/50 shadow-2xl rounded-2xl p-4 flex flex-col gap-2 animate-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 animate-bounce">
                <Bell className="h-4 w-4 fill-amber-500" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  Lembrete de Mensagem
                </p>
                <p className="text-xs text-muted-foreground">
                  De: <span className="font-semibold text-foreground">{reminder.senderName}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDismiss(reminder.id)}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="bg-muted/50 p-2.5 rounded-xl border border-border/40 text-xs text-foreground/90 line-clamp-3 italic">
            "{reminder.messageContent}"
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDismiss(reminder.id)}
              className="text-xs h-8"
            >
              Dispensar
            </Button>
            <Button
              size="sm"
              onClick={() => handleGoToMessage(reminder)}
              className="text-xs h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Ver Mensagem
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
