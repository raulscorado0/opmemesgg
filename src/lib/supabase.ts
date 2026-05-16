import { createClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || supabaseUrl.includes('your-supabase-url')) {
  console.warn('Supabase URL missing or using placeholder. Please set VITE_SUPABASE_URL in your Settings.');
  // If we are in the development environment, we might want to try to use the placeholder domain 
  // but since it's invalid it will cause fetch errors.
  supabaseUrl = 'https://placeholder-project.supabase.co'; 
}

// Ensure the URL is clean (no path, no trailing slash, no /rest/v1)
if (supabaseUrl) {
  try {
    // If it doesn't have a protocol, add https://
    let cleanUrl = supabaseUrl.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const urlObj = new URL(cleanUrl);
    // Only take the origin (protocol + hostname + port if any)
    supabaseUrl = urlObj.origin;
  } catch (e) {
    console.error('Invalid Supabase URL:', supabaseUrl);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'no-key');

// Helper to check if credentials are valid-looking
export const isSupabaseConfigured = () => {
  return supabaseUrl && 
         !supabaseUrl.includes('placeholder') && 
         supabaseAnonKey && 
         supabaseAnonKey.length > 20; // JWTs are long
};

export const formatSupabaseError = (err: any): string => {
  if (!err) return 'Erro desconhecido.';
  const msg = (err.message || (typeof err === 'string' ? err : JSON.stringify(err))).toLowerCase();
  
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('connection') || !isSupabaseConfigured()) {
    return 'Erro de conexão: Verifique se informou a URL e a Chave Anon do Supabase corretamente nas Configurações (Settings).';
  }
  
  if (msg.includes('column') || msg.includes('attribute') || msg.includes('does not exist')) {
    return `Erro de estrutura (coluna ausente): ${err.message || 'Verifique se seu banco de dados está atualizado'}. Você aplicou o SQL contido no arquivo SUPABASE_SETUP.sql no editor do Supabase?`;
  }

  if (msg.includes('relation') || msg.includes('not found')) {
    return 'Estrutura do banco não encontrada. Você aplicou o SQL contido no arquivo SUPABASE_SETUP.sql no editor do Supabase?';
  }

  if (msg.includes('Invalid login credentials')) {
    return 'Usuário ou senha inválidos.';
  }

  return msg;
};
