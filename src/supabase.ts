import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://omawjwrqmzsrgtwqmftv.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tYXdqd3JxbXpzcmd0d3FtZnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTMwNzMsImV4cCI6MjEwMzk4OTA3M30.nkn7qrcNTpQr4V1w5c9tsg9ZB-2MHzQk9ZZ0fXind_M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const isSupabaseActive = Boolean(supabaseUrl && supabaseAnonKey);
