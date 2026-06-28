-- Add is_paid column to donations table if it does not exist
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

-- Allow updates for donations (e.g. marking as paid)
DROP POLICY IF EXISTS "Enable update for all users" ON public.donations;
CREATE POLICY "Enable update for all users"
  ON public.donations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow deletes for donations (e.g. removing unpaid intents)
DROP POLICY IF EXISTS "Enable delete for all users" ON public.donations;
CREATE POLICY "Enable delete for all users"
  ON public.donations
  FOR DELETE
  USING (true);
