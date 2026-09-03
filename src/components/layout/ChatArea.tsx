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
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950">
        <div className="h-24 w-24 rounded-3xl bg-white dark:bg-slate-800 shadow-xl shadow-indigo-200/50 dark:shadow-indigo-900/20 flex items-center justify-center mb-8 rotate-3 transition-transform hover:rotate-6">
          <MessageSquarePlus className="h-12 w-12 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">Suas conversas</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-md text-center text-lg">
          Selecione um contato na barra lateral para começar a enviar mensagens.
        </p>
      </div>
    );
  }

  const activeChat = openTabs.find(t => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950 overflow-hidden">
      {/* Barra de Abas (Tabs) */}
      <div className="flex items-end px-2 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 overflow-x-auto no-scrollbar">
        {openTabs.map((tab) => (
          <div 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "group flex items-center h-10 px-4 min-w-40 max-w-64 border-t border-x rounded-t-xl mx-0.5 cursor-pointer select-none transition-all duration-200",
              activeTabId === tab.id 
                ? "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 relative z-10 before:absolute before:-bottom-px before:left-0 before:right-0 before:h-px before:bg-white dark:before:bg-slate-950 shadow-sm"
                : "bg-slate-100 dark:bg-slate-800/50 border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
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
