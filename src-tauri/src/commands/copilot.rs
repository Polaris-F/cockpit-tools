use tauri::AppHandle;

use crate::models::copilot::{CopilotAccount, CopilotQuota};
use crate::modules::{copilot_account, copilot_quota, copilot_oauth};
use serde::{Deserialize, Serialize};

const COPILOT_DEVICE_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";
const COPILOT_DEVICE_SCOPE: &str = "read:user";

#[derive(Debug, Serialize, Deserialize)]
pub struct CopilotDeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: i64,
    pub interval: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CopilotDevicePollResult {
    pub status: String,
    pub message: Option<String>,
    pub account: Option<CopilotAccount>,
}

fn resolve_client_id(override_client_id: Option<String>) -> String {
    let fallback = COPILOT_DEVICE_CLIENT_ID.trim();
    if let Some(value) = override_client_id {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    fallback.to_string()
}

#[tauri::command]
pub fn list_copilot_accounts() -> Result<Vec<CopilotAccount>, String> {
    Ok(copilot_account::list_accounts())
}

#[tauri::command]
pub fn get_current_copilot_account() -> Result<Option<CopilotAccount>, String> {
    Ok(copilot_account::get_current_account())
}

#[tauri::command]
pub async fn add_copilot_account(
    token: String,
    monthly_included_requests: Option<i64>,
    plan: Option<String>,
) -> Result<CopilotAccount, String> {
    let (username, email) = copilot_account::fetch_github_user(&token).await?;
    let account =
        copilot_account::upsert_account(username, token, email, plan, monthly_included_requests)?;

    if let Err(err) = copilot_quota::refresh_account_quota(&account.id).await {
        eprintln!("刷新 Copilot 配额失败: {}", err);
    }

    copilot_account::load_account(&account.id).ok_or_else(|| "账号保存后无法读取".to_string())
}

#[tauri::command]
pub async fn prepare_copilot_device_code(client_id: Option<String>) -> Result<CopilotDeviceCode, String> {
    let client_id = resolve_client_id(client_id);
    let response = copilot_oauth::request_device_code(&client_id, COPILOT_DEVICE_SCOPE).await?;
    Ok(CopilotDeviceCode {
        device_code: response.device_code,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        verification_uri_complete: response.verification_uri_complete,
        expires_in: response.expires_in,
        interval: response.interval,
    })
}

#[tauri::command]
pub async fn poll_copilot_device_code(
    device_code: String,
    client_id: Option<String>,
    monthly_included_requests: Option<i64>,
    plan: Option<String>,
) -> Result<CopilotDevicePollResult, String> {
    let client_id = resolve_client_id(client_id);
    let response = copilot_oauth::poll_device_token(&client_id, &device_code).await?;

    if let Some(token) = response.access_token {
        let account = add_copilot_account(token, monthly_included_requests, plan).await?;
        return Ok(CopilotDevicePollResult {
            status: "success".to_string(),
            message: None,
            account: Some(account),
        });
    }

    if let Some(error) = response.error {
        let status = match error.as_str() {
            "authorization_pending" => "pending",
            "slow_down" => "slow_down",
            "expired_token" => "expired",
            "access_denied" => "denied",
            _ => "error",
        };
        return Ok(CopilotDevicePollResult {
            status: status.to_string(),
            message: response.error_description.or(Some(error)),
            account: None,
        });
    }

    Ok(CopilotDevicePollResult {
        status: "pending".to_string(),
        message: None,
        account: None,
    })
}

#[tauri::command]
pub fn switch_copilot_account(account_id: String) -> Result<CopilotAccount, String> {
    copilot_account::switch_account(&account_id)
}

#[tauri::command]
pub fn delete_copilot_account(account_id: String) -> Result<(), String> {
    copilot_account::remove_account(&account_id)
}

#[tauri::command]
pub fn delete_copilot_accounts(account_ids: Vec<String>) -> Result<(), String> {
    copilot_account::remove_accounts(&account_ids)
}

#[tauri::command]
pub async fn refresh_copilot_quota(_app: AppHandle, account_id: String) -> Result<CopilotQuota, String> {
    copilot_quota::refresh_account_quota(&account_id).await
}

#[tauri::command]
pub async fn refresh_all_copilot_quotas(_app: AppHandle) -> Result<i32, String> {
    let results = copilot_quota::refresh_all_quotas().await?;
    let success_count = results.iter().filter(|(_, r)| r.is_ok()).count();
    Ok(success_count as i32)
}

#[tauri::command]
pub async fn refresh_current_copilot_quota(app: AppHandle) -> Result<(), String> {
    let Some(account) = copilot_account::get_current_account() else {
        return Err("未找到当前 Copilot 账号".to_string());
    };
    let _ = refresh_copilot_quota(app, account.id).await?;
    Ok(())
}

#[tauri::command]
pub fn update_copilot_account_tags(account_id: String, tags: Vec<String>) -> Result<CopilotAccount, String> {
    copilot_account::update_account_tags(&account_id, tags)
}
