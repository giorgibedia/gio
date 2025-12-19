/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient } from '@supabase/supabase-js';

// IMPORTANT: These are the public connection details for your Supabase project.
// The Anon key is safe to be exposed in a browser client.
// For true security, you MUST configure Row Level Security (RLS) policies
// in your Supabase dashboard.
const supabaseUrl = 'https://xigkbkbcfouijlkfwtqn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpZ2tia2JjZm91aWpsa2Z3dHFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMjExMzYsImV4cCI6MjA3Njg5NzEzNn0.UoZYeNhxNguOi-GeRKG9-JFLNX9uYXW0167o_sKHJJM';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is missing. Make sure to set them in services/supabaseClient.ts');
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);