// Public Supabase config. The anon key is public by design (protected by RLS).
// Overridable via environment variables when hardening on Vercel.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkvcuofxuounpxpiwtoo.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdmN1b2Z4dW91bnB4cGl3dG9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODc5MjksImV4cCI6MjA5NDU2MzkyOX0.b2_0NuUKOFPQUfxhHgE6TiNxSb4W-p7eT8q72DciAr8';
