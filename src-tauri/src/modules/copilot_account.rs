use crate::models::copilot::{CopilotAccount, CopilotAccountIndex, CopilotAccountSummary};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct GitHubUserResponse {
    login: String,
    email: Option<String>,
}

fn get_copilot_storage_dir() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("无法获取用户目录"))
        .join("com.antigravity.cockpit-tools")
        .join("copilot_accounts");
    fs::create_dir_all(&data_dir).ok();
    data_dir
}

fn get_accounts_index_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("无法获取用户目录"))
        .join("com.antigravity.cockpit-tools");
    fs::create_dir_all(&data_dir).ok();
    data_dir.join("copilot_accounts.json")
}

pub fn load_account_index() -> CopilotAccountIndex {
    let path = get_accounts_index_path();
    if !path.exists() {
        return CopilotAccountIndex::new();
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| CopilotAccountIndex::new()),
        Err(_) => CopilotAccountIndex::new(),
    }
}

pub fn save_account_index(index: &CopilotAccountIndex) -> Result<(), String> {
    let path = get_accounts_index_path();
    let content = serde_json::to_string_pretty(index).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(())
}

pub fn load_account(account_id: &str) -> Option<CopilotAccount> {
    let path = get_copilot_storage_dir().join(format!("{}.json", account_id));
    if !path.exists() {
        return None;
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).ok(),
        Err(_) => None,
    }
}

pub fn save_account(account: &CopilotAccount) -> Result<(), String> {
    let path = get_copilot_storage_dir().join(format!("{}.json", account.id));
    let content = serde_json::to_string_pretty(account).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(())
}

pub fn delete_account_file(account_id: &str) -> Result<(), String> {
    let path = get_copilot_storage_dir().join(format!("{}.json", account_id));
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

pub fn list_accounts() -> Vec<CopilotAccount> {
    let index = load_account_index();
    index
        .accounts
        .iter()
        .filter_map(|summary| load_account(&summary.id))
        .collect()
}

pub fn get_current_account() -> Option<CopilotAccount> {
    let index = load_account_index();
    let id = index.current_account_id?;
    load_account(&id)
}

pub async fn fetch_github_user(token: &str) -> Result<(String, Option<String>), String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|e| format!("构建 Authorization 头失败: {}", e))?,
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("cockpit-tools"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));

    let response = client
        .get("https://api.github.com/user")
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("请求 GitHub /user 失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("GitHub /user 返回错误 {} - {}", status, body));
    }

    let user: GitHubUserResponse = response
        .json()
        .await
        .map_err(|e| format!("解析 GitHub /user 响应失败: {}", e))?;

    Ok((user.login, user.email))
}

pub fn upsert_account(
    username: String,
    token: String,
    email: Option<String>,
    plan: Option<String>,
    monthly_included_requests: Option<i64>,
) -> Result<CopilotAccount, String> {
    let id = format!("copilot_{:x}", md5::compute(username.to_lowercase().as_bytes()));

    let mut index = load_account_index();
    let existing = index.accounts.iter().position(|a| a.username.eq_ignore_ascii_case(&username));

    let account = if let Some(pos) = existing {
        let existing_id = index.accounts[pos].id.clone();
        let mut acc = load_account(&existing_id).unwrap_or_else(|| {
            CopilotAccount::new(
                existing_id,
                username.clone(),
                token.clone(),
                email.clone(),
                plan.clone(),
                monthly_included_requests,
            )
        });
        acc.username = username.clone();
        acc.token = token;
        acc.email = email;
        acc.plan = plan;
        acc.monthly_included_requests = monthly_included_requests;
        acc.update_last_used();
        acc
    } else {
        let acc = CopilotAccount::new(
            id.clone(),
            username.clone(),
            token,
            email.clone(),
            plan.clone(),
            monthly_included_requests,
        );
        index.accounts.push(CopilotAccountSummary {
            id: id.clone(),
            username: username.clone(),
            created_at: acc.created_at,
            last_used: acc.last_used,
        });
        acc
    };

    save_account(&account)?;

    if let Some(summary) = index
        .accounts
        .iter_mut()
        .find(|a| a.username.eq_ignore_ascii_case(&username))
    {
        summary.username = account.username.clone();
        summary.last_used = account.last_used;
    }

    save_account_index(&index)?;
    Ok(account)
}

pub fn remove_account(account_id: &str) -> Result<(), String> {
    let mut index = load_account_index();
    index.accounts.retain(|a| a.id != account_id);
    if index.current_account_id.as_deref() == Some(account_id) {
        index.current_account_id = None;
    }
    save_account_index(&index)?;
    delete_account_file(account_id)?;
    Ok(())
}

pub fn remove_accounts(account_ids: &[String]) -> Result<(), String> {
    for id in account_ids {
        remove_account(id)?;
    }
    Ok(())
}

pub fn switch_account(account_id: &str) -> Result<CopilotAccount, String> {
    let mut account = load_account(account_id).ok_or_else(|| format!("账号不存在: {}", account_id))?;
    account.update_last_used();
    save_account(&account)?;

    let mut index = load_account_index();
    index.current_account_id = Some(account_id.to_string());
    save_account_index(&index)?;
    Ok(account)
}

pub fn update_account_tags(account_id: &str, tags: Vec<String>) -> Result<CopilotAccount, String> {
    let mut account = load_account(account_id).ok_or_else(|| format!("账号不存在: {}", account_id))?;
    account.tags = Some(tags);
    save_account(&account)?;
    Ok(account)
}
