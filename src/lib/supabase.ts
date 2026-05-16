import { createClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || supabaseUrl.includes('your-supabase-url')) {
  console.warn('Supabase URL missing or using placeholder. Please set VITE_SUPABASE_URL in your Settings.');
  supabaseUrl = 'https://placeholder.supabase.co'; // Fallback to a valid-looking URL to prevent crash
}

// Ensure the URL starts with http:// or https://
if (supabaseUrl && !supabaseUrl.startsWith('http')) {
  supabaseUrl = `https://${supabaseUrl}`;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'no-key');
