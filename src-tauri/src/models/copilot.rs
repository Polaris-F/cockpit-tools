use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotAccount {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub plan: Option<String>,
    pub monthly_included_requests: Option<i64>,
    pub token: String,
    pub quota: Option<CopilotQuota>,
    pub tags: Option<Vec<String>>,
    pub created_at: i64,
    pub last_used: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotQuota {
    pub used_requests: i64,
    pub included_requests: Option<i64>,
    pub remaining_requests: Option<i64>,
    pub usage_items_count: usize,
    pub copilot_plan: Option<String>,
    pub quota_reset_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotAccountIndex {
    pub version: String,
    pub accounts: Vec<CopilotAccountSummary>,
    pub current_account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotAccountSummary {
    pub id: String,
    pub username: String,
    pub created_at: i64,
    pub last_used: i64,
}

impl CopilotAccountIndex {
    pub fn new() -> Self {
        Self {
            version: "1.0".to_string(),
            accounts: Vec::new(),
            current_account_id: None,
        }
    }
}

impl Default for CopilotAccountIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl CopilotAccount {
    pub fn new(
        id: String,
        username: String,
        token: String,
        email: Option<String>,
        plan: Option<String>,
        monthly_included_requests: Option<i64>,
    ) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id,
            username,
            email,
            plan,
            monthly_included_requests,
            token,
            quota: None,
            tags: None,
            created_at: now,
            last_used: now,
        }
    }

    pub fn update_last_used(&mut self) {
        self.last_used = chrono::Utc::now().timestamp();
    }
}
