# GitHub Repository Event Monitor - Webhook Setup

This system now supports both polling and real-time webhook-based monitoring.

## Quick Start

### Polling Mode (Default)

```bash
bun run bot/label-op.tsx
```

### Webhook Mode (Real-time)

```bash
# Set environment variables
export USE_WEBHOOKS=true
export GITHUB_WEBHOOK_SECRET=your-secure-secret-here
export WEBHOOK_BASE_URL=https://your-domain.com  # Your public URL

# Run the monitor
bun run bot/label-op.tsx
```

## Webhook Setup Instructions

### 1. Environment Variables

- `USE_WEBHOOKS=true` - Enable webhook mode
- `GITHUB_WEBHOOK_SECRET` - Secret for webhook security (recommended)
- `WEBHOOK_BASE_URL` - Your public URL (for webhook endpoint)
- `GH_TOKEN` - GitHub personal access token with repo permissions

### 2. Public URL Requirements

For webhooks to work, your server needs to be accessible from the internet:

- **Development**: Use ngrok, cloudflare tunnels, or similar
- **Production**: Deploy to a cloud provider with a public domain

### 3. GitHub Permissions

The system will automatically attempt to create webhooks for repositories in `REPOLIST`. You need:

- Admin or write access to the repositories
- GitHub token with `repo` permissions

### 4. Webhook Events Monitored

- Issues (opened, closed, labeled, etc.)
- Pull Requests (opened, closed, merged, labeled, etc.)
- Comments (issue comments, PR comments, review comments)
- Labels (added, removed)

## Comparison: Polling vs Webhooks

| Feature            | Polling (30s)     | Webhooks            |
| ------------------ | ----------------- | ------------------- |
| **Latency**        | ~30 seconds       | ~1 second           |
| **API Usage**      | High (continuous) | Low (event-driven)  |
| **Setup**          | Simple            | Requires public URL |
| **Reliability**    | Always works      | Depends on network  |
| **Resource Usage** | Higher            | Lower               |

## Troubleshooting

### Webhook Creation Failed

- Check GitHub token permissions
- Ensure you have admin access to repositories
- Verify the WEBHOOK_BASE_URL is publicly accessible

### Webhook Not Receiving Events

- Test the webhook endpoint: `curl -X POST http://your-url/webhook`
- Check GitHub webhook delivery logs in repo settings
- Verify webhook secret matches if configured

### Fallback Strategy

The system gracefully falls back to polling mode if webhook setup fails for any repository.
