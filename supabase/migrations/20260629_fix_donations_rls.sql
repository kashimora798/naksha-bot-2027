-- Ensure the is_paid column exists on donations table
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

-- Re-enable Row Level Security on public.donations
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Drop all conflicting or old policies
DROP POLICY IF EXISTS "Enable insert for all users" ON public.donations;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.donations;
DROP POLICY IF EXISTS "Enable update for all users" ON public.donations;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.donations;
DROP POLICY IF EXISTS "Admin update policy" ON public.donations;
DROP POLICY IF EXISTS "Admin delete policy" ON public.donations;
DROP POLICY IF EXISTS "Allow public insert on donations" ON public.donations;
DROP POLICY IF EXISTS "Allow public select on donations" ON public.donations;
DROP POLICY IF EXISTS "Allow admin update on donations" ON public.donations;
DROP POLICY IF EXISTS "Allow admin delete on donations" ON public.donations;

-- 1) Allow insert to anyone (guest users can submit intents)
CREATE POLICY "Allow public insert on donations"
ON public.donations
FOR INSERT
WITH CHECK (true);

-- 2) Allow select to anyone (so status check is public/authenticated)
CREATE POLICY "Allow public select on donations"
ON public.donations
FOR SELECT
USING (true);

-- 3) Allow updates only to Admin users
CREATE POLICY "Allow admin update on donations"
ON public.donations
FOR UPDATE
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- 4) Allow deletes only to Admin users
CREATE POLICY "Allow admin delete on donations"
ON public.donations
FOR DELETE
USING (public.is_admin() = true);
