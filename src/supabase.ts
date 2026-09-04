/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve environment variables from Vite
const rawUrl = import.meta.env?.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

/**
 * Validate that a URL string is present, non-empty, and well-formed.
 */
function isValidSupabaseUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('YOUR_') || trimmed.includes('placeholder')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate that an Anon Key string is present, non-empty, and reasonably formed.
 */
function isValidSupabaseKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  return Boolean(trimmed && trimmed.length > 20 && !trimmed.includes('YOUR_') && !trimmed.includes('placeholder'));
}

const isUrlValid = isValidSupabaseUrl(rawUrl);
const isKeyValid = isValidSupabaseKey(rawAnonKey);
const isConfigured = isUrlValid && isKeyValid;

// Log an informative warning if credentials are not configured or invalid
if (!isConfigured) {
  const missing: string[] = [];
  if (!isUrlValid) missing.push('VITE_SUPABASE_URL (must be a valid http/https URL)');
  if (!isKeyValid) missing.push('VITE_SUPABASE_ANON_KEY (must be a non-empty string)');

  console.warn(
    `[Supabase Configuration Notice] ⚠️ Missing or invalid environment variables:\n` +
    `  • ${missing.join('\n  • ')}\n\n` +
    `A safe fallback mock client is active. The application will operate in local offline mode ` +
    `using browser storage (localStorage) without crashing into a blank screen.\n` +
    `To enable cloud synchronization, provide valid credentials in your .env file.`
  );
}

/**
 * Creates a mock SupabaseClient that safely resolves queries and mutations
 * to prevent unhandled promise rejections or runtime TypeError crashes.
 */
function createMockSupabaseClient(): SupabaseClient {
  const mockError = {
    message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud features.',
    details: 'Missing or invalid environment configuration',
    hint: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables',
    code: 'SUPABASE_NOT_CONFIGURED',
  };

  const safeResult = {
    data: null,
    error: mockError,
    count: null,
    status: 400,
    statusText: 'Bad Request: Supabase Not Configured',
  };

  // Safe recursive chain builder for table queries (.select(), .insert(), .order(), .limit(), etc.)
  const queryHandler: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (val: any) => void) => resolve(safeResult);
        }
        if (prop === 'catch') {
          return () => Promise.resolve(safeResult);
        }
        if (prop === 'finally') {
          return (callback?: () => void) => {
            callback?.();
            return Promise.resolve(safeResult);
          };
        }
        // Return a function that continues the chainable proxy
        return () => queryHandler;
      },
    }
  );

  // Safe mock auth module
  const mockAuth: any = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: async () => ({ data: null, error: mockError }),
    signUp: async () => ({ data: null, error: mockError }),
    signOut: async () => ({ error: null }),
  };

  // Safe client proxy providing .from(), .auth, .storage, .channel(), .rpc()
  const clientProxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'from') {
          return () => queryHandler;
        }
        if (prop === 'auth') {
          return mockAuth;
        }
        if (prop === 'channel') {
          return () => ({
            on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
            subscribe: () => ({ unsubscribe: () => {} }),
          });
        }
        if (prop === 'rpc') {
          return () => queryHandler;
        }
        if (prop === 'storage') {
          return {
            from: () => queryHandler,
          };
        }
        if (prop === 'then') {
          return undefined; // Not a promise itself
        }
        return () => queryHandler;
      },
    }
  );

  return clientProxy as SupabaseClient;
}

/**
 * Exported Supabase client:
 * If valid environment variables are present, returns the active SupabaseClient.
 * If either variable is missing, returns the safe mock client to prevent white screens.
 */
export const supabase: SupabaseClient = isConfigured
  ? createClient(rawUrl!.trim(), rawAnonKey!.trim())
  : createMockSupabaseClient();

/**
 * Helper function to inspect whether Supabase environment variables are properly configured.
 * Components can inspect this to conditionally display a setup notice or banner.
 */
export function isSupabaseConfigured(): boolean {
  return isConfigured;
}

/**
 * Backward-compatible boolean constant for existing components.
 */
export const isSupabaseActive = isConfigured;
