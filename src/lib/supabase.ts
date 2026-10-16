import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || (typeof process !== 'undefined' && (process as any).env) || {};
const rawUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';
const supabaseUrl = rawUrl.includes('://')
    ? rawUrl
    : rawUrl.length > 0
        ? `https://${rawUrl}.supabase.co`
        : 'https://placeholder.supabase.co';

if ((!rawUrl || !supabaseAnonKey || rawUrl.includes('placeholder')) && typeof window !== 'undefined') {
    console.error('❌ Supabase Configuration Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.');
    console.info('Ensure these are set in .env.local for local dev and GitHub Secrets for production.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey || 'placeholder');
