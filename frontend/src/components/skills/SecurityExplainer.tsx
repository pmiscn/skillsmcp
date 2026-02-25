import React from 'react';
import { Shield, Lock, Fingerprint, Sparkles, Cpu, Activity, Terminal, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/context/LanguageContext';

export const SecurityExplainer: React.FC = () => {
  const { t: translate } = useLanguage();
  const t = {
    title: translate('security.explainer.title'),
    subtitle: translate('security.explainer.subtitle'),
    dimensions: [
      {
        id: 'permissions',
        name: translate('security.dimensions.permissions'),
        icon: <Lock className="text-red-500" size={18} />,
        desc: translate('detail.deductions.permissions_detail'),
      },
      {
        id: 'trust',
        name: translate('security.dimensions.trust'),
        icon: <Fingerprint className="text-blue-500" size={18} />,
        desc: translate('detail.deductions.trust_detail'),
      },
      {
        id: 'ai_risk',
        name: translate('security.dimensions.ai_risk'),
        icon: <Sparkles className="text-amber-500" size={18} />,
        desc: translate('detail.deductions.ai_risk_detail'),
      },
      {
        id: 'runtime',
        name: translate('security.dimensions.runtime'),
        icon: <Cpu className="text-purple-500" size={18} />,
        desc: translate('detail.deductions.runtime_detail'),
      },
      {
        id: 'reputation',
        name: translate('security.dimensions.reputation'),
        icon: <Activity className="text-green-500" size={18} />,
        desc: translate('detail.deductions.reputation_detail'),
      },
      {
        id: 'metadata',
        name: translate('security.dimensions.metadata'),
        icon: <Terminal className="text-neutral-500" size={18} />,
        desc: translate('detail.deductions.metadata_detail'),
      },
    ],
    disclaimer: translate('security.explainer.disclaimer'),
  };

  return (
    <section className="mt-16 pt-12 border-t border-neutral-200 dark:border-neutral-800 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <Shield size={20} />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-neutral-900 dark:text-white">
            {t.title}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
        {t.dimensions.map((dim, idx) => (
          <motion.div
            key={dim.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center border border-neutral-100 dark:border-neutral-700 group-hover:scale-110 transition-transform">
                {dim.icon}
              </div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">{dim.name}</h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {dim.desc}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800 flex items-center gap-3 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase italic">
        <Info size={14} />
        {t.disclaimer}
      </div>
    </section>
  );
};
