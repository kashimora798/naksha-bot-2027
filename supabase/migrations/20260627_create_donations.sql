-- ============================================================================
-- Create donations table to track user donation clicks/intents
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.donations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  name TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Allow insert policy for everyone (both authenticated users and guests)
DROP POLICY IF EXISTS "Enable insert for all users" ON public.donations;
CREATE POLICY "Enable insert for all users"
  ON public.donations
  FOR INSERT
  WITH CHECK (true);

-- Allow select policy (public reading or admin reading)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.donations;
CREATE POLICY "Enable read access for all users"
  ON public.donations
  FOR SELECT
  USING (true);
