'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Zap, Compass, Activity, Settings, LogOut, Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from 'next-themes';

interface NavbarProps {
  children?: React.ReactNode;
}

export function Navbar({ children }: NavbarProps) {
  const { language, setLanguage, t } = useLanguage();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-[1920px] items-center px-6">
        <div className="flex items-center gap-8">
          <Link href="/skills" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20 ring-offset-1 ring-offset-background transition-transform group-hover:scale-105">
              <Zap size={18} className="fill-current" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">SkillShub</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/skills"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
            >
              <Compass size={16} />
              {t('nav.discover') || 'Discover'}
            </Link>
            <Link
              href="/skills/index"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
            >
              <Activity size={16} />
              {t('nav.index') || 'Index'}
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
            >
              <Settings size={16} />
              {t('nav.settings') || 'Settings'}
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          {children}

          <div className="mx-2 hidden h-6 w-px bg-border/60 sm:block" />

          <div className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/20 p-1 backdrop-blur-sm">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                'rounded-full p-1.5 transition-all',
                theme === 'light'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/10'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
              title="Light Mode"
            >
              <Sun size={14} />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={cn(
                'rounded-full p-1.5 transition-all',
                theme === 'system'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/10'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
              title="System Mode"
            >
              <Laptop size={14} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                'rounded-full p-1.5 transition-all',
                theme === 'dark'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/10'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
              title="Dark Mode"
            >
              <Moon size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/20 p-1 backdrop-blur-sm">
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                language === 'en'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/10'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('zh')}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                language === 'zh'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/10'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              CN
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => logout()}
              className="group flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
