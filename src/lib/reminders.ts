export interface ChatReminder {
  id: string;
  chatId: string;
  chatName: string;
  messageId: string;
  messageContent: string;
  senderName: string;
  remindAt: number; // timestamp em ms
  createdAt: number;
}

const STORAGE_KEY = "chatpc_reminders";

export function getReminders(): ChatReminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addReminder(
  reminder: Omit<ChatReminder, "id" | "createdAt">
): ChatReminder {
  const all = getReminders();
  const created: ChatReminder = {
    ...reminder,
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36),
    createdAt: Date.now(),
  };
  all.push(created);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return created;
}

export function removeReminder(id: string) {
  const all = getReminders().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
