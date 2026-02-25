import React from 'react';
import {
  Terminal,
  Search,
  Code,
  Globe,
  ShieldCheck,
  Wand2,
  Sparkles,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Category {
  id: string;
  name: string;
  name_zh: string;
  icon: React.ReactNode;
  color: string;
}

export const SKILL_CATEGORIES: Category[] = [
  {
    id: 'all',
    name: 'All Skills',
    name_zh: '全部技能',
    icon: <Sparkles size={14} />,
    color: '',
  },
  {
    id: 'coding',
    name: 'Coding & Dev',
    name_zh: '代码开发',
    icon: <Code size={14} />,
    color: '',
  },
  {
    id: 'research',
    name: 'Research',
    name_zh: '深度研究',
    icon: <Search size={14} />,
    color: '',
  },
  {
    id: 'automation',
    name: 'Automation',
    name_zh: '自动流程',
    icon: <Terminal size={14} />,
    color: '',
  },
  {
    id: 'creative',
    name: 'Creative',
    name_zh: '创意生成',
    icon: <Wand2 size={14} />,
    color: '',
  },
];

export const SAFETY_LEVELS = [
  {
    id: 'security_shield',
    name: 'Secure',
    name_zh: '安全盾牌',
    icon: <ShieldCheck size={14} />,
  },
  {
    id: 'privacy_pro',
    name: 'Privacy',
    name_zh: '隐私保护',
    icon: <Lock size={14} />,
  },
  {
    id: 'safe',
    name: 'Verified',
    name_zh: '已验证安全',
    icon: <ShieldCheck size={14} />,
  },
  {
    id: 'local',
    name: 'Local Only',
    name_zh: '仅限本地',
    icon: <Lock size={14} />,
  },
  {
    id: 'best',
    name: 'Best Practice',
    name_zh: '最佳实践',
    icon: <CheckCircle2 size={14} />,
  },
  {
    id: 'offline',
    name: 'Offline',
    name_zh: '无需联网',
    icon: <Globe size={14} />,
  },
  {
    id: 'online',
    name: 'Online',
    name_zh: '需要联网',
    icon: <Globe size={14} />,
  },
];

interface CategoryFilterProps {
  selectedId: string;
  onSelect: (id: string) => void;
  selectedSafety: string[];
  onToggleSafety: (id: string) => void;
  language: string;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedId,
  onSelect,
  selectedSafety,
  onToggleSafety,
  language,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        {SKILL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all w-full text-left',
              selectedId === cat.id
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {React.cloneElement(cat.icon as React.ReactElement<{ size?: number }>, { size: 16 })}
            <span>{language === 'zh' ? cat.name_zh : cat.name}</span>
            {selectedId === cat.id && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          {language === 'zh' ? '特性' : 'Attributes'}
        </h3>
        <div className="flex flex-wrap gap-2">
          {SAFETY_LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={() => onToggleSafety(level.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all border',
                selectedSafety.includes(level.id)
                  ? 'bg-primary/5 text-primary border-primary/20'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground',
              )}
            >
              {level.icon}
              {language === 'zh' ? level.name_zh : level.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
