-- ============================================================================
-- Feedback User Details and RLS Insert Fixes
-- 1) Ensure user_id column exists on feedbacks table, defaulting to auth.uid()
-- 2) Add policy to allow any user to insert feedbacks.
-- ============================================================================

-- 1) Add user_id column to feedbacks table if it does not exist
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();

-- 2) Enable INSERT for everyone (authenticated or anonymous) so feedback can be stored
DROP POLICY IF EXISTS "Enable insert for all users" ON public.feedbacks;
CREATE POLICY "Enable insert for all users"
  ON public.feedbacks
  FOR INSERT
  WITH CHECK (true);
