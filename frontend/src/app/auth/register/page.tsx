'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { motion } from 'framer-motion';
import { Zap, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMounted(true);
    generateCaptcha();
  }, []);

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars like I, 1, O, 0
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(result);
    drawCaptcha(result);
  };

  const drawCaptcha = (text: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Add some noise/lines
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.stroke();
    }

    // Draw text with slight rotation for each char
    const charWidth = canvas.width / (text.length + 1);
    for (let i = 0; i < text.length; i++) {
      ctx.save();
      const x = (i + 1) * charWidth;
      const y = canvas.height / 2;
      const angle = (Math.random() - 0.5) * 0.4; // Random rotation
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (password !== confirmPassword) {
      setError(t('register.error_password_mismatch'));
      return;
    }

    if (captchaInput.toUpperCase() !== captchaCode) {
      setError(t('register.error_generic') + ' (Invalid Captcha)');
      generateCaptcha(); // Refresh captcha on error
      setCaptchaInput('');
      return;
    }

    setSubmitting(true);

    try {
      // Backend api.register only takes username and password
      await api.register({ username, password });

      setSuccess(t('register.success'));
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || t('register.error_generic'));
      generateCaptcha();
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
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-4">
            <Zap size={20} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('register.title')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('register.subtitle')}</p>
        </div>

        <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 sm:p-8">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Username */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="username">
                {t('register.username')}
              </label>
              <input
                type="text"
                id="username"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
                placeholder={t('register.username_placeholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            {/* Email (Optional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="email">
                {t('register.email')}
              </label>
              <input
                type="email"
                id="email"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
                placeholder={t('register.email_placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="password">
                  {t('register.password')}
                </label>
                <input
                  type="password"
                  id="password"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
                  placeholder={t('register.password_placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="confirmPassword">
                  {t('register.confirm_password')}
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
                  placeholder={t('register.password_placeholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* CAPTCHA */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="captcha">
                {t('register.captcha')}
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  id="captcha"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm placeholder:text-muted-foreground/40 disabled:opacity-50 uppercase"
                  placeholder={t('register.captcha_placeholder')}
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  required
                  disabled={submitting}
                />
                <div
                  className="relative cursor-pointer group shrink-0"
                  onClick={generateCaptcha}
                  title="Click to refresh"
                >
                  <canvas
                    ref={canvasRef}
                    width={120}
                    height={44}
                    className="rounded-xl border border-input bg-muted/50"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-xl">
                    <RefreshCw className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
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

            {/* Success Message */}
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-3 rounded-xl"
              >
                <Zap size={16} />
                <p>{success}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-full mt-4 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                t('register.submit')
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/auth/login" className="text-sm text-primary hover:underline">
              {t('register.login_link')}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
