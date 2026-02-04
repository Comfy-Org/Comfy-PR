# Infrastructure Documentation

## Overview

This directory contains Terraform configuration for managing the Comfy-PR Cloud Run infrastructure on Google Cloud Platform.

## Project Configuration

- **Project ID**: `dreamboothy-dev`
- **Region**: `us-west2`
- **Service Name**: `comfy-pr`
- **State Backend**: GCS bucket `dreamboothy-dev-comfy-pr-tfstate`

## Resources Managed

### IAM & Service Accounts

- **Service Account**: `comfy-pr-sa@dreamboothy-dev.iam.gserviceaccount.com`
  - Roles:
    - Cloud Run Service Agent
    - Artifact Registry Reader
    - Secret Manager Secret Accessor

### Artifact Registry

- **Repository**: `comfy-pr` in `us-west2`
  - Docker format repository for container images

### Cloud Run

- Deployment handled via GitHub Actions workflow
- Uses Terraform-managed resources (bucket, service account)

## Development Workflow

### Prerequisites

1. Install Terraform: `brew install terraform` (macOS) or download from terraform.io
2. Install gcloud CLI and authenticate: `gcloud auth login`
3. Set project: `gcloud config set project dreamboothy-dev`

### Commands

#### Initialize Terraform

```bash
./tf.sh init
```

#### Plan Changes

```bash
./tf.sh plan
```

#### Apply Changes

```bash
./tf.sh apply
```

#### Destroy Resources (CAUTION)

```bash
./tf.sh destroy
```

### Using tf.sh Helper Script

The `tf.sh` script automatically injects Google OAuth access token for authentication:

```bash
./tf.sh <any terraform command>
```

Examples:

```bash
./tf.sh plan -out=tfplan
./tf.sh apply tfplan
./tf.sh state list
./tf.sh state show google_artifact_registry_repository.comfy_pr
```

## Important Files

- `main.tf` - Main Terraform configuration
- `tf.sh` - Helper script for running Terraform with auth
- `.terraform.lock.hcl` - Dependency lock file (should be committed)
- `.terraform/` - Provider plugins and modules (gitignored)
- `*.tfstate` - State files (stored remotely in GCS, local copies gitignored)

## Security Notes

1. **State Backend**: Terraform state is stored remotely in GCS bucket with encryption
2. **Service Account**: Limited permissions following least privilege principle
3. **Secrets**: Managed via Secret Manager, not stored in Terraform
4. **Access Control**: Cloud Run service configured for authenticated access only

## Troubleshooting

### Authentication Issues

```bash
# Re-authenticate with gcloud
gcloud auth application-default login

# Verify current auth
gcloud auth list
```

### State Lock Issues

If Terraform state is locked:

```bash
./tf.sh force-unlock <LOCK_ID>
```

### Viewing Current State

```bash
# List all resources
./tf.sh state list

# Show specific resource details
./tf.sh state show google_artifact_registry_repository.comfy_pr
```

## CI/CD Integration

The GitHub Actions workflow (`.github/workflows/cloudrun.yaml`) uses these Terraform-managed resources:

- Service account for Cloud Run deployment
- Artifact Registry for container images

Note: Caching is now ephemeral - cleared on each deployment/revision

## Best Practices

1. **Always run `plan` before `apply`** to review changes
2. **Use workspaces** for managing multiple environments if needed
3. **Tag resources** appropriately for cost tracking
4. **Review tfstate** regularly for drift detection
5. **Keep .terraform.lock.hcl** in version control for reproducible builds
