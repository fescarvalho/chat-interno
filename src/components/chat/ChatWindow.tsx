import { useState, useRef, useEffect } from "react";
import { useChatStore, type ChatSession } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { supabase } from "@/lib/supabase";
import { uploadChatFile } from "@/lib/storage";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Phone, Video, MoreVertical, Paperclip, FileIcon, Loader2, Share2 } from "lucide-react";
import { LinkPreview } from "@/components/chat/LinkPreview";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  chat: ChatSession;
}

export function ChatWindow({ chat }: ChatWindowProps) {
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Estado para o Indicador de Digitando
  const [typingUser, setTypingUser] = useState<string | null>(null);
  
  const { user } = useAuthStore();
  const { currentUserProfile } = useChatStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const isTypingTimeoutRef = useRef<any>(null);
  const hideTypingTimeoutRef = useRef<any>(null);

  // Efeito 1: Scroll Automático Inteligente
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, typingUser]);

  // Efeito 2: Conectar ao canal de "Digitando..." via Broadcast do Supabase
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`typing:${chat.id}`, {
      config: { broadcast: { self: false } }
    });

    channel.on('broadcast', { event: 'typing' }, (payload) => {
      setTypingUser(payload.payload.user_name);
      
      clearTimeout(hideTypingTimeoutRef.current);
      hideTypingTimeoutRef.current = setTimeout(() => {
        setTypingUser(null);
      }, 3000);
    }).subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat.id, user]);

  const sendMessage = async (content: string, fileData?: { url: string, name: string, type: string }) => {
    if (!user) return;
    
    // Fallback seguro caso crypto.randomUUID falhe em ambientes sem HTTPS restrito
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);

    const tempMessage = {
      id: tempId,
      chat_id: chat.id,
      sender_id: user.id,
      content: content || null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
      created_at: new Date().toISOString()
    };
    
    // Mostra a mensagem na tela local antes mesmo da internet processar
    useChatStore.getState().addMessage(chat.id, tempMessage);

    // Envia pro banco
    const { error } = await supabase.from('messages').insert({
      id: tempId, // Usamos o mesmo ID que mostramos na tela
      chat_id: chat.id,
      sender_id: user.id,
      content: content || null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null
    });

    if (error) {
      console.error("Erro ao enviar mensagem:", error);
    }
  };

  const shareWhatsApp = async (fileUrl: string, fileName: string) => {
    const text = `Confira este arquivo: *${fileName}*\n\n${fileUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(waUrl);
    } catch {
      window.open(waUrl, '_blank');
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    
    if (!isTypingTimeoutRef.current && channelRef.current) {
      try {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_name: currentUserProfile?.name || 'Alguém' }
        });
      } catch (err) {
        console.warn("Erro ao enviar broadcast", err);
      }
      
      isTypingTimeoutRef.current = setTimeout(() => {
        isTypingTimeoutRef.current = null;
      }, 2000);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    const content = text;
    setText(""); // Limpa imediatamente
    await sendMessage(content);
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    setIsUploading(true);
    
    // Processa todos os arquivos selecionados
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { url, error } = await uploadChatFile(chat.id, file);
      if (!error && url) {
        // Envia como uma mensagem separada
        await sendMessage("", { url, name: file.name, type: file.type });
      }
    }
    
    setIsUploading(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files);
    }
  };

  return (
    <div 
      className="flex flex-col h-full flex-1 min-h-0 bg-background relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDrop={onDrop}
    >
      {/* Overlay de Drag & Drop */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-bounce">
              <Paperclip className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-primary">Solte os arquivos aqui para enviar</h2>
          </div>
        </div>
      )}

      {/* Header do Chat */}
      <div className="h-16 flex items-center justify-between px-6 border-b bg-background z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarFallback>{chat.name?.substring(0,2).toUpperCase() || "CH"}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-semibold">{chat.name}</span>
            <span className="text-xs text-muted-foreground">
              {chat.type === 'GROUP' ? 'Grupo' : 'Chat Direto'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon"><Phone className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon"><Video className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Lista de Mensagens */}
      <ScrollArea className="flex-1 p-4 min-h-0">
        <div className="space-y-4 max-w-4xl mx-auto flex flex-col justify-end min-h-full pb-4">
          {chat.messages.map((msg: any) => {
            const isMe = msg.sender_id === user?.id;
            const isImage = msg.file_type?.startsWith('image/');
            
            return (
              <div 
                key={msg.id} 
                className={cn(
                  "flex w-max max-w-[75%] flex-col gap-2 rounded-2xl px-4 py-3 text-sm shadow-sm",
                  isMe 
                    ? "ml-auto bg-primary text-primary-foreground rounded-br-none" 
                    : "bg-muted text-foreground rounded-bl-none"
                )}
              >
                {/* Renderização de Anexos */}
                {msg.file_url && isImage && (
                  <div className="relative group/img">
                    <img src={msg.file_url} alt="Anexo" className="max-w-xs rounded-lg object-cover" />
                    <button
                      onClick={() => shareWhatsApp(msg.file_url, msg.file_name || 'Imagem')}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-green-600 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-all shadow-md"
                      title="Encaminhar via WhatsApp"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
                
                {msg.file_url && !isImage && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const { open } = await import('@tauri-apps/plugin-shell');
                          await open(msg.file_url);
                        } catch (err) {
                          window.open(msg.file_url, "_blank");
                        }
                      }}
                      className="flex-1 flex items-center gap-2 bg-background/20 p-2 rounded-md hover:bg-background/30 transition text-left"
                    >
                      <FileIcon className="h-8 w-8 shrink-0" />
                      <span className="truncate max-w-[180px] font-medium">{msg.file_name}</span>
                    </button>
                    
                    <button
                      onClick={() => shareWhatsApp(msg.file_url, msg.file_name || 'Arquivo')}
                      className="p-2 bg-green-500/10 hover:bg-green-500 hover:text-white text-green-600 rounded-full transition-colors flex-shrink-0"
                      title="Encaminhar via WhatsApp"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
                
                {/* Texto da mensagem */}
                {msg.content && <span>{msg.content}</span>}
                
                {/* Pré-visualização de Link (se houver) */}
                {msg.content && (() => {
                  const urlMatch = msg.content.match(/(https?:\/\/[^\s]+)/);
                  if (urlMatch && urlMatch[0]) {
                    return <LinkPreview url={urlMatch[0]} />;
                  }
                  return null;
                })()}
                
                <span className={cn(
                  "text-[10px] opacity-70 flex justify-end",
                  isMe ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            );
          })}
          
          {/* Indicador de quem está digitando */}
          {typingUser && (
            <div className="flex w-max max-w-[75%] gap-2 px-4 py-2 text-sm text-muted-foreground animate-pulse">
              <span>{typingUser} está digitando...</span>
            </div>
          )}

          {/* Âncora invisível para o Scroll Automático */}
          <div ref={messagesEndRef} className="h-px w-full" />
        </div>
      </ScrollArea>

      {/* Input de Mensagem */}
      <div className="p-4 bg-background border-t">
        <form 
          onSubmit={handleSend}
          className="max-w-4xl mx-auto flex items-end gap-2 bg-muted/50 p-2 rounded-2xl border focus-within:ring-1 ring-ring/50 transition-shadow"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple
            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          />
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </Button>
          
          <Input 
            value={text}
            onChange={handleTextChange}
            placeholder={isUploading ? "Enviando arquivos..." : "Digite uma mensagem... (Arraste arquivos aqui)"} 
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-6 resize-none"
            disabled={isUploading}
          />
          
          <Button 
            type="submit" 
            size="icon" 
            disabled={!text.trim() || isUploading}
            className="rounded-full shrink-0 h-10 w-10 mb-1"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
