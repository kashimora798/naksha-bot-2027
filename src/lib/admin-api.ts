import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  full_name: string | null;
  mobile: string | null;
  profession: string | null;
  tehsil: string | null;
  town_village: string | null;
  ward_no: string | null;
  eb_no: string | null;
  supervisor_name: string | null;
  is_mobile_verified: boolean;
  onboarding_completed: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  // joined
  email?: string | null;
  project_count?: number;
  live_session_count?: number;
}

export interface AdminProject {
  id: string;
  user_id: string;
  name: string;
  payment_status: string;
  payment_id: string | null;
  export_count: number;
  created_at: string;
  updated_at: string;
  data: any;
  // joined
  owner_name?: string | null;
  owner_mobile?: string | null;
}

export interface AdminSession {
  id: string;
  session_id: string;
  user_id: string;
  hlb_number: string | null;
  payment_status: string;
  payment_id: string | null;
  regen_allowance: number;
  regen_used: number;
  created_at: string;
  updated_at: string;
  // joined
  owner_name?: string | null;
}

export interface AdminFeedback {
  id: string;
  user_id: string | null;
  suggestions: string | null;
  useful: string | null;
  created_at: string;
  // joined
  owner_name?: string | null;
  owner_mobile?: string | null;
}

export interface AdminAssignment {
  id: string;
  project_id: string;
  user_id: string;
  assigned_by: string | null;
  assigned_at: string;
  // joined
  user_name?: string | null;
  user_mobile?: string | null;
}

export interface AdminStats {
  total_users: number;
  total_projects: number;
  paid_projects: number;
  total_sessions: number;
  paid_sessions: number;
  total_feedback: number;
}

// ─── Guard: confirm current user is admin ─────────────────────────────────────

export async function checkIsAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const { data } = await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .maybeSingle();
  return data?.is_admin === true;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function fetchAdminStats(): Promise<AdminStats> {
  const [users, projects, sessions, feedbacks] = await Promise.all([
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('payment_status', { count: 'exact' }),
    supabase.from('live_exports').select('payment_status', { count: 'exact' }),
    supabase.from('feedbacks').select('id', { count: 'exact', head: true }),
  ]);

  const paidProjects = (projects.data || []).filter(p => p.payment_status === 'paid').length;
  const paidSessions = (sessions.data || []).filter(s => s.payment_status === 'paid').length;

  return {
    total_users: users.count ?? 0,
    total_projects: projects.count ?? 0,
    paid_projects: paidProjects,
    total_sessions: sessions.count ?? 0,
    paid_sessions: paidSessions,
    total_feedback: feedbacks.count ?? 0,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Fetch per-user project counts
  const ids = (data || []).map(u => u.id);
  if (!ids.length) return [];

  const [projectCounts, sessionCounts] = await Promise.all([
    supabase.from('projects').select('user_id').in('user_id', ids),
    supabase.from('live_exports').select('user_id').in('user_id', ids),
  ]);

  const pcMap: Record<string, number> = {};
  (projectCounts.data || []).forEach(p => { pcMap[p.user_id] = (pcMap[p.user_id] || 0) + 1; });

  const scMap: Record<string, number> = {};
  (sessionCounts.data || []).forEach(s => { scMap[s.user_id] = (scMap[s.user_id] || 0) + 1; });

  return (data || []).map(u => ({
    ...u,
    project_count: pcMap[u.id] || 0,
    live_session_count: scMap[u.id] || 0,
  }));
}

export async function fetchAdminUserDetail(userId: string): Promise<{
  profile: AdminUser;
  projects: AdminProject[];
  sessions: AdminSession[];
}> {
  const [profile, projects, sessions] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', userId).single(),
    supabase.from('projects').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    supabase.from('live_exports').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);

  if (profile.error) throw profile.error;

  return {
    profile: profile.data,
    projects: projects.data || [],
    sessions: sessions.data || [],
  };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function fetchAdminProjects(): Promise<AdminProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set((data || []).map(p => p.user_id))];
  if (!userIds.length) return data || [];

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, mobile')
    .in('id', userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  return (data || []).map(p => ({
    ...p,
    owner_name: profileMap[p.user_id]?.full_name ?? null,
    owner_mobile: profileMap[p.user_id]?.mobile ?? null,
  }));
}

// ─── Live Sessions ────────────────────────────────────────────────────────────

export async function fetchAdminSessions(): Promise<AdminSession[]> {
  const { data, error } = await supabase
    .from('live_exports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set((data || []).map(s => s.user_id))];
  if (!userIds.length) return data || [];

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('id', userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  return (data || []).map(s => ({
    ...s,
    owner_name: profileMap[s.user_id]?.full_name ?? null,
  }));
}

// ─── Project Assignments ──────────────────────────────────────────────────────

export async function createAdminProject(name: string): Promise<AdminProject> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: session.user.id, name, data: {} })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchProjectAssignments(projectId: string): Promise<AdminAssignment[]> {
  const { data, error } = await supabase
    .from('project_assignments')
    .select('*')
    .eq('project_id', projectId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) return [];

  const userIds = data.map(a => a.user_id);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, mobile')
    .in('id', userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  return data.map(a => ({
    ...a,
    user_name: profileMap[a.user_id]?.full_name ?? null,
    user_mobile: profileMap[a.user_id]?.mobile ?? null,
  }));
}

export async function assignProjectToUser(projectId: string, userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('project_assignments')
    .insert({ project_id: projectId, user_id: userId, assigned_by: session?.user?.id ?? null });
  if (error) throw error;
}

export async function revokeProjectAssignment(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('project_assignments')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function fetchAdminFeedback(): Promise<AdminFeedback[]> {
  const { data, error } = await supabase
    .from('feedbacks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set((data || []).filter(f => f.user_id).map(f => f.user_id))];
  let profileMap: Record<string, any> = {};

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, mobile')
      .in('id', userIds);
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
  }

  return (data || []).map(f => ({
    ...f,
    owner_name: f.user_id ? (profileMap[f.user_id]?.full_name ?? null) : null,
    owner_mobile: f.user_id ? (profileMap[f.user_id]?.mobile ?? null) : null,
  }));
}

export interface AdminDonation {
  id: string;
  user_id: string | null;
  amount: number;
  name: string | null;
  note: string | null;
  created_at: string;
  // joined
  owner_name?: string | null;
  owner_mobile?: string | null;
}

export async function fetchAdminDonations(): Promise<AdminDonation[]> {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set((data || []).filter(d => d.user_id).map(d => d.user_id))];
  let profileMap: Record<string, any> = {};

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, mobile')
      .in('id', userIds);
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
  }

  return (data || []).map(d => ({
    ...d,
    owner_name: d.user_id ? (profileMap[d.user_id]?.full_name ?? null) : null,
    owner_mobile: d.user_id ? (profileMap[d.user_id]?.mobile ?? null) : null,
  }));
}
