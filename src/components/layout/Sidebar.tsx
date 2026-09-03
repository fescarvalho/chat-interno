import { useEffect } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { GlobalSearch } from "@/components/layout/GlobalSearch";

export function Sidebar() {
  const { user, signOut } = useAuthStore();
  const { usersList, currentUserProfile, fetchUsers, startDirectChat } = useChatStore();
  const unreadByUserId = useChatStore((state) => state.unreadByUserId || {});

  useEffect(() => {
    if (user) {
      fetchUsers(user.id);
    }
  }, [user, fetchUsers]);

  const handleSignOut = async () => {
    // Altera o status para OFFLINE antes de deslogar
    if (user) {
      await supabase.from('users').update({ status: 'OFFLINE' }).eq('id', user.id);
    }
    await signOut();
  };

  return (
    <aside className="w-80 flex-shrink-0 border-r border-indigo-900/50 bg-slate-900 text-slate-100 flex flex-col h-full">
      {/* Cabeçalho do Meu Usuário */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-slate-950/50">
        <div className="flex items-center">
          <div className="relative">
            <Avatar className="h-10 w-10 border border-indigo-500/50 shadow-sm">
              <AvatarFallback className="bg-indigo-600 text-white">{currentUserProfile?.name?.substring(0,2).toUpperCase() || user?.email?.substring(0,2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900"></div>
          </div>
          <div className="ml-3 flex flex-col max-w-[140px]">
            <span className="text-sm font-semibold truncate text-white">{currentUserProfile?.name || 'Carregando...'}</span>
            <span className="text-xs text-emerald-400 font-medium tracking-wide">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <GlobalSearch />
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair" className="hover:bg-white/10 hover:text-white text-slate-400">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="p-4 border-b border-white/10">
        <div className="relative group">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
          <Input 
            type="text" 
            placeholder="Buscar contatos..." 
            className="pl-9 bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 rounded-full"
          />
        </div>
      </div>

      {/* Lista de Contatos/Chats */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Contatos ({usersList.length})
          </div>
          
          {usersList.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Nenhum outro usuário encontrado.
            </div>
          ) : (
            usersList.map((contact) => (
              <button 
                key={contact.id}
                onClick={() => user && startDirectChat(user.id, contact)}
                className="w-full flex items-center p-3 rounded-xl hover:bg-white/5 transition-all duration-200 relative group"
              >
                <div className="relative">
                  <Avatar className="h-11 w-11 border border-white/10 shadow-sm transition-transform group-hover:scale-105">
                    <AvatarImage src={contact.avatar_url} />
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 font-medium">{contact.name?.substring(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {/* Bolinha de Status */}
                  <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${contact.status === 'ONLINE' ? 'bg-emerald-400' : 'bg-slate-500'}`}></div>
                </div>
                
                <div className="ml-3 text-left flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{contact.name}</div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{contact.email}</div>
                </div>
                
                {/* Badge de Não Lidas */}
                {unreadByUserId[contact.id] > 0 && (
                  <div className="ml-2 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 shadow-md">
                    {unreadByUserId[contact.id]}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
