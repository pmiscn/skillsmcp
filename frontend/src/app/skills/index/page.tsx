'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  api,
  Skill,
  SkillIndexStatus,
  TranslationJob,
  DashboardStats,
  ProcessStatus,
  SyncJobSummary,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Activity,
  Database,
  RefreshCcw,
  Github,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  ShieldCheck,
  Search,
  Cpu,
  Globe,
  Zap,
  Trash2,
  Copy,
  FileUp,
  X,
  FileText,
  Save,
  Play,
  Loader2,
  Terminal,
  Download,
  Upload,
  LayoutDashboard,
  Languages,
  Square,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Navbar } from '@/components/layout/Navbar';

export default function IndexStatusPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const router = useRouter();
  const [status, setStatus] = useState<SkillIndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<
    { timestamp: string; source: string; message: string }[]
  >([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [syncLogs]);

  const [syncStatus, setSyncStatus] = useState<'running' | 'completed' | 'failed' | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncJobSummary['summary'] | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [skillsShUrl, setSkillsShUrl] = useState('');
  const [gitOwner, setGitOwner] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [panelHeight, setPanelHeight] = useState(400);
  const [repoStatuses, setRepoStatuses] = useState<
    Record<string, 'success' | 'failed' | 'syncing' | null>
  >({});
  const [failures, setFailures] = useState<{ repo: string; error: string; timestamp: string }[]>(
    [],
  );
  const [showFailures, setShowFailures] = useState(false);
  const [showManualImport, setShowManualImport] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'github' | 'path'>('upload');
  const [manualImportData, setManualImportData] = useState({
    owner: '',
    repo: '',
    name: '',
    name_zh: '',
    description: '',
    description_zh: '',
    tags: '',
    contact: '',
    skill_path: '',
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transSkillId, setTransSkillId] = useState('');
  const [transSkillData, setTransSkillData] = useState<Skill | null>(null);
  const [transJobs, setTransJobs] = useState<TranslationJob[]>([]);
  const [transModule, setTransModule] = useState('prompt_templates');
  const [transJson, setTransJson] = useState('');
  const [transLangs, setTransLangs] = useState<string[]>(['zh']);
  const [transModules, setTransModules] = useState<string[]>([
    'name',
    'description',
    'content',
    'use_cases',
    'prompt_templates',
    'best_practices',
    'avoid',
    'faq',
  ]);
  const [transLoading, setTransLoading] = useState(false);
  const [skillStats, setSkillStats] = useState<{
    totalSkills: number;
    vectorizedSkills: number;
    pendingVectorization: number;
  } | null>(null);
  const [continueUpdating, setContinueUpdating] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [processLoading, setProcessLoading] = useState<Record<string, boolean>>({});
  const [logProcessName, setLogProcessName] = useState<string | null>(null);
  const [processLogs, setProcessLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);

  const [detecting, setDetecting] = useState(false);
  const [auditing, setAuditing] = useState(false);

  const fetchLogs = async (name: string) => {
    setLogsLoading(true);
    try {
      const data = await api.getProcessLogs(name);
      setProcessLogs(data.logs || '');
    } catch (error) {
      console.error(error);
      setProcessLogs('');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleStartProcess = async (name: string) => {
    setProcessLoading((prev) => ({ ...prev, [name]: true }));
    try {
      await api.startProcess(name);
      showToast(t('dashboard.processes.start_success', { name }), 'success');
      await fetchDashboardStats();
    } catch (error) {
      console.error(error);
      showToast(t('dashboard.processes.start_failed', { name }), 'error');
    } finally {
      setProcessLoading((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleStopProcess = async (name: string) => {
    setProcessLoading((prev) => ({ ...prev, [name]: true }));
    try {
      await api.stopProcess(name);
      showToast(t('dashboard.processes.stop_success', { name }), 'success');
      await fetchDashboardStats();
    } catch (error) {
      console.error(error);
      showToast(t('dashboard.processes.stop_failed', { name }), 'error');
    } finally {
      setProcessLoading((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleClearProcessLogs = async (name: string) => {
    try {
      await api.clearProcessLogs(name);
      showToast(t('dashboard.processes.clear_success', { name }), 'success');
       setProcessLogs('');
    } catch (error) {
      console.error(error);
      showToast(t('dashboard.processes.clear_failed', { name }), 'error');
    }
  };

  const fetchDashboardStats = useCallback(async () => {
    try {
      const stats = await api.getDashboardStats();
      setDashboardStats(stats);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardStats();
      const interval = setInterval(fetchDashboardStats, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchDashboardStats]);

  const handleDetectTranslations = async () => {
    setDetecting(true);
    try {
      const result = await api.detectTranslations();
      const { totalSkills, enqueuedCount } = result;
      showToast(
        t('index.detection_summary', {
          total: totalSkills || 0,
          enqueued: enqueuedCount || 0,
        }),
        'success',
      );
      await fetchDashboardStats();
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_enqueue'), 'error');
    } finally {
      setDetecting(false);
    }
  };

  const handleAuditAllSkills = async () => {
    setAuditing(true);
    try {
      await api.auditAllSkills();
      showToast(t('index.audit_triggered'), 'success');
      await fetchDashboardStats();
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_audit'), 'error');
    } finally {
      setAuditing(false);
    }
  };

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const StatCard = ({
    title,
    value,
    subtitle,
    actions,
  }: {
    title: string;
    value: string | number;
    subtitle?: string | React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );

  const handleContinueUpdate = async () => {
    setContinueUpdating(true);
    try {
      await api.updateSkillIndex();
      showToast(t('index.success_rebuild'), 'success');
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_rebuild'), 'error');
    } finally {
      setContinueUpdating(false);
    }
  };

  const fetchTransSkill = async () => {
    if (!transSkillId) return;
    setTransLoading(true);
    try {
      const skill = await api.getSkill(transSkillId);
      setTransSkillData(skill);
      const content =
        (skill as unknown as Record<string, unknown>)[transModule] ||
        (skill.module_overrides as Record<string, unknown>)?.[transModule] ||
        {};
      setTransJson(JSON.stringify(content, null, 2));

      const jobs = await api.listTranslationJobs(transSkillId);
      setTransJobs(jobs?.jobs || []);

      showToast(t('index.success_load_skill'), 'success');
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_load_skill'), 'error');
    } finally {
      setTransLoading(false);
    }
  };

  const handleTransModuleChange = (moduleName: string) => {
    setTransModule(moduleName);
    if (transSkillData) {
      const content =
        (transSkillData as unknown as Record<string, unknown>)[moduleName] ||
        (transSkillData.module_overrides as Record<string, unknown>)?.[moduleName] ||
        {};
      setTransJson(JSON.stringify(content, null, 2));
    }
  };

  const handleSaveOverride = async () => {
    if (!transSkillId || !transJson) return;
    try {
      let parsed;
      try {
        parsed = JSON.parse(transJson);
      } catch {
        showToast(t('index.invalid_json'), 'error');
        return;
      }

      await api.updateSkill(transSkillId, {
        [transModule]: parsed,
      });
      showToast(t('index.success_update_module'), 'success');
      fetchTransSkill();
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_update_module'), 'error');
    }
  };

  const handleEnqueueTranslation = async () => {
    if (!transSkillId) return;
    try {
      await api.enqueueTranslation(transSkillId, {
        target_langs: transLangs,
        modules: transModules,
      });
      showToast(t('index.success_enqueue'), 'success');
      const jobs = await api.listTranslationJobs(transSkillId);
      setTransJobs(jobs?.jobs || []);
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_enqueue'), 'error');
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.manualImportSkill({
        owner: manualImportData.owner,
        repo: manualImportData.repo,
        manifest: {
          name: manualImportData.name,
          name_zh: manualImportData.name_zh,
          description: manualImportData.description,
          description_zh: manualImportData.description_zh,
          tags: manualImportData.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          contact: manualImportData.contact,
        },
        skill_path: manualImportData.skill_path,
        rebuildIndex: true,
        file: importFile || undefined,
      });
      showToast(t('detail.sync_success'), 'success');
      setShowManualImport(false);
      setManualImportData({
        owner: '',
        repo: '',
        name: '',
        name_zh: '',
        description: '',
        description_zh: '',
        tags: '',
        contact: '',
        skill_path: '',
      });
      setImportFile(null);
      fetchStatus();
    } catch (err) {
      console.error(err);
      showToast(t('detail.sync_failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = useCallback(async () => {
    // Fetch individually to allow progressive rendering
    api.getSkillIndexStatus()
      .then(setStatus)
      .catch(err => {
        console.error('Failed to fetch status:', err);
        showToast(t('detail.error_loading'), 'error');
      });

    api.getSyncFailures()
      .then(setFailures)
      .catch(() => setFailures([]));

    api.getSkillStats()
      .then(setSkillStats)
      .catch(() => setSkillStats(null));
  }, [t, showToast]);

  const updateRepoStatus = (
    owner: string,
    repo: string,
    status: 'success' | 'failed' | 'syncing' | null,
  ) => {
    setRepoStatuses((prev) => ({ ...prev, [`${owner}/${repo}`]: status }));
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/auth/login');
      return;
    }

    if (!isAuthenticated) return;

    fetchStatus();
  }, [authLoading, isAuthenticated, router, fetchStatus]);

  const handleRebuild = async () => {
    setRebuilding(true);

    try {
      await api.rebuildSkillIndex();
      showToast(t('index.success_rebuild'), 'success');
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      console.error(err);
      showToast(t('index.failed_rebuild'), 'error');
    } finally {
      setRebuilding(false);
    }
  };

  const startLogStream = (jobId: string) => {
    setSyncLogs([]);
    setSyncStatus('running');
    setSyncSummary(null);
    setSyncing(true);
    setSyncProgress(null);
    setShowSyncPanel(true);

    const token = localStorage.getItem('accessToken');
    const eventSource = new EventSource(
      `${api.getBaseUrl()}/api/skills/sync/stream/${jobId}?token=${token}`,
    );

    let reconnectTimeout: NodeJS.Timeout;

    const activeRepos: string[] = [];

    eventSource.onopen = () => {
      console.log('SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      const rawData = event.data.trim();
      if (!rawData || rawData === ': heartbeat' || rawData.startsWith(':')) return;

      try {
        const data = JSON.parse(rawData);
        if (data.type === 'status') {
          setSyncStatus(data.status);
          if (data.status === 'completed' || data.status === 'failed') {
            eventSource.close();
            setSyncing(false);
            fetchStatus();

            api
              .getSyncSummary(jobId)
              .then((result) => {
                if (result?.summary) {
                  setSyncSummary(result.summary);
                }
              })
              .catch((err) => {
                console.warn('Failed to fetch sync summary:', err);
              });

            activeRepos.forEach((repoId) => {
              const [owner, repo] = repoId.split('/');
              updateRepoStatus(owner, repo, data.status === 'completed' ? 'success' : 'failed');
            });

            if (data.status === 'completed') {
              showToast(t('index.success_sync'), 'success');
            } else {
              showToast(t('index.failed_sync'), 'error');
            }
          }
        } else if (data.type === 'progress') {
          setSyncProgress({ current: data.current, total: data.total });
        } else {
          setSyncLogs((prev) => {
            const newLogs = [...prev, data];
            // Keep only last 500 logs to prevent browser freeze
            return newLogs.length > 500 ? newLogs.slice(-500) : newLogs;
          });

          const syncMatch =
            data.message.match(/Starting sync for ([^/]+)\/([^ ]+)/) ||
            data.message.match(/Syncing ([^/]+)\/([^.]+)/);
          if (syncMatch) {
            const owner = syncMatch[1];
            const repo = syncMatch[2];
            const repoId = `${owner}/${repo}`;
            if (!activeRepos.includes(repoId)) {
              activeRepos.push(repoId);
            }
            updateRepoStatus(owner, repo, 'syncing');
          }

          const successMatch = data.message.match(
            /Command success:.*load-skill.js.*--owner ([^ ]+) --repo ([^ ]+)/,
          );
          if (successMatch) {
            updateRepoStatus(successMatch[1], successMatch[2], 'success');
          }

          const failMatch = data.message.match(/Sync failed for ([^/]+)\/([^:]+):/);
          if (failMatch) {
            updateRepoStatus(failMatch[1], failMatch[2], 'failed');
          }
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', event.data, e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
      if (syncStatus === 'running') {
        reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect SSE...');
          startLogStream(jobId);
        }, 3000);
      } else {
        setSyncing(false);
        setSyncStatus('failed');
      }
    };

    return () => {
      eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  };

  const handleSyncSkillsSh = async (urlOverride?: string) => {
    const targetUrl = urlOverride || skillsShUrl;
    if (!targetUrl.trim()) return;
    try {
      const { jobId } = await api.syncSkills({
        source: 'skills.sh',
        url: targetUrl,
        rebuildIndex: true,
      });
      startLogStream(jobId);
      setSkillsShUrl('');
    } catch (err) {
      console.error(err);
      setSyncStatus('failed');
    }
  };

  const triggerSync = async (owner: string, repo: string, ref?: string) => {
    if (!owner.trim() || !repo.trim()) return;
    try {
      const { jobId } = await api.syncSkills({
        source: 'github',
        owner,
        repo,
        ref: ref || undefined,
        rebuildIndex: true,
      });
      startLogStream(jobId);
      if (owner === gitOwner && repo === gitRepo) {
        setGitOwner('');
        setGitRepo('');
        setGitRef('');
      }
    } catch (err) {
      console.error(err);
      setSyncStatus('failed');
    }
  };

  const handleSyncGitHubForm = () => {
    triggerSync(gitOwner, gitRepo, gitRef);
  };

  const handleSyncAllOfficial = async () => {
    const repos = [
      { source: 'github', owner: 'anthropics', repo: 'skills' },
      { source: 'github', owner: 'ComposioHQ', repo: 'awesome-claude-skills' },
      { source: 'github', owner: 'aiskillstore', repo: 'marketplace' },
    ];

    repos.forEach((r) => updateRepoStatus(r.owner, r.repo, 'syncing'));

    try {
      const { jobId } = await api.syncSkills(
        repos as { source: 'github'; owner: string; repo: string }[],
      );
      startLogStream(jobId);
    } catch (err) {
      console.error(err);
      setSyncStatus('failed');
      repos.forEach((r) => updateRepoStatus(r.owner, r.repo, 'failed'));
    }
  };

  const handleSyncAllSkillsSh = async () => {
    try {
      const { jobId } = await api.syncAllSkillsSh();
      startLogStream(jobId);
    } catch (err) {
      console.error(err);
      setSyncStatus('failed');
      showToast(t('index.failed_full_sync'), 'error');
    }
  };

  const RepoStatusIndicator = ({ owner, repo }: { owner: string; repo: string }) => {
    const status = repoStatuses[`${owner}/${repo}`];
    if (!status) return null;

    return (
      <div className="flex items-center gap-1.5 ml-2">
        {status === 'syncing' && <RefreshCcw size={10} className="animate-spin text-primary" />}
        {status === 'success' && <CheckCircle2 size={10} className="text-green-500" />}
        {status === 'failed' && <AlertCircle size={10} className="text-destructive" />}
        <span
          className={cn(
            'text-[9px] font-bold uppercase tracking-tighter',
            status === 'syncing'
              ? 'text-primary'
              : status === 'success'
                ? 'text-green-500'
                : 'text-destructive',
          )}
        >
          {status}
        </span>
      </div>
    );
  };

  const handleClearLogs = () => {
    setSyncLogs([]);
    if (!syncing) {
      setSyncStatus(null);
      setShowSyncPanel(false);
    }
  };

  const handleCopyLogs = () => {
    const text = syncLogs
      .map((log) => `[${log.timestamp}] [${log.source}] ${log.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-32">
      <Navbar>
        <div className="flex items-center">
          <Link
            href="/skills"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            {t('detail.back_home')}
          </Link>
        </div>
      </Navbar>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-semibold tracking-tight mb-2 text-foreground">
              {t('index.title')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">{t('index.subtitle')}</p>
          </motion.div>
        </header>
        {!dashboardStats ? (
          <section className="mb-12 p-8 bg-card border border-border rounded-xl shadow-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{t('detail.loading')}</p>
            </div>
          </section>
        ) : (
          <section className="mb-12 space-y-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              <h2>{t('dashboard.title')}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title={t('dashboard.translation.title')}
                value={dashboardStats.translation.completed}
                subtitle={
                  <div className="flex flex-col gap-0.5">
                    <span>
                      {`${t('dashboard.queued')}: ${dashboardStats.translation.queued} | ${t(
                        'dashboard.processing',
                      )}: ${dashboardStats.translation.processing}`}
                    </span>
                    {dashboardStats.translation.lastActiveAt && (
                      <span className="text-[10px] opacity-70 font-mono">
                        {t('dashboard.last_active')}:{' '}
                        {new Date(dashboardStats.translation.lastActiveAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                }
                actions={
                  <button
                    onClick={handleDetectTranslations}
                    disabled={detecting}
                    className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-md transition-all disabled:opacity-50"
                    title={t('index.detect_translations')}
                  >
                    {detecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                  </button>
                }
              />
              <StatCard
                title={t('dashboard.security.title')}
                value={dashboardStats.security.completed}
                subtitle={
                  <div className="flex flex-col gap-0.5">
                    <span>{`${t('dashboard.pending')}: ${dashboardStats.security.pending}`}</span>
                    {dashboardStats.security.lastActiveAt && (
                      <span className="text-[10px] opacity-70 font-mono">
                        {t('dashboard.last_active')}:{' '}
                        {new Date(dashboardStats.security.lastActiveAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                }
                actions={
                  <button
                    onClick={handleAuditAllSkills}
                    disabled={auditing}
                    className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-600 rounded-md transition-all disabled:opacity-50"
                    title={t('index.audit_pending')}
                  >
                    {auditing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                  </button>
                }
              />
              <StatCard
                title={t('dashboard.total')}
                value={dashboardStats.translation.total}
                subtitle={t('dashboard.updated_at', {
                  time: new Date(dashboardStats.updatedAt).toLocaleTimeString(),
                })}
              />
              <StatCard
                title={t('dashboard.failed')}
                value={dashboardStats.translation.failed}
                subtitle={`${t('dashboard.retry')}: ${dashboardStats.translation.retry}`}
              />
            </div>

            <div className="bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                {t('dashboard.processes.title')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t('dashboard.processes.status')}</th>
                      <th className="px-4 py-3 font-medium">{t('dashboard.processes.command')}</th>
                      <th className="px-4 py-3 font-medium text-right">{t('table.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dashboardStats.processes.map((proc, idx) => (
                      <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full',
                              proc.status === 'running'
                                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                                : 'bg-muted-foreground',
                            )}
                          />
                          {proc.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-md truncate">
                          {proc.command}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {proc.status === 'running' ? (
                              <button
                                onClick={() => handleStopProcess(proc.name)}
                                disabled={processLoading[proc.name]}
                                className="px-3 py-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                title={t('dashboard.processes.stop')}
                              >
                                {processLoading[proc.name] ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Square className="w-3 h-3 fill-current" />
                                )}
                                {t('dashboard.processes.stop')}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartProcess(proc.name)}
                                disabled={processLoading[proc.name]}
                                className="px-3 py-1.5 bg-green-500/10 text-green-600 hover:bg-green-500/20 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                title={t('dashboard.processes.start')}
                              >
                                {processLoading[proc.name] ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Play className="w-3 h-3 fill-current" />
                                )}
                                {t('dashboard.processes.start')}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setLogProcessName(proc.name);
                                fetchLogs(proc.name);
                              }}
                              className="px-3 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                              title={t('dashboard.processes.view_logs')}
                            >
                              <FileText className="w-3 h-3" />
                              {t('dashboard.processes.view_logs')}
                            </button>
                            <button
                              onClick={() => handleCopyCommand(proc.command)}
                              className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors inline-flex"
                              title={t('dashboard.processes.copy_command')}
                            >
                              {copiedCommand === proc.command ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-8">
            <AnimatePresence>
              {showFailures && failures.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-card border border-destructive/20 rounded-xl p-6 space-y-4 shadow-sm">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-4 flex items-center gap-2">
                      <AlertCircle size={14} />
                      {t('index.sync_failures')} ({failures.length})
                    </h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {failures.map((f, i) => (
                        <div
                          key={i}
                          className="flex flex-col gap-2 p-4 bg-destructive/5 rounded-lg border border-destructive/10"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">{f.repo}</span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {new Date(f.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-destructive break-all bg-background p-2 rounded border border-border">
                            {f.error}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <article className="bg-card border border-border rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center border border-border">
                    <Database size={18} className="text-muted-foreground" />
                  </div>
                  <div
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                      status?.index_loaded
                        ? 'bg-green-500/10 text-green-600 border-green-500/20'
                        : 'bg-destructive/10 text-destructive border-destructive/20',
                    )}
                  >
                    {status?.index_loaded ? t('index.live') : t('index.offline')}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    {t('index.registry_status')}
                  </h3>
                  <p className="text-2xl font-bold tracking-tight">
                    {status?.index_loaded ? t('index.ready') : t('index.incomplete')}
                  </p>
                </div>
              </article>

              <article className="bg-card border border-border rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center border border-border">
                    <Cpu size={18} className="text-muted-foreground" />
                  </div>
                  <ShieldCheck size={18} className="text-muted-foreground/40" />
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    {t('index.engine_mode')}
                  </h3>
                  <p className="text-2xl font-bold tracking-tight">
                    {typeof status?.meta?.embedding_type === 'string'
                      ? t(`index.engine.${String(status.meta.embedding_type).toLowerCase()}`)
                      : t('index.none')}
                  </p>
                </div>
              </article>
            </div>

            <div className="bg-secondary/30 rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 border border-border">
              <div className="flex-1">
                <h2 className="text-xl font-semibold tracking-tight mb-2 text-foreground">
                  {t('index.rebuild_title')}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  {t('index.rebuild_desc')}
                </p>
                {skillStats && (
                  <div className="flex flex-wrap items-center gap-6 text-xs">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-primary" />
                      <span className="font-medium text-muted-foreground">
                        {t('index.total_skills')}
                      </span>
                      <span className="font-bold text-foreground">
                        {skillStats.totalSkills.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Cpu size={14} className="text-green-500" />
                      <span className="font-medium text-muted-foreground">
                        {t('index.vectorized_skills')}
                      </span>
                      <span className="font-bold text-foreground">
                        {skillStats.vectorizedSkills.toLocaleString()}
                      </span>
                    </div>
                    {skillStats.pendingVectorization > 0 && (
                      <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="text-amber-500" />
                        <span className="font-medium text-muted-foreground">
                          {t('index.pending_vectorization')}
                        </span>
                        <span className="font-bold text-amber-500">
                          {skillStats.pendingVectorization.toLocaleString()}
                        </span>
                        <button
                          onClick={handleContinueUpdate}
                          disabled={continueUpdating}
                          className="ml-2 px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          {continueUpdating && <RefreshCcw size={10} className="animate-spin" />}
                          {t('index.continue_sync')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="shrink-0 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium text-sm hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {rebuilding ? (
                  <RefreshCcw size={16} className="animate-spin" />
                ) : (
                  <RefreshCcw size={16} />
                )}
                {rebuilding ? t('index.processing') : t('index.sync_now')}
              </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Database size={16} className="text-primary" />
                  {t('index.internal_mapping')}
                </h3>
                <button
                  onClick={() => setShowManualImport(!showManualImport)}
                  className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:bg-secondary/80 transition-colors border border-border"
                >
                  {showManualImport ? t('index.cancel_import') : t('index.manual_import')}
                </button>
              </div>

              <AnimatePresence>
                {showManualImport && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleManualImport}
                    className="space-y-6 mb-8 bg-secondary/20 p-6 rounded-xl border border-border"
                  >
                    {/* Mode Tabs */}
                    <div className="flex p-1 bg-background/50 rounded-lg border border-border max-w-sm mb-6">
                      {[
                        { id: 'upload' as const, icon: <Upload size={14} />, label: t('index.upload_zip') },
                        { id: 'github' as const, icon: <Github size={14} />, label: 'GitHub' },
                        { id: 'path' as const, icon: <LinkIcon size={14} />, label: t('index.skill_path') },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setImportMode(tab.id)}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all',
                            importMode === tab.id
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'hover:bg-muted text-muted-foreground',
                          )}
                        >
                          {tab.icon}
                          <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                      ))}
                    </div>

                    <AnimatePresence mode="wait">
                      {importMode === 'upload' && (
                        <motion.div
                          key="upload-tab"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="space-y-2"
                        >
                          <label className="text-xs font-medium text-muted-foreground px-1">
                            {t('index.upload_zip')}
                          </label>
                          <input
                            type="file"
                            accept=".zip,.tar.gz,.tgz"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setImportFile(file);
                            }}
                          />

                          {!importFile ? (
                            <div
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full border-2 border-dashed border-border hover:border-primary/50 bg-background rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group"
                            >
                              <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                <FileUp
                                  size={20}
                                  className="text-muted-foreground group-hover:text-primary transition-colors"
                                />
                              </div>
                              <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                                {t('index.drag_drop_zip')} / TAR.GZ
                              </span>
                              <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
                                {t('index.zip_help')}
                              </p>
                            </div>
                          ) : (
                            <div className="w-full bg-background border border-border rounded-xl p-4 flex items-center justify-between group">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                                  <FileText size={20} />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-foreground">
                                    {importFile.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    {t('index.selected_file')} • {(importFile.size / 1024).toFixed(1)}{' '}
                                    KB
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImportFile(null);
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                                title={t('index.clear_file')}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {importMode === 'github' && (
                        <motion.div
                          key="github-tab"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground px-1">
                              {t('index.github_owner')} *
                            </label>
                            <input
                              required
                              type="text"
                              value={manualImportData.owner}
                              onChange={(e) =>
                                setManualImportData({ ...manualImportData, owner: e.target.value })
                              }
                              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                              placeholder="e.g. anthropics"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground px-1">
                              {t('index.github_repo')} *
                            </label>
                            <input
                              required
                              type="text"
                              value={manualImportData.repo}
                              onChange={(e) =>
                                setManualImportData({ ...manualImportData, repo: e.target.value })
                              }
                              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                              placeholder="e.g. skills"
                            />
                          </div>
                        </motion.div>
                      )}

                      {importMode === 'path' && (
                        <motion.div
                          key="path-tab"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                        >
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground px-1">
                              {t('index.skill_path')} *
                            </label>
                            <input
                              required
                              type="text"
                              value={manualImportData.skill_path}
                              onChange={(e) =>
                                setManualImportData({
                                  ...manualImportData,
                                  skill_path: e.target.value,
                                })
                              }
                              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                              placeholder="e.g. /absolute/path/to/SKILL.md or relative/path"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="h-px bg-border my-2" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                          {t('index.skill_name')} *
                        </label>
                        <input
                          required={importMode !== 'upload'}
                          type="text"
                          value={manualImportData.name}
                          onChange={(e) =>
                            setManualImportData({ ...manualImportData, name: e.target.value })
                          }
                          className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                          placeholder="e.g. Search Tool"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                          {t('index.skill_name_zh')}
                        </label>
                        <input
                          type="text"
                          value={manualImportData.name_zh}
                          onChange={(e) =>
                            setManualImportData({ ...manualImportData, name_zh: e.target.value })
                          }
                          className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                          placeholder="e.g. 搜索工具"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                        {t('index.description')}
                      </label>
                      <textarea
                        value={manualImportData.description}
                        onChange={(e) =>
                          setManualImportData({ ...manualImportData, description: e.target.value })
                        }
                        className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none shadow-sm"
                        placeholder="What does this skill do?"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                        {t('index.description_zh')}
                      </label>
                      <textarea
                        value={manualImportData.description_zh}
                        onChange={(e) =>
                          setManualImportData({
                            ...manualImportData,
                            description_zh: e.target.value,
                          })
                        }
                        className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none shadow-sm"
                        placeholder="该技能的功能描述"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                          {t('index.tags_label')}
                        </label>
                        <input
                          type="text"
                          value={manualImportData.tags}
                          onChange={(e) =>
                            setManualImportData({ ...manualImportData, tags: e.target.value })
                          }
                          className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                          placeholder={t('index.tags_placeholder')}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                          {t('index.contact_label')}
                        </label>
                        <input
                          type="text"
                          value={manualImportData.contact}
                          onChange={(e) =>
                            setManualImportData({ ...manualImportData, contact: e.target.value })
                          }
                          className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                          placeholder={t('index.contact_placeholder')}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-muted-foreground px-1">
                        {t('index.skill_path')}
                      </label>
                      <input
                        type="text"
                        value={manualImportData.skill_path}
                        onChange={(e) =>
                          setManualImportData({ ...manualImportData, skill_path: e.target.value })
                        }
                        className="w-full bg-background border border-input rounded-xl px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                        placeholder="e.g. /absolute/path/to/SKILL.md or relative/path"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t('index.confirm_import')}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="space-y-3 font-mono text-xs text-muted-foreground bg-secondary/20 p-4 rounded-lg border border-border">
                <div className="flex items-center gap-4">
                  <span className="w-24 font-bold text-foreground uppercase tracking-tight">
                    {t('index.faiss_index')}
                  </span>
                  <span className="truncate opacity-75">
                    {typeof status?.meta?.index_path === 'string'
                      ? status.meta.index_path
                      : t('index.not_mapped')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-24 font-bold text-foreground uppercase tracking-tight">
                    {t('index.metadata')}
                  </span>
                  <span className="truncate opacity-75 text-primary font-medium">
                    {t('index.db_version')}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe size={16} className="text-pink-500" />
                  {t('index.translation_overrides')}
                </h3>
                {transLoading && (
                  <RefreshCcw size={14} className="animate-spin text-muted-foreground" />
                )}
              </div>

              <div className="space-y-6">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={transSkillId}
                    onChange={(e) => setTransSkillId(e.target.value)}
                    placeholder={t('index.enter_skill_id')}
                    className="flex-1 bg-background border border-input rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                  />
                  <button
                    onClick={fetchTransSkill}
                    disabled={transLoading || !transSkillId}
                    className="bg-secondary text-secondary-foreground px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-secondary/80 disabled:opacity-50 transition-all border border-border shadow-sm active:scale-95"
                  >
                    {transLoading ? (
                      <RefreshCcw size={14} className="animate-spin" />
                    ) : (
                      t('index.load')
                    )}
                  </button>
                </div>

                {transSkillData && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-border">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {t('index.module_override')}
                        </h4>
                        <select
                          value={transModule}
                          onChange={(e) => handleTransModuleChange(e.target.value)}
                          className="bg-background border border-border text-xs font-bold uppercase rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer transition-all shadow-sm"
                        >
                          <option value="prompt_templates">Prompt Templates</option>
                          <option value="use_cases">Use Cases</option>
                          <option value="faq">FAQ</option>
                          <option value="best_practices">Best Practices</option>
                          <option value="avoid">Avoid</option>
                        </select>
                      </div>
                      <textarea
                        value={transJson}
                        onChange={(e) => setTransJson(e.target.value)}
                        className="w-full h-[300px] bg-zinc-950 text-zinc-100 font-mono text-xs p-4 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border border-border transition-all"
                        spellCheck={false}
                      />
                      <button
                        onClick={handleSaveOverride}
                        className="w-full bg-secondary text-secondary-foreground py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-secondary/80 transition-all flex items-center justify-center gap-2 border border-border shadow-sm active:scale-95"
                      >
                        <Save size={14} /> {t('index.save_override')}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {t('index.translation_jobs')}
                      </h4>

                      <div className="bg-secondary/20 p-4 rounded-xl space-y-4 border border-border">
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase">
                            {t('index.target_languages')}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {['zh', 'es', 'fr', 'de', 'ja', 'ko'].map((lang) => (
                              <label
                                key={lang}
                                className="flex items-center gap-2 bg-background px-2 py-1.5 rounded-xl border border-border cursor-pointer hover:border-primary/50 transition-colors shadow-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={transLangs.includes(lang)}
                                  onChange={(e) => {
                                    if (e.target.checked) setTransLangs([...transLangs, lang]);
                                    else setTransLangs(transLangs.filter((l) => l !== lang));
                                  }}
                                  className="accent-primary w-4 h-4 rounded-xl border-primary"
                                />
                                <span className="text-xs font-bold uppercase">{lang}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-xs font-bold text-muted-foreground uppercase px-1">
                            {t('index.modules_label')}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {[
                              'name',
                              'description',
                              'content',
                              'prompt_templates',
                              'use_cases',
                              'faq',
                            ].map((mod) => (
                              <label
                                key={mod}
                                className="flex items-center gap-2 bg-background px-2 py-1.5 rounded-xl border border-border cursor-pointer hover:border-primary/50 transition-colors shadow-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={transModules.includes(mod)}
                                  onChange={(e) => {
                                    if (e.target.checked) setTransModules([...transModules, mod]);
                                    else setTransModules(transModules.filter((m) => m !== mod));
                                  }}
                                  className="accent-primary w-4 h-4 rounded-xl border-primary"
                                />
                                <span className="text-xs font-bold uppercase">
                                  {t(`translate.${mod}`)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={handleEnqueueTranslation}
                          disabled={transLangs.length === 0 || transModules.length === 0}
                          className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95"
                        >
                          <Play size={14} /> {t('index.enqueue_btn')}
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                        {transJobs.map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between bg-card p-3 rounded-xl border border-border shadow-sm"
                          >
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-foreground">
                                {job.target_lang}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(job.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <div
                              className={cn(
                                'px-2 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider',
                                job.status === 'completed'
                                  ? 'bg-green-500/10 text-green-600'
                                  : job.status === 'failed'
                                    ? 'bg-destructive/10 text-destructive'
                                    : 'bg-blue-500/10 text-blue-600',
                              )}
                            >
                              {job.status}
                            </div>
                          </div>
                        ))}
                        {transJobs.length === 0 && (
                          <div className="text-center py-4 text-xs text-muted-foreground italic">
                            {t('index.no_recent_jobs')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-8">
            <div className="sticky top-24 space-y-8">
              <section>
                <h2 className="text-lg font-semibold tracking-tight mb-4 text-foreground">
                  {t('index.official_sync')}
                </h2>

                <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={handleSyncAllOfficial}
                      disabled={syncing}
                      className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      {syncing ? (
                        <RefreshCcw size={14} className="animate-spin" />
                      ) : (
                        <Zap size={14} />
                      )}
                      {t('index.sync_all')}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => triggerSync('anthropics', 'skills')}
                      disabled={syncing}
                      className="w-full bg-secondary/50 border border-border text-foreground py-2.5 rounded-lg text-xs font-medium hover:bg-secondary hover:border-border/80 disabled:opacity-50 transition-all flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <Github size={14} className="text-muted-foreground" /> Anthropic
                        <RepoStatusIndicator owner="anthropics" repo="skills" />
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </button>

                    <button
                      onClick={() => triggerSync('ComposioHQ', 'awesome-claude-skills')}
                      disabled={syncing}
                      className="w-full bg-secondary/50 border border-border text-foreground py-2.5 rounded-lg text-xs font-medium hover:bg-secondary hover:border-border/80 disabled:opacity-50 transition-all flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <Github size={14} className="text-muted-foreground" /> Composio
                        <RepoStatusIndicator owner="ComposioHQ" repo="awesome-claude-skills" />
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </button>

                    <button
                      onClick={() => triggerSync('aiskillstore', 'marketplace')}
                      disabled={syncing}
                      className="w-full bg-secondary/50 border border-border text-foreground py-2.5 rounded-lg text-xs font-medium hover:bg-secondary hover:border-border/80 disabled:opacity-50 transition-all flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <Globe size={14} className="text-muted-foreground" /> Aiskillstore
                        <RepoStatusIndicator owner="aiskillstore" repo="marketplace" />
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold tracking-tight mb-4 text-foreground">
                  {t('index.synchronize')}
                </h2>

                <div className="space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <LinkIcon size={14} className="text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {t('index.via_protocol')}
                      </span>
                    </div>
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Import from <span className="text-foreground font-medium">skills.sh</span>{' '}
                        by providing a valid registry URL.
                      </p>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleSyncAllSkillsSh}
                          disabled={syncing}
                          className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-3 rounded-lg text-xs font-bold uppercase tracking-widest hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                        >
                          {syncing ? (
                            <RefreshCcw size={14} className="animate-spin" />
                          ) : (
                            <Globe size={14} />
                          )}
                          Sync Entire Catalog
                        </button>
                        <div className="flex flex-wrap gap-2">
                          {[
                            {
                              label: 'Anthropic Skills',
                              url: 'https://skills.sh/anthropics/skills',
                            },
                            {
                              label: 'Marketplace',
                              url: 'https://skills.sh/aiskillstore/marketplace',
                            },
                          ].map((item) => (
                            <button
                              key={item.url}
                              type="button"
                              onClick={() => handleSyncSkillsSh(item.url)}
                              disabled={syncing}
                              className="px-3 py-1.5 rounded-md bg-secondary border border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all flex items-center gap-2"
                            >
                              <Zap size={12} className="opacity-70" />
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative group">
                          <input
                            type="text"
                            value={skillsShUrl}
                            onChange={(event) => setSkillsShUrl(event.target.value)}
                            placeholder="Or enter custom URL..."
                            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleSyncSkillsSh()}
                            disabled={syncing || !skillsShUrl}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary disabled:opacity-0 transition-all"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Github size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {t('index.via_source')}
                      </span>
                    </div>
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Import from <span className="text-foreground font-medium">GitHub</span>{' '}
                        using owner and repository path.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={gitOwner}
                          onChange={(event) => setGitOwner(event.target.value)}
                          placeholder="Owner"
                          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                        <input
                          type="text"
                          value={gitRepo}
                          onChange={(event) => setGitRepo(event.target.value)}
                          placeholder="Repo"
                          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                      </div>
                      <input
                        type="text"
                        value={gitRef}
                        onChange={(event) => setGitRef(event.target.value)}
                        placeholder="Ref (branch/tag)"
                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                      />
                      <button
                        onClick={handleSyncGitHubForm}
                        disabled={syncing || !gitOwner || !gitRepo}
                        className="w-full bg-secondary text-secondary-foreground py-3 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-secondary/80 disabled:opacity-50 transition-all flex items-center justify-center gap-2 border border-border"
                      >
                        {syncing ? (
                          <RefreshCcw size={12} className="animate-spin" />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                        {t('index.fetch_repo')}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-12 bg-card/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            {t('nav.logo')} Protocol v2.0
          </p>
          <div className="flex gap-8">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Clock size={12} />
              Last Sync: {status?.meta?.updated_at ? new Date().toLocaleString() : 'Never'}
            </span>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {showSyncPanel && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            style={{ height: panelHeight }}
            className="fixed bottom-0 left-0 right-0 bg-background z-[100] border-t border-border shadow-2xl flex flex-col"
          >
            <div
              className="h-1.5 w-full cursor-ns-resize hover:bg-primary/50 transition-colors flex items-center justify-center group"
              onMouseDown={(e) => {
                const startY = e.clientY;
                const startHeight = panelHeight;
                const onMouseMove = (moveEvent: MouseEvent) => {
                  const delta = startY - moveEvent.clientY;
                  setPanelHeight(
                    Math.max(100, Math.min(window.innerHeight - 100, startHeight + delta)),
                  );
                };
                const onMouseUp = () => {
                  window.removeEventListener('mousemove', onMouseMove);
                  window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
              }}
            >
              <div className="w-12 h-1 bg-border rounded-full group-hover:bg-primary/50" />
            </div>

            <div className="flex-1 flex flex-col overflow-hidden px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-2.5 h-2.5 rounded-full',
                        syncStatus === 'running'
                          ? 'bg-blue-500 animate-pulse'
                          : syncStatus === 'completed'
                            ? 'bg-green-500'
                            : 'bg-destructive',
                      )}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t('index.sync_engine_output')}
                    </span>
                  </div>
                  {syncProgress && (
                    <div className="hidden md:flex items-center gap-3 bg-secondary px-3 py-1 rounded-full border border-border">
                      <span className="text-[10px] font-mono opacity-50 uppercase">Progress</span>
                      <div className="w-24 h-1 bg-border rounded-full overflow-hidden">
                        <motion.div
                          animate={{
                            width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                          }}
                          className="h-full bg-primary"
                        />
                      </div>
                      <span className="text-[10px] font-mono">
                        {syncProgress.current}/{syncProgress.total}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyLogs}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    title="Copy Logs"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={handleClearLogs}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    title="Clear Logs"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => setShowSyncPanel(false)}
                    className="ml-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    {t('index.close')}
                  </button>
                </div>
              </div>

              <div className="flex-1 font-mono text-[11px] leading-relaxed overflow-y-auto space-y-1.5 custom-scrollbar bg-zinc-950 text-zinc-100 rounded-xl p-6 border border-zinc-800 select-text">
                {syncSummary && (
                  <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-3 font-bold">
                      后台任务总览（本次同步新增）
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wider">翻译队列</div>
                        <div className="text-lg font-bold text-cyan-300">+{syncSummary.translationQueuedAdded}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wider">待审计</div>
                        <div className="text-lg font-bold text-amber-300">+{syncSummary.auditPendingAdded}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wider">待向量化</div>
                        <div className="text-lg font-bold text-violet-300">+{syncSummary.vectorizationPendingAdded}</div>
                      </div>
                    </div>
                  </div>
                )}

                {syncLogs.length === 0 && (
                  <div className="h-full flex items-center justify-center text-zinc-600 uppercase tracking-[0.3em] font-black italic">
                    {t('index.waiting_for_output')}
                  </div>
                )}
                {syncLogs.map((log, i) => (
                  <div key={i} className="flex gap-4 group">
                    <span className="opacity-40 shrink-0 font-mono text-zinc-500">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 w-16 font-bold uppercase tracking-tighter',
                        log.source === 'stderr'
                          ? 'text-red-400'
                          : log.source === 'system'
                            ? 'text-blue-400'
                            : 'text-zinc-500',
                      )}
                    >
                      [{log.source}]
                    </span>
                    <span className="break-all text-zinc-300 group-hover:text-white transition-colors">
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
                {syncing && (
                  <div className="flex gap-2 items-center text-zinc-500 animate-pulse ml-20">
                    <span className="w-1 h-3 bg-current" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {logProcessName && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl h-[70vh] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">
                      {t('dashboard.processes.logs_title', { name: logProcessName })}
                    </h3>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                      {t('dashboard.processes.running')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchLogs(logProcessName)}
                    disabled={logsLoading}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                    title={t('dashboard.processes.refresh_logs')}
                  >
                    <RefreshCcw className={cn('w-4 h-4', logsLoading && 'animate-spin')} />
                  </button>
                  <button
                    onClick={() => handleClearProcessLogs(logProcessName)}
                    className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                    title={t('dashboard.processes.clear_logs')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setLogProcessName(null)}
                    className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-6 bg-[#0d1117]">
                <pre className="h-full overflow-y-auto font-mono text-xs leading-relaxed text-blue-100/90 whitespace-pre-wrap custom-scrollbar">
                  {processLogs ||
                    (logsLoading ? t('detail.loading') : t('dashboard.processes.no_logs'))}
                </pre>
              </div>
              <div className="p-4 border-t border-border bg-secondary/30 flex justify-end">
                <button
                  onClick={() => setLogProcessName(null)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  {t('index.close')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
