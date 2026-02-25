'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Globe,
  Server,
  Key,
  Plus,
  Trash2,
  Play,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal,
  Activity,
  Zap,
  ShieldAlert,
  ArrowLeft,
  ShieldCheck,
  Languages,
  Lock,
  Copy,
  ExternalLink,
  ChevronRight,
  Info,
  X,
  Palette,
  Mic,
  User,
  Brain,
  Monitor,
} from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { api, ApiKey } from '@/lib/api';
import { Navbar } from '@/components/layout/Navbar';
import { cn } from '@/lib/utils';

interface Engine {
  type: string;
  provider?: string;
  model?: string;
  url?: string;
  apiKeyHeader?: string;
  apiKeyEnv?: string;
  proxy?: string;
  [key: string]: unknown;
}

interface TranslationConfig {
  engines: Engine[];
  [key: string]: unknown;
}

interface SecurityConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
  proxy?: string;
  [key: string]: unknown;
}

export default function SettingsPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'translation' | 'security' | 'authorization' | 'search'>('translation');
  const [config, setConfig] = useState<TranslationConfig>({ engines: [] });
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    provider: 'openai',
    model: 'gpt-4',
    api_key: '',
  });
  const [searchEngine, setSearchEngine] = useState('auto');
  const [useGpu, setUseGpu] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<number, { success: boolean; result?: string; error?: string; loading: boolean }>
  >({});
  const [securityTestResult, setSecurityTestResult] = useState<{
    success: boolean;
    result?: string;
    error?: string;
    loading: boolean;
  } | null>(null);

  // API Key State
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadConfig(), loadSecurityConfig(), loadApiKeys(), loadSearchEngineConfig()]).finally(() =>
      setLoading(false),
    );
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api.getTranslationConfig();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadSecurityConfig = async () => {
    try {
      const data = await api.getSecurityConfig();
      setSecurityConfig(data);
    } catch (error) {
      console.error('Failed to load security config:', error);
    }
  };

  const loadSearchEngineConfig = async () => {
    try {
      const data = await api.getSearchEngineConfig();
      setSearchEngine(data.engine || 'auto');
      setUseGpu(!!data.use_gpu);
    } catch (error) {
      console.error('Failed to load search engine config:', error);
    }
  };

  const loadApiKeys = async () => {
    try {
      const data = await api.listApiKeys();
      setApiKeys(data);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const newKey = await api.createApiKey(newKeyName);
      setGeneratedKey(newKey.key);
      setNewKeyName('');
      loadApiKeys();
      showToast(t('settings.key_generated'), 'success');
    } catch (error) {
      showToast(t('settings.generate_failed'), 'error');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm(t('settings.delete_confirm'))) return;
    try {
      await api.deleteApiKey(id);
      loadApiKeys();
      showToast(t('settings.key_deleted'), 'success');
    } catch (error) {
      showToast(t('settings.delete_failed'), 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t('settings.key_copied'), 'success');
  };

  const handleProviderChange = (provider: string) => {
    const defaults: Record<string, { url: string; model: string }> = {
      openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o' },
      deepseek: { url: 'https://api.deepseek.com', model: 'deepseek-chat' },
      siliconflow: { url: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
      groq: { url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
      openrouter: { url: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.0-flash-001' },
      gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-pro',
      },
      ollama: { url: 'http://localhost:11434', model: 'llama3' },
      qwen: {
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-turbo',
      },
      mistral: { url: 'https://api.mistral.ai/v1', model: 'mistral-medium' },
      anthropic: {
        url: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-5-sonnet-latest',
      },
      xai: { url: 'https://api.x.ai/v1', model: 'grok-2-latest' },
      azure: {
        url: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-02-15-preview',
        model: 'gpt-4',
      },
      custom: { url: '', model: '' },
    };

    const config = defaults[provider];
    setSecurityConfig({
      ...securityConfig,
      provider,
      base_url: config?.url || '',
      model: config?.model || securityConfig.model,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateTranslationConfig(config);
      showToast(t('settings.save_success'), 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast(t('settings.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecurity = async () => {
    setSavingSecurity(true);
    try {
      await api.updateSecurityConfig(securityConfig);
      showToast(t('settings.save_success'), 'success');
    } catch (error) {
      console.error('Failed to save security settings:', error);
      showToast(t('settings.save_failed'), 'error');
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleSaveSearch = async () => {
    setSavingSearch(true);
    try {
      await api.updateSearchEngineConfig({ engine: searchEngine, use_gpu: useGpu });
      showToast(t('settings.save_success'), 'success');
    } catch (error) {
      console.error('Failed to save search engine settings:', error);
      showToast(t('settings.save_failed'), 'error');
    } finally {
      setSavingSearch(false);
    }
  };

  const handleAddEngine = () => {
    setConfig({
      ...config,
      engines: [
        ...config.engines,
        { type: 'http', url: '', apiKeyHeader: 'X-API-KEY', apiKeyEnv: '' },
      ],
    });
  };

  const handleRemoveEngine = (index: number) => {
    const newEngines = [...config.engines];
    newEngines.splice(index, 1);
    setConfig({ ...config, engines: newEngines });
  };

  const updateEngine = (index: number, field: keyof Engine, value: string) => {
    const newEngines = [...config.engines];
    newEngines[index] = { ...newEngines[index], [field]: value };
    setConfig({ ...config, engines: newEngines });
  };

  const updateEngineProvider = (index: number, provider: string) => {
    const defaults: Record<string, { url: string; model: string }> = {
      openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o' },
      deepseek: { url: 'https://api.deepseek.com', model: 'deepseek-chat' },
      siliconflow: { url: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
      groq: { url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
      openrouter: { url: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.0-flash-001' },
      gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-pro',
      },
      ollama: { url: 'http://localhost:11434', model: 'llama3' },
      qwen: {
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-turbo',
      },
      mistral: { url: 'https://api.mistral.ai/v1', model: 'mistral-medium' },
      anthropic: {
        url: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-5-sonnet-latest',
      },
      xai: { url: 'https://api.x.ai/v1', model: 'grok-2-latest' },
      azure: {
        url: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-02-15-preview',
        model: 'gpt-4',
      },
      custom: { url: '', model: '' },
    };

    const d = defaults[provider];
    const newEngines = [...config.engines];
    newEngines[index] = {
      ...newEngines[index],
      provider,
      url: d?.url || '',
      model: d?.model || newEngines[index].model,
    };
    setConfig({ ...config, engines: newEngines });
  };

  const handleTestSecurity = async () => {
    setSecurityTestResult({ loading: true, success: false });

    try {
      const data = await api.testSecurityConfig(securityConfig);
      setSecurityTestResult({
        loading: false,
        success: true,
        result: data.result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSecurityTestResult({
        loading: false,
        success: false,
        error: errorMessage,
      });
    }
  };

  const testEngine = async (index: number) => {
    setTestResults({
      ...testResults,
      [index]: { loading: true, success: false },
    });

    try {
      const data = await api.testTranslationEngine(config.engines[index]);
      setTestResults({
        ...testResults,
        [index]: { loading: false, success: true, result: data.result },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestResults({
        ...testResults,
        [index]: { loading: false, success: false, error: errorMessage },
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'translation' as const,
      label: t('settings.translation_tab'),
      icon: <Languages size={20} className="text-[#4a90e2]" />,
    },
    {
      id: 'security' as const,
      label: t('settings.security_tab'),
      icon: <ShieldCheck size={20} className="text-[#52c41a]" />,
    },
    {
      id: 'search' as const,
      label: '搜索与匹配',
      icon: <Brain size={20} className="text-[#8b5cf6]" />,
    },
    {
      id: 'authorization' as const,
      label: t('settings.authorization_tab'),
      icon: <Lock size={20} className="text-[#f5a623]" />,
    },
  ];

  const mcpEndpoint =
    typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp';

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
        {/* Container with rounded corners and border */}
        <div className="bg-card rounded-2xl border border-border shadow-sm flex min-h-[800px] overflow-hidden">
          
          {/* Sidebar Navigation */}
          <aside className="w-64 border-r border-border shrink-0 pt-6 bg-card/50">
            <div className="px-6 mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('settings.title')}</h1>
            </div>

            <nav className="flex flex-col">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-6 py-4 text-[15px] font-medium transition-all group relative',
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {/* Active Indicator Bar */}
                  {activeTab === tab.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  )}
                  
                  <span className="shrink-0">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content Area */}
          <div className="flex-1 p-10 bg-card overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'security' && (
                <motion.section
                  key="security"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-8"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">{t('settings.security.title')}</h2>
                    <p className="text-muted-foreground text-[15px] mb-8">{t('settings.security.desc')}</p>
                  </div>

                  <div className="space-y-8">
                    {/* Model Provider Section */}
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold text-foreground">{t('settings.security.provider')}</h3>
                      <div className="flex flex-col gap-6">
                        <select
                          value={securityConfig.provider}
                          onChange={(e) => handleProviderChange(e.target.value)}
                          className="w-full h-[48px] px-4 rounded-xl border border-input bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                        >
                          <option value="openai">OpenAI</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="anthropic">Anthropic Claude</option>
                          <option value="gemini">Google Gemini</option>
                          <option value="xai">X.AI (Grok)</option>
                          <option value="siliconflow">SiliconFlow</option>
                          <option value="groq">Groq</option>
                          <option value="qwen">Aliyun Qwen</option>
                          <option value="mistral">Mistral AI</option>
                          <option value="openrouter">OpenRouter</option>
                          <option value="azure">Azure OpenAI</option>
                          <option value="ollama">Ollama (Local)</option>
                          <option value="custom">Custom (OpenAI Compatible)</option>
                        </select>

                        <div className="p-4 bg-accent/50 rounded-lg border border-border flex items-start gap-3">
                          <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            已为您预设大多数供应商 URL，只有使用本地或私有服务器时才需手动输入。
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Model Parameters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2">
                        <label className="text-[14px] font-semibold text-card-foreground/80">
                          模型名称 (MODEL ID)
                        </label>
                        <input
                          type="text"
                          value={securityConfig.model}
                          onChange={(e) => setSecurityConfig({ ...securityConfig, model: e.target.value })}
                          className="w-full h-[48px] px-4 rounded-xl border border-input bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                          placeholder="gpt-4-turbo"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[14px] font-semibold text-card-foreground/80">
                          API KEY (部分本地服务可选)
                        </label>
                        <input
                          type="password"
                          value={securityConfig.api_key}
                          onChange={(e) => setSecurityConfig({ ...securityConfig, api_key: e.target.value })}
                          className="w-full h-[48px] px-4 rounded-xl border border-input bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                          placeholder="sk-..."
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[14px] font-semibold text-card-foreground/80">
                          基础 URL (BASE URL)
                        </label>
                        <input
                          type="text"
                          value={securityConfig.base_url || ''}
                          onChange={(e) => setSecurityConfig({ ...securityConfig, base_url: e.target.value })}
                          className="w-full h-[48px] px-4 rounded-xl border border-input bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono shadow-sm"
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[14px] font-semibold text-card-foreground/80">
                          代理 URL (PROXY URL)
                        </label>
                        <input
                          type="text"
                          value={securityConfig.proxy || ''}
                          onChange={(e) => setSecurityConfig({ ...securityConfig, proxy: e.target.value })}
                          className="w-full h-[48px] px-4 rounded-xl border border-input bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono shadow-sm"
                          placeholder="http://127.0.0.1:7890"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        onClick={handleTestSecurity}
                        disabled={securityTestResult?.loading}
                        className="h-[48px] px-8 py-2.5 bg-background border border-input text-foreground rounded-xl hover:bg-accent transition-all font-bold disabled:opacity-50 shadow-sm active:scale-95"
                      >
                         {securityTestResult?.loading ? (
                          <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        ) : null}
                        测试连接
                      </button>
                      <button
                        onClick={handleSaveSecurity}
                        disabled={savingSecurity}
                        className="h-[48px] px-8 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50 font-bold"
                      >
                         {savingSecurity ? (
                          <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        ) : (
                          <Save className="w-4 h-4 inline-block mr-2" />
                        )}
                        {t('settings.engine.save')}
                      </button>
                    </div>

                    {/* Test Results */}
                    <AnimatePresence>
                      {securityTestResult && !securityTestResult.loading && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={cn(
                            'border rounded-xl p-5 shadow-inner',
                            securityTestResult.success
                              ? 'bg-green-500/10 border-green-500/20'
                              : 'bg-red-500/10 border-red-500/20',
                          )}
                        >
                          <div className="flex gap-4">
                            <div className={cn(
                              "p-2 rounded-full shrink-0",
                              securityTestResult.success ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"
                            )}>
                              {securityTestResult.success ? (
                                <CheckCircle2 className="w-6 h-6" />
                              ) : (
                                <AlertCircle className="w-6 h-6" />
                              )}
                            </div>
                            <div className="space-y-3 w-full min-w-0">
                              <p className={cn('font-bold text-base', securityTestResult.success ? 'text-green-600' : 'text-red-600')}>
                                {securityTestResult.success ? '测试成功' : '测试失败'}
                              </p>
                              <div className="p-4 bg-background/50 border border-border rounded-lg text-xs font-mono break-all whitespace-pre-wrap">
                                {securityTestResult.success ? securityTestResult.result : securityTestResult.error}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Quick Experience Section (Bonus Style) */}
                    <div className="pt-10">
                      <div className="flex items-center gap-2 mb-6 text-foreground">
                        <span className="text-xl">🎁</span>
                        <h3 className="text-lg font-bold">快速体验：免费模型资源</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-8">
                        如果暂时没有 API 密钥，可以参考以下厂商提供的免费额度或永久免费计划。
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { name: 'DeepSeek', desc: '新用户赠送 500-1000万 Token，极度超值。', tag: 'Recommended', color: 'bg-blue-500/10 text-blue-500' },
                          { name: 'Aliyun Qwen', desc: '通义千问新用户系统赠送 100-200万 Token。', tag: 'Stable', color: 'bg-green-500/10 text-green-500' },
                          { name: 'Tencent Hunyuan', desc: 'Hunyuan-lite 永久免费；云原生输出 1亿额度。', tag: 'Lite Free', color: 'bg-cyan-500/10 text-cyan-500' },
                          { name: 'Zhipu GLM', desc: 'GLM-4-Flash 模型永久免费，指令遵循极快。', tag: 'Flash Free', color: 'bg-orange-500/10 text-orange-500' },
                          { name: 'Google Gemini', desc: '实时免费配额 (Rate Limit)，适合常规使用。', tag: 'Global', color: 'bg-violet-500/10 text-violet-500' },
                          { name: 'Groq', desc: '极速推理，云端部分机型免费额度。', tag: 'Speed', color: 'bg-rose-500/10 text-rose-500' },
                        ].map((item) => (
                          <div key={item.name} className="p-5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-md transition-all group">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-foreground">{item.name}</h4>
                              <span className={cn("text-[10px] px-2 py-0.5 rounded font-bold uppercase", item.color)}>
                                {item.tag}
                              </span>
                            </div>
                            <p className="text-[12px] text-muted-foreground mb-4 h-10 overflow-hidden">{item.desc}</p>
                            <div className="flex items-center gap-2">
                              <button className="flex-1 h-9 bg-primary text-primary-foreground text-[13px] font-semibold rounded-lg hover:bg-primary/90 transition-all opacity-0 group-hover:opacity-100">
                                一键配置
                              </button>
                              <button className="h-9 px-3 bg-secondary text-secondary-foreground text-[13px] rounded-lg">获取密钥</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}

              {activeTab === 'translation' && (
                <motion.section
                  key="translation"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-8"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">{t('settings.translation.title')}</h2>
                    <p className="text-muted-foreground text-[15px] mb-8">{t('settings.translation.desc')}</p>
                  </div>
                  
                  <div className="space-y-6">
                    {config.engines.map((engine, index) => (
                      <div key={index} className="p-8 bg-card border border-border rounded-2xl shadow-sm space-y-6 relative overflow-hidden group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 flex items-center justify-center bg-primary/10 text-primary rounded-full">
                              <Globe size={20} />
                            </div>
                            <h3 className="font-bold text-lg text-foreground">{t('settings.engine.title')} #{index + 1}</h3>
                          </div>
                          <button onClick={() => handleRemoveEngine(index)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 size={20} />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-2">
                             <label className="text-sm font-semibold text-card-foreground/80">{t('settings.engine.type')}</label>
                             <select
                                value={engine.type}
                                onChange={(e) => updateEngine(index, 'type', e.target.value)}
                                className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                              >
                                <option value="http">HTTP API</option>
                                <option value="llm">LLM Translation</option>
                                <option value="google-free">{t('settings.engine.google_free')}</option>
                                <option value="bing-free">{t('settings.engine.bing_free')}</option>
                                <option value="internal">Internal Fallback</option>
                              </select>
                           </div>

                           {engine.type === 'llm' && (
                             <>
                               <div className="space-y-2">
                                 <label className="text-sm font-semibold text-card-foreground/80">{t('settings.security.provider')}</label>
                                 <select
                                   value={engine.provider || 'openai'}
                                   onChange={(e) => updateEngineProvider(index, e.target.value)}
                                   className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                 >
                                    <option value="openai">OpenAI</option>
                                    <option value="deepseek">DeepSeek</option>
                                    <option value="qwen">Aliyun Qwen</option>
                                    <option value="anthropic">Anthropic Claude</option>
                                    <option value="gemini">Google Gemini</option>
                                    <option value="xai">X.AI (Grok)</option>
                                    <option value="siliconflow">SiliconFlow</option>
                                    <option value="groq">Groq</option>
                                    <option value="mistral">Mistral AI</option>
                                    <option value="openrouter">OpenRouter</option>
                                    <option value="azure">Azure OpenAI</option>
                                    <option value="ollama">Ollama (Local)</option>
                                    <option value="custom">Custom</option>
                                 </select>
                               </div>

                               <div className="space-y-2">
                                 <label className="text-sm font-semibold text-card-foreground/80">模型名称 (MODEL ID)</label>
                                 <input
                                   type="text"
                                   value={engine.model || ''}
                                   onChange={(e) => updateEngine(index, 'model', e.target.value)}
                                   className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                   placeholder="gpt-4"
                                 />
                               </div>

                               <div className="space-y-2">
                                 <label className="text-sm font-semibold text-card-foreground/80">基础 URL (BASE URL)</label>
                                 <input
                                   type="text"
                                   value={engine.url || ''}
                                   onChange={(e) => updateEngine(index, 'url', e.target.value)}
                                   className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono shadow-sm"
                                   placeholder="https://api.openai.com/v1"
                                 />
                               </div>

                               <div className="space-y-2">
                                 <label className="text-sm font-semibold text-card-foreground/80">API TOKEN / KEY</label>
                                 <input
                                   type="password"
                                   value={engine.apiKeyEnv || ''}
                                   onChange={(e) => updateEngine(index, 'apiKeyEnv', e.target.value)}
                                   className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                   placeholder="sk-..."
                                 />
                               </div>

                               <div className="space-y-2">
                                 <label className="text-sm font-semibold text-card-foreground/80">代理 URL (PROXY URL)</label>
                                 <input
                                   type="text"
                                   value={engine.proxy || ''}
                                   onChange={(e) => updateEngine(index, 'proxy', e.target.value)}
                                   className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono shadow-sm"
                                   placeholder="http://127.0.0.1:7890"
                                 />
                               </div>
                             </>
                           )}

                           {engine.type === 'http' && (
                             <div className="space-y-2">
                               <label className="text-sm font-semibold text-card-foreground/80">{t('settings.engine.url')}</label>
                               <input
                                 type="text"
                                 value={engine.url || ''}
                                 onChange={(e) => updateEngine(index, 'url', e.target.value)}
                                 className="w-full h-11 px-4 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                 placeholder="https://..."
                               />
                             </div>
                           )}
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                           <button 
                             onClick={() => testEngine(index)} 
                             disabled={testResults[index]?.loading}
                             className="px-6 h-10 border border-input rounded-xl text-sm font-bold bg-background hover:bg-accent text-foreground disabled:opacity-50 transition-all active:scale-95 shadow-sm"
                           >
                             {testResults[index]?.loading ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> : null}
                             测试引擎
                           </button>
                        </div>

                        {testResults[index] && !testResults[index].loading && (
                          <div className={cn(
                            "mt-4 p-4 rounded-lg text-xs font-mono break-all whitespace-pre-wrap flex gap-3",
                            testResults[index].success ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-red-500/10 text-red-600 border border-red-500/20"
                          )}>
                            <div className="shrink-0 pt-0.5">
                              {testResults[index].success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                            </div>
                            <div className="space-y-1">
                              <div className="font-bold">{testResults[index].success ? 'Success' : 'Failed'}</div>
                              <div>{testResults[index].success ? testResults[index].result : testResults[index].error}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    <button onClick={handleAddEngine} className="w-full py-8 border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-2 text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all">
                      <Plus size={24} />
                      <span className="text-sm font-bold uppercase tracking-widest">{t('settings.engine.add')}</span>
                    </button>
                    
                    <div className="flex justify-end pt-4">
                      <button onClick={handleSave} className="h-12 px-10 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:bg-primary/90 active:scale-95 transition-all">
                        保存所有配置
                      </button>
                    </div>
                  </div>
                </motion.section>
              )}

              {activeTab === 'search' && (
                <motion.section
                  key="search"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-8"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">搜索与匹配设置</h2>
                    <p className="text-muted-foreground text-[15px] mb-8">配置全局技能搜索引擎模式。切换模式将影响所有用户的默认检索行为。</p>
                  </div>

                  <div className="bg-card border border-border rounded-2xl p-8 space-y-8 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        { id: 'auto', label: '智能推荐 (系统决定)', desc: '最省心的选择。系统会自动判断你的话是想搜关键词还是搜大概意思，然后选最准的方式。' },
                        { id: 'tfidf', label: '文字匹配 (找关键词)', desc: '最原始但也最快的方式。如果你知道插件或工具的确切名字，用这个准没错。' },
                        { id: 'sbert', label: '语义搜索 (懂你意思)', desc: '最聪明的搜索。它能听懂你说话的意思，哪怕你搜的是中文也能找到英文写的工具。' },
                        { id: 'hybrid', label: '全能搜索 (综合匹配)', desc: '全都要。把文字匹配和意思匹配结合起来，虽然稍微慢一点，但能搜得最全。' },
                        { id: 'tfidf', label: '关键词模式 (TF-IDF)', desc: '基于精确词频匹配，速度最快，适合查找特定名称' },
                        { id: 'sbert', label: '语义模式 (SBERT)', desc: '理解搜索意图，支持跨语言和近义词匹配' },
                        { id: 'hybrid', label: '混合模式 (Hybrid)', desc: '结合关键词与语义，提供最平衡的检索效果' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setSearchEngine(mode.id)}
                          className={cn(
                            'flex flex-col text-left p-6 rounded-xl border-2 transition-all',
                            searchEngine === mode.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border hover:border-border/80 hover:bg-accent/30',
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-foreground">{mode.label}</span>
                            {searchEngine === mode.id && <CheckCircle2 size={18} className="text-primary" />}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{mode.desc}</p>
                        </button>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-border">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={useGpu}
                          onChange={(e) => setUseGpu(e.target.checked)}
                          className="w-4 h-4 rounded border border-input bg-background"
                        />
                        <div>
                          <div className="font-bold text-foreground">在服务器上启用 GPU（用于 SBERT 编码与 Faiss GPU）</div>
                          <div className="text-xs text-muted-foreground">启用后，系统将在后端尝试使用 GPU 加速编码与索引迁移；需后端支持并可能需要重启服务。</div>
                        </div>
                      </label>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-border">
                      <button
                        onClick={handleSaveSearch}
                        disabled={savingSearch}
                        className="h-12 px-10 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2"
                      >
                        {savingSearch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={18} />}
                        保存搜索配置
                      </button>
                    </div>
                  </div>
                </motion.section>
              )}

              {activeTab === 'authorization' && (
                <motion.section
                  key="authorization"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-8"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">{t('settings.auth_title')}</h2>
                    <p className="text-muted-foreground text-[15px] mb-8">{t('settings.auth_subtitle')}</p>
                  </div>

                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-8 space-y-6">
                    <div className="flex items-center gap-3 text-foreground">
                      <Terminal size={24} className="text-primary" />
                      <h3 className="text-lg font-bold">{t('settings.mcp_endpoint')}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <code className="flex-1 bg-background border border-border rounded-xl px-4 py-3 font-mono text-sm overflow-x-auto whitespace-nowrap">
                        {mcpEndpoint}
                      </code>
                      <button onClick={() => copyToClipboard(mcpEndpoint)} className="p-3 bg-primary text-primary-foreground rounded-xl shadow-sm hover:scale-105 transition-all">
                        <Copy size={20} />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('settings.mcp_help')}
                    </p>
                  </div>

                  {/* API Key Table and Generation UI */}
                  <div className="space-y-6 pt-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-foreground">{t('settings.api_keys')}</h3>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder={t('settings.key_name')}
                          className="h-10 px-4 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                        />
                        <button 
                          onClick={handleCreateKey} 
                          disabled={creatingKey || !newKeyName.trim()}
                          className="h-10 px-6 bg-foreground text-background rounded-xl text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shadow-md active:scale-95"
                        >
                          {creatingKey ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                          {t('settings.generate_key')}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {generatedKey && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 relative overflow-hidden group shadow-sm mb-6"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <h4 className="font-bold text-green-600 flex items-center gap-2">
                                <CheckCircle2 size={18} />
                                {t('settings.key_generated')}
                              </h4>
                              <p className="text-sm text-green-600/80">
                                请立即复制存放在安全位置，该密钥之后将无法再次查看。
                              </p>
                              <div className="mt-4 flex items-center gap-2">
                                <code className="bg-background px-4 py-2 rounded-lg border border-green-500/20 font-mono text-lg text-green-600 select-all">
                                  {generatedKey}
                                </code>
                                <button 
                                  onClick={() => copyToClipboard(generatedKey)}
                                  className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all shadow-sm"
                                >
                                  <Copy size={18} />
                                </button>
                              </div>
                            </div>
                            <button 
                              onClick={() => setGeneratedKey(null)}
                              className="p-2 text-green-600/50 hover:text-green-600 transition-colors"
                            >
                              <X size={20} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                       <table className="w-full text-left">
                         <thead className="bg-accent/50 border-b border-border">
                           <tr className="text-muted-foreground text-[13px] font-bold uppercase tracking-wider">
                             <th className="px-6 py-4">{t('settings.key_name')}</th>
                             <th className="px-6 py-4">Prefix</th>
                             <th className="px-6 py-4">{t('settings.last_used')}</th>
                             <th className="px-6 py-4 text-right">{t('settings.actions')}</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-border">
                           {apiKeys.length === 0 ? (
                             <tr>
                               <td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">
                                 {t('settings.no_keys')}
                               </td>
                             </tr>
                           ) : (
                             apiKeys.map((key) => (
                               <tr key={key.id} className="hover:bg-accent/30 transition-colors">
                                 <td className="px-6 py-4 font-bold text-foreground">{key.name}</td>
                                 <td className="px-6 py-4 font-mono text-sm text-muted-foreground">{key.key.substring(0, 8)}****</td>
                                 <td className="px-6 py-4 text-sm text-muted-foreground">
                                   {key.lastUsed ? new Date(key.lastUsed).toLocaleString() : t('settings.never')}
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                   <button onClick={() => handleDeleteKey(key.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                                     <Trash2 size={18} />
                                   </button>
                                 </td>
                               </tr>
                             ))
                           )}
                         </tbody>
                       </table>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
