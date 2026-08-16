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

// ─── Dashboard Stats (from single RPC) ──────────────────────────────────────

export interface DashboardKPIs {
  total_users: number;
  paid_conversion_pct: number;
  total_revenue_paise: number;
  active_this_week: number;
}

export interface DashboardTimelineDay {
  day: string;
  new_users: number;
  new_projects: number;
  revenue_paise: number;
}

export interface DashboardFunnel {
  signups: number;
  onboarding_done: number;
  first_map: number;
  paid_or_donated: number;
}

export interface DashboardRevenueBreakdown {
  maps_paise: number;
  sessions_paise: number;
  donations_paise: number;
  upi_paise: number;
}

export interface DashboardCohortRetention {
  d1_pct: number;
  d7_pct: number;
  d30_pct: number;
}

export interface DashboardGeoRow {
  tehsil: string;
  town_village: string;
  user_count: number;
  pct: number;
}

export interface DashboardLiveFunnel {
  started: number;
  regen_used: number;
  paid: number;
}

export interface DashboardStats {
  kpis: DashboardKPIs;
  timeline: DashboardTimelineDay[];
  funnel: DashboardFunnel;
  revenue_breakdown: DashboardRevenueBreakdown;
  cohort_retention: DashboardCohortRetention;
  geo: DashboardGeoRow[];
  live_funnel: DashboardLiveFunnel;
}

export interface UserEvent {
  id: string;
  user_id: string | null;
  fingerprint_id: string | null;
  event_type: string;
  ip_address: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  page_path: string | null;
  metadata: any;
  created_at: string;
  // joined
  user_name?: string | null;
}

// Legacy type kept for compatibility with non-dashboard admin screens
export interface AdminStats {
  total_users: number;
  total_projects: number;
  paid_projects: number;
  total_sessions: number;
  paid_sessions: number;
  total_feedback: number;
  returning_users: number;
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

// ─── Dashboard RPC (single round-trip) ───────────────────────────────────────

export async function fetchDashboardStats(days: number = 30): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats', {
    p_days: days,
    p_tz: 'Asia/Kolkata',
  });
  if (error) throw error;
  return data as DashboardStats;
}

// ─── User Activity (fingerprint log) ─────────────────────────────────────────

export async function fetchUserEvents(limit: number = 100): Promise<UserEvent[]> {
  const { data, error } = await supabase
    .from('user_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!data?.length) return [];

  const userIds = [...new Set((data).filter(e => e.user_id).map(e => e.user_id))];
  let nameMap: Record<string, string | null> = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds);
    (profiles || []).forEach(p => { nameMap[p.id] = p.full_name; });
  }

  return data.map(e => ({ ...e, user_name: e.user_id ? (nameMap[e.user_id] ?? null) : null }));
}

// ─── Log UPI payment (admin only, calls Postgres fn) ─────────────────────────

export async function adminLogUpiPayment(
  amountRupees: number,
  upiRef?: string,
  note?: string
): Promise<void> {
  const { error } = await supabase.rpc('admin_log_upi_payment', {
    p_amount_rupees: amountRupees,
    p_upi_ref:       upiRef || null,
    p_note:          note   || null,
    p_source_id:     null,
  });
  if (error) throw error;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

export function exportCSV(filename: string, rows: Record<string, any>[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape  = (v: any) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function fetchAdminUsers(
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<{ users: AdminUser[]; total: number }> {
  const start = (page - 1) * limit;
  const end   = start + limit - 1;

  let query = supabase.from('user_profiles').select('*', { count: 'exact' });

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`full_name.ilike.${q},mobile.ilike.${q},tehsil.ilike.${q},town_village.ilike.${q}`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) throw error;

  const ids = (data || []).map(u => u.id);
  if (!ids.length) return { users: [], total: count || 0 };

  const [projectCounts, sessionCounts] = await Promise.all([
    supabase.from('projects').select('user_id').in('user_id', ids),
    supabase.from('live_exports').select('user_id').in('user_id', ids),
  ]);

  const pcMap: Record<string, number> = {};
  (projectCounts.data || []).forEach(p => { pcMap[p.user_id] = (pcMap[p.user_id] || 0) + 1; });

  const scMap: Record<string, number> = {};
  (sessionCounts.data || []).forEach(s => { scMap[s.user_id] = (scMap[s.user_id] || 0) + 1; });

  const users = (data || []).map(u => ({
    ...u,
    project_count: pcMap[u.id] || 0,
    live_session_count: scMap[u.id] || 0,
  }));

  return { users, total: count || 0 };
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

export async function fetchAdminProjects(
  page: number,
  limit: number = 20,
  search?: string,
  paymentStatus?: 'all' | 'paid' | 'unpaid'
): Promise<{ projects: AdminProject[]; total: number }> {
  const start = (page - 1) * limit;
  const end   = start + limit - 1;

  let query = supabase.from('projects').select('*', { count: 'exact' });

  if (paymentStatus && paymentStatus !== 'all') {
    query = query.eq('payment_status', paymentStatus);
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    const { data: matchingUsers } = await supabase
      .from('user_profiles')
      .select('id')
      .or(`full_name.ilike.${q},mobile.ilike.${q}`);

    const matchingUserIds = (matchingUsers || []).map(u => u.id);

    if (matchingUserIds.length > 0) {
      query = query.or(`name.ilike.${q},user_id.in.(${matchingUserIds.join(',')})`);
    } else {
      query = query.ilike('name', q);
    }
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(start, end);

  if (error) throw error;

  const userIds = [...new Set((data || []).map(p => p.user_id))];
  if (!userIds.length) return { projects: [], total: count || 0 };

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, mobile')
    .in('id', userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  const projects = (data || []).map(p => ({
    ...p,
    owner_name:   profileMap[p.user_id]?.full_name ?? null,
    owner_mobile: profileMap[p.user_id]?.mobile    ?? null,
  }));

  return { projects, total: count || 0 };
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
    user_name:   profileMap[a.user_id]?.full_name ?? null,
    user_mobile: profileMap[a.user_id]?.mobile    ?? null,
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

export async function transferProjectOwner(projectId: string, newUserId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ user_id: newUserId })
    .eq('id', projectId);
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
    owner_name:   f.user_id ? (profileMap[f.user_id]?.full_name ?? null) : null,
    owner_mobile: f.user_id ? (profileMap[f.user_id]?.mobile    ?? null) : null,
  }));
}

export interface AdminDonation {
  id: string;
  user_id: string | null;
  amount: number;
  name: string | null;
  note: string | null;
  created_at: string;
  is_paid?: boolean | null;
  payment_id?: string | null;
  payment_status?: string | null;
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
    owner_name:   d.user_id ? (profileMap[d.user_id]?.full_name ?? null) : null,
    owner_mobile: d.user_id ? (profileMap[d.user_id]?.mobile    ?? null) : null,
  }));
}

export async function verifyDonation(id: string, isPaid: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('donations')
    .update({ is_paid: isPaid })
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No rows updated. Make sure the database schema is updated and policies allow updates.');
  }
}

export async function deleteDonation(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('donations')
    .delete()
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No rows deleted. Make sure the database schema is updated and policies allow deletes.');
  }
}

// ─── Legacy: kept for compatibility with other admin screens ─────────────────

export interface DailyStat {
  date: string;
  newUsers: number;
  newProjects: number;
}

export async function searchAdminUsers(queryText: string): Promise<AdminUser[]> {
  let query = supabase.from('user_profiles').select('*');

  if (queryText.trim()) {
    const q = `%${queryText.trim()}%`;
    query = query.or(`full_name.ilike.${q},mobile.ilike.${q},tehsil.ilike.${q}`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data || [];
}

/**
 * Formats a phone number for official WhatsApp wa.me links.
 * Handles numbers with or without +91 / 91 / 0 prefix properly.
 * E.g.
 * "9876543210" -> "919876543210"
 * "+919876543210" -> "919876543210"
 * "919876543210" -> "919876543210"
 * "09876543210" -> "919876543210"
 */
export function formatWhatsAppNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith('091')) {
    return digits.slice(1);
  }
  return digits;
}

