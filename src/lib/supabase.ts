import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Auto-correct if only project ID is provided
const supabaseUrl = rawUrl.includes('://')
    ? rawUrl
    : rawUrl.length > 0
        ? `https://${rawUrl}.supabase.co`
        : 'https://placeholder.supabase.co';

if (!rawUrl || !supabaseAnonKey || rawUrl.includes('placeholder')) {
    console.error('❌ Supabase Configuration Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.');
    console.info('Ensure these are set in .env.local for local dev and GitHub Secrets for production.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder');
