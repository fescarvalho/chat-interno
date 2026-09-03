import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatArea } from "@/components/layout/ChatArea";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { useAuthStore } from "@/stores/useAuthStore";
import { supabase } from "@/lib/supabase";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  const { session, setSession, isLoading } = useAuthStore();

  useEffect(() => {
    // Busca a sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Escuta mudanças (login, logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-background text-foreground">Carregando...</div>;
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
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
