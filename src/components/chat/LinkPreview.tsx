import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

interface LinkPreviewProps {
  url: string;
}

interface PreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchPreview = async () => {
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        
        // Usamos uma API gratuita (microlink) que retorna OpenGraph JSON
        // Nota: em produção, o ideal é ter uma Edge Function própria no Supabase
        const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error("Failed to fetch");
        
        const json = await response.json();
        if (json.status === "success" && json.data) {
          if (isMounted) {
            setData({
              title: json.data.title || null,
              description: json.data.description || null,
              image: json.data.image?.url || null,
              domain
            });
          }
        }
      } catch (err) {
        console.error("Link preview error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPreview();
    return () => { isMounted = false; };
  }, [url]);

  const handleOpen = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="mt-2 w-full max-w-sm h-24 bg-muted/50 rounded-lg animate-pulse flex items-center justify-center border border-border/50">
        <span className="text-xs text-muted-foreground">Carregando preview...</span>
      </div>
    );
  }

  if (!data || (!data.title && !data.image)) return null;

  return (
    <div 
      onClick={handleOpen}
      className="mt-2 w-full max-w-sm flex flex-col rounded-xl overflow-hidden border border-border/60 bg-card hover:bg-accent/50 transition-colors cursor-pointer text-card-foreground shadow-sm group"
    >
      {data.image && (
        <div className="h-36 w-full overflow-hidden bg-muted">
          <img 
            src={data.image} 
            alt={data.title || "Link Preview"} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}
      <div className="p-3 flex flex-col gap-1 text-left">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          {data.domain}
        </div>
        {data.title && (
          <h4 className="text-sm font-bold leading-tight line-clamp-2">
            {data.title}
          </h4>
        )}
        {data.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {data.description}
          </p>
        )}
      </div>
    </div>
  );
}
