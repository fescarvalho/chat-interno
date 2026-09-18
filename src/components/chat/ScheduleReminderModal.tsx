import { useState } from "react";
import { Clock, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addReminder } from "@/lib/reminders";
import type { Message } from "@/stores/useChatStore";

interface ScheduleReminderModalProps {
  message: Message;
  chatId: string;
  chatName: string;
  onClose: () => void;
  onSuccess: (text: string) => void;
}

export function ScheduleReminderModal({
  message,
  chatId,
  chatName,
  onClose,
  onSuccess,
}: ScheduleReminderModalProps) {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);

  // Opções de tempo comuns no escritório
  const PRESETS = [
    { label: "Em 15 minutos", minutes: 15 },
    { label: "Em 30 minutos", minutes: 30 },
    { label: "Em 1 hora", minutes: 60 },
    { label: "Em 2 horas", minutes: 120 },
    {
      label: "Amanhã às 09:00",
      customCalc: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
      },
    },
  ];

  const handleConfirm = () => {
    const remindAt = Date.now() + selectedMinutes * 60 * 1000;
    const sender = message.reply_to_sender_name || "Colega";

    addReminder({
      chatId,
      chatName,
      messageId: message.id,
      messageContent: message.content || (message.file_name ? `📎 ${message.file_name}` : "Anexo"),
      senderName: sender,
      remindAt,
    });

    const targetDate = new Date(remindAt);
    const timeStr = targetDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    onSuccess(`Lembrete agendado para às ${timeStr}!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in-50 duration-200">
      <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <Clock className="h-4 w-4 text-amber-500" />
            <span>Lembrar-me desta mensagem</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-muted/50 p-2.5 rounded-xl border text-xs text-foreground/85 italic line-clamp-2">
          "{message.content || message.file_name || "Anexo"}"
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quando deseja ser lembrado?
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            {PRESETS.map((preset, idx) => {
              const mins = preset.customCalc ? preset.customCalc() : preset.minutes;
              const isSelected = selectedMinutes === mins;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedMinutes(mins)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary shadow-xs"
                      : "border-border/60 hover:bg-muted/50 text-foreground"
                  }`}
                >
                  <span>{preset.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-8">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="text-xs h-8 bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
          >
            <Clock className="h-3.5 w-3.5" />
            Definir Lembrete
          </Button>
        </div>
      </div>
    </div>
  );
}
