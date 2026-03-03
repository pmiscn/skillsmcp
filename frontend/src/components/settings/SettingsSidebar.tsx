'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Languages, ShieldCheck, Brain, Lock, User, Key, Globe } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface SettingsSidebarProps {
  activeTab: string;
  onTabChange?: (tabId: 'translation' | 'security' | 'search' | 'authorization') => void;
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  const { t } = useLanguage();

  const items = [
    {
      id: 'translation',
      label: t('settings.translation_tab'),
      icon: Languages,
      color: 'text-[#4a90e2]',
      href: '/settings',
    },
    {
      id: 'security',
      label: t('settings.security_tab'),
      icon: ShieldCheck,
      color: 'text-[#52c41a]',
      href: '/settings',
    },
    {
      id: 'search',
      label: '搜索与匹配',
      icon: Brain,
      color: 'text-[#8b5cf6]',
      href: '/settings',
    },
    {
      id: 'authorization',
      label: t('settings.authorization_tab'),
      icon: Lock,
      color: 'text-[#f5a623]',
      href: '/settings',
    },
    {
      id: 'users',
      label: t('settings.users_tab'),
      icon: User,
      color: 'text-primary',
      href: '/settings/users',
    },
    {
      id: 'oauth',
      label: t('settings.oauth_tab'),
      icon: Globe,
      color: 'text-primary',
      href: '/settings/oauth',
    },
  ] as const;

  return (
    <aside className="w-64 border-r border-border shrink-0 pt-6 bg-card/50">
      <div className="px-6 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('settings.title')}</h1>
      </div>

      <nav className="flex flex-col">
        {items.map((item) => {
          const isActive = activeTab === item.id;
          // If we have an onTabChange handler and this item points to /settings,
          // use the handler instead of navigation (unless we're not on /settings)
          const isInternalTab = item.href === '/settings';
          const shouldUseButton = isInternalTab && onTabChange;

          if (shouldUseButton) {
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id as any)}
                className={cn(
                  'w-full flex items-center gap-3 px-6 py-4 text-[15px] font-medium transition-all group relative',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}

                <span className="shrink-0">
                  <item.icon size={20} className={item.color} />
                </span>
                {item.label}
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'w-full flex items-center gap-3 px-6 py-4 text-[15px] font-medium transition-all group relative',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
              <span className="shrink-0">
                <item.icon size={20} className={item.color} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
