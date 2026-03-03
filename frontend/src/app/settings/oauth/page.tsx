'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { ArrowLeft, Loader2, Save, Globe, Github, Mail, MessageSquare, Server } from 'lucide-react';
import Link from 'next/link';


interface OAuthConfig {
  ldap: {
    enabled: boolean;
    server: string;
    baseDn: string;
    bindDn: string;
    bindPassword?: string;
  };
  providers: {
    google: { clientId: string; clientSecret: string; enabled: boolean };
    microsoft: { clientId: string; clientSecret: string; enabled: boolean };
    github: { clientId: string; clientSecret: string; enabled: boolean };
    wechat: { clientId: string; clientSecret: string; enabled: boolean };
  };
}

const DEFAULT_CONFIG: OAuthConfig = {
  ldap: { enabled: false, server: '', baseDn: '', bindDn: '', bindPassword: '' },
  providers: {
    google: { clientId: '', clientSecret: '', enabled: false },
    microsoft: { clientId: '', clientSecret: '', enabled: false },
    github: { clientId: '', clientSecret: '', enabled: false },
    wechat: { clientId: '', clientSecret: '', enabled: false },
  },
};

export default function OAuthPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [config, setConfig] = useState<OAuthConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await api.getOAuthConfig();
      // Merge with default to ensure structure exists
      setConfig({
        ...DEFAULT_CONFIG,
        ...data,
        ldap: { ...DEFAULT_CONFIG.ldap, ...(data.ldap || {}) },
        providers: {
          google: { ...DEFAULT_CONFIG.providers.google, ...(data.providers?.google || {}) },
          microsoft: {
            ...DEFAULT_CONFIG.providers.microsoft,
            ...(data.providers?.microsoft || {}),
          },
          github: { ...DEFAULT_CONFIG.providers.github, ...(data.providers?.github || {}) },
          wechat: { ...DEFAULT_CONFIG.providers.wechat, ...(data.providers?.wechat || {}) },
        },
      });
    } catch (error) {
      console.error('Failed to load OAuth config:', error);
      showToast(t('oauth.load_failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateOAuthConfig(config);
      showToast(t('oauth.save_success'), 'success');
    } catch (error) {
      console.error('Failed to save OAuth settings:', error);
      showToast(t('oauth.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateLdap = (field: keyof OAuthConfig['ldap'], value: any) => {
    setConfig((prev) => ({
      ...prev,
      ldap: { ...prev.ldap, [field]: value },
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateProvider = (provider: keyof OAuthConfig['providers'], field: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          [field]: value,
        },
      },
    }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-10 transition-colors">
      <Navbar>
        <div className="flex items-center">
          <Link
            href="/skills"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            {t('detail.back_home')}
          </Link>
        </div>
      </Navbar>

      <main className="max-w-[1280px] mx-auto pt-4 px-4">
        <div className="bg-card rounded-2xl border border-border shadow-sm flex min-h-[800px] overflow-hidden">
          <SettingsSidebar activeTab="oauth" />

          <div className="flex-1 p-10 bg-card overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">{t('oauth.title')}</h2>
                <p className="text-muted-foreground text-[15px]">{t('oauth.subtitle')}</p>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="h-10 px-6 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={18} />}
                {t('oauth.save_changes')}
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-64 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-8">
                {/* LDAP / AD Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
                      <Server size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{t('oauth.ldap_title')}</h3>
                  </div>

                  <div className="p-6 bg-card border border-border rounded-xl space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-foreground">
                          {t('oauth.ldap_enable')}
                        </div>
                        <div className="text-sm text-muted-foreground">{t('oauth.ldap_desc')}</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.ldap.enabled}
                          onChange={(e) => updateLdap('enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    {config.ldap.enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-muted-foreground">
                            {t('oauth.ldap_server')}
                          </label>
                          <input
                            type="text"
                            value={config.ldap.server}
                            onChange={(e) => updateLdap('server', e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            placeholder="ldap://ldap.example.com:389"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-muted-foreground">
                            {t('oauth.ldap_base_dn')}
                          </label>
                          <input
                            type="text"
                            value={config.ldap.baseDn}
                            onChange={(e) => updateLdap('baseDn', e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            placeholder="dc=example,dc=com"
                          />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                          <div className="text-xs text-muted-foreground mb-2 p-2 bg-muted/50 rounded-lg">
                            💡 {t('oauth.ldap_bind_optional') || '可选：绑定账户用于搜索用户目录。不设置时，用户将直接使用 AD 账号密码登录验证。'}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-muted-foreground">
                            {t('oauth.ldap_bind_dn')}
                          </label>
                          <input
                            type="text"
                            value={config.ldap.bindDn}
                            onChange={(e) => updateLdap('bindDn', e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            placeholder="cn=admin,dc=example,dc=com"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-muted-foreground">
                            {t('oauth.ldap_bind_password')}
                          </label>
                          <input
                            type="password"
                            value={config.ldap.bindPassword || ''}
                            onChange={(e) => updateLdap('bindPassword', e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <hr className="border-border" />

                {/* OAuth Providers Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600">
                      <Globe size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">
                      {t('oauth.social_providers')}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {/* Google */}
                    <div className="p-6 bg-card border border-border rounded-xl space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white border rounded-full flex items-center justify-center shadow-sm overflow-hidden p-2">
                            <img
                              src="https://www.google.com/favicon.ico"
                              alt="Google"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{t('oauth.google')}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('oauth.google_desc')}
                            </div>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.providers.google.enabled}
                            onChange={(e) => updateProvider('google', 'enabled', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      {config.providers.google.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_id')}
                            </label>
                            <input
                              type="text"
                              value={config.providers.google.clientId}
                              onChange={(e) => updateProvider('google', 'clientId', e.target.value)}
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_secret')}
                            </label>
                            <input
                              type="password"
                              value={config.providers.google.clientSecret}
                              onChange={(e) =>
                                updateProvider('google', 'clientSecret', e.target.value)
                              }
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Microsoft */}
                    <div className="p-6 bg-card border border-border rounded-xl space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#00a4ef] text-white rounded-full flex items-center justify-center shadow-sm">
                            <Mail size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{t('oauth.microsoft')}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('oauth.microsoft_desc')}
                            </div>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.providers.microsoft.enabled}
                            onChange={(e) =>
                              updateProvider('microsoft', 'enabled', e.target.checked)
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      {config.providers.microsoft.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_id')}
                            </label>
                            <input
                              type="text"
                              value={config.providers.microsoft.clientId}
                              onChange={(e) =>
                                updateProvider('microsoft', 'clientId', e.target.value)
                              }
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_secret')}
                            </label>
                            <input
                              type="password"
                              value={config.providers.microsoft.clientSecret}
                              onChange={(e) =>
                                updateProvider('microsoft', 'clientSecret', e.target.value)
                              }
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* GitHub */}
                    <div className="p-6 bg-card border border-border rounded-xl space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center shadow-sm">
                            <Github size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{t('oauth.github')}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('oauth.github_desc')}
                            </div>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.providers.github.enabled}
                            onChange={(e) => updateProvider('github', 'enabled', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      {config.providers.github.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_id')}
                            </label>
                            <input
                              type="text"
                              value={config.providers.github.clientId}
                              onChange={(e) => updateProvider('github', 'clientId', e.target.value)}
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_secret')}
                            </label>
                            <input
                              type="password"
                              value={config.providers.github.clientSecret}
                              onChange={(e) =>
                                updateProvider('github', 'clientSecret', e.target.value)
                              }
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* WeChat */}
                    <div className="p-6 bg-card border border-border rounded-xl space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#07c160] text-white rounded-full flex items-center justify-center shadow-sm">
                            <MessageSquare size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{t('oauth.wechat')}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('oauth.wechat_desc')}
                            </div>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.providers.wechat.enabled}
                            onChange={(e) => updateProvider('wechat', 'enabled', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      {config.providers.wechat.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.corp_id')}
                            </label>
                            <input
                              type="text"
                              value={config.providers.wechat.clientId}
                              onChange={(e) => updateProvider('wechat', 'clientId', e.target.value)}
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-muted-foreground">
                              {t('oauth.client_secret')}
                            </label>
                            <input
                              type="password"
                              value={config.providers.wechat.clientSecret}
                              onChange={(e) =>
                                updateProvider('wechat', 'clientSecret', e.target.value)
                              }
                              className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
