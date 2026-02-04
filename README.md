# Comfy-PR

A comprehensive automation platform for [ComfyUI Custom Node](https://registry.comfy.org/) development and publishing. Comfy-PR helps Custom Node authors streamline their publishing workflow by automating repository setup, pull request creation, and ongoing maintenance.

## Features

- 🔄 **Automated PR Creation**: Clone repos, update `pyproject.toml`, initialize GitHub Actions, and create PRs
- 📊 **Analytics Dashboard**: Web-based dashboard with statistics, CSV/YAML exports, and repository insights
- 🔗 **GitHub Webhook Integration**: Real-time monitoring of issues, PRs, and comments
- ⚡ **Performance Optimized**: Cached GitHub API client with SQLite storage (5min TTL)
- 📋 **Task Management**: Automated task execution with progress tracking
- 🎯 **Rule-Based Follow-ups**: Configurable automation rules for different PR states

## Comfy-PR Project Goals

The Comfy-PR project aims to support and streamline the process for Custom Node Authors to publish their work in the Comfy Registry. Here's why this initiative is essential:

1. **Simplify Node Publishing**: Provide tools and assistance to make publishing Custom Nodes straightforward, allowing authors to concentrate on development rather than the complexities of the publishing process.
2. **Expand Node Availability**: Streamlined publishing will increase the number of Custom Nodes in the Comfy Registry, enriching the ecosystem and offering more options to users.
3. **Encourage Collaboration**: Scanning GitHub repositories and providing follow-up support fosters collaboration, knowledge-sharing, and a stronger sense of community among Custom Node Authors and users.
4. **Ensure Quality and Compliance**: Automate checks and provide guidance to maintain high-quality standards and compliance within the Comfy Registry.
5. **Resolve Publishing Issues Promptly**: Address Custom Node Authors' issues during the publishing process quickly, reducing frustration and improving the overall user experience.
6. **Strengthen the Comfy Community**: Help solve users' problems with Custom Node uploading and publishing, contributing to a more vibrant, supportive, and engaged community.
7. **Promote Innovation**: Lower barriers to publishing Custom Nodes to encourage innovation and creativity within the community, leading to the development of novel and exciting nodes.

Through these efforts, Comfy-PR seeks to create an environment where Custom Node Authors can thrive and users can access a diverse and high-quality array of Custom Nodes.

## Architecture Overview

### Core Components

1. **CLI Tool** (`src/cli.ts`): Command-line interface for processing individual repositories
2. **Main Service** (`src/index.ts`): Orchestrates batch processing of repositories
3. **Web Dashboard** (`app/`): Next.js application with analytics and management UI
4. **Webhook Service** (`bot/index.ts`): Real-time GitHub event monitoring
5. **Task System** (`app/tasks/`): Automated background tasks for various operations

### Key Features

#### CLI Operations

- ✅ Repository forking and local cloning
- ✅ Automated `pyproject.toml` setup via `comfy node init`
- ✅ GitHub Actions workflow creation and publishing
- ✅ Template-based PR creation with descriptions
- ✅ Clean workspace management

#### Analytics & Monitoring

- ✅ Repository status tracking (private/archived/active)
- ✅ PR status monitoring (open/merged/closed) with comments
- ✅ Statistical analysis and reporting
- ✅ CSV/YAML data exports
- ✅ Related PR cross-referencing

#### Automation Engine

- ✅ Rule-based follow-up actions
- ✅ Slack notifications
- ✅ Email task management
- ✅ License schema updates
- ✅ Repository bypass logic
- 🔄 Auto-cleanup of merged forks (in progress)

### Web Dashboard

Access the dashboard at https://comfy-pr.vercel.app

- 📊 Repository statistics and analytics
- 📈 Interactive charts and visualizations
- 📋 Task management interface
- 📤 Data export tools (CSV/YAML)
- 🔍 PR status monitoring and filtering

## Configuration

### Environment Variables

#### Core Settings

```bash
# GitHub API token (required)
GH_TOKEN=ghp_your_github_token_here

# PR source organization (optional - defaults to your account)
FORK_OWNER="ComfyNodePRs"

# PR branch prefix (optional)
FORK_PREFIX="PR-"

# MongoDB connection (for dashboard/analytics)
MONGODB_URI=mongodb://localhost:27017
```

#### Webhook Service (Optional)

```bash
# Enable real-time webhook monitoring
USE_WEBHOOKS=true
GITHUB_WEBHOOK_SECRET=your_secure_webhook_secret
WEBHOOK_BASE_URL=https://your-domain.com
PORT=8080
```

### GitHub Token Setup

1. Go to [GitHub Personal Access Tokens](https://github.com/settings/tokens?type=beta)
2. Create a fine-grained token with these permissions:
   - **Pull requests**: Read and write
   - **Workflows**: Read and write
   - **Metadata**: Read-only
   - **Repository hooks**: Read and write (for webhooks)

### SSH Key Setup

Required for automated git operations:

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
cat ~/.ssh/id_rsa.pub
# Add the public key to https://github.com/settings/keys
```

## Quick Start

### CLI Usage

```bash
# Install and run for specific repositories
bunx comfy-pr [GITHUB_REPO_URLS...]

# Process from a file list
bunx comfy-pr --repolist repos.txt

# Use environment variable
REPO=https://github.com/owner/repo bunx comfy-pr
```

### Examples

```bash
# Process a single repository
bunx comfy-pr https://github.com/example/my-comfy-node

# Process multiple repositories
bunx comfy-pr \
  https://github.com/user1/node-a \
  https://github.com/user2/node-b

# Use a repository list file
echo "https://github.com/example/repo1" > repos.txt
echo "https://github.com/example/repo2" >> repos.txt
bunx comfy-pr --repolist repos.txt
```

## Installation & Setup

### Prerequisites

- [Bun](https://bun.sh) runtime
- Python 3.x with `comfy-cli` installed
- Git with SSH key configured
- GitHub Personal Access Token

### Local Development

```bash
# Clone the repository
git clone https://github.com/Comfy-Org/Comfy-PR
cd Comfy-PR

# Install dependencies
bun install

# Setup Python environment for comfy-cli
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install comfy-cli

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run CLI tool
bun src/cli.ts https://github.com/example/my-comfy-node

# Run main service (batch processing)
bun src/index.ts

# Start web dashboard
bun run dev  # Available at http://localhost:3000
```

### Production Deployment

#### Docker Compose (Recommended)

```bash
# Configure environment
cp .env.example .env
# Edit .env with production settings

# Deploy with Docker Compose
docker compose up -d
```

#### Manual Docker

```bash
docker run --rm -it \
  -v $HOME/.ssh:/root/.ssh:ro \
  -e GH_TOKEN=your_github_token \
  -e MONGODB_URI=mongodb://localhost:27017 \
  comfy-org/comfy-pr
```

#### Cloud Deployment

The webhook service can be deployed to:

- **Vercel**: `vercel --prod`
- **Google Cloud Run**: `cd run && ./deploy.sh`
- **Railway**: `railway deploy`
- **Heroku**: Standard Node.js deployment

## Development

### Project Structure

```
Comfy-PR/
├── src/                      # Core utilities and business logic
│   ├── cli.ts               # Command-line interface
│   ├── index.ts             # Main service orchestrator
│   ├── ghc.ts               # Cached GitHub API client
│   ├── db/                  # Database models and utilities
│   ├── gh/                  # GitHub API wrappers
│   └── utils/               # Shared utilities
├── app/                      # Next.js web dashboard
│   ├── (dashboard)/         # Dashboard pages and components
│   ├── api/                 # API routes and tRPC
│   └── tasks/               # Background task implementations
├── bot/                      # Production services
│   ├── index.ts             # GitHub webhook service
│   └── deploy.sh            # Cloud deployment scripts
├── gh-service/              # Legacy webhook service
├── templates/               # PR and workflow templates
└── packages/                # Internal packages
    └── mongodb-pipeline-ts/ # MongoDB aggregation utilities
```

### Development Workflow

```bash
# Install dependencies
bun install

# Start MongoDB (required for dashboard)
docker compose up mongodb -d

# Initialize database
bun src/index.ts

# Development modes:
bun run dev          # Web dashboard (http://localhost:3000)
bun run dev:tsc      # TypeScript compiler watch mode
bun run gh-service   # Webhook service

# Testing
bun test             # Run test suite
bun test --watch     # Watch mode

# Linting and building
bun run lint         # ESLint
bun run build        # Next.js build
```

### Running Individual Components

```bash
# Process specific repositories
bun src/cli.ts https://github.com/example/repo

# Run specific tasks
bun app/tasks/coreping/coreping.ts
bun app/tasks/gh-bounty/gh-bounty.ts

# Update repository data
bun src/updateCNRepos.ts
bun src/updateAuthors.ts
```

## Advanced Usage

### Webhook Integration

For real-time GitHub event monitoring:

```bash
# Generate secure webhook secret
export GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)

# Enable webhook mode
export USE_WEBHOOKS=true
export WEBHOOK_BASE_URL=https://your-domain.com

# Start webhook service
bun run gh-service
```

See [WEBHOOK_SETUP.md](./docs/WEBHOOK_SETUP.md) for detailed webhook configuration.

### Task System

The platform includes several automated tasks:

- **CorePing** (`app/tasks/coreping/`): Repository health monitoring
- **GitHub Bounty** (`app/tasks/gh-bounty/`): Bounty management
- **Design Tasks** (`app/tasks/gh-design/`): Design-related automation
- **Contributor Analysis** (`app/tasks/github-contributor-analyze/`): Contribution statistics
- **Action Updates** (`app/tasks/github-action-update/`): GitHub Actions maintenance

### Database Inspection

```bash
# Inspect production database (read-only)
echo 'MONGODB_URI_INSPECT=mongodb://prod-readonly-uri' > .env.development.local
echo 'MONGODB_URI=$MONGODB_URI_INSPECT' >> .env.development.local

# Run inspection scripts
bun src/checkPRsFailures.ts
bun src/analyzeTotals.ts
```

### Performance Optimization

The project uses a cached GitHub API client (`src/ghc.ts`) that:

- Stores responses in SQLite for 5 minutes
- Reduces API rate limiting
- Improves response times for repeated requests

```typescript
import { ghc } from "./src/ghc";

// Use ghc instead of gh for automatic caching
const repo = await ghc.repos.get({ owner, repo });
```
