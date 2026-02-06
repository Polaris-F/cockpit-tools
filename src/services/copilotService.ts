import { invoke } from '@tauri-apps/api/core';
import { CopilotAccount, CopilotQuota } from '../types/copilot';

export async function listCopilotAccounts(): Promise<CopilotAccount[]> {
  return await invoke('list_copilot_accounts');
}

export async function getCurrentCopilotAccount(): Promise<CopilotAccount | null> {
  return await invoke('get_current_copilot_account');
}

export async function addCopilotAccount(
  token: string,
  monthlyIncludedRequests?: number,
  plan?: string
): Promise<CopilotAccount> {
  return await invoke('add_copilot_account', {
    token,
    monthlyIncludedRequests: monthlyIncludedRequests ?? null,
    plan: plan ?? null,
  });
}

export async function prepareCopilotDeviceCode(clientId?: string): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}> {
  return await invoke('prepare_copilot_device_code', {
    clientId: clientId ?? null,
  });
}

export async function pollCopilotDeviceCode(
  deviceCode: string,
  clientId?: string,
  monthlyIncludedRequests?: number,
  plan?: string
): Promise<{
  status: string;
  message?: string;
  account?: CopilotAccount;
}> {
  return await invoke('poll_copilot_device_code', {
    deviceCode,
    clientId: clientId ?? null,
    monthlyIncludedRequests: monthlyIncludedRequests ?? null,
    plan: plan ?? null,
  });
}

export async function switchCopilotAccount(accountId: string): Promise<CopilotAccount> {
  return await invoke('switch_copilot_account', { accountId });
}

export async function deleteCopilotAccount(accountId: string): Promise<void> {
  return await invoke('delete_copilot_account', { accountId });
}

export async function deleteCopilotAccounts(accountIds: string[]): Promise<void> {
  return await invoke('delete_copilot_accounts', { accountIds });
}

export async function refreshCopilotQuota(accountId: string): Promise<CopilotQuota> {
  return await invoke('refresh_copilot_quota', { accountId });
}

export async function refreshAllCopilotQuotas(): Promise<number> {
  return await invoke('refresh_all_copilot_quotas');
}

export async function updateCopilotAccountTags(accountId: string, tags: string[]): Promise<CopilotAccount> {
  return await invoke('update_copilot_account_tags', { accountId, tags });
}
