# slack — Slack CLI

A lightweight Slack CLI built in Rust for quick workspace interaction from the terminal.

## Features

- **News** — Activity feed showing recent mentions (`to:me`), grouped by day with human-readable timestamps
- **Messages** — Browse recent messages across joined channels
- **Search** — Full-text search across the workspace
- **Send** — Send messages to channels or DMs with a confirm-hash safety mechanism (prevents accidental sends)

### Output formatting

- DM channels display as `@DisplayName`, public channels as `#channel-name`
- Slack `<@UID>` mention tokens are resolved to display names
- Slack `<!date^...>` markup is rendered as human-readable dates
- Messages are grouped by day (Today / Yesterday / weekday)

## Installation

```sh
cargo install --path .
```

## Usage

```sh
# Activity feed (mentions directed to you)
slack news
slack news --limit 5

# Recent messages across joined channels
slack msgs

# Search messages
slack search "deploy"

# Send a message (requires --confirm hash)
slack send "#general" "Hello team"
# Shows preview + confirm hash; rerun with --confirm=<hash> to send
```

## Configuration

Requires a Slack user token (`xoxp-...`) with the following scopes:
- `search:read` — for search and news
- `channels:history`, `groups:history`, `im:history`, `mpim:history` — for message history
- `channels:read`, `groups:read`, `im:read`, `mpim:read` — for channel listing
- `users:read` — for resolving display names
- `chat:write` — for sending messages

Set the token via environment variable:

```sh
export SLACK_MCP_XOXP_TOKEN=xoxp-...
```

Or place it in `~/.config/sno-comfy/.env.local` or a local `.env` file.

## Dependencies

Built with:
- [clap](https://crates.io/crates/clap) — CLI argument parsing
- [reqwest](https://crates.io/crates/reqwest) — HTTP client for Slack Web API
- [tokio](https://crates.io/crates/tokio) — async runtime
- [chrono](https://crates.io/crates/chrono) — date/time formatting
- [ring](https://crates.io/crates/ring) — SHA-256 for confirm hashes

## License

MIT
