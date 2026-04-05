mod slack;

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::collections::HashMap;
use std::fmt::Write as _;

fn is_interactive() -> bool {
    // Returns true only if stderr is a real terminal (not piped/captured)
    unsafe { libc::isatty(libc::STDERR_FILENO) == 1 }
}

fn sha256_hex(input: &str) -> String {
    let digest = ring::digest::digest(&ring::digest::SHA256, input.as_bytes());
    let mut s = String::with_capacity(64);
    for b in digest.as_ref() { write!(s, "{b:02x}").unwrap(); }
    s
}

#[derive(Parser)]
#[command(name = "slack", about = "Slack CLI")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Show recent messages across joined channels
    Msgs,
    /// Show activity feed (mentions, @channel, @here) like Slack's Activity tab
    News {
        /// Max items to show
        #[arg(short, long, default_value = "20")]
        limit: usize,
    },
    /// Search messages across workspace
    Search { query: String },
    /// Send a message to a channel or DM (requires --confirm hash)
    Send {
        channel: String,
        message: String,
        #[arg(long)] thread: Option<String>,
        #[arg(long)] confirm: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load env: XDG config first, then local .env
    if let Some(home) = std::env::var_os("HOME") {
        dotenvy::from_filename(std::path::Path::new(&home).join(".config/sno-comfy/.env.local")).ok();
    }
    dotenvy::dotenv().ok();

    let token = std::env::var("SLACK_MCP_XOXP_TOKEN")?;
    let cli = Cli::parse();

    match cli.cmd {
        Cmd::Msgs => {
            let resp = slack::list_conversations(&token).await?;
            let mut channels = resp["channels"].as_array().cloned().unwrap_or_default();
            channels.sort_by(|a, b| {
                let ta = a["updated"].as_f64().unwrap_or(0.0);
                let tb = b["updated"].as_f64().unwrap_or(0.0);
                tb.partial_cmp(&ta).unwrap()
            });
            let mut user_cache: HashMap<String, String> = HashMap::new();
            let member_channels: Vec<_> = channels.iter()
                .filter(|c| c["is_member"].as_bool() == Some(true))
                .take(10)
                .collect();
            for ch in member_channels {
                let id = ch["id"].as_str().unwrap_or("");
                let name = ch["name"].as_str()
                    .or_else(|| ch["user"].as_str())
                    .unwrap_or(id);
                let msgs = slack::history(&token, id, 5).await?;
                let messages: Vec<_> = msgs["messages"].as_array()
                    .cloned().unwrap_or_default()
                    .into_iter()
                    .filter(|m| m["subtype"].is_null())
                    .filter(|m| {
                        let text = m["text"].as_str().unwrap_or("");
                        !text.is_empty() && !text.starts_with("<@")
                    })
                    .take(3)
                    .collect();
                if messages.is_empty() { continue; }
                println!("── #{name} ─────────────────────────────────");
                for m in &messages {
                    let display_name = if let Some(uid) = m["user"].as_str() {
                        if !user_cache.contains_key(uid) {
                            let name = slack::user_name(&token, uid).await;
                            user_cache.insert(uid.to_string(), name);
                        }
                        user_cache[uid].clone()
                    } else {
                        m["username"].as_str().unwrap_or("bot").to_string()
                    };
                    let raw_text = m["text"].as_str().unwrap_or("").lines().next().unwrap_or("");
                    let text = slack::resolve_mentions(&token, raw_text, &mut user_cache).await;
                    println!("  {display_name}: {text}");
                }
            }
        }
        Cmd::News { limit } => {
            let resp = slack::search(&token, "to:me").await?;
            let matches = resp["messages"]["matches"].as_array().cloned().unwrap_or_default();
            let mut user_cache: HashMap<String, String> = HashMap::new();
            let mut last_day = String::new();
            for m in matches.iter().take(limit) {
                let ts = m["ts"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
                let dt = chrono::DateTime::from_timestamp(ts as i64, 0)
                    .unwrap_or_default();
                let now = chrono::Utc::now();
                let today = now.date_naive();
                let msg_day = dt.date_naive();
                let day_label = if msg_day == today {
                    "Today".to_string()
                } else if msg_day == today.pred_opt().unwrap_or(today) {
                    "Yesterday".to_string()
                } else {
                    msg_day.format("%A, %b %d").to_string()
                };
                if day_label != last_day {
                    if !last_day.is_empty() { println!(); }
                    println!("  {day_label}");
                    println!("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
                    last_day = day_label;
                }
                let is_im = m["channel"]["is_im"].as_bool() == Some(true);
                let ch_name_raw = m["channel"]["name"].as_str().unwrap_or("dm");
                // For DMs, resolve UID to @display_name; for channels, use #channel-name
                let ch_label = if is_im && ch_name_raw.starts_with('U') {
                    if !user_cache.contains_key(ch_name_raw) {
                        user_cache.insert(ch_name_raw.to_string(), slack::user_name(&token, ch_name_raw).await);
                    }
                    format!("@{}", user_cache[ch_name_raw])
                } else if is_im {
                    format!("@{ch_name_raw}")
                } else {
                    format!("#{ch_name_raw}")
                };
                let username = m["username"].as_str().unwrap_or("?");
                let display = if let Some(uid) = m["user"].as_str() {
                    if !user_cache.contains_key(uid) {
                        user_cache.insert(uid.to_string(), slack::user_name(&token, uid).await);
                    }
                    user_cache[uid].clone()
                } else {
                    username.to_string()
                };
                let raw_text = m["text"].as_str().unwrap_or("");
                let text = slack::resolve_mentions(&token, raw_text, &mut user_cache).await;
                let text = slack::resolve_date_markup(&text);
                let first_line: String = text.lines().next().unwrap_or("").chars().take(80).collect();
                let time = dt.format("%H:%M").to_string();
                let icon = if is_im { "💬" } else { "🔔" };
                println!("  {icon} {ch_label}  {time}");
                println!("     {display}: {first_line}");
            }
        }
        Cmd::Search { query } => {
            let resp = slack::search(&token, &query).await?;
            println!("{}", serde_json::to_string_pretty(&resp)?);
        }
        Cmd::Send { channel, message, thread, confirm } => {
            let channel_id = slack::resolve_channel(&token, &channel).await?;
            let ctx = slack::history(&token, &channel_id, 5).await?;
            // Hash only stable fields (ts + text) — Slack randomizes block_id on each API call
            let ctx_stable: String = ctx["messages"].as_array()
                .cloned().unwrap_or_default()
                .iter()
                .filter(|m| m["subtype"].is_null())
                .take(5)
                .map(|m| format!("{}:{}", m["ts"].as_str().unwrap_or(""), m["text"].as_str().unwrap_or("")))
                .collect::<Vec<_>>()
                .join("\n");
            let hash = {
                let mut hasher_input = ctx_stable.clone();
                hasher_input.push_str(&message);
                let digest = sha256_hex(&hasher_input);
                digest[..4].to_string()
            };
            match confirm.as_deref() {
                None => {
                    if !is_interactive() {
                        eprintln!("Error: --confirm is required when not running interactively.");
                        eprintln!("Run in a terminal first to see the preview and get the confirm hash.");
                        std::process::exit(2);
                    }
                    println!("─── Recent context ──────────────────────────");
                    let messages = ctx["messages"].as_array().cloned().unwrap_or_default();
                    for m in messages.iter().filter(|m| m["subtype"].is_null()).take(5) {
                        let user = m["user"].as_str().unwrap_or("?");
                        let text = m["text"].as_str().unwrap_or("").lines().next().unwrap_or("");
                        println!("  {user}: {text}");
                    }
                    println!("─── Message preview ─────────────────────────");
                    println!("  To:      {channel}{}", thread.as_deref().map(|t| format!(" (thread {t})")).unwrap_or_default());
                    println!("  Message: {message}");
                    println!("─────────────────────────────────────────────");
                    eprintln!("\nRerun with --confirm={hash}");
                    std::process::exit(1);
                }
                Some(c) if c != hash => {
                    eprintln!("Confirm hash mismatch. Expected: {hash}");
                    std::process::exit(1);
                }
                _ => {
                    let ts = slack::send(&token, &channel_id, &message, thread.as_deref()).await?;
                    println!("✓ Sent (ts: {})", ts);
                }
            }
        }
    }

    Ok(())
}
