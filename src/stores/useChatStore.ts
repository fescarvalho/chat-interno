import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database } from '@supabase/supabase-js'; // Idealmente, usaríamos os tipos gerados

export type ChatSession = {
  id: string;
  name: string | null;
  type: 'DIRECT' | 'GROUP';
  messages: any[];
  participants: any[];
  unreadCount: number;
};

interface ChatState {
  openTabs: ChatSession[];
  activeTabId: string | null;
  chatList: any[];
  usersList: any[]; // Lista de contatos disponíveis
  currentUserProfile: any | null; // Perfil detalhado do usuário logado
  unreadByUserId: Record<string, number>; // Controle de mensagens não lidas por remetente
  
  openChat: (chat: ChatSession) => void;
  closeChat: (chatId: string) => void;
  setActiveTab: (chatId: string) => void;
  addMessage: (chatId: string, message: any) => void;
  
  incrementUnreadForUser: (userId: string) => void;
  clearUnreadForUser: (userId: string) => void;
  
  // Ações Assíncronas Reais
  fetchUsers: (currentUserId: string) => Promise<void>;
  startDirectChat: (currentUserId: string, otherUser: any) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  openTabs: [],
  activeTabId: null,
  chatList: [],
  usersList: [],
  currentUserProfile: null,
  unreadByUserId: {},
  
  openChat: (chat) => set((state) => {
    const exists = state.openTabs.find(t => t.id === chat.id);
    // Limpa os não-lidos desta pessoa ao abrir o chat
    const newUnread = { ...state.unreadByUserId };
    if (chat.participants && chat.participants[0]) {
      newUnread[chat.participants[0].id] = 0;
    }
    
    return {
      openTabs: exists ? state.openTabs : [...state.openTabs, chat],
      activeTabId: chat.id,
      unreadByUserId: newUnread
    };
  }),
  
  closeChat: (chatId) => set((state) => {
    const newTabs = state.openTabs.filter(t => t.id !== chatId);
    return {
      openTabs: newTabs,
      activeTabId: state.activeTabId === chatId 
        ? (newTabs[newTabs.length - 1]?.id || null) 
        : state.activeTabId
    };
  }),
  
  setActiveTab: (chatId) => set((state) => {
    // Ao focar na aba, limpa os não-lidos
    const tab = state.openTabs.find(t => t.id === chatId);
    const newUnread = { ...state.unreadByUserId };
    if (tab && tab.participants && tab.participants[0]) {
      newUnread[tab.participants[0].id] = 0;
    }
    return { activeTabId: chatId, unreadByUserId: newUnread };
  }),
  
  incrementUnreadForUser: (userId) => set((state) => ({
    unreadByUserId: {
      ...state.unreadByUserId,
      [userId]: (state.unreadByUserId[userId] || 0) + 1
    }
  })),

  clearUnreadForUser: (userId) => set((state) => ({
    unreadByUserId: {
      ...state.unreadByUserId,
      [userId]: 0
    }
  })),
  
  addMessage: (chatId, message) => set((state) => ({
    openTabs: state.openTabs.map(tab => 
      tab.id === chatId 
        ? { ...tab, messages: [...tab.messages, message], unreadCount: state.activeTabId !== chatId ? tab.unreadCount + 1 : 0 }
        : tab
    )
  })),
  
  // Busca todos os usuários do banco (menos eu mesmo) e também o meu perfil
  fetchUsers: async (currentUserId) => {
    // Busca os outros contatos
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .neq('id', currentUserId);
      
    // Busca o meu perfil para mostrar o nome real no topo
    const { data: myProfile } = await supabase
      .from('users')
      .select('*')
      .eq('id', currentUserId)
      .single();
      
    if (!error && data) {
      set({ usersList: data, currentUserProfile: myProfile });
    }
  },

  // Inicia ou abre um chat existente com um contato
  startDirectChat: async (currentUserId, otherUser) => {
    try {
      // 1. Verifica se já temos essa aba aberta localmente
      const existingTab = get().openTabs.find(tab => 
        tab.type === 'DIRECT' && tab.participants.some(p => p.id === otherUser.id)
      );
      if (existingTab) {
        get().setActiveTab(existingTab.id);
        return;
      }

      // 2. Busca todos os chats em que a OUTRA pessoa está
      const { data: otherMemberships, error: err1 } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', otherUser.id);
        
      if (err1) console.error("Erro ao buscar chats do contato:", err1);
        
      const otherChatIds = otherMemberships?.map(m => m.chat_id) || [];
      let targetChatId = null;

      // 3. Se a pessoa tem chats, vamos ver se EU estou em algum deles
      if (otherChatIds.length > 0) {
        const { data: myMemberships, error: err2 } = await supabase
          .from('chat_members')
          .select('chat_id')
          .eq('user_id', currentUserId)
          .in('chat_id', otherChatIds);
          
        if (err2) console.error("Erro ao buscar meus chats compartilhados:", err2);

        // Pega o primeiro chat que temos em comum
        if (myMemberships && myMemberships.length > 0) {
          targetChatId = myMemberships[0].chat_id;
        }
      }

      let chatData;

      if (targetChatId) {
        // 4A. Já existe um chat! Vamos puxar as mensagens antigas
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', targetChatId)
          .order('created_at', { ascending: true });
        
        chatData = {
          id: targetChatId,
          name: otherUser.name,
          type: 'DIRECT',
          messages: messages || [],
          participants: [otherUser],
          unreadCount: 0
        };
      } else {
        // 4B. Não existe chat. Vamos criar um novo!
        const newChatId = crypto.randomUUID();
        
        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({ 
            id: newChatId, 
            type: 'DIRECT',
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (chatError || !newChat) {
          console.error("Erro ao criar tabela de chat:", chatError);
          return;
        }
        
        targetChatId = newChat.id;

        // Adiciona nós dois como membros do chat passando os IDs gerados
        const { error: membersError } = await supabase.from('chat_members').insert([
          { id: crypto.randomUUID(), chat_id: targetChatId, user_id: currentUserId },
          { id: crypto.randomUUID(), chat_id: targetChatId, user_id: otherUser.id }
        ]);

        if (membersError) {
          console.error("Erro ao inserir membros no chat:", membersError);
        }

        chatData = {
          id: targetChatId,
          name: otherUser.name,
          type: 'DIRECT',
          messages: [],
          participants: [otherUser],
          unreadCount: 0
        };
      }

      // 5. Abre a aba no frontend
      get().openChat(chatData as ChatSession);
      
    } catch (error) {
      console.error("Erro crítico em startDirectChat:", error);
    }
  }
}));
