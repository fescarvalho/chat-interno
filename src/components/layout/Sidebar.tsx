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
    <aside className="w-80 flex-shrink-0 border-r bg-sidebar flex flex-col h-full">
      {/* Cabeçalho do Meu Usuário */}
      <div className="h-16 flex items-center justify-between px-4 border-b">
        <div className="flex items-center">
          <div className="relative">
            <Avatar className="h-10 w-10 border">
              <AvatarFallback>{currentUserProfile?.name?.substring(0,2).toUpperCase() || user?.email?.substring(0,2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
          </div>
          <div className="ml-3 flex flex-col max-w-[140px]">
            <span className="text-sm font-medium truncate">{currentUserProfile?.name || 'Carregando...'}</span>
            <span className="text-xs text-green-500 font-medium">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <GlobalSearch />
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair">
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder="Buscar contatos..." 
            className="pl-8 bg-sidebar-accent"
          />
        </div>
      </div>

      {/* Lista de Contatos/Chats */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Contatos ({usersList.length})
          </div>
          
          {usersList.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum outro usuário encontrado.
            </div>
          ) : (
            usersList.map((contact) => (
              <button 
                key={contact.id}
                onClick={() => user && startDirectChat(user.id, contact)}
                className="w-full flex items-center p-3 rounded-lg hover:bg-sidebar-accent transition-colors relative"
              >
                <div className="relative">
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage src={contact.avatar_url} />
                    <AvatarFallback>{contact.name?.substring(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {/* Bolinha de Status */}
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${contact.status === 'ONLINE' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                </div>
                
                <div className="ml-3 text-left flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{contact.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{contact.email}</div>
                </div>
                
                {/* Badge de Não Lidas */}
                {unreadByUserId[contact.id] > 0 && (
                  <div className="ml-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
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
