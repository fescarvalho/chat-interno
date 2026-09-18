import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatArea } from "@/components/layout/ChatArea";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { useAuthStore } from "@/stores/useAuthStore";
import { supabase } from "@/lib/supabase";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateDialog } from "@/components/UpdateDialog";
import { ReminderAlert } from "@/components/ReminderAlert";

function App() {
  const { session, setSession, isLoading } = useAuthStore();
  const [pendingUpdate, setPendingUpdate] = useState<{
    version: string;
    install: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    // Busca a sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Escuta mudanças de auth (login, logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Verifica atualizações — exibe diálogo de confirmação em vez de instalar silenciosamente
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setPendingUpdate({
            version: update.version,
            install: async () => {
              await update.downloadAndInstall();
            },
          });
        }
      } catch (error) {
        console.error("Erro ao verificar atualizações:", error);
      }
    };
    checkForUpdates();

    return () => subscription.unsubscribe();
  }, [setSession]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        Carregando...
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
          {/* Barra lateral */}
          <Sidebar />

          {/* Área principal: abas de chat */}
          <main className="flex-1 flex flex-col min-w-0">
            <ChatArea />
          </main>
        </div>

        {/* Alertas de lembretes agendados */}
        <ReminderAlert />

        {/* Diálogo de atualização — só aparece quando há uma versão nova */}
        {pendingUpdate && (
          <UpdateDialog
            version={pendingUpdate.version}
            onConfirm={pendingUpdate.install}
            onDismiss={() => setPendingUpdate(null)}
          />
        )}
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
