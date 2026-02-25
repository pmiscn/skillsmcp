'use client';

import { useEffect, useState, useMemo, FormEvent, useCallback } from 'react';
import Link from 'next/link';
import { api, Skill } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutGrid,
  List,
  Activity,
  Shield,
  Clock,
  ChevronRight,
  ChevronLeft,
  Download,
  Star,
  TrendingUp,
  Layers,
  Filter,
  X,
  Hash,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatMetric } from '@/lib/utils';
import { Navbar } from '@/components/layout/Navbar';
import { SkillCard } from '@/components/skills/SkillCard';
import { CategoryFilter } from '@/components/skills/CategoryFilter';

export default function SkillsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committedSearchQuery, setCommittedSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSafety, setSelectedSafety] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [engine, setEngine] = useState<'auto' | 'tfidf' | 'sbert' | 'hybrid'>('auto');
  const [sortBy, setSortBy] = useState<'heat' | 'relevance' | 'security'>('relevance');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSkills, setTotalSkills] = useState(0);

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (selectedCategory !== 'all') {
        const categoryTags: Record<string, string[]> = {
          coding: ['coding', 'dev', 'development', 'programming', 'script'],
          research: ['research', 'search', 'analysis', 'data'],
          automation: ['automation', 'workflow', 'tool', 'task'],
          creative: ['creative', 'design', 'image', 'generation', 'art'],
        };
        const tags = categoryTags[selectedCategory] || [];
        const hasTag = (skill.tags || []).some((t) => tags.includes(t.toLowerCase()));
        if (!hasTag) return false;
      }

      if (selectedSafety.length > 0) {
        if (selectedSafety.includes('security_shield')) {
          const score = skill.security_score || 0;
          if (score < 70) return false;
        }
        if (selectedSafety.includes('privacy_pro')) {
          const runtimeScore = skill.security_data?.runtime || 0;
          if (runtimeScore < 15) return false;
        }
        if (selectedSafety.includes('safe')) {
          const isSafe = !skill.permissions || skill.permissions.length === 0;
          if (!isSafe) return false;
        }
        if (selectedSafety.includes('best')) {
          const isBest = skill.weight && skill.weight > 8;
          if (!isBest) return false;
        }
        if (selectedSafety.includes('local')) {
          if (skill.source !== 'local') return false;
        }
        if (selectedSafety.includes('offline')) {
          if (skill.requires_internet) return false;
        }
        if (selectedSafety.includes('online')) {
          if (!skill.requires_internet) return false;
        }
      }

      return true;
    });
  }, [skills, selectedCategory, selectedSafety, language]);

  const toggleSafety = (id: string) => {
    setSelectedSafety((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listSkills(
        page,
        50,
        sortBy === 'security' ? 'security' : sortBy === 'heat' ? 'heat' : undefined,
      );
      setSkills(data.skills || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalSkills(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load skills.');
    } finally {
      setLoading(false);
    }
  }, [page, sortBy]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/auth/login');
      return;
    }

    if (!isAuthenticated) return;

    api
      .getUserPreferences()
      .then((prefs) => {
        if (prefs?.search_engine) setEngine(prefs.search_engine);
      })
      .catch(() => null);
  }, [authLoading, isAuthenticated, router]);

  const handleSearch = useCallback(
    async (query: string) => {
      setIsSearching(true);
      try {
        const data = await api.searchSkills(query, { engine, sort: sortBy });
        setSkills(data.results || []);
      } catch (err) {
        console.error(err);
        setError('Search failed.');
      } finally {
        setIsSearching(false);
      }
    },
    [engine, sortBy],
  );

  useEffect(() => {
    if (!isAuthenticated) return;

    if (!committedSearchQuery.trim()) {
      fetchSkills();
    } else {
      handleSearch(committedSearchQuery);
    }
  }, [isAuthenticated, fetchSkills, committedSearchQuery, handleSearch]);

  const handleEngineChange = async (value: 'auto' | 'tfidf' | 'sbert' | 'hybrid') => {
    setEngine(value);
    try {
      await api.updateUserPreferences({ search_engine: value });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = async (e: React.MouseEvent, skill: Skill) => {
    e.preventDefault();
    e.stopPropagation();
    setDownloadingId(skill.id);
    try {
      await api.downloadSkill(skill.id, skill.name);
    } catch (err) {
      console.error(err);
      setError('Failed to download skill.');
    } finally {
      setDownloadingId(null);
    }
  };

  const getName = (skill: Skill) => {
    const name = language === 'zh' && skill.name_zh ? skill.name_zh : skill.name || 'Untitled';
    if (committedSearchQuery && skill.matched_fields?.includes('name')) {
      return (
        <span
          dangerouslySetInnerHTML={{
            __html: name.replace(
              new RegExp(`(${committedSearchQuery})`, 'gi'),
              '<mark class="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">$1</mark>',
            ),
          }}
        />
      );
    }
    return name;
  };

  const getDescription = (skill: Skill) => {
    const desc =
      language === 'zh' && skill.description_zh
        ? skill.description_zh
        : skill.description || 'No description provided.';

    if (
      committedSearchQuery &&
      (skill.matched_fields?.includes('description') || skill.matched_fields?.includes('content'))
    ) {
      return (
        <span
          dangerouslySetInnerHTML={{
            __html: desc.replace(
              new RegExp(`(${committedSearchQuery})`, 'gi'),
              '<mark class="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">$1</mark>',
            ),
          }}
        />
      );
    }
    return desc;
  };

  const SidebarContent = () => (
    <div className="space-y-8 pb-10">
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {language === 'zh' ? '搜索' : 'Search'}
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const query = formData.get('query') as string;
            setCommittedSearchQuery(query);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <input
              type="text"
              name="query"
              defaultValue={committedSearchQuery}
              placeholder={language === 'zh' ? '搜索技能...' : 'Search skills...'}
              className="w-full h-11 bg-background border border-input rounded-xl pl-10 pr-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50 shadow-sm"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            )}
          </div>
          <button
            type="submit"
            className="h-11 px-6 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-md whitespace-nowrap active:scale-95 flex items-center justify-center"
          >
            {language === 'zh' ? '搜索' : 'Search'}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('index.engine.auto')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(['auto', 'sbert', 'tfidf', 'hybrid'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleEngineChange(item)}
              className={cn(
                'px-3 py-2 text-xs font-medium rounded-xl transition-all text-center border shadow-sm',
                engine === item
                  ? 'bg-primary/5 border-primary/20 text-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              {t(`index.engine.${item}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {language === 'zh' ? '排序' : 'Sort'}
        </h3>
        <div className="flex flex-col gap-1">
          {[
            { id: 'relevance', label: language === 'zh' ? '相关度' : 'Relevance', icon: Layers },
            {
              id: 'security',
              label: language === 'zh' ? '安全优先' : 'Security',
              icon: Shield,
            },
            { id: 'heat', label: language === 'zh' ? '热度' : 'Popularity', icon: TrendingUp },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSortBy(item.id as 'heat' | 'relevance' | 'security')}
              className={cn(
                'flex items-center justify-between px-3 py-2 text-sm font-medium rounded-xl transition-all',
                sortBy === item.id
                  ? 'bg-secondary text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={16} className="opacity-70" />
                {item.label}
              </div>
              {sortBy === item.id && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <CategoryFilter
          selectedId={selectedCategory}
          onSelect={setSelectedCategory}
          selectedSafety={selectedSafety}
          onToggleSafety={toggleSafety}
          language={language}
        />
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Navbar>
        <div className="flex items-center bg-secondary/50 rounded-xl p-1 border border-border/50 shadow-sm">
          <button
            onClick={() => setViewMode('cards')}
            className={cn(
              'p-1.5 rounded-xl transition-all outline-none focus:ring-2 focus:ring-primary/20',
              viewMode === 'cards'
                ? 'bg-background text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
            )}
          >
            <LayoutGrid size={16} />
          </button>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'p-1.5 rounded-xl transition-all outline-none focus:ring-2 focus:ring-primary/20',
              viewMode === 'table'
                ? 'bg-background text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
            )}
          >
            <List size={16} />
          </button>
        </div>
      </Navbar>

      <div className="max-w-[1920px] mx-auto">
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)]">
          <div className="lg:hidden px-4 py-3 border-b border-border flex items-center justify-between sticky top-16 bg-background/95 backdrop-blur z-40">
            <div className="text-sm font-medium text-muted-foreground">
              {filteredSkills.length} Skills
            </div>
            <button
              onClick={() => setIsMobileFiltersOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground font-medium rounded-xl text-xs hover:bg-secondary/80 transition-colors"
            >
              <Filter size={14} />
              Filters
            </button>
          </div>

          <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-border bg-card/30">
            <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto px-6 py-8 custom-scrollbar">
              <SidebarContent />
            </div>
          </aside>

          <AnimatePresence>
            {isMobileFiltersOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileFiltersOpen(false)}
                  className="fixed inset-0 bg-black/50 z-50 lg:hidden backdrop-blur-sm"
                />
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="fixed inset-y-0 left-0 w-[85%] max-w-[320px] bg-background z-50 lg:hidden border-r border-border flex flex-col shadow-2xl"
                >
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <span className="font-medium text-sm">Filters</span>
                    <button
                      onClick={() => setIsMobileFiltersOpen(false)}
                      className="p-1 hover:bg-muted rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <SidebarContent />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <main className="flex-1 w-full min-w-0 bg-background">
            <section className="px-6 md:px-10 py-10 border-b border-border">
              <div className="max-w-5xl">
                <h1 className="text-3xl font-semibold tracking-tight mb-2 text-foreground">
                  {t('skills.title')}
                </h1>
                <p className="text-lg text-muted-foreground">{t('skills.subtitle')}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {language === 'zh' ? (
                    <>
                      本站已经收藏
                      <span className="text-primary font-extrabold text-lg md:text-2xl mx-2">
                        {new Intl.NumberFormat().format(totalSkills)}
                      </span>
                      个
                    </>
                  ) : (
                    <>
                      This site has collected
                      <span className="text-primary font-extrabold text-lg md:text-2xl mx-2">
                        {new Intl.NumberFormat().format(totalSkills)}
                      </span>
                      skills
                    </>
                  )}
                </p>
              </div>
            </section>

            <div className="p-6 md:p-10">
              {loading && skills.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-64 bg-secondary/10 rounded-3xl animate-pulse border border-border/50 shadow-inner" />
                  ))}
                </div>
              ) : (
                <div className={cn("relative", loading && "opacity-60 pointer-events-none")}>
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 p-4 mb-8 flex items-center gap-3 rounded-xl text-destructive text-sm font-medium">
                  <Activity size={16} />
                  {error}
                </div>
              )}

              {filteredSkills.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl">
                  <div className="w-12 h-12 bg-secondary/50 flex items-center justify-center mb-4 text-muted-foreground rounded-xl">
                    <Hash size={20} />
                  </div>
                  <h3 className="text-lg font-medium mb-1">{t('skills.no_found')}</h3>
                  <p className="text-muted-foreground text-sm">
                    Try adjusting your filters or search query.
                  </p>
                </div>
              ) : viewMode === 'cards' ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        language={language}
                        searchQuery={committedSearchQuery}
                        onDownload={handleDownload}
                        isDownloading={downloadingId === skill.id}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-6">
                    <div className="hidden sm:block text-sm font-bold uppercase tracking-tight text-muted-foreground/60">
                      Page {page} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2 mx-auto sm:mx-0">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 border border-border rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm active:scale-95"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold px-4 sm:hidden">
                          Page {page} / {totalPages}
                        </span>
                      </div>

                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 border border-border rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm active:scale-95"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            <th className="py-3 px-6 font-semibold">{t('table.identity')}</th>
                            <th className="py-3 px-6 font-semibold">{t('table.origin')}</th>
                            <th className="py-3 px-6 font-semibold">Metrics</th>
                            <th className="py-3 px-6 font-semibold">{t('table.modified')}</th>
                            <th className="py-3 px-6 font-semibold text-right">
                              {t('table.action')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                          {filteredSkills.map((skill) => (
                            <tr
                              key={skill.id}
                              className="group hover:bg-secondary/20 transition-colors"
                            >
                              <td className="py-3 px-6">
                                <Link href={`/skills/${skill.id}`} className="flex flex-col">
                                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                                    {getName(skill)}
                                  </span>
                                  <span className="text-xs text-muted-foreground line-clamp-1 max-w-xs mt-0.5">
                                    {getDescription(skill)}
                                  </span>
                                </Link>
                              </td>
                              <td className="py-3 px-6">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground border border-border/50">
                                  {skill.source ?? 'registry'}
                                </span>
                              </td>
                              <td className="py-3 px-6">
                                <div className="flex items-center gap-4 text-muted-foreground">
                                  <div className="flex items-center gap-1.5" title="Installs">
                                    <Download size={14} />
                                    <span className="text-xs font-medium">
                                      {formatMetric(skill.installs || 0)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5" title="Stars">
                                    <Star size={14} />
                                    <span className="text-xs font-medium">
                                      {formatMetric(skill.stars || 0)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-6">
                                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                  <Clock size={14} />
                                  <span>
                                    {skill.updated_at
                                      ? new Date(skill.updated_at).toLocaleDateString()
                                      : '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={(e) => handleDownload(e, skill)}
                                    disabled={downloadingId === skill.id}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-sm active:scale-95"
                                    title={t('detail.download')}
                                  >
                                    {downloadingId === skill.id ? (
                                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Download size={14} />
                                    )}
                                  </button>
                                  <Link
                                    href={`/skills/${skill.id}`}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-all shadow-sm active:scale-95"
                                  >
                                    <ChevronRight size={16} />
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4">
                    <p className="text-xs font-bold uppercase tracking-tight text-muted-foreground/60">
                      {t('skills.showing', { count: filteredSkills.length, total: totalSkills })}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 border border-border rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm active:scale-95"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 border border-border rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm active:scale-95"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
