-- ─── Project Assignments ──────────────────────────────────────────────────────
-- Admin-only table that lets admins share/assign any project to any user.
-- Assigned users get full read+write access on that project via updated RLS.

CREATE TABLE IF NOT EXISTS public.project_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

-- Users see their own assignments; admins see all
DROP POLICY IF EXISTS "assignments_select_own" ON public.project_assignments;
CREATE POLICY "assignments_select_own" ON public.project_assignments
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

-- Only admins can create assignments
DROP POLICY IF EXISTS "assignments_insert_admin" ON public.project_assignments;
CREATE POLICY "assignments_insert_admin" ON public.project_assignments
  FOR INSERT WITH CHECK (is_admin());

-- Only admins can revoke assignments
DROP POLICY IF EXISTS "assignments_delete_admin" ON public.project_assignments;
CREATE POLICY "assignments_delete_admin" ON public.project_assignments
  FOR DELETE USING (is_admin());

-- ─── Update projects SELECT policy ────────────────────────────────────────────
-- Extend to also allow users who have an assignment on that project to read it.

DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.project_assignments pa
      WHERE pa.project_id = id AND pa.user_id = auth.uid()
    )
  );

-- ─── Update projects UPDATE policy ────────────────────────────────────────────
-- Assigned users can edit the project just like owners.

DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.project_assignments pa
      WHERE pa.project_id = id AND pa.user_id = auth.uid()
    )
  );
