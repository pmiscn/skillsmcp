'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { motion } from 'framer-motion';
import { Zap, AlertCircle, Loader2 } from 'lucide-react';
import { api, type OAuthProvidersPublicResponse } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [oauthConfig, setOauthConfig] = useState<OAuthProvidersPublicResponse | null>(null);
  const [loadingOauth, setLoadingOauth] = useState(true);

  useEffect(() => {
    setMounted(true);
    api
      .getOAuthProvidersPublic()
      .then(setOauthConfig)
      .catch(console.error)
      .finally(() => setLoadingOauth(false));
  }, []);

  const handleOAuthLogin = (provider: string) => {
    window.location.href = `/api/auth/${provider}`;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
    } catch (err) {
      console.error(err);
      setError('Invalid credentials. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 transition-colors duration-300">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-4">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your credentials to access the registry
          </p>
        </div>

        <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 sm:p-8">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="username">
                Username
              </label>
              <input
                type="text"
                id="username"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="password">
                Password
              </label>
              <input
                type="password"
                id="password"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={submitting}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-xl"
              >
                <AlertCircle size={16} />
                <p>{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-full mt-4 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
            </button>
          </form>

          {!loadingOauth &&
            oauthConfig &&
            (oauthConfig.providers.google.enabled ||
              oauthConfig.providers.microsoft.enabled ||
              oauthConfig.providers.github.enabled ||
              oauthConfig.providers.wechat.enabled) && (
              <div className="mt-6">
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                <div className="grid gap-3">
                  {oauthConfig.providers.google.enabled && (
                    <button
                      type="button"
                      onClick={() => handleOAuthLogin('google')}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 w-full transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <img src="/oauth/google.svg" className="w-5 h-5 mr-2" alt="Google" />
                      {t('login.google')}
                    </button>
                  )}
                  {oauthConfig.providers.microsoft.enabled && (
                    <button
                      type="button"
                      onClick={() => handleOAuthLogin('microsoft')}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 w-full transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <img src="/oauth/microsoft.svg" className="w-5 h-5 mr-2" alt="Microsoft" />
                      {t('login.microsoft')}
                    </button>
                  )}
                  {oauthConfig.providers.github.enabled && (
                    <button
                      type="button"
                      onClick={() => handleOAuthLogin('github')}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 w-full transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <img src="/oauth/github.svg" className="w-5 h-5 mr-2" alt="GitHub" />
                      {t('login.github')}
                    </button>
                  )}
                  {oauthConfig.providers.wechat.enabled && (
                    <button
                      type="button"
                      onClick={() => handleOAuthLogin('wechat')}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 w-full transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <img src="/oauth/wechat.svg" className="w-5 h-5 mr-2" alt="WeChat" />
                      {t('login.wechat')}
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Restricted access. Authorized personnel only.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
