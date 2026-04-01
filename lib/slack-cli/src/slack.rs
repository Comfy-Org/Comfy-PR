// slack.rs — Slack Web API client using reqwest directly
#![allow(dead_code)]
// auth: SLACK_MCP_XOXP_TOKEN (xoxp user token, Authorization: Bearer)
// Note: the generated slack-client crate (from OpenAPI) has overly strict
// deny_unknown_fields on nested types that break on real Slack responses.

use anyhow::{bail, Result};
use reqwest::Client;
use serde_json::Value;

fn client() -> Client {
    Client::new()
}

async fn get(token: &str, method: &str, params: &[(&str, &str)]) -> Result<Value> {
    let resp = client()
        .get(format!("https://slack.com/api/{method}"))
        .bearer_auth(token)
        .query(params)
        .send()
        .await?
        .json::<Value>()
        .await?;
    if resp["ok"].as_bool() != Some(true) {
        bail!("Slack error on {method}: {}", resp["error"].as_str().unwrap_or("unknown"));
    }
    Ok(resp)
}

async fn post(token: &str, method: &str, body: Value) -> Result<Value> {
    let resp = client()
        .post(format!("https://slack.com/api/{method}"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await?
        .json::<Value>()
        .await?;
    if resp["ok"].as_bool() != Some(true) {
        bail!("Slack error on {method}: {}", resp["error"].as_str().unwrap_or("unknown"));
    }
    Ok(resp)
}

/// Fetch recent messages from a channel
pub async fn history(token: &str, channel_id: &str, limit: i64) -> Result<Value> {
    get(token, "conversations.history", &[
        ("channel", channel_id),
        ("limit", &limit.to_string()),
    ]).await
}

/// Search messages across workspace
pub async fn search(token: &str, query: &str) -> Result<Value> {
    get(token, "search.messages", &[("query", query), ("sort", "timestamp"), ("sort_dir", "desc")]).await
}

/// Send a message to a channel or DM, rendered as a markdown block
pub async fn send(token: &str, channel: &str, text: &str, thread_ts: Option<&str>) -> Result<String> {
    let mut body = serde_json::json!({
        "channel": channel,
        "text": text,  // fallback for notifications
        "blocks": [{ "type": "markdown", "text": text }]
    });
    if let Some(ts) = thread_ts {
        body["thread_ts"] = Value::String(ts.to_string());
    }
    let resp = post(token, "chat.postMessage", body).await?;
    Ok(resp["ts"].as_str().unwrap_or("").to_string())
}

/// List conversations (channels + DMs)
pub async fn list_conversations(token: &str) -> Result<Value> {
    get(token, "conversations.list", &[
        ("limit", "200"),
        ("types", "public_channel,private_channel,im,mpim"),
    ]).await
}

/// Resolve @user or #channel name to a channel/DM ID; passes through if already an ID
pub async fn resolve_channel(token: &str, ref_str: &str) -> anyhow::Result<String> {
    if !ref_str.starts_with('@') && !ref_str.starts_with('#') {
        return Ok(ref_str.to_string());
    }
    let is_im = ref_str.starts_with('@');
    let name = ref_str[1..].to_lowercase();
    let types = if is_im { "im,mpim" } else { "public_channel,private_channel" };
    let resp = get(token, "conversations.list", &[
        ("limit", "200"),
        ("types", types),
    ]).await?;
    let channels = resp["channels"].as_array().cloned().unwrap_or_default();
    // For DMs, Slack gives a `user` field with the other user's ID; match via users.info
    for ch in &channels {
        if is_im {
            if let Some(uid) = ch["user"].as_str() {
                let info = get(token, "users.info", &[("user", uid)]).await.unwrap_or_default();
                let display = info["user"]["profile"]["display_name"].as_str().unwrap_or("")
                    .to_lowercase();
                let uname = info["user"]["name"].as_str().unwrap_or("").to_lowercase();
                if display == name || uname == name {
                    return Ok(ch["id"].as_str().unwrap_or("").to_string());
                }
            }
        } else {
            let ch_name = ch["name"].as_str().unwrap_or("").to_lowercase();
            if ch_name == name {
                return Ok(ch["id"].as_str().unwrap_or("").to_string());
            }
        }
    }
    anyhow::bail!("{} not found: {ref_str}", if is_im { "DM" } else { "channel" })
}

/// Replace <@UXXXXXXX> mention tokens in text with display names
pub async fn resolve_mentions(token: &str, text: &str, cache: &mut std::collections::HashMap<String, String>) -> String {
    let mut result = text.to_string();
    // find all <@UXXXXXXX> or <@UXXXXXXX|label> patterns
    let re_pat = "<@U";
    let mut search = result.as_str();
    let mut ids = vec![];
    while let Some(pos) = search.find(re_pat) {
        let rest = &search[pos + 2..]; // skip "<@"
        let end = rest.find(|c| c == '>' || c == '|').unwrap_or(rest.len());
        let uid = &rest[..end];
        if uid.len() >= 9 { ids.push(uid.to_string()); }
        search = &search[pos + 1..];
    }
    for uid in ids {
        if !cache.contains_key(&uid) {
            cache.insert(uid.clone(), user_name(token, &uid).await);
        }
        let display = cache[&uid].clone();
        // replace <@UID> and <@UID|label> forms
        result = result.replace(&format!("<@{uid}>"), &format!("@{display}"));
        result = result.replace(&format!("<@{uid}|"), &format!("@{display}|")); // handle label form too
        // clean up trailing |label> if present
        while let Some(p) = result.find(&format!("@{display}|")) {
            let after = p + format!("@{display}|").len();
            if let Some(close) = result[after..].find('>') {
                result = format!("{}{}{}", &result[..p], &format!("@{display}"), &result[after + close + 1..]);
            } else { break; }
        }
    }
    result
}

// Resolve Slack date markup: <!date^EPOCH^{format}|fallback> → fallback or formatted date
pub fn resolve_date_markup(text: &str) -> String {
    let mut result = text.to_string();
    while let Some(start) = result.find("<!date^") {
        let Some(end) = result[start..].find('>') else { break };
        let tag = &result[start..start + end + 1];
        // parse: <!date^EPOCH^{format}|fallback>
        let inner = &tag[7..tag.len() - 1]; // strip <!date^ and >
        let parts: Vec<&str> = inner.splitn(3, |c| c == '^' || c == '|').collect();
        let replacement = if let Some(epoch_str) = parts.first() {
            if let Ok(epoch) = epoch_str.parse::<i64>() {
                if let Some(dt) = chrono::DateTime::from_timestamp(epoch, 0) {
                    dt.format("%A, %b %d, %Y").to_string()
                } else {
                    parts.last().unwrap_or(&"date").to_string()
                }
            } else {
                parts.last().unwrap_or(&"date").to_string()
            }
        } else {
            "date".to_string()
        };
        result = format!("{}{}{}", &result[..start], replacement, &result[start + end + 1..]);
    }
    result
}

/// Look up a user's display name by ID
pub async fn user_name(token: &str, user_id: &str) -> String {
    let Ok(resp) = get(token, "users.info", &[("user", user_id)]).await else {
        return user_id.to_string();
    };
    resp["user"]["profile"]["display_name"].as_str()
        .filter(|s| !s.is_empty())
        .or_else(|| resp["user"]["real_name"].as_str())
        .or_else(|| resp["user"]["name"].as_str())
        .unwrap_or(user_id)
        .to_string()
}

/// Get replies in a thread
pub async fn replies(token: &str, channel_id: &str, thread_ts: &str, limit: i64) -> Result<Value> {
    get(token, "conversations.replies", &[
        ("channel", channel_id),
        ("ts", thread_ts),
        ("limit", &limit.to_string()),
    ]).await
}
