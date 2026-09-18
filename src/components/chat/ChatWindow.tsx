import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { useChatStore, type ChatSession, type Message } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { supabase } from "@/lib/supabase";
import { uploadChatFile } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  FileIcon,
  Loader2,
  Share2,
  Smile,
  CornerUpLeft,
  X,
  ChevronUp,
  Check,
  CheckCheck,
  Copy,
  Pin,
  PinOff,
  UploadCloud,
  BellRing,
  Clock,
  FolderOpen,
} from "lucide-react";
import { LinkPreview } from "@/components/chat/LinkPreview";
import { ImageLightbox } from "@/components/chat/ImageLightbox";
import { WindowsPathPreview } from "@/components/chat/WindowsPathPreview";
import { ScheduleReminderModal } from "@/components/chat/ScheduleReminderModal";
import { playNudgeSound } from "@/lib/sound";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { cn } from "@/lib/utils";

// ─── Hook: detecta dark mode do sistema ───────────────────────────────────────
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDark;
}

// ─── Regex de emojis puros ────────────────────────────────────────────────────
const ONLY_EMOJI_RE =
  /^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\s]+$/u;

// ─── Props ────────────────────────────────────────────────────────────────────
interface ChatWindowProps {
  chat: ChatSession;
}

// ─────────────────────────────────────────────────────────────────────────────
export function ChatWindow({ chat }: ChatWindowProps) {
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [currentPinIndex, setCurrentPinIndex] = useState(0);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`chatpc_pinned_${chat.id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Estados de Chamar Atenção (Nudge)
  const [nudgeCooldown, setNudgeCooldown] = useState(0);
  const [isNudging, setIsNudging] = useState(false);
  const [nudgeAlertUser, setNudgeAlertUser] = useState<string | null>(null);

  // Estados de Lembretes e Toast
  const [reminderTargetMessage, setReminderTargetMessage] = useState<Message | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const dragCounterRef = useRef(0);

  // Timer de cooldown para não spammar o chamado de atenção
  useEffect(() => {
    if (nudgeCooldown <= 0) return;
    const timer = setInterval(() => {
      setNudgeCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [nudgeCooldown]);

  // Atualiza as mensagens fixadas ao alternar de chat
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chatpc_pinned_${chat.id}`);
      setPinnedIds(saved ? new Set(JSON.parse(saved)) : new Set());
      setCurrentPinIndex(0);
    } catch {}
  }, [chat.id]);

  const { user } = useAuthStore();
  const { currentUserProfile, loadMoreMessages } = useChatStore();
  const isDarkMode = useIsDarkMode();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);

  // ── Auto-resize da textarea ────────────────────────────────────────────────
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  // ── Scroll para o fim (inteligente) ───────────────────────────────────────
  const scrollToBottom = useCallback((force = false) => {
    if (force || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // ── Detecta se usuário está perto do fim ──────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // ── Rola para o fim quando chegam novas msgs (apenas se estava no fim) ─────
  useEffect(() => {
    scrollToBottom();
  }, [chat.messages, typingUser, scrollToBottom]);

  // ── Força scroll ao trocar de chat ────────────────────────────────────────
  useLayoutEffect(() => {
    isNearBottomRef.current = true;
    scrollToBottom(true);
    setText("");
    setReplyTo(null);
    setShowEmojiPicker(false);
  }, [chat.id, scrollToBottom]);

  // ── Canal de Broadcast em tempo real (Digitando + Chamar Atenção) ────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`typing:${chat.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        setTypingUser(payload.payload.user_name);
        if (hideTypingTimeoutRef.current)
          clearTimeout(hideTypingTimeoutRef.current);
        hideTypingTimeoutRef.current = setTimeout(
          () => setTypingUser(null),
          3000
        );
      })
      .on("broadcast", { event: "nudge" }, (payload) => {
        // Efeito sonoro imediato
        playNudgeSound();
        // Efeito de tremor na janela
        setIsNudging(true);
        setNudgeAlertUser(payload.payload.sender_name || "Um colega");
        setTimeout(() => setIsNudging(false), 1200);
        setTimeout(() => setNudgeAlertUser(null), 6000);

        // Notificação nativa do Windows
        try {
          sendNotification({
            title: "⚠️ Chamado de Urgência!",
            body: `${payload.payload.sender_name || "Um colega"} chamou sua atenção no ChatPC!`,
          });
        } catch {}
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat.id, user]);

  // ── Marca mensagens como lidas e busca quem leu as minhas ─────────────────
  useEffect(() => {
    if (!user || chat.messages.length === 0) return;

    const markAsRead = async () => {
      const unreadFromOthers = chat.messages.filter(
        (m) => m.sender_id !== user.id
      );
      if (unreadFromOthers.length === 0) return;

      const reads = unreadFromOthers.map((m) => ({
        message_id: m.id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      }));

      // upsert silencioso — se a tabela não existir, captura o erro sem quebrar
      await supabase
        .from("message_reads")
        .upsert(reads, { onConflict: "message_id,user_id" })
        .then(({ error }) => {
          if (error && !error.message.includes("does not exist"))
            console.warn("message_reads:", error.message);
        });
    };

    const fetchReadStatus = async () => {
      const myMessageIds = chat.messages
        .filter((m) => m.sender_id === user.id)
        .map((m) => m.id);

      if (myMessageIds.length === 0) return;

      const { data } = await supabase
        .from("message_reads")
        .select("message_id")
        .in("message_id", myMessageIds)
        .neq("user_id", user.id);

      if (data) {
        setReadMessageIds(new Set(data.map((r) => r.message_id)));
      }
    };

    markAsRead();
    fetchReadStatus();
  }, [chat.id, chat.messages.length, user]);

  // ── Envio de mensagem ─────────────────────────────────────────────────────
  const sendMessage = async (
    content: string,
    fileData?: { url: string; name: string; type: string }
  ) => {
    if (!user) return;

    const tempId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

    const replySenderName = replyTo
      ? replyTo.sender_id === user.id
        ? "Você"
        : (chat.participants.find((p) => p.id === replyTo.sender_id)?.name || chat.name || "Alguém")
      : null;

    const tempMessage: Message = {
      id: tempId,
      chat_id: chat.id,
      sender_id: user.id,
      content: content || null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
      reply_to_id: replyTo?.id || null,
      reply_to_content: replyTo?.content || null,
      reply_to_sender_name: replySenderName,
      created_at: new Date().toISOString(),
    };

    // Mostra localmente de imediato (optimistic UI)
    useChatStore.getState().addMessage(chat.id, tempMessage);
    setReplyTo(null);
    isNearBottomRef.current = true;

    const { error } = await supabase.from("messages").insert({
      id: tempId,
      chat_id: chat.id,
      sender_id: user.id,
      content: content || null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
      reply_to_id: replyTo?.id || null,
      reply_to_content: replyTo?.content || null,
      reply_to_sender_name: replySenderName,
    });

    if (error) console.error("Erro ao enviar mensagem:", error);
  };

  // ── Chamar Atenção / Urgência (Nudge) ────────────────────────────────────
  const handleSendNudge = async () => {
    if (nudgeCooldown > 0 || !user || !channelRef.current) return;
    setNudgeCooldown(30);
    playNudgeSound();
    setIsNudging(true);
    setTimeout(() => setIsNudging(false), 800);

    try {
      channelRef.current.send({
        type: "broadcast",
        event: "nudge",
        payload: {
          sender_id: user.id,
          sender_name: currentUserProfile?.name || "Alguém",
        },
      });
    } catch (err) {
      console.error("Erro ao emitir nudge:", err);
    }

    await sendMessage("🔔 Chamou sua atenção com urgência!");
    showToast("Atenção chamada com sucesso! 🔔");
  };

  const shareWhatsApp = async (fileUrl: string, fileName: string) => {
    const msg = `Confira este arquivo: *${fileName}*\n\n${fileUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(waUrl);
    } catch {
      window.open(waUrl, "_blank");
    }
  };

  const broadcastTyping = useCallback(() => {
    if (isTypingTimeoutRef.current || !channelRef.current) return;
    try {
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { user_name: currentUserProfile?.name || "Alguém" },
      });
    } catch {}
    isTypingTimeoutRef.current = setTimeout(() => {
      isTypingTimeoutRef.current = null;
    }, 2000);
  }, [currentUserProfile]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    autoResize();
    broadcastTyping();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  };

  const doSend = async () => {
    if (!text.trim() || isUploading) return;
    const content = text;
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setShowEmojiPicker(false);
    await sendMessage(content);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSend();
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setText((prev) => prev + emojiData.emoji);
    textareaRef.current?.focus();
    setTimeout(autoResize, 0);
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { url, error } = await uploadChatFile(chat.id, file);
      if (!error && url) {
        await sendMessage("", { url, name: file.name, type: file.type });
      }
    }
    setIsUploading(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files?.length > 0) {
      await handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ── Colar imagem/print da Área de Transferência (Ctrl+V) ─────────────────
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    const filesToUpload: File[] = [];

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            filesToUpload.push(
              new File([blob], `print_${timestamp}.png`, {
                type: blob.type || "image/png",
              })
            );
          }
        }
      }
    }

    if (filesToUpload.length === 0 && e.clipboardData.files?.length > 0) {
      filesToUpload.push(...Array.from(e.clipboardData.files));
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      await handleFileUpload(filesToUpload);
    }
  };

  // ── Copiar texto da mensagem ─────────────────────────────────────────────
  const handleCopyMessage = async (msg: Message) => {
    if (!msg.content) return;
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Falha ao copiar texto:", err);
    }
  };

  // ── Fixar / Desafixar mensagem ───────────────────────────────────────────
  const togglePinMessage = (msgId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      try {
        localStorage.setItem(
          `chatpc_pinned_${chat.id}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  // Mensagens fixadas encontradas no histórico do chat
  const pinnedMessages = chat.messages.filter((m) => pinnedIds.has(m.id));

  // Rola suavemente até a mensagem fixada e destaca visualmente
  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2500);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "flex flex-col h-full flex-1 min-h-0 bg-background relative overflow-hidden",
        isNudging && "animate-nudge"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={onDrop}
      onPaste={handlePaste}
    >
      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* ── Overlay de Drag & Drop (sem flicker) ──────────────────────────── */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-2xl pointer-events-none transition-all">
          <div className="text-center space-y-3 p-8 bg-card rounded-2xl shadow-2xl border border-border/70">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-bounce">
              <UploadCloud className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Solte os arquivos aqui para enviar
            </h2>
            <p className="text-xs text-muted-foreground">
              Fotos, documentos, PDFs e planilhas
            </p>
          </div>
        </div>
      )}

      {/* ── Alerta de Chamar Atenção Recebido ────────────────────────────── */}
      {nudgeAlertUser && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md animate-bounce z-30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 animate-spin flex-shrink-0" />
            <span>⚠️ {nudgeAlertUser.toUpperCase()} CHAMOU SUA ATENÇÃO COM URGÊNCIA!</span>
          </div>
          <button
            onClick={() => setNudgeAlertUser(null)}
            className="p-1 hover:bg-black/20 rounded transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="h-16 flex items-center justify-between px-6 border-b bg-background z-10 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarFallback>
              {chat.name?.substring(0, 2).toUpperCase() || "CH"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-semibold">{chat.name}</span>
            <span className="text-xs text-muted-foreground">
              {chat.type === "GROUP" ? "Grupo" : "Chat Direto"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Chamar Atenção / Urgência */}
          <Button
            variant={nudgeCooldown > 0 ? "outline" : "destructive"}
            size="sm"
            onClick={handleSendNudge}
            disabled={nudgeCooldown > 0}
            className={cn(
              "gap-1.5 text-xs h-8 px-2.5 font-medium transition-all shadow-sm",
              nudgeCooldown === 0 && "hover:scale-105 active:scale-95"
            )}
            title={
              nudgeCooldown > 0
                ? `Aguarde ${nudgeCooldown}s para chamar atenção novamente`
                : "Chamar atenção / Urgência (faz tremer a tela e toca alarme sonoro)"
            }
          >
            <BellRing className={cn("h-3.5 w-3.5", nudgeCooldown === 0 && "animate-pulse")} />
            <span className="hidden sm:inline">
              {nudgeCooldown > 0 ? `${nudgeCooldown}s` : "Chamar Atenção"}
            </span>
          </Button>

          <Button variant="ghost" size="icon">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Barra de Mensagens Fixadas (Pinned Messages) ───────────────────── */}
      {pinnedMessages.length > 0 && (() => {
        const activePinned =
          pinnedMessages[currentPinIndex % pinnedMessages.length] ||
          pinnedMessages[0];
        const isMePinned = activePinned.sender_id === user?.id;
        const senderName = isMePinned
          ? "Você"
          : (chat.participants.find((p) => p.id === activePinned.sender_id)
              ?.name || chat.name || "Contato");

        return (
          <div className="bg-muted/70 backdrop-blur border-b border-border/50 px-4 py-2 flex items-center justify-between gap-3 text-xs z-20 shadow-sm select-none flex-shrink-0">
            <div
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
              onClick={() => scrollToMessage(activePinned.id)}
              title="Clique para ir até a mensagem fixada"
            >
              <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500 flex-shrink-0 -rotate-45" />
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="font-semibold text-primary flex-shrink-0">
                  {senderName}:
                </span>
                <span className="text-foreground/80 truncate">
                  {activePinned.content ||
                    (activePinned.file_name
                      ? `📎 ${activePinned.file_name}`
                      : "Anexo")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {pinnedMessages.length > 1 && (
                <button
                  onClick={() =>
                    setCurrentPinIndex(
                      (prev) => (prev + 1) % pinnedMessages.length
                    )
                  }
                  className="px-1.5 py-0.5 rounded text-[10px] bg-background/80 hover:bg-background text-muted-foreground border border-border/50 transition-colors"
                  title="Alternar entre mensagens fixadas"
                >
                  {(currentPinIndex % pinnedMessages.length) + 1}/
                  {pinnedMessages.length}
                </button>
              )}
              <button
                onClick={() => togglePinMessage(activePinned.id)}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                title="Desafixar mensagem"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Lista de Mensagens ────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 min-h-0"
      >
        <div className="space-y-4 max-w-4xl mx-auto flex flex-col justify-end min-h-full pb-4">
          {/* Botão de carregar mensagens anteriores */}
          {chat.hasMore && (
            <div className="flex justify-center pt-2 pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMoreMessages(chat.id)}
                disabled={chat.isLoadingMore}
                className="gap-2 text-xs h-8"
              >
                {chat.isLoadingMore ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
                {chat.isLoadingMore
                  ? "Carregando..."
                  : "Carregar mensagens anteriores"}
              </Button>
            </div>
          )}

          {/* Mensagens */}
          {chat.messages.map((msg: Message) => {
            const isMe = msg.sender_id === user?.id;
            const isImage = msg.file_type?.startsWith("image/");
            const isRead = readMessageIds.has(msg.id);
            const isOnlyEmoji = msg.content && ONLY_EMOJI_RE.test(msg.content);

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={cn(
                  "group flex flex-col gap-1 max-w-[85%] sm:max-w-[75%] transition-all",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className="relative group/msg w-fit max-w-full">
                  {/* Barra de ações rápidas (aparece no hover) */}
                  <div
                    className={cn(
                      "absolute top-1 flex items-center gap-0.5 p-1 rounded-full bg-background/90 backdrop-blur border border-border shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10",
                      isMe ? "-left-32" : "-right-32"
                    )}
                  >
                    {/* Botão de responder */}
                    <button
                      onClick={() => setReplyTo(msg)}
                      title="Responder"
                      className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <CornerUpLeft className="h-3.5 w-3.5" />
                    </button>

                    {/* Botão de copiar (se houver texto) */}
                    {msg.content && (
                      <button
                        onClick={() => handleCopyMessage(msg)}
                        title={
                          copiedMessageId === msg.id
                            ? "Copiado!"
                            : "Copiar texto"
                        }
                        className={cn(
                          "p-1 rounded-full transition-colors",
                          copiedMessageId === msg.id
                            ? "bg-emerald-500 text-white"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}

                    {/* Botão de fixar / desafixar */}
                    <button
                      onClick={() => togglePinMessage(msg.id)}
                      title={
                        pinnedIds.has(msg.id)
                          ? "Desafixar do topo"
                          : "Fixar no topo"
                      }
                      className={cn(
                        "p-1 rounded-full transition-colors",
                        pinnedIds.has(msg.id)
                          ? "text-amber-500 hover:bg-amber-500/10"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Pin
                        className={cn(
                          "h-3.5 w-3.5",
                          pinnedIds.has(msg.id) && "fill-amber-500"
                        )}
                      />
                    </button>

                    {/* Botão de Lembrar-me disso (Alarme / Tarefa) */}
                    <button
                      onClick={() => setReminderTargetMessage(msg)}
                      title="Lembrar-me desta mensagem (Alarme / Tarefa)"
                      className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Balão da mensagem */}
                  <div
                    className={cn(
                      "flex flex-col gap-1.5 rounded-2xl px-4 py-2.5 text-sm shadow-sm min-w-[80px] w-fit max-w-full transition-all duration-300",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-muted text-foreground rounded-bl-none",
                      highlightedMessageId === msg.id &&
                        "ring-4 ring-amber-400 ring-offset-2 scale-[1.02]"
                    )}
                  >
                    {/* Contexto de resposta (dentro do balão) */}
                    {msg.reply_to_content && (
                      <div
                        className={cn(
                          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border-l-2 mb-1 min-w-[120px] max-w-full select-none",
                          isMe
                            ? "bg-black/15 text-primary-foreground/90 border-primary-foreground/70"
                            : "bg-background/60 text-muted-foreground border-primary"
                        )}
                      >
                        <CornerUpLeft className="h-3 w-3 flex-shrink-0 opacity-70" />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold mr-1">
                            {msg.reply_to_sender_name}:
                          </span>
                          <span className="truncate opacity-85 inline-block max-w-[220px] align-bottom">
                            {msg.reply_to_content}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Imagem */}
                    {msg.file_url && isImage && (
                      <div className="relative group/img">
                        <img
                          src={msg.file_url}
                          alt="Anexo"
                          className="max-w-xs rounded-lg object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                          onClick={() => setLightboxSrc(msg.file_url!)}
                        />
                        <button
                          onClick={() =>
                            shareWhatsApp(
                              msg.file_url!,
                              msg.file_name || "Imagem"
                            )
                          }
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-green-600 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-all shadow-md"
                          title="Encaminhar via WhatsApp"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {/* Arquivo */}
                    {msg.file_url && !isImage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              const { open } = await import(
                                "@tauri-apps/plugin-shell"
                              );
                              await open(msg.file_url!);
                            } catch {
                              window.open(msg.file_url!, "_blank");
                            }
                          }}
                          className="flex-1 flex items-center gap-2 bg-background/20 p-2 rounded-md hover:bg-background/30 transition text-left"
                        >
                          <FileIcon className="h-8 w-8 shrink-0" />
                          <span className="truncate max-w-[180px] font-medium">
                            {msg.file_name}
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            shareWhatsApp(
                              msg.file_url!,
                              msg.file_name || "Arquivo"
                            )
                          }
                          className="p-2 bg-green-500/10 hover:bg-green-500 hover:text-white text-green-600 rounded-full transition-colors flex-shrink-0"
                          title="Encaminhar via WhatsApp"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {/* Texto */}
                    {msg.content && (
                      <span
                        className={cn(
                          isOnlyEmoji
                            ? "text-5xl my-2 leading-tight"
                            : "whitespace-pre-wrap break-words leading-relaxed"
                        )}
                      >
                        {msg.content}
                      </span>
                    )}

                    {/* Link preview */}
                    {msg.content &&
                      (() => {
                        const urlMatch = msg.content.match(
                          /(https?:\/\/[^\s]+)/
                        );
                        return urlMatch ? (
                          <LinkPreview url={urlMatch[0]} />
                        ) : null;
                      })()}

                    {/* Detector de pastas locais e de rede Windows (\\servidor\pasta ou C:\pasta) */}
                    {msg.content && (
                      <WindowsPathPreview content={msg.content} />
                    )}

                    {/* Horário + indicador de leitura + pin */}
                    <span
                      className={cn(
                        "text-[10px] opacity-70 flex items-center justify-end gap-1 select-none mt-0.5",
                        isMe
                          ? "text-primary-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {pinnedIds.has(msg.id) && (
                        <Pin className="h-2.5 w-2.5 text-amber-400 fill-amber-400 -rotate-45" />
                      )}
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {isMe &&
                        (isRead ? (
                          <CheckCheck className="h-3 w-3 text-blue-300" />
                        ) : (
                          <Check className="h-3 w-3 opacity-60" />
                        ))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Indicador de digitando */}
          {typingUser && (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span>{typingUser} está digitando...</span>
            </div>
          )}

          {/* Âncora de scroll */}
          <div ref={messagesEndRef} className="h-px w-full" />
        </div>
      </div>

      {/* ── Área de Input ─────────────────────────────────────────────────── */}
      <div className="p-4 bg-background border-t relative">
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-[88px] left-4 z-50 shadow-xl rounded-xl border bg-background">
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              autoFocusSearch={false}
              theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
            />
          </div>
        )}

        {/* Preview de resposta */}
        {replyTo && (
          <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/50 text-sm">
            <CornerUpLeft className="h-4 w-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary">
                Respondendo a{" "}
                {replyTo.sender_id === user?.id
                  ? "você mesmo"
                  : (chat.participants.find((p) => p.id === replyTo.sender_id)?.name || chat.name || "mensagem")}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {replyTo.content || "📎 Arquivo"}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto flex items-end gap-2 bg-muted/50 p-2 rounded-2xl border focus-within:ring-1 ring-ring/50 transition-shadow"
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={(e) =>
              e.target.files && handleFileUpload(e.target.files)
            }
          />

          {/* Botão de anexo */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </Button>

          {/* Botão de emoji */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            disabled={isUploading}
          >
            <Smile className="h-5 w-5" />
          </Button>

          {/* Textarea com auto-resize */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isUploading
                ? "Enviando arquivos..."
                : "Digite uma mensagem... (Enter envia • Shift+Enter nova linha)"
            }
            disabled={isUploading}
            rows={1}
            className={cn(
              "flex-1 bg-transparent focus:outline-none focus:ring-0 border-0",
              "px-2 py-2 text-sm resize-none overflow-y-auto",
              "min-h-[40px] max-h-[160px] leading-relaxed",
              "placeholder:text-muted-foreground"
            )}
          />

          {/* Botão de enviar */}
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

      {/* ── Modal de Agendar Lembrete ───────────────────────────────────────── */}
      {reminderTargetMessage && (
        <ScheduleReminderModal
          chatId={chat.id}
          chatName={chat.name || "Chat"}
          message={reminderTargetMessage}
          onClose={() => setReminderTargetMessage(null)}
          onSuccess={(feedbackText) => showToast(feedbackText)}
        />
      )}

      {/* ── Toast de Feedback Rápido ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-full text-xs font-medium shadow-xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
