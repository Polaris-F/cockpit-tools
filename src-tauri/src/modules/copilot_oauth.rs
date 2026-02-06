use reqwest::header::{HeaderMap, HeaderValue, ACCEPT};
use serde::{Deserialize, Serialize};

const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i64,
    pub interval: i64,
    #[serde(default)]
    pub verification_uri_complete: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub async fn request_device_code(client_id: &str, scope: &str) -> Result<DeviceCodeResponse, String> {
    if client_id.trim().is_empty() {
        return Err("COPILOT_CLIENT_ID_NOT_CONFIGURED".to_string());
    }

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    let response = client
        .post(DEVICE_CODE_URL)
        .headers(headers)
        .form(&[("client_id", client_id), ("scope", scope)])
        .send()
        .await
        .map_err(|e| format!("获取 device_code 失败: {}", e))?;

    let status = response.status();
    let body: DeviceCodeResponse = response
        .json()
        .await
        .map_err(|e| format!("解析 device_code 响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("device_code 请求失败: {} - {:?}", status, body));
    }

    Ok(body)
}

pub async fn poll_device_token(client_id: &str, device_code: &str) -> Result<DeviceTokenResponse, String> {
    if client_id.trim().is_empty() {
        return Err("COPILOT_CLIENT_ID_NOT_CONFIGURED".to_string());
    }

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    let response = client
        .post(TOKEN_URL)
        .headers(headers)
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("轮询 access_token 失败: {}", e))?;

    let status = response.status();
    let body: DeviceTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("解析 access_token 响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("access_token 请求失败: {} - {:?}", status, body));
    }

    Ok(body)
}
