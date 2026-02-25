'use client';

import {
  useEffect,
  useState,
  use,
  useRef,
  useCallback,
  ComponentPropsWithoutRef,
  useMemo,
  Fragment,
} from 'react';
import Link from 'next/link';
import { api, Skill, TranslationJob, I18nItem, QualityData, AuditReport } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Globe,
  Copy,
  Check,
  FileText,
  Download,
  AlertTriangle,
  Terminal,
  X,
  ExternalLink,
  Zap,
  Activity,
  Box,
  Users,
  FileCode,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  Code,
  BookOpen,
  Loader2,
  ShieldAlert,
  CloudOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, ghcolors } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import FileTree from '@/components/skills/FileTree';
import { Navbar } from '@/components/layout/Navbar';

export default function SkillDetailPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { language, t } = useLanguage();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const syntaxStyle = useMemo(() => (theme === 'dark' ? vscDarkPlus : ghcolors), [theme]);
  const router = useRouter();
  const resolvedParams = use(params);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [contentMode, setContentMode] = useState<'auto' | 'en' | 'zh'>('auto');
  const [activeTab, setActiveTab] = useState<'docs' | 'source' | 'scenarios' | 'quality'>('docs');
  type TabId = 'docs' | 'source' | 'scenarios' | 'quality';
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['zh']);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    'name',
    'description',
    'content',
    'use_cases',
    'prompt_templates',
    'best_practices',
    'avoid',
    'faq',
  ]);
  const [enqueuing, setEnqueuing] = useState(false);
  const [auditReports, setAuditReports] = useState<AuditReport[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [expandedAuditCheck, setExpandedAuditCheck] = useState<string | null>(null);
  const [sortByRisk, setSortByRisk] = useState(false);
  const [highRiskOnly, setHighRiskOnly] = useState(false);

  // File Explorer State
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loadingFileContent, setLoadingFileContent] = useState(false);

  const [, setTranslationJobs] = useState<TranslationJob[]>([]);
  const hasActiveJobsRef = useRef(false);

  const fetchSkill = useCallback(async () => {
    try {
      const decodedId = decodeURIComponent(resolvedParams.skillId);
      const [skillData, reports] = await Promise.all([
        api.getSkill(decodedId),
        api.getAuditReports(decodedId),
      ]);
      setSkill(skillData);
      setAuditReports(reports);
    } catch (err) {
      console.error(err);
      setError(t('detail.error_loading'));
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.skillId, t]);

  const handleFileClick = async (filePath: string) => {
    if (!skill) return;
    setLoadingFileContent(true);
    try {
      const data = await api.getSkillFile(skill.id, filePath);
      setFileContent(data.content || data);
      setSelectedFile(filePath);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFileContent(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/auth/login');
      return;
    }
    if (!isAuthenticated) return;
    fetchSkill();
  }, [authLoading, isAuthenticated, router, fetchSkill]);

  useEffect(() => {
    if (!skill?.id) return;
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const pollJobs = async () => {
      if (!isMounted) return;
      try {
        const result = await api.listTranslationJobs(skill.id);
        const jobs = Array.isArray(result) ? (result as TranslationJob[]) : [];
        if (isMounted) setTranslationJobs(jobs);

        const hasActive = jobs.some((j: TranslationJob) =>
          ['queued', 'processing'].includes(j.status),
        );
        hasActiveJobsRef.current = hasActive;

        if (hasActive) {
          timeoutId = setTimeout(pollJobs, 5000);
        }
      } catch (err) {
        console.error('Error fetching translation jobs:', err);
      }
    };

    pollJobs();
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [skill?.id]);

  const handleCopy = () => {
    if (skill?.snippet) {
      navigator.clipboard.writeText(skill.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!skill) return;
    setDownloading(true);
    try {
      await api.downloadSkill(skill.id, skill.name);
      showToast(t('detail.download_success'), 'success');
    } catch (err) {
      console.error(err);
      showToast(t('detail.error_downloading'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleTranslate = async () => {
    if (!skill) return;
    setEnqueuing(true);
    try {
      await api.enqueueTranslation(skill.id, {
        target_langs: selectedLangs,
        modules: selectedModules,
      });
      setShowTranslateModal(false);
      showToast(t('detail.translation_enqueued'), 'success');
    } catch (err) {
      console.error(err);
      showToast(t('detail.translation_failed'), 'error');
    } finally {
      setEnqueuing(false);
    }
  };

  const handleTriggerAudit = async () => {
    if (!skill) return;
    setAuditing(true);
    try {
      await api.triggerSecurityAudit(skill.id);
      showToast(t('detail.audit_triggered'), 'success');
      // Wait a bit and refresh reports
      setTimeout(async () => {
        const reports = await api.getAuditReports(skill.id);
        setAuditReports(reports);
      }, 5000);
    } catch (err) {
      console.error(err);
      showToast(t('detail.audit_failed'), 'error');
    } finally {
      setAuditing(false);
    }
  };

  const getActiveLanguage = () => {
    if (contentMode !== 'auto') return contentMode;
    return language;
  };

  const activeLang = getActiveLanguage();
  const displayName = activeLang === 'zh' && skill?.name_zh ? skill.name_zh : (skill?.name ?? '');
  const displayDescription =
    activeLang === 'zh' && skill?.description_zh
      ? skill.description_zh
      : (skill?.description ?? '');

  const getI18nValue = (value: unknown): I18nItem[] | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, I18nItem[] | null>;
    return record[activeLang] || record.en || record.zh || null;
  };

  const useCases = getI18nValue(skill?.use_cases);
  const promptTemplates = getI18nValue(skill?.prompt_templates);
  const bestPractices = getI18nValue(skill?.best_practices);
  const avoidItems = getI18nValue(skill?.avoid);

  const getQualityData = (): QualityData | null => {
    if (!skill?.quality_data) return null;
    if (typeof skill.quality_data === 'string') {
      try {
        return JSON.parse(skill.quality_data) as QualityData;
      } catch {
        return null;
      }
    }
    return skill.quality_data as QualityData;
  };

  const qualityData = getQualityData();
  const latestAudit = auditReports[0];
  const displayScore = skill?.quality_score && skill.quality_score > 0
    ? skill.quality_score
    : (latestAudit?.score ?? 0);

  type ParsedAuditLine =
    | { type: 'item'; title: string; content: string }
    | { type: 'heading'; content: string }
    | { type: 'text'; content: string };

  const normalizeInlineMarkdown = (text: string): string =>
    text
      .replace(/\*{1,2}(.*?)\*{1,2}/g, '$1')
      .replace(/[_]{1,2}(.*?)[_]{1,2}/g, '$1')
      .replace(/[*_]/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .trim();

  const stripMarkdownLinePrefix = (line: string): string =>
    line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^>\s+/, '')
      .trim();

  const parseAuditReport = useCallback((report: string): ParsedAuditLine[] => {
    if (!report) return [];
    
    return report
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((rawLine) => {
        // Handle markdown headings (e.g., ## Overview)
        const headingMatch = rawLine.match(/^#{1,6}\s+(.+)$/);
        if (headingMatch) {
          return { type: 'heading', content: normalizeInlineMarkdown(headingMatch[1]) };
        }

        const line = stripMarkdownLinePrefix(rawLine);

        // KV Pattern: Can be **Bold Key**: Value OR Plain Key: Value
        // Match up to the first colon, ensuring the key is not too long
        const kvMatch = line.match(/^(\*\*.*?\*\*|[^:：]{2,40})[:：]\s*(.*)$/);
        if (kvMatch) {
          const key = normalizeInlineMarkdown(kvMatch[1].replace(/^\*\*|\*\*$/g, '').trim()).replace(/[:：]$/, '');
          const content = kvMatch[2].trim();
          
          if (content || key.toLowerCase().includes('risk level')) {
             return {
               type: 'item' as const,
               title: key,
               content: normalizeInlineMarkdown(content || 'N/A')
             };
          }
        }

        // Heuristic: If it starts with a number (e.g., 1. Section) and is relatively short, it's a heading
        const sectionMatch = rawLine.match(/^(\d+\.\s+)(.+)$/);
        if (sectionMatch && sectionMatch[2].length < 60) {
           return { type: 'heading', content: normalizeInlineMarkdown(sectionMatch[2]) };
        }

        // Short lines without spaces or common section titles
        if (line.length < 40 && !line.includes(' ')) {
           return { type: 'heading', content: normalizeInlineMarkdown(line) };
        }

        return {
          type: 'text' as const,
          content: normalizeInlineMarkdown(line),
        };
      });
  }, []);

  const parsedAuditLines = useMemo(() => {
    return latestAudit?.report ? parseAuditReport(latestAudit.report) : [];
  }, [latestAudit?.report, parseAuditReport]);

  type RiskBucket = 'high' | 'medium' | 'low' | 'none' | 'unknown';
  type StructuredAuditCheck = {
    id: string;
    title: string;
    finding: string;
    riskLevel: string;
    scoreImpact: string;
    details: string[];
    riskBucket: RiskBucket;
  };

  const resolveRiskBucket = (riskText: string): RiskBucket => {
    const normalized = riskText.toLowerCase();
    if (
      normalized.includes('critical') ||
      normalized.includes('high') ||
      normalized.includes('严重') ||
      normalized.includes('高')
    ) {
      return 'high';
    }
    if (
      normalized.includes('medium') ||
      normalized.includes('moderate') ||
      normalized.includes('中')
    ) {
      return 'medium';
    }
    if (normalized.includes('low') || normalized.includes('低')) {
      return 'low';
    }
    if (normalized.includes('none') || normalized.includes('无') || normalized.includes('n/a')) {
      return 'none';
    }
    return 'unknown';
  };

  const structuredAuditChecks = useMemo<StructuredAuditCheck[]>(() => {
    if (!parsedAuditLines.length) return [];

    const checks: StructuredAuditCheck[] = [];
    let current: Omit<StructuredAuditCheck, 'id' | 'riskBucket'> = {
      title: t('detail.audit_check_default_title'),
      finding: '',
      riskLevel: '',
      scoreImpact: '',
      details: [],
    };

    const pushCurrent = () => {
      const titleLower = current.title.toLowerCase();
      const isNoiseHeader =
        titleLower.includes('检测项') ||
        titleLower.includes('check item') ||
        titleLower.includes('overview') ||
        titleLower.includes('summary') ||
        titleLower.includes('结论') ||
        titleLower.includes('conclusion');

      const hasSubstance =
        !!current.finding ||
        (current.details.length > 0 && current.details.some((d) => d.trim().length > 0));

      // Skip noise headers with no content
      if (isNoiseHeader && !hasSubstance) return;
      if (!hasSubstance && !current.riskLevel) return;

      checks.push({
        id: `${checks.length}-${current.title}`,
        title: current.title,
        finding: current.finding,
        riskLevel: current.riskLevel || t('detail.audit_risk_unknown'),
        scoreImpact: current.scoreImpact || '--',
        details: current.details,
        riskBucket: resolveRiskBucket(current.riskLevel),
      });
    };

    parsedAuditLines.forEach((line) => {
      if (line.type === 'heading') {
        pushCurrent();
        current = {
          title: line.content,
          finding: '',
          riskLevel: '',
          scoreImpact: '',
          details: [],
        };
        return;
      }

      if (line.type === 'item') {
        const key = line.title.toLowerCase();
        if (key.includes('finding') || key.includes('结论') || key.includes('发现')) {
          current.finding = line.content;
          return;
        }
        if (key.includes('risk') || key.includes('风险')) {
          current.riskLevel = line.content;
          return;
        }
        if (key.includes('score') || key.includes('impact') || key.includes('评分') || key.includes('影响')) {
          current.scoreImpact = line.content;
          return;
        }
        current.details.push(`${line.title}: ${line.content}`);
        return;
      }

      if (line.type === 'text') {
        current.details.push(line.content);
      }
    });

    pushCurrent();
    return checks;
  }, [parsedAuditLines, t]);

  const auditSummary = useMemo(() => {
    const total = structuredAuditChecks.length;
    const high = structuredAuditChecks.filter((item) => item.riskBucket === 'high').length;
    const medium = structuredAuditChecks.filter((item) => item.riskBucket === 'medium').length;
    const lowOrNone = structuredAuditChecks.filter(
      (item) => item.riskBucket === 'low' || item.riskBucket === 'none',
    ).length;

    return {
      total,
      high,
      medium,
      lowOrNone,
    };
  }, [structuredAuditChecks]);

  const displayedAuditChecks = useMemo(() => {
    const riskPriority: Record<RiskBucket, number> = {
      high: 5,
      medium: 4,
      low: 3,
      none: 2,
      unknown: 1,
    };

    let list = structuredAuditChecks;

    if (highRiskOnly) {
      list = list.filter((item) => item.riskBucket === 'high');
    }

    if (sortByRisk) {
      list = [...list].sort((a, b) => riskPriority[b.riskBucket] - riskPriority[a.riskBucket]);
    }

    return list;
  }, [structuredAuditChecks, highRiskOnly, sortByRisk]);

  const riskBadgeClass: Record<RiskBucket, string> = {
    high: 'bg-destructive/10 text-destructive border-destructive/20',
    medium: 'bg-secondary text-secondary-foreground border-border',
    low: 'bg-primary/10 text-primary border-primary/20',
    none: 'bg-muted text-muted-foreground border-border',
    unknown: 'bg-muted text-muted-foreground border-border',
  };

  const getRiskStatusIcon = (bucket: RiskBucket) => {
    if (bucket === 'high') return <X size={14} className="text-destructive" />;
    if (bucket === 'medium') return <AlertTriangle size={14} className="text-foreground" />;
    if (bucket === 'low' || bucket === 'none') return <Check size={14} className="text-primary" />;
    return <AlertTriangle size={14} className="text-muted-foreground" />;
  };

  const hasStructuredAuditItems = useMemo(() => {
    return structuredAuditChecks.length > 0;
  }, [structuredAuditChecks]);

  const qualityCategories = [
    {
      id: 'architecture',
      label: t('security.dimensions.architecture'),
      icon: <Box size={14} />,
      score: (qualityData?.dimensions?.architecture ?? 0) || (latestAudit?.score && latestAudit.score > 0 ? Math.floor(latestAudit.score * 0.9) : 0),
    },
    {
      id: 'maintainability',
      label: t('security.dimensions.maintainability'),
      icon: <FileCode size={14} />,
      score: (qualityData?.dimensions?.maintainability ?? 0) || (latestAudit?.score && latestAudit.score > 0 ? Math.floor(latestAudit.score * 0.85) : 0),
    },
    {
      id: 'content',
      label: t('security.dimensions.content'),
      icon: <FileText size={14} />,
      score: (qualityData?.dimensions?.content ?? 0) || (latestAudit?.score && latestAudit.score > 0 ? latestAudit.score : 0),
    },
    {
      id: 'community',
      label: t('security.dimensions.community'),
      icon: <Users size={14} />,
      score: qualityData?.dimensions?.community ?? 0,
    },
    {
      id: 'security',
      label: t('security.dimensions.security'),
      icon: <ShieldCheck size={14} />,
      score: (qualityData?.dimensions?.security ?? 0) || (latestAudit?.score ?? 0),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin rounded-full mb-4" />
        <p className="text-sm text-muted-foreground font-medium animate-pulse">
          {t('detail.loading')}
        </p>
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('detail.error_loading')}</h1>
        <p className="text-muted-foreground mb-8 text-center max-w-md">
          {error || t('detail.not_found_desc')}
        </p>
        <Link
          href="/skills"
          className="px-6 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium rounded-lg text-sm"
        >
          {t('detail.return')}
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'docs', label: t('detail.tabs.docs'), icon: <BookOpen size={16} /> },
    { id: 'source', label: t('detail.tabs.source'), icon: <Code size={16} /> },
    { id: 'scenarios', label: t('detail.tabs.scenarios'), icon: <Zap size={16} /> },
    { id: 'quality', label: t('detail.tabs.quality'), icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Breadcrumbs */}
      <Navbar>
        <div className="flex items-center">
          <Link
            href="/skills"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            {t('detail.back_home')}
          </Link>
          <span className="mx-2 text-muted-foreground/30">/</span>
          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {displayName}
          </span>
        </div>
      </Navbar>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Header Card */}
            <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20 uppercase tracking-wide">
                    v1.0.0
                  </span>
                  <span className="bg-muted text-muted-foreground text-xs font-medium px-2.5 py-1 rounded-full border border-border">
                    {skill.source}
                  </span>
                  {skill.updated_at && (
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs ml-auto">
                      <Clock size={12} />
                      {new Date(skill.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground break-words">
                  {displayName}
                </h1>

                <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                  {displayDescription}
                </p>
              </div>

              {/* Decorative background element */}
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            </div>

            {/* Tabs Navigation */}
            <div id="tabs-section" className="border-b border-border flex gap-1 overflow-x-auto pb-px custom-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabId)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              <AnimatePresence mode="wait">
                {activeTab === 'docs' && (
                  <motion.div
                    key="docs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {skill.content || skill.content_zh ? (
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6 md:p-8">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                          <h2 className="text-lg font-bold flex items-center gap-2">
                            <FileText className="text-primary" size={20} />{' '}
                            {t('detail.documentation')}
                          </h2>
                          <div className="flex gap-2">
                          <button
                            onClick={() => setContentMode('auto')}
                            className={cn(
                              'px-3 py-1.5 text-[10px] font-bold uppercase rounded-xl transition-all border focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm',
                              contentMode === 'auto'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50',
                            )}
                          >
                            Auto
                          </button>
                          <button
                            onClick={() => setContentMode('en')}
                            disabled={!skill.content}
                            className={cn(
                              'px-3 py-1.5 text-[10px] font-bold uppercase rounded-xl transition-all border focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm disabled:opacity-30',
                              contentMode === 'en'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50',
                            )}
                          >
                            EN
                          </button>
                          <button
                            onClick={() => setContentMode('zh')}
                            disabled={!skill.content_zh}
                            className={cn(
                              'px-3 py-1.5 text-[10px] font-bold uppercase rounded-xl transition-all border focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm disabled:opacity-30',
                              contentMode === 'zh'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50',
                            )}
                          >
                            ZH
                          </button>
                        </div>
                        </div>
                        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded-lg prose-code:before:content-[''] prose-code:after:content-['']">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({
                                inline,
                                className,
                                children,
                                ...props
                              }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
                                const match = /language-(\w+)/.exec(className || '');
                                if (!inline && match) {
                                  return (
                                    <div className="border border-border rounded-lg overflow-hidden my-6">
                                      <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground border-b border-border flex justify-between">
                                        <span>{match[1]}</span>
                                      </div>
                                      <SyntaxHighlighter
                                        style={syntaxStyle as any}
                                        language={match[1]}
                                        PreTag="div"
                                        showLineNumbers={true}
                                        lineNumberStyle={{
                                          minWidth: '2.5em',
                                          paddingRight: '1em',
                                          color: 'rgba(128, 128, 128, 0.5)',
                                          textAlign: 'right',
                                          userSelect: 'none',
                                        }}
                                        customStyle={{
                                          margin: 0,
                                          background: 'transparent',
                                          fontSize: '13px',
                                          lineHeight: '1.6',
                                        }}
                                        {...props}
                                      >
                                        {String(children).replace(/\n$/, '')}
                                      </SyntaxHighlighter>
                                    </div>
                                  );
                                }
                                return (
                                  <code
                                    className="bg-muted text-foreground px-1 py-0.5 rounded-lg text-sm font-mono"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {contentMode === 'zh'
                              ? skill.content_zh || skill.content || ''
                              : contentMode === 'en'
                                ? skill.content || skill.content_zh || ''
                                : activeLang === 'zh'
                                  ? skill.content_zh || skill.content || ''
                                  : skill.content || skill.content_zh || ''}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <FileText size={48} className="mb-4 opacity-20" />
                        <p>{t('detail.no_description')}</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'source' && (
                  <motion.div
                    key="source"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="h-[650px] bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                      <div className="flex items-center gap-2 text-sm overflow-hidden">
                        <span className="font-semibold text-foreground shrink-0">
                          {t('detail.files')}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <div className="flex items-center gap-1 overflow-hidden">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-lg border border-border shrink-0">
                            {skill.id}
                          </span>
                          {selectedFile &&
                            selectedFile.split('/').map((part, i, arr) => (
                              <div key={i} className="flex items-center gap-1 shrink-0">
                                <span className="text-muted-foreground">/</span>
                                <span
                                  className={cn(
                                    'font-mono text-[10px] truncate max-w-[150px]',
                                    i === arr.length - 1 ? 'text-primary' : 'text-muted-foreground',
                                  )}
                                >
                                  {part}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 flex overflow-hidden">
                        {!skill.file_exists ? (
                          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground/60">
                            <CloudOff size={32} className="mb-4 opacity-10" />
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/70">
                              {t('detail.missing_source_title')}
                            </h3>
                            <p className="text-[10px] leading-relaxed max-w-[180px]">
                              {t('detail.missing_source_desc')}
                            </p>
                          </div>
                        ) : (
                          <div className="w-72 shrink-0 border-r border-border overflow-y-auto h-full">
                            <FileTree
                              skillId={skill.id}
                              onFileSelect={handleFileClick}
                              selectedFile={selectedFile}
                            />
                          </div>
                        )}
                      <div className="flex-1 min-w-0 bg-muted/20 dark:bg-black overflow-hidden flex flex-col relative">
                        {loadingFileContent ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 backdrop-blur-sm">
                            <div className="flex flex-col items-center">
                              <div className="w-6 h-6 border-2 border-primary border-t-transparent animate-spin rounded-full mb-2" />
                              <span className="text-xs text-muted-foreground">
                                {t('detail.fetching_content')}
                              </span>
                            </div>
                          </div>
                        ) : selectedFile && fileContent ? (
                          <>
                            <div className="p-2 border-b border-border text-xs font-mono text-muted-foreground bg-muted/50 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileCode size={12} className="text-primary" />
                                {selectedFile}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(fileContent);
                                }}
                                className="hover:text-primary transition-colors p-1 rounded-lg"
                                title="Copy content"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                              <SyntaxHighlighter
                                style={syntaxStyle as any}
                                language={selectedFile.split('.').pop() || 'text'}
                                showLineNumbers={true}
                                lineNumberStyle={{
                                  minWidth: '2.5em',
                                  paddingRight: '1em',
                                  color: 'rgba(128, 128, 128, 0.5)',
                                  textAlign: 'right',
                                  userSelect: 'none',
                                }}
                                customStyle={{
                                  margin: 0,
                                  padding: 0,
                                  background: 'transparent',
                                  fontSize: '13px',
                                  lineHeight: '1.6',
                                }}
                              >
                                {fileContent}
                              </SyntaxHighlighter>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50 p-8 text-center">
                            <Code size={48} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium mb-1">
                              {t('detail.select_file_desc')}
                            </p>
                            <p className="text-xs max-w-[200px]">
                              Browse the file tree on the left to view skill source code and
                              manifests.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'scenarios' && (
                  <motion.div
                    key="scenarios"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-8"
                  >
                    {useCases && useCases.length > 0 && (
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={18} className="text-primary" />
                          <h2 className="text-lg font-semibold tracking-tight">
                            {t('detail.operational_scenarios')}
                          </h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {useCases.map((item, i) => (
                            <div
                              key={i}
                              className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all group"
                            >
                              <h3 className="font-semibold text-foreground mb-2 text-sm flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 group-hover:bg-primary transition-colors"></span>
                                {item.title}
                              </h3>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {item.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {promptTemplates && promptTemplates.length > 0 && (
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Terminal size={18} className="text-primary" />
                          <h2 className="text-lg font-semibold tracking-tight">
                            {t('detail.prompt_templates')}
                          </h2>
                        </div>
                        <div className="space-y-4">
                          {promptTemplates.map((item, i) => (
                            <div
                              key={i}
                              className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
                            >
                              <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
                                <span className="font-medium text-xs text-muted-foreground">
                                  {item.title}
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(String(item.prompt));
                                  }}
                                  className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors px-2 py-1 hover:bg-primary/10 rounded-lg"
                                >
                                  <Copy size={12} /> {t('detail.copy')}
                                </button>
                              </div>
                              <div className="p-0 bg-muted/20 dark:bg-black">
                                <SyntaxHighlighter
                                  language="text"
                                  style={syntaxStyle as any}
                                  showLineNumbers={true}
                                  lineNumberStyle={{
                                    minWidth: '2.5em',
                                    paddingRight: '1em',
                                    color: 'rgba(128, 128, 128, 0.5)',
                                    textAlign: 'right',
                                    userSelect: 'none',
                                  }}
                                  customStyle={{
                                    margin: 0,
                                    padding: '1rem',
                                    background: 'transparent',
                                    fontSize: '13px',
                                    lineHeight: '1.6',
                                  }}
                                >
                                  {String(item.prompt)}
                                </SyntaxHighlighter>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {((bestPractices && bestPractices.length > 0) ||
                      (avoidItems && avoidItems.length > 0)) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                        {bestPractices && (
                          <div className="bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-6 rounded-xl">
                            <h3 className="text-green-700 dark:text-green-400 font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                              <ThumbsUp size={14} /> {t('detail.recommended')}
                            </h3>
                            <ul className="space-y-3">
                              {bestPractices.map((item, i) => (
                                <li
                                  key={i}
                                  className="flex gap-3 text-sm text-green-800/80 dark:text-green-300/80"
                                >
                                  <Check
                                    size={16}
                                    className="text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                                  />
                                  <span>
                                    <strong className="text-green-700 dark:text-green-300">
                                      {item.title}:
                                    </strong>{' '}
                                    {String(item.body)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {avoidItems && (
                          <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-6 rounded-xl">
                            <h3 className="text-red-700 dark:text-red-400 font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                              <ThumbsDown size={14} /> {t('detail.restricted')}
                            </h3>
                            <ul className="space-y-3">
                              {avoidItems.map((item, i) => (
                                <li
                                  key={i}
                                  className="flex gap-3 text-sm text-red-800/80 dark:text-red-300/80"
                                >
                                  <X
                                    size={16}
                                    className="text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                                  />
                                  <span>
                                    <strong className="text-red-700 dark:text-red-300">
                                      {item.title}:
                                    </strong>{' '}
                                    {String(item.body)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'quality' && (
                  <motion.div
                    key="quality"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    {/* Heuristic Quality Score (Original) */}
                    {displayScore > 0 && (
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6 md:p-8 space-y-8">
                        <div className="flex flex-col sm:flex-row items-center gap-6 pb-8 border-b border-border">
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'w-24 h-24 rounded-full flex items-center justify-center border-4 text-4xl font-bold',
                                displayScore >= 80
                                  ? 'border-green-500 text-green-500'
                                  : displayScore >= 60
                                    ? 'border-amber-500 text-amber-500'
                                    : 'border-red-500 text-red-500',
                              )}
                            >
                              {displayScore}
                            </div>
                            <span className="text-sm font-medium text-muted-foreground mt-2 uppercase tracking-wide">
                              {t('detail.total_score')}
                            </span>
                          </div>
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                            {qualityCategories.map((cat) => (
                              <div key={cat.id} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="flex items-center gap-2 text-muted-foreground">
                                    {cat.icon} {cat.label}
                                  </span>
                                  <span className="font-medium text-foreground">{cat.score}%</span>
                                </div>
                                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all duration-500',
                                      cat.score >= 80
                                        ? 'bg-green-500'
                                        : cat.score >= 50
                                          ? 'bg-amber-500'
                                          : 'bg-red-500',
                                    )}
                                    style={{ width: `${cat.score}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Audit log (Heuristic Checklist) */}
                        {qualityData?.checklist && (
                          <div>
                            <h3 className="font-semibold text-foreground mb-4">
                              {t('detail.audit_log')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                              {qualityData.checklist.map((item, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                                >
                                  {item.pass ? (
                                    <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                                      <Check
                                        size={12}
                                        className="text-green-600 dark:text-green-400"
                                      />
                                    </div>
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                                      <X size={12} className="text-red-600 dark:text-red-400" />
                                    </div>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {item.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {!qualityData?.checklist && latestAudit && (
                          <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
                            <p className="text-xs text-primary/80 font-medium italic">
                              {t('detail.using_audit_score_reason')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* LLM Security Audit Report (New) */}
                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                      <div className="bg-muted/30 px-6 py-4 border-b border-border flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={20} className="text-primary" />
                          <h2 className="text-lg font-bold">{t('detail.security_report')}</h2>
                        </div>
                        <button
                          onClick={handleTriggerAudit}
                          disabled={auditing}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50"
                        >
                          {auditing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Activity size={14} />
                          )}
                          {t('detail.re_audit')}
                        </button>
                      </div>

                      <div className="p-6 md:p-8">
                        {auditReports.length > 0 ? (
                          <div className="space-y-6">
                            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground pb-4 border-b border-border/50">
                              <div className="flex items-center gap-1.5">
                                <Activity size={14} className="text-primary" />
                                {t('detail.audit_status', { status: auditReports[0].status })}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock size={14} className="text-primary" />
                                {t('detail.audit_date', {
                                  date: new Date(auditReports[0].createdAt).toLocaleString(),
                                })}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Box size={14} className="text-primary" />
                                {auditReports[0].provider} / {auditReports[0].model}
                              </div>
                              <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 text-primary rounded border border-primary/20">
                                <ShieldCheck size={14} />
                                {t('security.score')}: {auditReports[0].score}/100
                              </div>
                            </div>

                            {hasStructuredAuditItems ? (
                              <div className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                                    <div className="text-xs text-muted-foreground font-medium">
                                      {t('detail.audit_total_checks')}
                                    </div>
                                    <div className="text-xl font-bold text-foreground mt-1">
                                      {auditSummary.total}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-border bg-destructive/5 px-4 py-3">
                                    <div className="text-xs text-muted-foreground font-medium">
                                      {t('detail.audit_high_risk')}
                                    </div>
                                    <div className="text-xl font-bold text-destructive mt-1">
                                      {auditSummary.high}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
                                    <div className="text-xs text-muted-foreground font-medium">
                                      {t('detail.audit_medium_risk')}
                                    </div>
                                    <div className="text-xl font-bold text-foreground mt-1">
                                      {auditSummary.medium}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-border bg-primary/5 px-4 py-3">
                                    <div className="text-xs text-muted-foreground font-medium">
                                      {t('detail.audit_low_or_none_risk')}
                                    </div>
                                    <div className="text-xl font-bold text-primary mt-1">
                                      {auditSummary.lowOrNone}
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-lg border border-border overflow-hidden">
                                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
                                    <div className="text-xs font-medium text-muted-foreground">
                                      {t('detail.audit_table_count', { count: displayedAuditChecks.length })}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setSortByRisk((prev) => !prev)}
                                        className={cn(
                                          'px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-tight transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20',
                                          sortByRisk
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                                        )}
                                      >
                                        {sortByRisk
                                          ? t('detail.audit_sort_risk_on')
                                          : t('detail.audit_sort_risk_off')}
                                      </button>
                                      <button
                                        onClick={() => setHighRiskOnly((prev) => !prev)}
                                        className={cn(
                                          'px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-tight transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20',
                                          highRiskOnly
                                            ? 'bg-destructive text-destructive-foreground border-destructive'
                                            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                                        )}
                                      >
                                        {highRiskOnly
                                          ? t('detail.audit_filter_high_on')
                                          : t('detail.audit_filter_high_off')}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                        <tr>
                                          <th className="px-4 py-3 text-left font-semibold">
                                            {t('detail.audit_table_item')}
                                          </th>
                                          <th className="px-4 py-3 text-left font-semibold">
                                            {t('detail.audit_table_risk')}
                                          </th>
                                          <th className="px-4 py-3 text-left font-semibold">
                                            {t('detail.audit_table_impact')}
                                          </th>
                                          <th className="px-4 py-3 text-right font-semibold">
                                            {t('detail.audit_table_status')}
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border bg-card">
                                        {displayedAuditChecks.map((check) => {
                                          const isExpanded = expandedAuditCheck === check.id;
                                          return (
                                            <Fragment key={check.id}>
                                              <tr className="hover:bg-muted/20 transition-colors cursor-pointer"
                                                onClick={() => setExpandedAuditCheck(isExpanded ? null : check.id)}
                                              >
                                                <td className="px-4 py-3 align-top">
                                                  <div className="flex items-center gap-2">
                                                    <ChevronRight 
                                                      size={14} 
                                                      className={cn("text-muted-foreground transition-transform", isExpanded && "rotate-90")} 
                                                    />
                                                    <span className="font-semibold text-foreground hover:text-primary transition-colors">
                                                      {check.title}
                                                    </span>
                                                  </div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                  <span
                                                    className={cn(
                                                      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                                                      riskBadgeClass[check.riskBucket],
                                                    )}
                                                  >
                                                    {check.riskLevel}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                  <span className="inline-flex rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                                                    {check.scoreImpact}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 align-top text-right">
                                                  <div className="flex justify-end">
                                                    {getRiskStatusIcon(check.riskBucket)}
                                                  </div>
                                                </td>
                                              </tr>

                                              {isExpanded && (
                                                <tr className="bg-muted/5">
                                                  <td colSpan={4} className="px-4 py-3">
                                                    <div className="rounded-lg border border-border/50 bg-muted/20 px-5 py-4 space-y-4 shadow-inner">
                                                      {check.finding && (
                                                        <div>
                                                          <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                            {t('detail.audit_finding')}
                                                          </div>
                                                          <div className="text-sm text-foreground leading-relaxed font-medium bg-background/50 p-3 rounded border border-border/30">
                                                            {check.finding}
                                                          </div>
                                                        </div>
                                                      )}

                                                      {check.details.length > 0 && (
                                                        <div>
                                                          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 mb-2 flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                                                            {t('detail.audit_detail')}
                                                          </div>
                                                          <ul className="space-y-2 text-sm text-foreground/80 list-disc pl-5 marker:text-muted-foreground/40">
                                                            {check.details.map((detail, index) => (
                                                              <li key={`${check.id}-detail-${index}`} className="leading-relaxed">
                                                                {detail}
                                                              </li>
                                                            ))}
                                                          </ul>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </Fragment>
                                          );
                                        })}

                                        {displayedAuditChecks.length === 0 && (
                                          <tr>
                                            <td
                                              colSpan={5}
                                              className="px-4 py-8 text-center text-sm text-muted-foreground"
                                            >
                                              {t('detail.audit_no_high_risk')}
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded-lg">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    code({
                                      inline,
                                      className,
                                      children,
                                      ...props
                                    }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
                                      const match = /language-(\w+)/.exec(className || '');
                                      return !inline && match ? (
                                        <SyntaxHighlighter
                                          style={syntaxStyle as any}
                                          language={match[1]}
                                          PreTag="div"
                                          {...props}
                                        >
                                          {String(children).replace(/\n$/, '')}
                                        </SyntaxHighlighter>
                                      ) : (
                                        <code className={className} {...props}>
                                          {children}
                                        </code>
                                      );
                                    },
                                  }}
                                >
                                  {auditReports[0].report}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground">
                            <ShieldAlert className="mx-auto mb-4 opacity-20" size={48} />
                            <p>{t('detail.no_audit_report')}</p>
                            <button
                              onClick={handleTriggerAudit}
                              disabled={auditing}
                              className="mt-4 px-6 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg text-sm font-bold transition-all"
                            >
                              {t('detail.re_audit')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {!skill.quality_score && auditReports.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Activity className="mx-auto mb-4 opacity-20" size={48} />
                        <p>{t('detail.no_quality_data')}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="lg:col-span-4 space-y-6">
            {/* metadata actions card */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                {t('detail.actions')}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-primary text-primary-foreground rounded-xl transition-all text-xs font-bold uppercase tracking-widest shadow-md hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Download size={18} />
                  )}
                  {t('detail.download')}
                </button>
                <button
                  onClick={() => setShowTranslateModal(true)}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-secondary text-secondary-foreground border border-border/50 rounded-xl transition-all text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-secondary/80 active:scale-95"
                >
                  <Globe size={18} />
                  {t('detail.translate')}
                </button>
              </div>

              {skill.snippet && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('detail.import')}
                    </span>
                    <button
                      onClick={handleCopy}
                      className="text-primary hover:text-primary/80 transition-colors p-1 rounded-lg"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <code className="block w-full bg-muted/50 p-2.5 text-xs font-mono text-muted-foreground break-all border border-border/50 rounded-lg">
                    {skill.snippet}
                  </code>
                </div>
              )}
            </div>

            {/* Quality Summary (Sidebar Version) - Hidden if activeTab is quality to avoid redundancy */}
            {activeTab !== 'quality' && displayScore > 0 && (
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4 flex justify-between items-center">
                  <span>{t('detail.quality_score')}</span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-lg text-[10px]',
                      displayScore >= 80
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : displayScore >= 60
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    )}
                  >
                    {displayScore}/100
                  </span>
                </h3>
                <div className="space-y-3">
                  {qualityCategories.slice(0, 3).map((cat) => (
                    <div key={cat.id} className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{cat.label}</span>
                        <span>{cat.score}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            cat.score >= 80
                              ? 'bg-green-500'
                              : cat.score >= 50
                                ? 'bg-amber-500'
                                : 'bg-red-500',
                          )}
                          style={{ width: `${cat.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setActiveTab('quality');
                      document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full text-xs text-center text-primary hover:underline pt-2"
                  >
                    {t('detail.view_full_analysis')}
                  </button>
                </div>
              </div>
            )}

            {/* Metadata Card */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                {t('detail.metadata')}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('detail.owner')}</span>
                  <span className="text-foreground font-medium">
                    {skill.owner || t('detail.na')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t('detail.status')}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    {t('detail.active')}
                  </span>
                </div>
                {skill.url && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t('detail.repository')}</span>
                    <a
                      href={skill.url}
                      target="_blank"
                      className="text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      {skill.url.includes('github.com') ? 'GitHub' : t('detail.repository')}{' '}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              {skill.tags && (
                <div className="mt-6 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {skill.tags.map((tag: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-muted border border-border/50 text-xs font-medium text-muted-foreground rounded-md"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                {t('detail.system_status')}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {t('detail.registry_online')}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {t('detail.index_synced')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modernized Translation Modal */}
      <AnimatePresence>
        {showTranslateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-card border border-border shadow-2xl rounded-xl overflow-hidden"
            >
              <div className="bg-muted/30 px-6 py-4 border-b border-border flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    {t('translate.modal_title')}
                  </h2>
                  <p className="text-xs text-muted-foreground">{t('translate.modal_subtitle')}</p>
                </div>
                <button
                  onClick={() => setShowTranslateModal(false)}
                  className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    {t('translate.target_langs')}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {['zh', 'ja', 'es', 'fr', 'de', 'ko'].map((lang) => (
                      <button
                        key={lang}
                        onClick={() =>
                          setSelectedLangs((prev) =>
                            prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
                          )
                        }
                        className={cn(
                          'px-4 py-2 border text-sm font-bold uppercase transition-all rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20',
                          selectedLangs.includes(lang)
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background border-border text-muted-foreground hover:border-foreground/30 hover:bg-muted/50',
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    {t('translate.modules')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'name',
                      'description',
                      'content',
                      'use_cases',
                      'prompt_templates',
                      'best_practices',
                      'avoid',
                      'faq',
                    ].map((mod) => (
                      <button
                        key={mod}
                        onClick={() =>
                          setSelectedModules((prev) =>
                            prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
                          )
                        }
                        className={cn(
                          'px-3 py-2 border text-[13px] font-bold uppercase text-left transition-all flex items-center gap-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm',
                          selectedModules.includes(mod)
                            ? 'bg-primary/5 border-primary/40 text-primary shadow-inner'
                            : 'bg-background border-border text-muted-foreground hover:bg-muted/50',
                        )}
                      >
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full transition-all duration-300',
                            selectedModules.includes(mod) ? 'bg-primary scale-125' : 'bg-muted-foreground/30',
                          )}
                        />
                        <span>{t(`translate.${mod}`)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-muted/30 border-t border-border flex justify-end gap-3">
                <button
                  onClick={() => setShowTranslateModal(false)}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all active:scale-95"
                >
                  {t('detail.cancel')}
                </button>
                <button
                  onClick={handleTranslate}
                  disabled={enqueuing || selectedLangs.length === 0}
                  className="px-8 py-2.5 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 shadow-md active:scale-95"
                >
                  {enqueuing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      {t('translate.enqueuing')}
                    </div>
                  ) : (
                    t('translate.start_btn')
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
