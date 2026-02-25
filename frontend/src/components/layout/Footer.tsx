'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Footer() {
  const [mounted, setMounted] = useState(false);
  const [timestamp, setTimestamp] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimestamp(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      );
    };

    setTimeout(() => {
      setMounted(true);
      updateTime();
    }, 0);

    const interval = setInterval(updateTime, 1000 * 60);
    return () => clearInterval(interval);
  }, []);

  const links = [
    { name: 'Registry', href: '/registry' },
    { name: 'Index', href: '/index' },
    { name: 'Settings', href: '/settings' },
    { name: 'Docs', href: '/docs' },
  ];

  return (
    <footer className="w-full border-t border-border/40 bg-background/50 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:gap-12">
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">SkillShub</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              A semantic skill registry and execution environment for your local development
              workflow. Empowering developers with AI-driven capabilities.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-medium text-muted-foreground/80">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              All Systems Operational
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Navigation</h3>
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">System</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Version</span>
                <span className="font-mono text-xs text-foreground/80">v2.4.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Build</span>
                <span className="font-mono text-xs text-foreground/80">Stable</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-8 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} SkillShub System. All rights reserved.</p>
          <div className="font-mono tabular-nums opacity-60">
            {mounted ? timestamp : 'Initializing...'}
          </div>
        </div>
      </div>
    </footer>
  );
}
