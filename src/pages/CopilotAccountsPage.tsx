import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  LayoutGrid,
  List,
  ArrowDownWideNarrow,
  Tag,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  Play,
  X,
  Info
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCopilotAccountStore } from '../stores/useCopilotAccountStore';
import * as copilotService from '../services/copilotService';
import { TagEditModal } from '../components/TagEditModal';
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog';

function getUsedQuotaClass(percentage: number): string {
  if (percentage >= 80) return 'critical';
  if (percentage >= 60) return 'low';
  if (percentage >= 30) return 'medium';
  return 'high';
}

export function CopilotAccountsPage() {
  const { t } = useTranslation();
  const {
    accounts,
    currentAccount,
    loading,
    fetchAccounts,
    fetchCurrentAccount,
    addAccount,
    refreshQuota,
    refreshAllQuotas,
    switchAccount,
    deleteAccount
  } = useCopilotAccountStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'device' | 'token'>('device');
  const [tokenInput, setTokenInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [planInput, setPlanInput] = useState('Pro');
  const [saving, setSaving] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'last_used' | 'used_asc' | 'used_desc' | 'remaining'>('last_used');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTagModal, setShowTagModal] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const tagFilterRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState<{ text: string; tone?: 'error' } | null>(null);

  const [_deviceCode, setDeviceCode] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [verifyUrlComplete, setVerifyUrlComplete] = useState<string | null>(null);
  const [deviceInterval, setDeviceInterval] = useState<number>(5);
  const [deviceExpiresAt, setDeviceExpiresAt] = useState<number | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(() => localStorage.getItem('copilotDeviceClientId') || '');
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    fetchAccounts();
    fetchCurrentAccount();
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showTagFilter) return;
    const handleClick = (event: MouseEvent) => {
      if (!tagFilterRef.current) return;
      if (!tagFilterRef.current.contains(event.target as Node)) {
        setShowTagFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTagFilter]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    accounts.forEach((account) => {
      (account.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = [...accounts];
    if (q) {
      result = result.filter((account) => {
        return (
          account.username.toLowerCase().includes(q) ||
          (account.email ? account.email.toLowerCase().includes(q) : false)
        );
      });
    }
    if (tagFilter.length > 0) {
      result = result.filter((account) => {
        const tags = account.tags || [];
        return tagFilter.every((tag) => tags.includes(tag));
      });
    }
    return result;
  }, [accounts, searchQuery, tagFilter]);

  const sortedAccounts = useMemo(() => {
    const result = [...filteredAccounts];
    if (sortBy === 'last_used') {
      result.sort((a, b) => b.last_used - a.last_used);
      return result;
    }
    if (sortBy === 'used_asc') {
      result.sort((a, b) => (a.quota?.used_requests ?? 0) - (b.quota?.used_requests ?? 0));
      return result;
    }
    if (sortBy === 'used_desc') {
      result.sort((a, b) => (b.quota?.used_requests ?? 0) - (a.quota?.used_requests ?? 0));
      return result;
    }
    if (sortBy === 'remaining') {
      result.sort((a, b) => (b.quota?.remaining_requests ?? 0) - (a.quota?.remaining_requests ?? 0));
      return result;
    }
    return result;
  }, [filteredAccounts, sortBy]);

  const openAddModal = (mode: 'device' | 'token') => {
    setAddMode(mode);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setDeviceStatus('idle');
    setDeviceMessage(null);
    setDeviceCode(null);
    setUserCode(null);
    setVerifyUrl(null);
    setVerifyUrlComplete(null);
    setDeviceExpiresAt(null);
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const runBusy = async (accountId: string, runner: () => Promise<void>) => {
    if (busyIds.has(accountId)) return;
    setBusyIds((prev) => new Set(prev).add(accountId));
    try {
      await runner();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  const formatError = (error: unknown) => {
    const text = String(error || '');
    if (text.includes('COPILOT_PERMISSION_INTEGRATION')) {
      return t('copilot.errors.integration', '该 token 无法访问用量接口，请使用 Fine-grained PAT（Plan: Read）');
    }
    return text;
  };

  const handleAdd = async () => {
    if (!tokenInput.trim()) return;
    setSaving(true);
    try {
      const parsed = limitInput.trim() ? Number(limitInput.trim()) : undefined;
      const monthlyIncludedRequests = Number.isFinite(parsed) ? parsed : undefined;
      await addAccount(tokenInput.trim(), monthlyIncludedRequests, planInput.trim() || undefined);
      setTokenInput('');
    } catch (error) {
      setMessage({ text: formatError(error), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePrepareDevice = async () => {
    setDeviceStatus('pending');
    setDeviceMessage(null);
    try {
      if (clientIdInput.trim()) {
        localStorage.setItem('copilotDeviceClientId', clientIdInput.trim());
      }
      const resp = await copilotService.prepareCopilotDeviceCode(
        clientIdInput.trim() || undefined
      );
      setDeviceCode(resp.device_code);
      setUserCode(resp.user_code);
      setVerifyUrl(resp.verification_uri);
      setVerifyUrlComplete(resp.verification_uri_complete ?? null);
      setDeviceInterval(resp.interval || 5);
      setDeviceExpiresAt(Date.now() + resp.expires_in * 1000);
      setDeviceStatus('pending');
      schedulePolling(resp.device_code, resp.interval || 5);
    } catch (error) {
      setDeviceStatus('error');
      setDeviceMessage(formatError(error));
    }
  };

  const schedulePolling = (code: string, interval: number) => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
    }
    pollTimerRef.current = window.setTimeout(() => {
      pollDevice(code);
    }, Math.max(3, interval) * 1000);
  };

  const pollDevice = async (code: string) => {
    if (!code) return;
    if (deviceExpiresAt && Date.now() > deviceExpiresAt) {
      setDeviceStatus('error');
      setDeviceMessage(t('copilot.deviceExpired', '授权码已过期，请重新获取'));
      return;
    }
    try {
      const resp = await copilotService.pollCopilotDeviceCode(
        code,
        clientIdInput.trim() || undefined,
        limitInput.trim() ? Number(limitInput.trim()) : undefined,
        planInput.trim() || undefined
      );
      if (resp.status === 'success') {
        setDeviceStatus('success');
        setDeviceMessage(t('copilot.deviceSuccess', '授权成功，已添加账号'));
        await fetchAccounts();
        await fetchCurrentAccount();
        return;
      }
      if (resp.status === 'slow_down') {
        schedulePolling(code, deviceInterval + 5);
        return;
      }
      if (resp.status === 'pending') {
        schedulePolling(code, deviceInterval);
        return;
      }
      setDeviceStatus('error');
      setDeviceMessage(resp.message || t('copilot.deviceFailed', '授权失败'));
    } catch (error) {
      setDeviceStatus('error');
      setDeviceMessage(formatError(error));
    }
  };

  const handleCopyCode = async () => {
    if (!userCode) return;
    await navigator.clipboard.writeText(userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenVerify = async () => {
    const url = verifyUrlComplete || verifyUrl;
    if (!url) return;
    await openUrl(url);
  };

  const handleRefreshAll = async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      await refreshAllQuotas();
    } catch (error) {
      setMessage({ text: formatError(error), tone: 'error' });
    } finally {
      setRefreshingAll(false);
    }
  };

  const toggleSelect = (accountId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === sortedAccounts.length) {
        return new Set();
      }
      return new Set(sortedAccounts.map((acc) => acc.id));
    });
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    const ok = await confirmDialog(t('messages.batchDeleteConfirm', { count: selected.size }), {
      title: t('common.confirm', '确认')
    });
    if (!ok) return;
    await useCopilotAccountStore.getState().deleteAccounts(Array.from(selected));
    setSelected(new Set());
  };

  const getAccountTags = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    return account?.tags || [];
  };

  return (
    <main className="main-content">
      <div className="page-header">
        <h1>{t('copilot.title', 'Copilot 账号')}</h1>
        <p>{t('copilot.subtitle', '管理 GitHub Copilot 账号并查看本月 Premium Requests 用量')}</p>
      </div>

      <div className="action-message" style={{ marginBottom: 16 }}>
        <div className="action-message-text">
          <Info size={14} style={{ marginRight: 6 }} />
          {t('copilot.loginHint', '登录方式：设备码授权或 PAT')}
        </div>
      </div>

      <div className="codex-accounts-page copilot-accounts-page">
        {message && (
          <div className={`message-bar ${message.tone === 'error' ? 'error' : 'success'}`}>
            {message.text}
            <button onClick={() => setMessage(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder={t('copilot.search', '搜索用户名或邮箱')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="view-switcher">
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title={t('copilot.view.list', '列表视图')}
              >
                <List size={16} />
              </button>
              <button
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title={t('copilot.view.grid', '卡片视图')}
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            <div className="sort-select">
              <ArrowDownWideNarrow size={14} className="sort-icon" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label={t('copilot.sortLabel', '排序')}
              >
                <option value="last_used">{t('copilot.sort.lastUsed', '最近使用')}</option>
                <option value="used_asc">{t('copilot.sort.usedAsc', '已用升序')}</option>
                <option value="used_desc">{t('copilot.sort.usedDesc', '已用降序')}</option>
                <option value="remaining">{t('copilot.sort.remaining', '剩余最多')}</option>
              </select>
            </div>

            <div className="tag-filter" ref={tagFilterRef}>
              <button
                type="button"
                className={`tag-filter-btn ${tagFilter.length > 0 ? 'active' : ''}`}
                onClick={() => setShowTagFilter((prev) => !prev)}
                aria-label={t('copilot.filterTags', '标签筛选')}
              >
                <Tag size={14} />
                <span>{t('copilot.filterTags', '标签筛选')}</span>
              </button>

              {showTagFilter && (
                <div className="tag-filter-panel">
                  <div className="tag-filter-options">
                    {allTags.length === 0 && (
                      <div className="tag-filter-empty">{t('copilot.noAvailableTags', '暂无可用标签')}</div>
                    )}
                    {allTags.map((tag) => {
                      const selectedTag = tagFilter.includes(tag);
                      return (
                        <label key={tag} className={`tag-filter-option ${selectedTag ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedTag}
                            onChange={() => {
                              setTagFilter((prev) => {
                                if (prev.includes(tag)) {
                                  return prev.filter((item) => item !== tag);
                                }
                                return [...prev, tag];
                              });
                            }}
                          />
                          <span className="tag-filter-name">{tag}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    className="tag-filter-clear"
                    onClick={() => setTagFilter([])}
                    disabled={tagFilter.length === 0}
                  >
                    {t('copilot.clearFilter', '清空筛选')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="toolbar-right">
            <button className="btn btn-secondary" onClick={handleRefreshAll} disabled={refreshingAll}>
              <RefreshCw size={14} className={refreshingAll ? 'loading-spinner' : ''} />
              {t('common.refresh', '刷新')}
            </button>
            {selected.size > 0 && (
              <button className="btn btn-danger" onClick={handleBatchDelete}>
                <Trash2 size={14} />
                {t('common.delete', '删除')} ({selected.size})
              </button>
            )}
            <button className="btn btn-primary" onClick={() => openAddModal('device')}>
              <Plus size={14} />
              {t('copilot.addAccount', '添加 Copilot 账号')}
            </button>
          </div>
        </div>

        {viewMode === 'grid' && (
          <div className="codex-accounts-grid">
            {sortedAccounts.map((account) => {
              const busy = busyIds.has(account.id);
              const isCurrent = currentAccount?.id === account.id;
              const included = account.quota?.included_requests;
              const used = account.quota?.used_requests ?? 0;
              const remaining = account.quota?.remaining_requests ?? 0;
              const usedPct = included ? Math.min(100, Math.round((used / included) * 100)) : 0;
              const planParts = [
                account.quota?.copilot_plan,
                account.plan
              ].filter((v, idx, arr) => v && arr.indexOf(v) === idx) as string[];
              const planLabel = planParts.length > 0 ? planParts.join(' · ') : '-';
              const tags = account.tags || [];

              return (
                <div key={account.id} className={`codex-account-card ${isCurrent ? 'current' : ''}`}>
                  <div className="card-top">
                    <div className="card-select">
                      <input
                        type="checkbox"
                        checked={selected.has(account.id)}
                        onChange={() => toggleSelect(account.id)}
                      />
                    </div>
                    <span className="account-email" title={account.username}>
                      {account.username}
                    </span>
                    {account.email && (
                      <span className="account-email" title={account.email}>
                        {account.email}
                      </span>
                    )}
                    {isCurrent && <span className="current-tag">{t('copilot.current', '当前')}</span>}
                  <span className={`tier-badge ${isCurrent ? 'pro' : ''}`}>{planLabel}</span>
                  </div>

                  <div className="codex-quota-section">
                    <div className="quota-item">
                      <div className="quota-header">
                        <span className="quota-label">{t('copilot.used', '已用')}</span>
                        <span className={`quota-pct ${getUsedQuotaClass(usedPct)}`}>
                          {included ? `${used} (${usedPct}%)` : `${used}`}
                        </span>
                      </div>
                      <div className="quota-bar-track">
                        <div className={`quota-bar ${getUsedQuotaClass(usedPct)}`} style={{ width: `${usedPct}%` }} />
                      </div>
                      <div className="quota-reset">
                        {t('copilot.remaining', '剩余')} {included ? remaining : '-'}
                      </div>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div className="card-tags">
                      {tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="tag-pill">{tag}</span>
                      ))}
                      {tags.length > 3 && (
                        <span className="tag-pill more">+{tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="card-actions">
                    <button
                      className="action-btn"
                      disabled={busy}
                      onClick={() =>
                        runBusy(account.id, async () => {
                          try {
                            await refreshQuota(account.id);
                          } catch (error) {
                            setMessage({ text: formatError(error), tone: 'error' });
                          }
                        })
                      }
                      title={t('common.refresh', '刷新')}
                    >
                      <RotateCw size={14} className={busy ? 'loading-spinner' : ''} />
                    </button>
                    <button
                      className="action-btn"
                      disabled={busy}
                      onClick={() => runBusy(account.id, async () => { await switchAccount(account.id); })}
                      title={t('common.switch', '切换')}
                    >
                      <Play size={14} />
                    </button>
                    <button
                      className="action-btn"
                      disabled={busy}
                      onClick={() => setShowTagModal(account.id)}
                      title={t('copilot.editTags', '编辑标签')}
                    >
                      <Tag size={14} />
                    </button>
                    <button
                      className="action-btn danger"
                      disabled={busy}
                      onClick={() => runBusy(account.id, async () => { await deleteAccount(account.id); })}
                      title={t('common.delete', '删除')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="account-table-container">
            <table className="account-table copilot-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === sortedAccounts.length && sortedAccounts.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ width: 260 }}>{t('copilot.columns.username', '账号')}</th>
                  <th style={{ width: 220 }}>{t('copilot.columns.plan', '订阅')}</th>
                  <th>{t('copilot.columns.usage', '已用')}</th>
                  <th className="sticky-action-header table-action-header">{t('copilot.columns.actions', '操作')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedAccounts.map((account) => {
                  const busy = busyIds.has(account.id);
                  const isCurrent = currentAccount?.id === account.id;
                  const included = account.quota?.included_requests ?? 0;
                  const used = account.quota?.used_requests ?? 0;
                  const usedPct = included ? Math.min(100, Math.round((used / included) * 100)) : 0;
                  const planParts = [
                    account.quota?.copilot_plan,
                    account.plan
                  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx) as string[];
                  const planLabel = planParts.length > 0 ? planParts.join(' · ') : '-';

                  return (
                    <tr key={account.id} className={isCurrent ? 'current' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(account.id)}
                          onChange={() => toggleSelect(account.id)}
                        />
                      </td>
                      <td>
                        <div className="account-email" title={account.username}>
                          {account.username}
                        </div>
                        {account.email && (
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {account.email}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="tier-badge plan-badge" title={planLabel}>{planLabel}</span>
                      </td>
                      <td>
                        <div className="quota-item">
                          <div className="quota-header">
                            <span className="quota-label">Premium</span>
                            <span className={`quota-pct ${getUsedQuotaClass(usedPct)}`}>
                              {included ? `${used}/${included} (${usedPct}%)` : `${used}`}
                            </span>
                          </div>
                          <div className="quota-bar-track">
                            <div className={`quota-bar ${getUsedQuotaClass(usedPct)}`} style={{ width: `${usedPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          <button
                            className="action-btn"
                            disabled={busy}
                            onClick={() => runBusy(account.id, () => refreshQuota(account.id))}
                            title={t('common.refresh', '刷新')}
                          >
                            <RotateCw size={14} className={busy ? 'loading-spinner' : ''} />
                          </button>
                          <button
                            className="action-btn"
                            disabled={busy}
                            onClick={() => runBusy(account.id, async () => { await switchAccount(account.id); })}
                            title={t('common.switch', '切换')}
                          >
                            <Play size={14} />
                          </button>
                          <button
                            className="action-btn"
                            disabled={busy}
                            onClick={() => setShowTagModal(account.id)}
                            title={t('copilot.editTags', '编辑标签')}
                          >
                            <Tag size={14} />
                          </button>
                          <button
                            className="action-btn danger"
                            disabled={busy}
                            onClick={() => runBusy(account.id, async () => { await deleteAccount(account.id); })}
                            title={t('common.delete', '删除')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && sortedAccounts.length === 0 && (
          <div className="empty-state">
            {t('copilot.empty', '还没有 Copilot 账号，先添加一个 PAT。')}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-content codex-add-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('copilot.addModalTitle', '添加 Copilot 账号')}</h2>
              <button className="modal-close" onClick={closeAddModal} aria-label={t('common.close', '关闭')}>
                <X />
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={`modal-tab ${addMode === 'device' ? 'active' : ''}`}
                onClick={() => setAddMode('device')}
              >
                <Globe size={14} />
                {t('copilot.deviceTab', '设备码授权')}
              </button>
              <button
                className={`modal-tab ${addMode === 'token' ? 'active' : ''}`}
                onClick={() => setAddMode('token')}
              >
                <KeyRound size={14} />
                {t('copilot.tokenTab', 'PAT')}
              </button>
            </div>

            <div className="modal-body">
              {addMode === 'device' && (
                <div className="add-section">
                  <p className="section-desc">
                    {t('copilot.deviceDesc', '获取授权码后，在浏览器中输入 code 完成授权。')}
                  </p>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                    <input
                      className="token-input"
                      placeholder={t('copilot.monthlyLimitPlaceholder', '月度包含额度（可选，例如 300）')}
                      value={limitInput}
                      onChange={(e) => setLimitInput(e.target.value)}
                    />
                    <input
                      className="token-input"
                      placeholder={t('copilot.planPlaceholder', '套餐名称（可选，例如 Pro / Pro+）')}
                      value={planInput}
                      onChange={(e) => setPlanInput(e.target.value)}
                    />
                  </div>

                  <input
                    className="token-input"
                    placeholder={t('copilot.clientIdPlaceholder', 'Client ID（默认内置，可留空）')}
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                  />

                  <button className="btn btn-primary btn-full" onClick={handlePrepareDevice} disabled={deviceStatus === 'pending'}>
                    <Plus size={14} />
                    {t('copilot.deviceStart', '获取授权码')}
                  </button>

                  {userCode && (
                    <div className="add-status success">
                      <span>{t('copilot.deviceCode', '授权码')}：</span>
                      <strong>{userCode}</strong>
                      <button className="btn btn-sm btn-outline" onClick={handleCopyCode}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {t('copilot.copyCode', '复制授权码')}
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={handleOpenVerify}>
                        <ExternalLink size={14} />
                        {t('copilot.openVerify', '打开授权页面')}
                      </button>
                    </div>
                  )}

                  {deviceMessage && (
                    <div className={`add-status ${deviceStatus === 'error' ? 'error' : 'success'}`}>
                      <span>{deviceMessage}</span>
                    </div>
                  )}
                </div>
              )}

              {addMode === 'token' && (
                <div className="add-section">
                  <p className="section-desc">
                    {t('copilot.tokenDesc', '使用 PAT 添加账号（建议仅用于读账单/usage）。')}
                  </p>
                  <textarea
                    className="token-input"
                    placeholder={t('copilot.tokenPlaceholder', '输入 GitHub PAT（建议仅用于读账单/usage）')}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    rows={4}
                  />
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                    <input
                      className="token-input"
                      placeholder={t('copilot.monthlyLimitPlaceholder', '月度包含额度（可选，例如 300）')}
                      value={limitInput}
                      onChange={(e) => setLimitInput(e.target.value)}
                    />
                    <input
                      className="token-input"
                      placeholder={t('copilot.planPlaceholder', '套餐名称（可选，例如 Pro / Pro+）')}
                      value={planInput}
                      onChange={(e) => setPlanInput(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-primary btn-full" onClick={handleAdd} disabled={saving || !tokenInput.trim()}>
                    <Plus size={14} />
                    {saving ? t('common.adding', '添加中...') : t('copilot.addAccount', '添加 Copilot 账号')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <TagEditModal
        isOpen={!!showTagModal}
        initialTags={showTagModal ? getAccountTags(showTagModal) : []}
        availableTags={allTags}
        onClose={() => setShowTagModal(null)}
        onSave={async (tags) => {
          if (!showTagModal) return;
          await useCopilotAccountStore.getState().updateAccountTags(showTagModal, tags);
          await fetchAccounts();
          setShowTagModal(null);
        }}
      />
    </main>
  );
}
