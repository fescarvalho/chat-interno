import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 30;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reply_to_sender_name: string | null;
  created_at: string;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY';
};

export type ChatSession = {
  id: string;
  name: string | null;
  type: 'DIRECT' | 'GROUP';
  messages: Message[];
  participants: UserProfile[];
  unreadCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
};

// ─── Interface do Store ────────────────────────────────────────────────────────

interface ChatState {
  openTabs: ChatSession[];
  activeTabId: string | null;
  chatList: ChatSession[];
  usersList: UserProfile[];
  currentUserProfile: UserProfile | null;
  unreadByUserId: Record<string, number>;

  // Ações síncronas
  openChat: (chat: ChatSession) => void;
  closeChat: (chatId: string) => void;
  setActiveTab: (chatId: string) => void;
  addMessage: (chatId: string, message: Message) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  deleteMessageById: (messageId: string) => void;
  updateUserStatus: (userId: string, status: string) => void;

  // Controle de não-lidas
  incrementUnreadForUser: (userId: string) => void;
  clearUnreadForUser: (userId: string) => void;

  // Ações assíncronas
  fetchUsers: (currentUserId: string) => Promise<void>;
  startDirectChat: (currentUserId: string, otherUser: UserProfile) => Promise<void>;
  loadMoreMessages: (chatId: string) => Promise<void>;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  openTabs: [],
  activeTabId: null,
  chatList: [],
  usersList: [],
  currentUserProfile: null,
  unreadByUserId: {},

  openChat: (chat) =>
    set((state) => {
      const exists = state.openTabs.find((t) => t.id === chat.id);
      const newUnread = { ...state.unreadByUserId };
      if (chat.participants && chat.participants[0]) {
        newUnread[chat.participants[0].id] = 0;
      }
      return {
        openTabs: exists ? state.openTabs : [...state.openTabs, chat],
        activeTabId: chat.id,
        unreadByUserId: newUnread,
      };
    }),

  closeChat: (chatId) =>
    set((state) => {
      const newTabs = state.openTabs.filter((t) => t.id !== chatId);
      return {
        openTabs: newTabs,
        activeTabId:
          state.activeTabId === chatId
            ? newTabs[newTabs.length - 1]?.id || null
            : state.activeTabId,
      };
    }),

  setActiveTab: (chatId) =>
    set((state) => {
      const tab = state.openTabs.find((t) => t.id === chatId);
      const newUnread = { ...state.unreadByUserId };
      if (tab?.participants?.[0]) {
        newUnread[tab.participants[0].id] = 0;
      }
      return { activeTabId: chatId, unreadByUserId: newUnread };
    }),

  addMessage: (chatId, message) =>
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.id === chatId
          ? {
              ...tab,
              messages: [...tab.messages, message],
              unreadCount:
                state.activeTabId !== chatId ? tab.unreadCount + 1 : 0,
            }
          : tab
      ),
    })),

  deleteMessage: (chatId, messageId) =>
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.id === chatId
          ? {
              ...tab,
              messages: tab.messages.filter((m) => m.id !== messageId),
            }
          : tab
      ),
    })),

  deleteMessageById: (messageId) =>
    set((state) => ({
      openTabs: state.openTabs.map((tab) => ({
        ...tab,
        messages: tab.messages.filter((m) => m.id !== messageId),
      })),
    })),

  updateUserStatus: (userId, status) =>
    set((state) => ({
      usersList: state.usersList.map((u) =>
        u.id === userId ? { ...u, status: status as UserProfile['status'] } : u
      ),
      currentUserProfile:
        state.currentUserProfile?.id === userId
          ? { ...state.currentUserProfile, status: status as UserProfile['status'] }
          : state.currentUserProfile,
    })),

  incrementUnreadForUser: (userId) =>
    set((state) => ({
      unreadByUserId: {
        ...state.unreadByUserId,
        [userId]: (state.unreadByUserId[userId] || 0) + 1,
      },
    })),

  clearUnreadForUser: (userId) =>
    set((state) => ({
      unreadByUserId: { ...state.unreadByUserId, [userId]: 0 },
    })),

  // ── Busca todos os usuários (exceto eu) e meu próprio perfil ──────────────
  fetchUsers: async (currentUserId) => {
    const [{ data, error }, { data: myProfile }] = await Promise.all([
      supabase.from('users').select('*').neq('id', currentUserId),
      supabase.from('users').select('*').eq('id', currentUserId).single(),
    ]);

    if (!error && data) {
      set({ usersList: data as UserProfile[], currentUserProfile: myProfile as UserProfile });
    }
  },

  // ── Inicia ou re-abre um chat direto ──────────────────────────────────────
  startDirectChat: async (currentUserId, otherUser) => {
    try {
      // 1. Já está aberto como aba?
      const existingTab = get().openTabs.find(
        (tab) =>
          tab.type === 'DIRECT' &&
          tab.participants.some((p) => p.id === otherUser.id)
      );
      if (existingTab) {
        get().setActiveTab(existingTab.id);
        return;
      }

      // 2. Busca chats que a outra pessoa tem
      const { data: otherMemberships, error: err1 } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', otherUser.id);

      if (err1) console.error('Erro ao buscar chats do contato:', err1);

      const otherChatIds = otherMemberships?.map((m) => m.chat_id) || [];
      let targetChatId: string | null = null;

      // 3. Verifica se EU estou em algum desses chats
      if (otherChatIds.length > 0) {
        const { data: myMemberships, error: err2 } = await supabase
          .from('chat_members')
          .select('chat_id')
          .eq('user_id', currentUserId)
          .in('chat_id', otherChatIds);

        if (err2) console.error('Erro ao buscar meus chats compartilhados:', err2);

        if (myMemberships && myMemberships.length > 0) {
          targetChatId = myMemberships[0].chat_id;
        }
      }

      let chatData: ChatSession;

      if (targetChatId) {
        // 4A. Chat existente → carrega as últimas PAGE_SIZE mensagens
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', targetChatId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        const orderedMessages = ((messages || []) as Message[]).reverse();

        chatData = {
          id: targetChatId,
          name: otherUser.name,
          type: 'DIRECT',
          messages: orderedMessages,
          participants: [otherUser],
          unreadCount: 0,
          hasMore: (messages || []).length === PAGE_SIZE,
          isLoadingMore: false,
        };
      } else {
        // 4B. Cria novo chat
        const newChatId = crypto.randomUUID();

        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({ id: newChatId, type: 'DIRECT', updated_at: new Date().toISOString() })
          .select()
          .single();

        if (chatError || !newChat) {
          console.error('Erro ao criar chat:', chatError);
          return;
        }

        targetChatId = newChat.id;

        const { error: membersError } = await supabase.from('chat_members').insert([
          { id: crypto.randomUUID(), chat_id: targetChatId, user_id: currentUserId },
          { id: crypto.randomUUID(), chat_id: targetChatId, user_id: otherUser.id },
        ]);

        if (membersError) console.error('Erro ao inserir membros:', membersError);

        chatData = {
          id: targetChatId,
          name: otherUser.name,
          type: 'DIRECT',
          messages: [],
          participants: [otherUser],
          unreadCount: 0,
          hasMore: false,
          isLoadingMore: false,
        };
      }

      get().openChat(chatData);
    } catch (error) {
      console.error('Erro crítico em startDirectChat:', error);
    }
  },

  // ── Carrega mensagens mais antigas (paginação) ─────────────────────────────
  loadMoreMessages: async (chatId) => {
    const state = get();
    const tab = state.openTabs.find((t) => t.id === chatId);
    if (!tab || !tab.hasMore || tab.isLoadingMore) return;

    // Marca como carregando
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === chatId ? { ...t, isLoadingMore: true } : t
      ),
    }));

    const oldestDate = tab.messages[0]?.created_at;

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .lt('created_at', oldestDate || new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    const olderMessages = ((data || []) as Message[]).reverse();

    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === chatId
          ? {
              ...t,
              messages: [...olderMessages, ...t.messages],
              hasMore: olderMessages.length === PAGE_SIZE,
              isLoadingMore: false,
            }
          : t
      ),
    }));
  },
}));
