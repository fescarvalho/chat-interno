import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare } from "lucide-react";

export function AuthScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (isSignUp: boolean) => {
    try {
      setLoading(true);
      setError(null);
      
      let authError;

      if (isSignUp) {
        if (!name.trim()) throw new Error("Por favor, digite seu nome.");
        // Passa o nome no metadata para o Trigger do banco salvar na tabela users
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: { name }
          }
        });
        authError = error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        authError = error;
      }

      if (authError) throw authError;
      
      // Se for login, atualiza o status para ONLINE no banco
      if (!isSignUp) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('users').update({ status: 'ONLINE' }).eq('id', user.id);
        }
      }

    } catch (err: any) {
      setError(err.message || "Ocorreu um erro na autenticação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md space-y-8 px-8">
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="rounded-2xl bg-primary/10 p-3">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ChatPC</h1>
          <p className="text-sm text-muted-foreground">
            Acesse sua conta para continuar
          </p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="register">Criar Conta</TabsTrigger>
          </TabsList>
          
          {error && (
            <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md text-center">
              {error}
            </div>
          )}

          <TabsContent value="login" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Input 
                type="email" 
                placeholder="nome@empresa.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input 
                type="password" 
                placeholder="Sua senha" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={() => handleAuth(false)}
              disabled={loading || !email || !password}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Input 
                type="text" 
                placeholder="Seu Nome Completo" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input 
                type="email" 
                placeholder="nome@empresa.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input 
                type="password" 
                placeholder="Crie uma senha forte" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={() => handleAuth(true)}
              disabled={loading || !name || !email || !password}
            >
              {loading ? "Criando..." : "Criar Conta"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
