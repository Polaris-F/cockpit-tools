import { create } from 'zustand';
import { CopilotAccount } from '../types/copilot';
import * as copilotService from '../services/copilotService';

const COPILOT_ACCOUNTS_CACHE_KEY = 'agtools.copilot.accounts.cache';
const COPILOT_CURRENT_ACCOUNT_CACHE_KEY = 'agtools.copilot.accounts.current';

const loadCachedCopilotAccounts = (): CopilotAccount[] => {
  try {
    const raw = localStorage.getItem(COPILOT_ACCOUNTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const loadCachedCopilotCurrentAccount = (): CopilotAccount | null => {
  try {
    const raw = localStorage.getItem(COPILOT_CURRENT_ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CopilotAccount;
  } catch {
    return null;
  }
};

const persistCopilotAccountsCache = (accounts: CopilotAccount[]) => {
  try {
    localStorage.setItem(COPILOT_ACCOUNTS_CACHE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore cache write failures
  }
};

const persistCopilotCurrentAccountCache = (account: CopilotAccount | null) => {
  try {
    if (!account) {
      localStorage.removeItem(COPILOT_CURRENT_ACCOUNT_CACHE_KEY);
      return;
    }
    localStorage.setItem(COPILOT_CURRENT_ACCOUNT_CACHE_KEY, JSON.stringify(account));
  } catch {
    // ignore cache write failures
  }
};

interface CopilotAccountState {
  accounts: CopilotAccount[];
  currentAccount: CopilotAccount | null;
  loading: boolean;
  error: string | null;
  fetchAccounts: () => Promise<void>;
  fetchCurrentAccount: () => Promise<void>;
  addAccount: (token: string, monthlyIncludedRequests?: number, plan?: string) => Promise<CopilotAccount>;
  switchAccount: (accountId: string) => Promise<CopilotAccount>;
  deleteAccount: (accountId: string) => Promise<void>;
  deleteAccounts: (accountIds: string[]) => Promise<void>;
  refreshQuota: (accountId: string) => Promise<void>;
  refreshAllQuotas: () => Promise<void>;
  updateAccountTags: (accountId: string, tags: string[]) => Promise<CopilotAccount>;
}

export const useCopilotAccountStore = create<CopilotAccountState>((set, get) => ({
  accounts: loadCachedCopilotAccounts(),
  currentAccount: loadCachedCopilotCurrentAccount(),
  loading: false,
  error: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null });
    try {
      const accounts = await copilotService.listCopilotAccounts();
      set({ accounts, loading: false });
      persistCopilotAccountsCache(accounts);
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  fetchCurrentAccount: async () => {
    try {
      const currentAccount = await copilotService.getCurrentCopilotAccount();
      set({ currentAccount });
      persistCopilotCurrentAccountCache(currentAccount);
    } catch (e) {
      console.error('获取当前 Copilot 账号失败:', e);
    }
  },

  addAccount: async (token, monthlyIncludedRequests, plan) => {
    const account = await copilotService.addCopilotAccount(token, monthlyIncludedRequests, plan);
    await get().fetchAccounts();
    return account;
  },

  switchAccount: async (accountId) => {
    const account = await copilotService.switchCopilotAccount(accountId);
    set({ currentAccount: account });
    persistCopilotCurrentAccountCache(account);
    await get().fetchAccounts();
    return account;
  },

  deleteAccount: async (accountId) => {
    await copilotService.deleteCopilotAccount(accountId);
    await get().fetchAccounts();
    await get().fetchCurrentAccount();
  },

  deleteAccounts: async (accountIds) => {
    await copilotService.deleteCopilotAccounts(accountIds);
    await get().fetchAccounts();
    await get().fetchCurrentAccount();
  },

  refreshQuota: async (accountId) => {
    await copilotService.refreshCopilotQuota(accountId);
    await get().fetchAccounts();
  },

  refreshAllQuotas: async () => {
    await copilotService.refreshAllCopilotQuotas();
    await get().fetchAccounts();
  },

  updateAccountTags: async (accountId, tags) => {
    const account = await copilotService.updateCopilotAccountTags(accountId, tags);
    await get().fetchAccounts();
    return account;
  },
}));
