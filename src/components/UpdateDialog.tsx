import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Loader2, Sparkles } from "lucide-react";

interface UpdateDialogProps {
  version: string;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}

export function UpdateDialog({ version, onConfirm, onDismiss }: UpdateDialogProps) {
  const [installing, setInstalling] = useState(false);

  const handleConfirm = async () => {
    setInstalling(true);
    try {
      await onConfirm();
    } catch (err) {
      console.error("Erro ao instalar atualização:", err);
      setInstalling(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !installing) onDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Nova Atualização Disponível!</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            A versão{" "}
            <span className="font-bold text-foreground px-1.5 py-0.5 bg-primary/10 rounded text-primary">
              v{version}
            </span>{" "}
            do ChatPC está disponível. Deseja reiniciar o app para instalar agora?
          </DialogDescription>
        </DialogHeader>

        {installing && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
            <span>Baixando e instalando... O app será reiniciado em instantes.</span>
          </div>
        )}

        <DialogFooter className="flex gap-2 mt-2">
          <Button
            variant="outline"
            onClick={onDismiss}
            disabled={installing}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-2" />
            Depois
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={installing}
            className="flex-1"
          >
            {installing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Instalando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Atualizar Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
