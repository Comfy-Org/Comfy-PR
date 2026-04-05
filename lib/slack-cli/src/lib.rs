mod slack;

use napi_derive::napi;
use std::sync::Once;

static INIT: Once = Once::new();

fn get_token() -> napi::Result<String> {
    INIT.call_once(|| {
        if let Some(home) = std::env::var_os("HOME") {
            dotenvy::from_filename(std::path::Path::new(&home).join(".config/sno-comfy/.env.local")).ok();
        }
        dotenvy::dotenv().ok();
    });
    std::env::var("SLACK_MCP_XOXP_TOKEN")
        .map_err(|_| napi::Error::from_reason("Missing SLACK_MCP_XOXP_TOKEN env var"))
}

fn to_napi<T: std::fmt::Display>(e: T) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// Fetch recent messages from a channel. Returns JSON string.
#[napi]
pub async fn history(channel_id: String, limit: Option<i32>) -> napi::Result<String> {
    let token = get_token()?;
    let result = slack::history(&token, &channel_id, limit.unwrap_or(20) as i64)
        .await
        .map_err(to_napi)?;
    serde_json::to_string(&result).map_err(to_napi)
}

/// Search messages across workspace. Returns JSON string.
#[napi]
pub async fn search(query: String) -> napi::Result<String> {
    let token = get_token()?;
    let result = slack::search(&token, &query).await.map_err(to_napi)?;
    serde_json::to_string(&result).map_err(to_napi)
}

/// Send a message. Returns the message timestamp.
#[napi]
pub async fn send(channel: String, text: String, thread_ts: Option<String>) -> napi::Result<String> {
    let token = get_token()?;
    slack::send(&token, &channel, &text, thread_ts.as_deref())
        .await
        .map_err(to_napi)
}

/// List conversations (channels + DMs). Returns JSON string.
#[napi]
pub async fn list_conversations() -> napi::Result<String> {
    let token = get_token()?;
    let result = slack::list_conversations(&token).await.map_err(to_napi)?;
    serde_json::to_string(&result).map_err(to_napi)
}

/// Resolve @user or #channel name to a channel/DM ID.
#[napi]
pub async fn resolve_channel(ref_str: String) -> napi::Result<String> {
    let token = get_token()?;
    slack::resolve_channel(&token, &ref_str).await.map_err(to_napi)
}

/// Get replies in a thread. Returns JSON string.
#[napi]
pub async fn replies(channel_id: String, thread_ts: String, limit: Option<i32>) -> napi::Result<String> {
    let token = get_token()?;
    let result = slack::replies(&token, &channel_id, &thread_ts, limit.unwrap_or(50) as i64)
        .await
        .map_err(to_napi)?;
    serde_json::to_string(&result).map_err(to_napi)
}

/// Look up a user's display name by ID.
#[napi]
pub async fn user_name(user_id: String) -> napi::Result<String> {
    let token = get_token()?;
    Ok(slack::user_name(&token, &user_id).await)
}
