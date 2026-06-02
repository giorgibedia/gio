/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient } from '@supabase/supabase-js';

// IMPORTANT: These are the public connection details for your Supabase project.
// The Anon key is safe to be exposed in a browser client.
// For true security, you MUST configure Row Level Security (RLS) policies
// in your Supabase dashboard.
const supabaseUrl = 'https://ozjubwksqhekupplleqx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96anVid2tzcWhla3VwcGxsZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4MDMsImV4cCI6MjA5NTk1ODgwM30.9rDSYfamGJgu7bNThgD9_wOgicJENLxOxQ0gki4my5c';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is missing. Make sure to set them in services/supabaseClient.ts');
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);