import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(url && anonKey);

if (!hasSupabaseConfig) {
    console.warn('[auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY; Supabase auth is disabled');
}

export const supabase = hasSupabaseConfig ? createClient(url, anonKey) : null;
