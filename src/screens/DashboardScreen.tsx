import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { idbStore, SurveySession } from '../lib/idb';
import type { MapData } from '../types';
import ProfileScreen from './ProfileScreen';
import DonationPopup from '../components/DonationPopup';
import { useTranslation, LanguageSelector } from '../lib/i18n';
import { AppShell } from '../components/AppShell';
import { Button, IconButton, Card, Badge, Input, Sheet, Skeleton } from '../components/ui';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  data: Partial<MapData>;
  created_at: string;
  updated_at: string;
  payment_status: string;
  export_count: number;
  isAssigned?: boolean;
}

interface Props {
  user: any;
  userProfile?: any;
  onLoadProject: (projectId: string, data: Partial<MapData>) => void;
  onNewProject: (initialData?: Partial<MapData>) => void;
  onLiveSurvey?: (initialData?: Partial<MapData>) => void;
  onResumeLiveSurvey?: (sessionId: string) => void;
  onDemoMap?: () => void;
  onCanvasBlockMap?: () => void;
  onProfileUpdated?: (profile: any) => void;
  onSatExtractorMap?: () => void;
}

export default function DashboardScreen({
  user,
  userProfile,
  onLoadProject,
  onNewProject,
  onLiveSurvey,
  onResumeLiveSurvey,
  onDemoMap,
  onCanvasBlockMap,
  onProfileUpdated,
  onSatExtractorMap
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [liveSessions, setLiveSessions] = useState<SurveySession[]>([]);
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Advanced Auto-Map States
  const [showAdvancedMapModal, setShowAdvancedMapModal] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [hlbCode, setHlbCode] = useState('');
  const [extractStatus, setExtractStatus] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);

  // Filter & Search state for My Maps
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed' | 'draft'>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // Feedback & Donate Modals
  const [showDonate, setShowDonate] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const sessionPopupShown = useRef(false);

  // Helper check map limit
  const checkLimitAndStart = (action: () => void) => {
    action();
  };

  const handleStartCanvasMap = () => {
    if (onCanvasBlockMap) onCanvasBlockMap();
  };

  // Fetch announcements
  useEffect(() => {
    async function loadAnnouncements() {
      try {
        const { data } = await supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(3);
        if (data) setAnnouncements(data);
      } catch (e) {
        // ignore
      }
    }
    loadAnnouncements();
  }, []);

  // Fetch user projects
  useEffect(() => {
    if (!user?.id) return;
    async function loadProjects() {
      try {
        setLoading(true);
        const [ownResult, assignmentsResult] = await Promise.all([
          supabase
            .from('projects')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false }),
          supabase
            .from('project_assignments')
            .select('project_id')
            .eq('user_id', user.id),
        ]);

        if (ownResult.error) throw ownResult.error;
        const visibleProjects = (ownResult.data || []).filter(p => !p.data?.deletedUI);
        setProjects(visibleProjects);

        const assignedIds = (assignmentsResult.data || []).map((a: any) => a.project_id);
        if (assignedIds.length) {
          const { data: sharedData } = await supabase
            .from('projects')
            .select('*')
            .in('id', assignedIds)
            .order('updated_at', { ascending: false });
          setAssignedProjects((sharedData || []).map(p => ({ ...p, isAssigned: true })));
        }
      } catch (err: any) {
        console.error('Error fetching projects:', err);
        setError(err.message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, [user?.id]);

  // Load IDB live survey sessions
  useEffect(() => {
    idbStore.getAllSessions().then(sessions => {
      setLiveSessions(sessions.sort((a, b) => b.startTime - a.startTime));
    }).catch(() => {});
  }, []);

  const handleDeleteUI = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!window.confirm(`Remove "${project.name || 'Untitled Map'}" from dashboard?`)) return;
    try {
      const updatedData = { ...(project.data || {}), deletedUI: true };
      const { error } = await supabase.from('projects').update({ data: updatedData }).eq('id', project.id);
      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch (err) {
      alert('Failed to remove map. Please try again.');
    }
  };

  const handleExtract = async () => {
    if (!pdfFile || !hlbCode.trim()) {
      setExtractError('Please upload a PDF file and enter the 4-digit HLB code.');
      return;
    }
    setExtractError(null);
    setExtractStatus('Sending PDF to microservice...');
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('hlb', hlbCode.trim());

      const apiUrl = import.meta.env.VITE_EXTRACTOR_API_URL || 'https://naksha-bot-2027.onrender.com';
      const res = await fetch(`${apiUrl}/api/extract`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned error status ${res.status}`);
      }

      const geojson = await res.json();
      const coords = geojson.geometry?.coordinates?.[0];
      if (!coords || coords.length < 3) {
        throw new Error('Server returned an invalid boundary polygon structure.');
      }
      
      const boundaryPins = coords.map(([lng, lat]: any) => ({ lat, lng }));
      const sumLat = boundaryPins.reduce((acc: number, curr: any) => acc + curr.lat, 0);
      const sumLng = boundaryPins.reduce((acc: number, curr: any) => acc + curr.lng, 0);
      const center = { lat: sumLat / boundaryPins.length, lng: sumLng / boundaryPins.length };

      setShowAdvancedMapModal(false);
      setPdfFile(null);
      setHlbCode('');
      setExtractStatus('');

      onNewProject({
        hlbNumber: hlbCode.trim(),
        boundaryPins,
        boundaryClosed: true,
        center,
        isAutoFetched: true,
        mode: 'sat-extractor' as any
      });
    } catch (err: any) {
      console.error(err);
      setExtractError(err.message || 'Connection failed.');
      setExtractStatus('');
    }
  };

  if (showProfile) {
    return (
      <ProfileScreen
        user={user}
        userProfile={userProfile}
        onClose={() => setShowProfile(false)}
        onSaved={(p: any) => {
          if (onProfileUpdated) onProfileUpdated(p);
          setShowProfile(false);
        }}
      />
    );
  }

  // Derive counts
  const pendingSessions = liveSessions.filter(s => s.state === 'paused');
  const completedSessions = liveSessions.filter(s => s.state === 'completed');
  
  // New this week projects (<7 days old)
  const oneWeekAgo = Date.now() - 7 * 86400 * 1000;
  const newProjectsThisWeek = projects.filter(p => new Date(p.created_at).getTime() > oneWeekAgo);
  
  // TODO(data): wire team member count to real team table when schema supports organization teams
  const teamMemberCount = 1;

  // Filter projects by search query and status filter
  const deskProjects = projects.filter((p: any) => p.data?.mode !== 'canvas');
  const canvasProjects = projects.filter((p: any) => p.data?.mode === 'canvas');

  const filterProject = (p: Project) => {
    const syms: any[] = p.data?.symbols || [];
    const total = syms.filter((s: any) => ['pucca_house','kutcha_house','apartment','non_residential'].includes(s.symbol_type)).length;
    const numbered = syms.filter((s: any) => ['pucca_house','kutcha_house','apartment','non_residential'].includes(s.symbol_type) && s.number !== null).length;
    
    let isCompleted = total > 0 && numbered === total;
    let isDraft = total === 0;
    let isInProgress = total > 0 && numbered < total;

    if (statusFilter === 'completed' && !isCompleted) return false;
    if (statusFilter === 'in_progress' && !isInProgress) return false;
    if (statusFilter === 'draft' && !isDraft) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = (p.name || '').toLowerCase().includes(q);
      const hlbMatch = (p.data?.hlbNumber || '').toLowerCase().includes(q);
      const distMatch = (p.data?.district || '').toLowerCase().includes(q);
      const stateMatch = (p.data?.state || '').toLowerCase().includes(q);
      if (!nameMatch && !hlbMatch && !distMatch && !stateMatch) return false;
    }
    return true;
  };

  const filteredDeskProjects = deskProjects.filter(filterProject);
  const filteredCanvasProjects = canvasProjects.filter(filterProject);

  // Group projects by Month (e.g. "July 2026")
  const groupProjectsByMonth = (projList: Project[]) => {
    const groups: { month: string; projects: Project[] }[] = [];
    projList.forEach(p => {
      const date = new Date(p.updated_at || p.created_at);
      const monthStr = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let group = groups.find(g => g.month === monthStr);
      if (!group) {
        group = { month: monthStr, projects: [] };
        groups.push(group);
      }
      group.projects.push(p);
    });
    return groups;
  };

  const deskProjectGroups = groupProjectsByMonth(filteredDeskProjects);

  // Render a flat list row for a project card
  const renderListRow = (project: Project, isCanvas = false) => {
    const syms: any[] = project.data?.symbols || [];
    const totalBuildings = syms.filter((s: any) => ['pucca_house','kutcha_house','apartment','non_residential'].includes(s.symbol_type)).length;
    const numberedBuildings = syms.filter((s: any) => ['pucca_house','kutcha_house','apartment','non_residential'].includes(s.symbol_type) && s.number !== null).length;
    const allNumbered = totalBuildings > 0 && numberedBuildings === totalBuildings;
    const isDraft = totalBuildings === 0;

    const statusDotVariant = allNumbered ? 'success' : isDraft ? 'neutral' : 'warning';
    const statusLabel = allNumbered ? 'Completed' : isDraft ? 'Draft' : 'In Progress';

    const hlb = project.data?.hlbNumber;

    return (
      <div
        key={project.id}
        onClick={() => onLoadProject(project.id, { ...project.data, paymentStatus: project.payment_status, exportCount: project.export_count })}
        className="group flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] border-b border-[var(--color-hairline)] last:border-b-0 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Status Dot */}
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            statusDotVariant === 'success' ? 'bg-[var(--color-success)]' : statusDotVariant === 'warning' ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-ink-tertiary)]'
          }`} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--color-ink)] font-public-sans group-hover:text-[var(--color-accent)] transition-colors truncate">
                {isCanvas && <span className="mr-1">🧩</span>}
                {project.data?.mode === 'sat-extractor' && <span className="mr-1">🛰️</span>}
                {project.name || 'Untitled Map'}
              </h3>
              {hlb && (
                <Badge variant="neutral" size="sm">
                  HLB {hlb}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--color-ink-secondary)] mt-0.5 font-jetbrains-mono">
              <span>{totalBuildings > 0 ? `${numberedBuildings}/${totalBuildings} houses` : 'No houses'}</span>
              {(project.data?.district || project.data?.state) && (
                <span className="truncate hidden sm:inline">
                  📍 {[project.data?.district, project.data?.state].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="text-[10px] text-[var(--color-ink-tertiary)]">
                {new Date(project.updated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-3">
          <Badge variant={statusDotVariant} size="sm">
            {statusLabel}
          </Badge>
          <IconButton
            onClick={(e) => handleDeleteUI(e, project)}
            aria-label="Delete map"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-[var(--color-danger)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </IconButton>
        </div>
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState<'home' | 'maps' | 'block-maps' | 'field-survey' | 'learn' | 'admin'>('home');

  const handleAppShellNavigate = (tab: 'home' | 'maps' | 'block-maps' | 'field-survey' | 'learn' | 'admin') => {
    setActiveTab(tab);
    if (tab === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tab === 'maps') {
      const el = document.getElementById('my-maps-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (tab === 'block-maps') {
      const el = document.getElementById('block-maps-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (tab === 'field-survey') {
      navigate('/live-dashboard');
    } else if (tab === 'learn') {
      if (onDemoMap) onDemoMap();
      else navigate('/how-it-works');
    } else if (tab === 'admin') {
      navigate('/kratagya');
    }
  };

  return (
    <AppShell activeTab={activeTab} onNavigate={handleAppShellNavigate} userEmail={user?.email}>
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Header Bar */}
        <header className="flex items-center justify-between pb-4 border-b border-[var(--color-hairline)]">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-10 h-10 object-contain shrink-0" />
            <div>
              <h1 className="text-xl font-bold font-public-sans text-[var(--color-ink)] leading-tight">{t('brand')}</h1>
              <p className="text-xs text-[var(--color-ink-secondary)]">{t('subBrand')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {announcements.length > 0 && (
              <IconButton
                onClick={() => setShowAnnouncementsModal(true)}
                aria-label="View Announcements"
                variant="surface"
              >
                🔔
              </IconButton>
            )}
            <Button
              onClick={() => setShowWhatsApp(true)}
              variant="tinted"
              size="sm"
            >
              <span className="hidden sm:inline">{t('helpGroup')}</span>
              <span className="sm:hidden">WhatsApp</span>
            </Button>
            <IconButton
              onClick={() => setShowDonate(true)}
              aria-label="Support"
              variant="surface"
            >
              🙏
            </IconButton>
            <IconButton
              onClick={() => setShowProfile(true)}
              aria-label="Profile"
              variant="surface"
            >
              👤
            </IconButton>
          </div>
        </header>

        {/* Greeting Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold font-public-sans tracking-tight text-[var(--color-ink)]">
              {`Namaste, ${(userProfile?.full_name || user?.user_metadata?.full_name || user?.email || 'Surveyor').split(' ')[0]} 👋`}
            </h2>
            <p className="text-sm text-[var(--color-ink-secondary)] mt-0.5">Pick up where you left off, or start something new.</p>
          </div>
          {/* Surfaced "New this week" pill on mobile */}
          {newProjectsThisWeek.length > 0 && (
            <div className="sm:hidden self-start">
              <Badge variant="accent" size="md">
                ✨ {newProjectsThisWeek.length} new this week
              </Badge>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-rose-50 text-[var(--color-danger)] p-4 rounded-[var(--radius-md)] border border-rose-200 text-sm">{error}</div>
        )}

        {/* ── Overview Stats Block (5 metrics on desktop, 2x2 + pill on mobile) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Card variant="flat" padding="sm" className="text-center">
            <p className="text-2xl font-bold text-[var(--color-accent)] font-jetbrains-mono">{projects.length}</p>
            <p className="text-xs text-[var(--color-ink-secondary)] font-semibold uppercase tracking-wide">Maps</p>
          </Card>
          <Card variant="flat" padding="sm" className="text-center">
            <p className="text-2xl font-bold text-[var(--color-warning)] font-jetbrains-mono">{pendingSessions.length}</p>
            <p className="text-xs text-[var(--color-ink-secondary)] font-semibold uppercase tracking-wide">In Progress</p>
          </Card>
          <Card variant="flat" padding="sm" className="text-center">
            <p className="text-2xl font-bold text-[var(--color-success)] font-jetbrains-mono">{completedSessions.length}</p>
            <p className="text-xs text-[var(--color-ink-secondary)] font-semibold uppercase tracking-wide">Completed</p>
          </Card>
          <Card variant="flat" padding="sm" className="text-center">
            <p className="text-2xl font-bold text-[var(--color-ink)] font-jetbrains-mono">{teamMemberCount}</p>
            <p className="text-xs text-[var(--color-ink-secondary)] font-semibold uppercase tracking-wide">Team Members</p>
          </Card>
          {/* Desktop 5th metric card for New This Week */}
          <Card variant="flat" padding="sm" className="text-center hidden lg:block">
            <p className="text-2xl font-bold text-[var(--color-accent)] font-jetbrains-mono">{newProjectsThisWeek.length}</p>
            <p className="text-xs text-[var(--color-ink-secondary)] font-semibold uppercase tracking-wide">New This Week</p>
          </Card>
        </div>

        {/* ── New Maps Strip (horizontally scrollable, shown only if new maps exist in last 7 days) ── */}
        {newProjectsThisWeek.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--color-ink-secondary)] uppercase tracking-wider flex items-center gap-1.5 font-public-sans">
                <span>✨ New Maps (Last 7 Days)</span>
              </h3>
            </div>
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {newProjectsThisWeek.map(p => (
                <div
                  key={p.id}
                  onClick={() => onLoadProject(p.id, { ...p.data, paymentStatus: p.payment_status, exportCount: p.export_count })}
                  className="w-64 shrink-0 bg-[var(--color-surface)] p-3.5 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] shadow-[var(--shadow-sm)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Badge variant="accent" size="sm">New</Badge>
                    <span className="text-[10px] text-[var(--color-ink-tertiary)] font-jetbrains-mono">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--color-ink)] group-hover:text-[var(--color-accent)] truncate font-public-sans">
                    {p.name || 'Untitled Map'}
                  </h4>
                  <p className="text-xs text-[var(--color-ink-secondary)] font-jetbrains-mono mt-1">
                    HLB {p.data?.hlbNumber || '—'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Quick Actions Row (5 action tiles: all neutral surface-2, with --color-accent-tint reserved strictly for "Make a Map") ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            onClick={() => checkLimitAndStart(() => setShowAdvancedMapModal(true))}
            className="text-left p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-hairline)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-surface)] flex items-center justify-center text-xl mb-2 shadow-sm">⚡</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-ink)] leading-tight">Advanced Auto-Map</p>
            <p className="text-xs text-[var(--color-ink-secondary)] mt-0.5">GeoPDF Extract</p>
          </button>

          {/* Primary Action Tile strictly reserved with --color-accent-tint */}
          <button
            onClick={() => checkLimitAndStart(() => onNewProject(undefined))}
            className="text-left p-4 rounded-[var(--radius-lg)] bg-[var(--color-accent-tint)] border border-[var(--color-accent)]/30 hover:bg-indigo-100/80 transition-all cursor-pointer group shadow-sm"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white flex items-center justify-center text-xl mb-2 shadow-sm">🗺️</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-accent)] leading-tight">नक्शा बनाएं</p>
            <p className="text-xs text-[var(--color-accent)]/80 mt-0.5 font-semibold">Make a Map</p>
          </button>

          <button
            onClick={() => checkLimitAndStart(handleStartCanvasMap)}
            className="text-left p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-hairline)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-surface)] flex items-center justify-center text-xl mb-2 shadow-sm">🧩</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-ink)] leading-tight">ब्लॉक नक्शा</p>
            <p className="text-xs text-[var(--color-ink-secondary)] mt-0.5">Block Map</p>
          </button>

          <button
            onClick={() => navigate('/live-dashboard')}
            className="text-left p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-hairline)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-surface)] flex items-center justify-center text-xl mb-2 shadow-sm">🚶</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-ink)] leading-tight">फील्ड सर्वे</p>
            <p className="text-xs text-[var(--color-ink-secondary)] mt-0.5">Field Survey</p>
          </button>

          <button
            onClick={onDemoMap}
            className="text-left p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-hairline)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-surface)] flex items-center justify-center text-xl mb-2 shadow-sm">🎓</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-ink)] leading-tight">सीखें</p>
            <p className="text-xs text-[var(--color-ink-secondary)] mt-0.5">Learn</p>
          </button>
        </div>

        {/* ── My Maps Section (Search input + status filter chips + Month headers + List Rows) ── */}
        <section id="my-maps-section" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--color-hairline)]">
            <h2 className="text-lg font-bold font-public-sans text-[var(--color-ink)]">
              🗺️ {t('myMaps')} ({filteredDeskProjects.length})
            </h2>

            {/* Inline search + filter chips */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search maps..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 min-h-[36px] text-xs"
              />

              {/* Filter Chips Desktop */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                {(['all', 'in_progress', 'completed', 'draft'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-[var(--radius-full)] text-xs font-semibold capitalize transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-[var(--color-accent)] text-white shadow-sm'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-ink-secondary)] hover:bg-slate-200'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Mobile Filter Sheet Button */}
              <button
                onClick={() => setShowFilterSheet(true)}
                className="sm:hidden px-3 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-hairline)] rounded-[var(--radius-md)] text-xs font-semibold text-[var(--color-ink-secondary)] shrink-0"
              >
                Filter ({statusFilter.replace('_', ' ')})
              </button>
            </div>
          </div>

          {/* Grouped Month List Rows */}
          {deskProjectGroups.length === 0 ? (
            <Card variant="flat" padding="lg" className="text-center">
              <p className="text-sm text-[var(--color-ink-secondary)] font-medium">No maps found matching your criteria.</p>
              <Button
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                variant="plain"
                size="sm"
                className="mt-2"
              >
                Clear filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {deskProjectGroups.map(group => (
                <div key={group.month} className="space-y-2">
                  <h3 className="text-xs font-bold text-[var(--color-ink-tertiary)] uppercase tracking-wider px-1 font-public-sans">
                    {group.month}
                  </h3>
                  <Card variant="flat" padding="none" className="overflow-hidden divide-y divide-[var(--color-hairline)]">
                    {group.projects.map(p => renderListRow(p, false))}
                  </Card>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Block Maps Section ── */}
        {filteredCanvasProjects.length > 0 && (
          <section id="block-maps-section" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-public-sans text-[var(--color-ink)]">
                🧩 ब्लॉक नक्शे <span className="text-[var(--color-ink-tertiary)] text-xs font-normal">/ Block Maps</span>
              </h2>
              <Button onClick={() => checkLimitAndStart(handleStartCanvasMap)} variant="filled" size="sm">
                + New Block Map
              </Button>
            </div>
            <Card variant="flat" padding="none" className="overflow-hidden divide-y divide-[var(--color-hairline)]">
              {filteredCanvasProjects.map(p => renderListRow(p, true))}
            </Card>
          </section>
        )}
      </div>

      {/* Mobile Filter Sheet */}
      <Sheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)} title="Filter Maps" maxWidth="sm">
        <div className="space-y-2">
          {(['all', 'in_progress', 'completed', 'draft'] as const).map(st => (
            <button
              key={st}
              onClick={() => { setStatusFilter(st); setShowFilterSheet(false); }}
              className={`w-full text-left p-3 rounded-[var(--radius-md)] text-sm font-bold capitalize transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-[var(--color-accent-tint)] text-[var(--color-accent)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </Sheet>

      {/* Advanced Map Modal */}
      <Sheet open={showAdvancedMapModal} onClose={() => setShowAdvancedMapModal(false)} title="Advanced Auto-Map (GeoPDF)" maxWidth="md">
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-ink-secondary)] leading-relaxed">
            Upload an official GeoPDF map file and enter your 4-digit HLB code to auto-extract boundary coordinates.
          </p>
          <Input
            label="HLB Code (4 digits)"
            placeholder="e.g. 0042"
            value={hlbCode}
            onChange={e => setHlbCode(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-ink-secondary)]">Upload GeoPDF Map File</label>
            <input
              type="file"
              accept=".pdf"
              onChange={e => setPdfFile(e.target.files?.[0] || null)}
              className="text-xs text-[var(--color-ink)]"
            />
          </div>
          {extractError && <p className="text-xs text-[var(--color-danger)] font-bold">{extractError}</p>}
          {extractStatus && <p className="text-xs text-[var(--color-accent)] font-medium animate-pulse">{extractStatus}</p>}
          <Button onClick={handleExtract} variant="filled" fullWidth size="lg">
            Extract & Start Map
          </Button>
        </div>
      </Sheet>

      {/* WhatsApp Modal */}
      <Sheet open={showWhatsApp} onClose={() => setShowWhatsApp(false)} title="Join WhatsApp Support" maxWidth="sm">
        <div className="space-y-4 text-center">
          <p className="text-sm text-[var(--color-ink-secondary)]">
            Connect directly with enumerators across India for real-time census mapping help.
          </p>
          <Button
            onClick={() => window.open('https://chat.whatsapp.com/sample', '_blank')}
            variant="filled"
            fullWidth
            size="lg"
          >
            Open WhatsApp Group
          </Button>
        </div>
      </Sheet>

      {/* Donation Modal */}
      <DonationPopup
        isOpen={showDonate}
        onClose={() => setShowDonate(false)}
        onMute24h={() => setShowDonate(false)}
        isPrintArea={false}
      />
    </AppShell>
  );
}
