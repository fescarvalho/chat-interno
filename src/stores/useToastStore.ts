import { create } from 'zustand';

export interface IncomingMessageToast {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  avatarUrl?: string | null;
  content: string;
  createdAt: number;
}

interface ToastState {
  toasts: IncomingMessageToast[];
  showToast: (toast: Omit<IncomingMessageToast, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    set((state) => ({
      // Mantém no máximo 3 notificações simultâneas
      toasts: [...state.toasts.slice(-2), { ...toast, id, createdAt: Date.now() }],
    }));
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
