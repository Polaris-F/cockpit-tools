export interface CopilotQuota {
  used_requests: number;
  included_requests?: number;
  remaining_requests?: number;
  usage_items_count: number;
  copilot_plan?: string;
  quota_reset_date?: string;
  raw_data?: unknown;
}

export interface CopilotAccount {
  id: string;
  username: string;
  email?: string;
  plan?: string;
  monthly_included_requests?: number;
  token: string;
  quota?: CopilotQuota;
  tags?: string[];
  created_at: number;
  last_used: number;
}
