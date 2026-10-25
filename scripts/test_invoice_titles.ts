import { createClient } from '@supabase/supabase-js';
import { buildInvoiceTitle826 } from '../src/lib/ai/typePrompts';

// Load Supabase URL and Key from env or standard config
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xukevvfvffvfvfgmwhim.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1a2V2dmZ2ZmZ2ZnZtd2hpbSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MDQzMTA0MDAsImV4cCI6MjAyMDIwOTYwMH0.fake';

console.log('Testing buildInvoiceTitle826...');
