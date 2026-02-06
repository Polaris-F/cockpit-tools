use crate::models::copilot::CopilotQuota;
use crate::modules::copilot_account;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde_json::Value;

fn parse_premium_interactions(raw: &Value) -> Result<(i64, i64, Option<String>, Option<String>), String> {
    let snapshots = raw
        .get("quota_snapshots")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "缺少 quota_snapshots".to_string())?;
    let premium = snapshots
        .get("premium_interactions")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "缺少 premium_interactions".to_string())?;

    let entitlement = premium
        .get("entitlement")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "缺少 entitlement".to_string())?;
    let remaining = premium
        .get("remaining")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "缺少 remaining".to_string())?;

    let plan = raw
        .get("copilot_plan")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let reset_date = raw
        .get("quota_reset_date")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    Ok((entitlement, remaining, plan, reset_date))
}

pub async fn fetch_quota(
    token: &str,
    included_requests_override: Option<i64>,
) -> Result<CopilotQuota, String> {
    let client = reqwest::Client::new();

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|e| format!("构建 Authorization 头失败: {}", e))?,
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("cockpit-tools"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
    headers.insert("X-GitHub-Api-Version", HeaderValue::from_static("2022-11-28"));

    let url = "https://api.github.com/copilot_internal/user";

    let response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("请求 Copilot usage 失败: {}", e))?;

    let status = response.status();
    let raw: Value = response
        .json()
        .await
        .map_err(|e| format!("解析 Copilot usage 响应失败: {}", e))?;

    if !status.is_success() {
        if status.as_u16() == 403 {
            let message = raw
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            if message == "Resource not accessible by integration" {
                return Err("COPILOT_PERMISSION_INTEGRATION".to_string());
            }
        }
        return Err(format!("Copilot usage API 返回错误 {} - {}", status, raw));
    }

    let (entitlement, remaining, plan, reset_date) = parse_premium_interactions(&raw)?;
    let included_requests = included_requests_override.or(Some(entitlement));
    let used_requests = (entitlement - remaining).max(0);
    let remaining_requests = Some(remaining.max(0));

    Ok(CopilotQuota {
        used_requests,
        included_requests,
        remaining_requests,
        usage_items_count: 0,
        copilot_plan: plan,
        quota_reset_date: reset_date,
        raw_data: Some(raw),
    })
}

pub async fn refresh_account_quota(account_id: &str) -> Result<CopilotQuota, String> {
    let mut account = copilot_account::load_account(account_id)
        .ok_or_else(|| format!("账号不存在: {}", account_id))?;

    let quota = fetch_quota(&account.token, account.monthly_included_requests).await?;

    account.quota = Some(quota.clone());
    copilot_account::save_account(&account)?;
    Ok(quota)
}

pub async fn refresh_all_quotas() -> Result<Vec<(String, Result<CopilotQuota, String>)>, String> {
    let accounts = copilot_account::list_accounts();
    let mut results = Vec::new();
    for account in accounts {
        let result = refresh_account_quota(&account.id).await;
        results.push((account.id, result));
    }
    Ok(results)
}
