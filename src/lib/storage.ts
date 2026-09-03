import { supabase } from './supabase';

/**
 * Faz o upload de um arquivo para o bucket do Supabase
 */
export async function uploadChatFile(chatId: string, file: File): Promise<{ url: string | null; error: Error | null }> {
  try {
    // Organiza por chatId / timestamp_nomedoarquivo para evitar conflitos
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
    const filePath = `${chatId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // Obtém a URL pública do arquivo
    const { data: publicUrlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(filePath);

    return { url: publicUrlData.publicUrl, error: null };
  } catch (err: any) {
    console.error("Erro no upload:", err);
    return { url: null, error: err };
  }
}
