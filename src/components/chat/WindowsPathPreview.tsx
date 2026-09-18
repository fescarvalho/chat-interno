import { useState } from "react";
import { Folder, HardDrive, ExternalLink, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// Expressão regular para caminhos UNC (ex: \\servidor\pasta) e letras de unidade (ex: C:\pasta)
export const WINDOWS_PATH_REGEX =
  /(?:\\\\[a-zA-Z0-9_.\-]+(?:\\[^<>:"/\\|?*\r\n]+)+|[a-zA-Z]:\\(?:[^<>:"/\\|?*\r\n]+\\)*[^<>:"/\\|?*\r\n]+)/g;

interface WindowsPathPreviewProps {
  content: string;
}

export function WindowsPathPreview({ content }: WindowsPathPreviewProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Extrai todos os caminhos únicos da mensagem
  const paths = Array.from(new Set(content.match(WINDOWS_PATH_REGEX) || []));

  if (paths.length === 0) return null;

  const handleOpenPath = async (path: string) => {
    setOpening(true);
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(path);
    } catch (err) {
      console.warn("Falha ao abrir pasta nativamente, copiando para a área de transferência:", err);
      // Fallback: copia o caminho para a área de transferência
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2500);
    } finally {
      setOpening(false);
    }
  };

  const handleCopy = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-1.5 mt-1.5 mb-1 max-w-full">
      {paths.map((path, idx) => {
        const isNetwork = path.startsWith("\\\\");
        return (
          <div
            key={idx}
            onClick={() => handleOpenPath(path)}
            className="flex items-center gap-2 p-2 rounded-xl bg-background/40 hover:bg-background/70 border border-primary/20 hover:border-primary/40 transition-all cursor-pointer group/path select-none shadow-xs"
            title="Clique para abrir no Windows Explorer"
          >
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-500 flex-shrink-0">
              {isNetwork ? (
                <Folder className="h-4 w-4 fill-amber-500/20" />
              ) : (
                <HardDrive className="h-4 w-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  {isNetwork ? "Pasta de Rede" : "Pasta Local"}
                </span>
              </div>
              <p className="text-xs font-mono font-medium truncate text-foreground/90 mt-0.5">
                {path}
              </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={(e) => handleCopy(path, e)}
                title="Copiar caminho"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                {copiedPath === path ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={opening}
                className="h-7 px-2 text-xs gap-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
              >
                Abrir
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
