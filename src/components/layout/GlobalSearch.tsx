import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const { user } = useAuthStore();
  const { startDirectChat, usersList } = useChatStore();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !user) return;
    
    setLoading(true);
    try {
      // Usa o Full Text Search nativo do Postgres no Supabase
      // Buscamos mensagens que contenham o texto, com um join simples
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, chat_id, sender_id,
          chats ( type )
        `)
        .textSearch('content', query.trim())
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        setResults(data);
      }
    } catch (err) {
      console.error("Erro na busca:", err);
    } finally {
      setLoading(false);
    }
  };

  const jumpToMessage = async (msg: any) => {
    // Para simplificar, abrimos o chat correspondente. 
    // Em produção, carregaríamos o histórico exato daquela data.
    const sender = usersList.find(u => u.id === msg.sender_id);
    if (sender) {
      await startDirectChat(user!.id, sender);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Search className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Motor de Busca Global</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSearch} className="flex items-center gap-2 mt-4">
          <Input 
            autoFocus
            placeholder="Buscar por palavras-chave nas mensagens..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </Button>
        </form>

        <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-2 pr-2">
          {results.length === 0 && !loading && query && (
            <div className="text-center p-8 text-muted-foreground">
              Nenhuma mensagem encontrada para "{query}".
            </div>
          )}
          
          {results.map((msg) => {
            const sender = usersList.find(u => u.id === msg.sender_id);
            return (
              <button
                key={msg.id}
                onClick={() => jumpToMessage(msg)}
                className="w-full text-left p-3 rounded-lg border border-border/50 bg-card hover:bg-accent hover:border-accent transition-all flex flex-col gap-1 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <MessageSquare className="h-3 w-3" />
                    {sender?.name || "Usuário"}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <p className="text-sm text-card-foreground line-clamp-2 leading-relaxed">
                  {/* Destaca a palavra pesquisada de forma simples */}
                  {msg.content?.split(new RegExp(`(${query})`, 'gi')).map((part: string, i: number) => 
                    part.toLowerCase() === query.toLowerCase() ? (
                      <span key={i} className="bg-yellow-200/50 text-yellow-900 dark:text-yellow-100 dark:bg-yellow-900/50 font-semibold">{part}</span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
