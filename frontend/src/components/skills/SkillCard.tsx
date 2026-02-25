import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Shield, Star, Download, Globe, Sparkles, Cpu } from 'lucide-react';
import { cn, formatMetric } from '@/lib/utils';
import { SKILL_CATEGORIES } from './CategoryFilter';
import { Skill } from '@/lib/api';

interface SkillCardProps {
  skill: Skill;
  searchQuery: string;
  onDownload: (e: React.MouseEvent, skill: Skill) => void;
  isDownloading: boolean;
  language: 'en' | 'zh';
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  searchQuery,
  onDownload,
  isDownloading,
  language,
}) => {
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <span
              key={i}
              className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-sm px-0.5"
            >
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </>
    );
  };

  const isBestPractice = skill.weight && skill.weight > 8;
  const requiresInternet = skill.requires_internet;
  const securityScore = skill.security_score || skill.score || 0;

  const name = skill.name || skill.id?.split('::').pop() || 'Unknown Skill';
  const description = skill.description || 'No description available';

  const displayId = skill.id?.replace(/::/g, '/').split('/').slice(0, 2).join('/');

  const getCategoryInfo = (tag: string) => {
    const category = SKILL_CATEGORIES.find(
      (c) => c.id !== 'all' && (c.id === tag || tag.includes(c.id)),
    );

    const icon = category ? category.icon : <Sparkles size={16} />;

    if (React.isValidElement(icon)) {
      return React.cloneElement(icon as React.ReactElement<{ size?: number; className?: string }>, {
        size: 18,
        className: 'text-foreground/70 group-hover:text-primary transition-colors',
      });
    }
    return icon;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80)
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    if (score >= 50)
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800';
  };

  return (
    <Link
      href={`/skills/${encodeURIComponent(skill.id)}`}
      className="group block h-full outline-none"
    >
      <motion.div
        layoutId={skill.id}
        className="relative flex flex-col h-full bg-card border border-border/60 hover:border-border hover:shadow-sm hover:bg-card/80 transition-all duration-300 rounded-xl overflow-hidden backdrop-blur-[2px]"
      >
        <div className="p-5 flex flex-col h-full">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center border border-border/40 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors">
              {getCategoryInfo(skill.tags && skill.tags.length > 0 ? skill.tags[0] : 'skill')}
            </div>

            <div className="flex items-center gap-2">
              {isBestPractice && (
                <div className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Star size={10} className="fill-current" />
                  <span>PRO</span>
                </div>
              )}
              <div
                className={cn(
                  'px-2 py-0.5 rounded-lg border text-[10px] font-mono font-medium flex items-center gap-1.5',
                  getScoreColor(securityScore),
                )}
                title={`Security Score: ${securityScore}`}
              >
                <Shield size={10} />
                <span>{securityScore}</span>
              </div>
            </div>
          </div>

          <div className="mb-auto">
            <div className="mb-2">
              <h3 className="font-semibold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {highlightText(name)}
              </h3>
              <p className="text-xs font-mono text-muted-foreground/60 mt-0.5 truncate">
                {displayId}
              </p>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4">
              {highlightText(description)}
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/40 mt-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5" title="Installs">
                <Download size={12} />
                <span>{formatMetric(skill.installs || 0)}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Stars">
                <Star size={12} />
                <span>{formatMetric(skill.stars || 0)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {requiresInternet ? (
                <div
                  className="p-1.5 rounded-lg bg-secondary/50 text-muted-foreground"
                  title="Requires Internet"
                >
                  <Globe size={12} />
                </div>
              ) : (
                <div
                  className="p-1.5 rounded-lg bg-secondary/50 text-muted-foreground"
                  title="Runs Locally"
                >
                  <Cpu size={12} />
                </div>
              )}

              <button
                onClick={(e) => onDownload(e, skill)}
                disabled={isDownloading}
                className={cn(
                  'p-1.5 rounded-xl transition-all duration-200 flex items-center justify-center',
                  isDownloading
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground',
                )}
                title={language === 'zh' ? '安装' : 'Install'}
              >
                {isDownloading ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
};
