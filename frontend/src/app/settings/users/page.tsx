'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { ArrowLeft, Loader2, Plus, Trash2, Edit2, Search, Check, X } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  enabled: boolean;
  status?: 'PENDING' | 'ACTIVE' | 'DISABLED';
  createdAt?: string;
}

export default function UsersPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(t('users.load_failed'), error);
      showToast(t('users.load_failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user?: AdminUser) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        password: '',
        role: user.role,
        enabled: user.enabled,
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        role: 'user',
        enabled: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSave = async () => {
    if (!formData.username) {
      showToast(t('users.user_required'), 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const payload: any = {
          username: formData.username,
          role: formData.role,
          enabled: formData.enabled,
        };
        if (formData.password) {
          payload.password = formData.password;
        }
        await api.updateUser(editingUser.id, payload);
        showToast(t('users.update_success'), 'success');
      } else {
        if (!formData.password) {
          showToast(t('users.password_required'), 'error');
          setSaving(false);
          return;
        }
        await api.createUser(formData);
        showToast(t('users.create_success'), 'success');
      }
      handleCloseModal();
      loadUsers();
    } catch (error) {
      console.error(t('users.save_failed'), error);
      showToast(t('users.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('users.delete_confirm'))) return;

    try {
      await api.deleteUser(id);
      showToast(t('users.delete_success'), 'success');
      loadUsers();
    } catch (error) {
      console.error(t('users.delete_failed'), error);
      showToast(t('users.delete_failed'), 'error');
    }
  };

  const handleApprove = async (user: AdminUser) => {
    if (!confirm(t('users.approve_confirm'))) return;

    try {
      // Assuming backend handles status update via patch/put
      // @ts-ignore - status field is added
      await api.updateUser(user.id, { status: 'ACTIVE', enabled: true });
      showToast(t('users.approve_success'), 'success');
      loadUsers();
    } catch (error) {
      console.error(t('users.approve_failed'), error);
      showToast(t('users.approve_failed'), 'error');
    }
  };

  const handleReject = async (user: AdminUser) => {
    if (!confirm(t('users.reject_confirm'))) return;

    try {
      // @ts-ignore - status field is added
      await api.updateUser(user.id, { status: 'DISABLED', enabled: false });
      showToast(t('users.reject_success'), 'success');
      loadUsers();
    } catch (error) {
      console.error(t('users.reject_failed'), error);
      showToast(t('users.reject_failed'), 'error');
    }
  };


  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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
          <SettingsSidebar activeTab="users" />

          <div className="flex-1 p-10 bg-card overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">{t('users.title')}</h2>
                <p className="text-muted-foreground text-[15px]">{t('users.subtitle')}</p>
              </div>
              <button
                onClick={() => handleOpenModal()}
                className="h-10 px-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm active:scale-95"
              >
                <Plus size={18} />
                {t('users.add_user')}
              </button>
            </div>

            {/* Search Bar */}
            <div className="mb-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                placeholder={t('users.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {/* Users Table */}
            <div className="border border-border rounded-xl overflow-hidden bg-background/50">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                  <tr>
                    <th className="px-6 py-4">{t('users.username')}</th>
                    <th className="px-6 py-4">{t('users.role')}</th>
                    <th className="px-6 py-4">{t('users.status')}</th>
                    <th className="px-6 py-4 text-right">{t('users.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        {t('users.loading')}
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        {t('users.no_found')}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                              {user.username.substring(0, 2)}
                            </div>
                            {user.username}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'px-2 py-1 rounded-md text-xs font-bold border',
                              user.role === 'admin'
                                ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                            )}
                          >
                            {user.role === 'admin' ? t('users.role_admin') : t('users.role_user')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {user.status === 'PENDING' ? (
                            <span className="flex items-center gap-1.5 text-orange-600 text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-orange-500" />
                              {t('users.status_pending')}
                            </span>
                          ) : (user.status === 'ACTIVE' || user.enabled) ? (
                            <span className="flex items-center gap-1.5 text-green-600 text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              {t('users.status_active')}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-gray-400" />
                              {t('users.status_disabled')}
                            </span>
                          )}
                        </td>
                          {user.enabled ? (
                            <span className="flex items-center gap-1.5 text-green-600 text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              {t('users.active')}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-gray-400" />
                              {t('users.disabled')}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {user.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleApprove(user)}
                                  className="p-2 hover:bg-green-500/10 rounded-lg text-muted-foreground hover:text-green-600 transition-colors"
                                  title={t('users.approve')}
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => handleReject(user)}
                                  className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-600 transition-colors"
                                  title={t('users.reject')}
                                >
                                  <X size={16} />
                                </button>
                                <div className="w-px h-4 bg-border mx-1" />
                              </>
                            )}
                            <button
                              onClick={() => handleOpenModal(user)}
                              className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenModal(user)}
                              className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card w-full max-w-md rounded-2xl border border-border shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">
                  {editingUser ? t('users.edit_user') : t('users.add_new_user')}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    {t('users.username')}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder={t('users.username')}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    {t('users.password')}{' '}
                    {editingUser && (
                      <span className="text-xs text-muted-foreground font-normal">
                        {t('users.password_hint')}
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder={editingUser ? '••••••••' : t('users.enter_password')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      {t('users.role')}
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })
                      }
                      className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="user">{t('users.role_user')}</option>
                      <option value="admin">{t('users.role_admin')}</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      {t('users.status')}
                    </label>
                    <div className="flex items-center h-10 gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={formData.enabled}
                          onChange={() => setFormData({ ...formData, enabled: true })}
                          className="w-4 h-4 text-primary"
                        />
                        <span className="text-sm">{t('users.active')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={!formData.enabled}
                          onChange={() => setFormData({ ...formData, enabled: false })}
                          className="w-4 h-4 text-primary"
                        />
                        <span className="text-sm">{t('users.disabled')}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-muted/30 border-t border-border flex justify-end gap-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {t('users.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('users.save_changes')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
