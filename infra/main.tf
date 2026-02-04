# Comfy-PR - Cloud Run Deployment with Direct IAP (No Load Balancer)

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
  
  backend "gcs" {
    bucket = "dreamboothy-dev-comfy-pr-tfstate"
    prefix = "terraform/state"
  }
}

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "dreamboothy-dev"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-west2"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "comfy-pr"
}

# Provider
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# APIs are already enabled in the project
# Commenting out to avoid permission issues

# Note: Cache bucket removed - using ephemeral storage only
# Caches are cleared on each Cloud Run deployment/revision

# Artifact Registry Repository
resource "google_artifact_registry_repository" "comfy_pr" {
  location      = var.region
  repository_id = var.service_name
  description   = "Docker repository for comfy-pr"
  format        = "DOCKER"

  # depends_on = [google_project_service.apis]
}

# Cloud Run v2 Service with Direct IAP
resource "google_cloud_run_v2_service" "comfy_pr" {
  provider     = google-beta
  name         = var.service_name
  location     = var.region
  project      = var.project_id
  ingress      = "INGRESS_TRAFFIC_ALL"
  launch_stage = "BETA"
  # iap_enabled = true  # Enable later after service is running
  deletion_protection = false
  
  template {
    service_account = google_service_account.cloud_run_sa.email
    
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.service_name}/${var.service_name}:latest"

      ports {
        container_port = 80
      }
      
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }
      
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      
      # Note/TODO: NOTION_TOKEN set via GitHub Actions deployment
      # need to consult on standards for environment secrets
    }
    
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
    
    max_instance_request_concurrency = 1000
    timeout                         = "300s"
  }
  
  # depends_on = [google_project_service.apis]
}

# Cloud Run service account for accessing GCS bucket
resource "google_service_account" "cloud_run_sa" {
  account_id   = "${var.service_name}-sa"
  display_name = "Cloud Run Service Account for comfy-pr"
  description  = "Service account for comfy-pr Cloud Run service"
}

# Note: Storage permissions removed - using ephemeral storage only

# Service account for GitHub Actions (deployment)
resource "google_service_account" "github_actions_sa" {
  account_id   = "github-actions-${var.service_name}"
  display_name = "GitHub Actions Service Account for comfy-pr"
  description  = "Service account for GitHub Actions to deploy comfy-pr"
}

# Grant GitHub Actions service account permission to push to Artifact Registry
resource "google_project_iam_member" "github_actions_artifact_registry" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_actions_sa.email}"
}

# Grant GitHub Actions service account permission to deploy to Cloud Run
resource "google_project_iam_member" "github_actions_cloud_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.github_actions_sa.email}"
}

# Grant GitHub Actions service account permission to use service accounts (for Cloud Run deployment)
resource "google_project_iam_member" "github_actions_service_account_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_actions_sa.email}"
}

# Also grant Cloud Run SA permission to pull from Artifact Registry
resource "google_project_iam_member" "cloud_run_artifact_registry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Allow public access (will restrict with IAP later)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = google_cloud_run_v2_service.comfy_pr.location
  name     = google_cloud_run_v2_service.comfy_pr.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "service_url" {
  description = "Cloud Run service URL (IAP-protected)"
  value       = google_cloud_run_v2_service.comfy_pr.uri
}

output "github_actions_service_account_email" {
  description = "Email of the GitHub Actions service account"
  value       = google_service_account.github_actions_sa.email
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.comfy_pr.name}"
}