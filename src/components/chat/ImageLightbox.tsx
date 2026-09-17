import { useEffect, useCallback } from "react";
import { X, Download } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(src);
    } catch {
      window.open(src, "_blank");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={handleDownload}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all shadow-lg"
          title="Abrir / Baixar"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all shadow-lg"
          title="Fechar (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={alt || "Imagem"}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Bottom hint */}
      <p className="absolute bottom-4 text-white/40 text-xs select-none">
        Clique fora da imagem ou pressione Esc para fechar
      </p>
    </div>
  );
}
