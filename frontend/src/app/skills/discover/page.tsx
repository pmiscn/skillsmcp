'use client';

import { useEffect, useState } from 'react';
import type { FormEventHandler } from 'react';
import Link from 'next/link';
import { api, Skill } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'next/navigation';

export default function DiscoverSkillsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false); // Start false, wait for user input
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [engine, setEngine] = useState<'auto' | 'tfidf' | 'sbert' | 'hybrid'>('auto');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      api
        .getUserPreferences()
        .then((prefs) => {
          if (prefs?.search_engine) setEngine(prefs.search_engine);
        })
        .catch(() => null);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/auth/login');
      return;
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSearch: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    setError(null);

    try {
      const data = await api.searchSkills(query, { engine });
      setSkills(data.results || []);
    } catch (err) {
      console.error(err);
      setError(t('discover.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleEngineChange = async (value: 'auto' | 'tfidf' | 'sbert' | 'hybrid') => {
    setEngine(value);
    try {
      await api.updateUserPreferences({ search_engine: value });
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center transition-colors">
        <div className="w-4 h-4 bg-slate-900 dark:bg-white animate-ping" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-8 md:p-12 lg:p-24 font-sans selection:bg-slate-900 selection:text-white transition-colors duration-300">
      <header className="mb-12">
        <Link
          href="/skills"
          className="font-mono text-sm uppercase tracking-widest text-neutral-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white mb-8 block"
        >
          ← {t('discover.back')}
        </Link>
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-4 mb-8">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">
            {t('discover.title')}
          </h1>
          <div className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 px-2 py-1 rounded-md bg-white dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 text-xs font-mono uppercase tracking-widest transition-colors ${
                language === 'en'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                  : 'text-neutral-400 dark:text-neutral-500'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('zh')}
              className={`px-2 py-1 text-xs font-mono uppercase tracking-widest transition-colors ${
                language === 'zh'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                  : 'text-neutral-400 dark:text-neutral-500'
              }`}
            >
              中文
            </button>
          </div>
        </div>
        <p className="text-xl md:text-2xl text-neutral-600 dark:text-neutral-400 max-w-2xl mb-12 font-light">
          {t('discover.subtitle')}
        </p>
      </header>

      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            {t('discover.engine')}
          </div>
          <div className="flex items-center gap-2">
            {(['auto', 'sbert', 'tfidf', 'hybrid'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleEngineChange(item)}
                className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded-full transition-colors ${
                  engine === item
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600'
                }`}
              >
                {t(`index.engine.${item}`)}
              </button>
            ))}
          </div>
        </div>
        <form onSubmit={handleSearch} className="mb-16">
          <div className="relative">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('discover.search_placeholder')}
              className="w-full bg-transparent border-2 border-slate-900 dark:border-neutral-800 p-6 font-mono text-lg focus:outline-none focus:ring-4 focus:ring-slate-200 dark:focus:ring-white/5 transition-all min-h-[120px] resize-none dark:bg-neutral-900 rounded-sm"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-black px-8 py-3 font-mono text-sm uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? t('discover.searching') : t('discover.find_skills')}
            </button>
          </div>
        </form>

        {error && (
          <div className="border border-red-500 dark:border-red-500/50 p-6 mb-12 bg-red-50 dark:bg-red-500/10">
            <p className="text-red-600 dark:text-red-400 font-mono text-sm">{error}</p>
          </div>
        )}

        {hasSearched && (
          <div className="space-y-12">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
              <h2 className="font-mono text-sm uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                {skills.length} {t('discover.matches')}
              </h2>
            </div>

            {skills.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-neutral-300 dark:border-neutral-700">
                <p className="font-mono text-neutral-400 dark:text-neutral-500">
                  {t('discover.try_different')}
                </p>
              </div>
            ) : (
              skills.map((skill) => (
                <Link href={`/skills/${skill.id}`} key={skill.id} className="block group">
                  <article className="border-l-2 border-neutral-200 dark:border-neutral-800 pl-8 py-2 group-hover:border-slate-900 dark:group-hover:border-white transition-colors duration-300">
                    <div className="flex items-baseline justify-between mb-2">
                      <h3 className="text-3xl font-bold group-hover:underline decoration-2 underline-offset-4 text-neutral-900 dark:text-white">
                        {language === 'zh' && skill.name_zh ? skill.name_zh : skill.name}
                      </h3>
                      {skill.score !== undefined && (
                        <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
                          {t('discover.score')}: {skill.score.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-4 font-light">
                      {language === 'zh' && skill.description_zh
                        ? skill.description_zh
                        : skill.description}
                    </p>

                    {skill.matched_fields && skill.matched_fields.length > 0 && (
                      <div className="flex gap-2 text-xs font-mono text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                        <span>
                          {t('discover.matched')}: {skill.matched_fields.join(', ')}
                        </span>
                      </div>
                    )}

                    {skill.tags && skill.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {skill.tags.map((tag) => (
                          <span
                            key={tag}
                            className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-xs font-mono text-neutral-600 dark:text-neutral-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
