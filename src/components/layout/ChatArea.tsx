import { useChatStore } from "@/stores/useChatStore";
import { ChatWindow } from "../chat/ChatWindow";
import { X, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";

export function ChatArea() {
  useRealtimeMessages();
  const { openTabs, activeTabId, setActiveTab, closeChat } = useChatStore();

  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <MessageSquarePlus className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Nenhuma conversa aberta</h2>
        <p className="text-muted-foreground mt-2">
          Selecione um chat na barra lateral para começar a enviar mensagens.
        </p>
      </div>
    );
  }

  const activeChat = openTabs.find(t => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
      {/* Barra de Abas (Tabs) */}
      <div className="flex items-end px-2 pt-2 border-b bg-muted/40 overflow-x-auto no-scrollbar">
        {openTabs.map((tab) => (
          <div 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "group flex items-center h-10 px-4 min-w-40 max-w-64 border-t border-x rounded-t-lg mx-0.5 cursor-pointer select-none transition-colors",
              activeTabId === tab.id 
                ? "bg-background border-border relative z-10 before:absolute before:-bottom-px before:left-0 before:right-0 before:h-px before:bg-background"
                : "bg-muted/50 border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="truncate flex-1 text-sm font-medium">
              {tab.name || "Chat sem nome"}
            </span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                closeChat(tab.id);
              }}
              className="ml-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Janela de Chat Ativa */}
      {activeChat ? (
        <ChatWindow chat={activeChat} />
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}
