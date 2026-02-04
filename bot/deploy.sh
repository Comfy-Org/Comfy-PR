#!/bin/bash

# GitHub Webhook Service Deployment Script for Google Cloud Run
set -e

# Default values
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-""}
LOCATION=${LOCATION:-"us-central1"}
REPOSITORY=${REPOSITORY:-"github-webhook-service"}
SERVICE_NAME=${SERVICE_NAME:-"github-webhook-service"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    if [ -z "$PROJECT_ID" ]; then
        print_error "PROJECT_ID not set. Please set GOOGLE_CLOUD_PROJECT environment variable or pass it as argument."
        echo "Usage: $0 [PROJECT_ID]"
        exit 1
    fi
    
    print_status "Prerequisites check passed."
}

# Enable required APIs
enable_apis() {
    print_status "Enabling required Google Cloud APIs..."
    gcloud services enable cloudbuild.googleapis.com --project="$PROJECT_ID"
    gcloud services enable run.googleapis.com --project="$PROJECT_ID"
    gcloud services enable artifactregistry.googleapis.com --project="$PROJECT_ID"
    gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"
}

# Create Artifact Registry repository
create_artifact_registry() {
    print_status "Creating Artifact Registry repository..."
    if gcloud artifacts repositories describe "$REPOSITORY" --location="$LOCATION" --project="$PROJECT_ID" &>/dev/null; then
        print_status "Artifact Registry repository '$REPOSITORY' already exists."
    else
        gcloud artifacts repositories create "$REPOSITORY" \
            --repository-format=docker \
            --location="$LOCATION" \
            --project="$PROJECT_ID"
        print_status "Created Artifact Registry repository: $REPOSITORY"
    fi
}

# Create secrets if they don't exist
create_secrets() {
    print_status "Creating secrets in Secret Manager..."
    
    # GitHub Token
    if gcloud secrets describe github-token --project="$PROJECT_ID" &>/dev/null; then
        print_status "Secret 'github-token' already exists."
    else
        if [ -z "$GITHUB_TOKEN" ]; then
            print_error "GITHUB_TOKEN environment variable not set."
            print_warning "Please set it manually:"
            echo "export GITHUB_TOKEN='your_github_token_here'"
            echo "gcloud secrets create github-token --data-file=<(echo \$GITHUB_TOKEN) --project=$PROJECT_ID"
            exit 1
        fi
        echo "$GITHUB_TOKEN" | gcloud secrets create github-token --data-file=- --project="$PROJECT_ID"
        print_status "Created secret: github-token"
    fi
    
    # GitHub Webhook Secret
    if gcloud secrets describe github-webhook-secret --project="$PROJECT_ID" &>/dev/null; then
        print_status "Secret 'github-webhook-secret' already exists."
    else
        if [ -z "$GITHUB_WEBHOOK_SECRET" ]; then
            # Generate a random webhook secret if not provided
            GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 20)
            print_warning "Generated random webhook secret. Save this for your GitHub webhook configuration:"
            echo "GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET"
        fi
        echo "$GITHUB_WEBHOOK_SECRET" | gcloud secrets create github-webhook-secret --data-file=- --project="$PROJECT_ID"
        print_status "Created secret: github-webhook-secret"
    fi
}

# Deploy using Cloud Build
deploy_service() {
    print_status "Deploying service using Cloud Build..."
    
    # Get the service URL after deployment for webhook configuration
    WEBHOOK_BASE_URL="https://${SERVICE_NAME}-REPLACE_WITH_HASH-${LOCATION:0:2}.a.run.app"
    
    gcloud builds submit . \
        --config=bot/cloudbuild.yaml \
        --project="$PROJECT_ID" \
        --substitutions="_LOCATION=$LOCATION,_REPOSITORY=$REPOSITORY,_SERVICE_NAME=$SERVICE_NAME,_WEBHOOK_BASE_URL=$WEBHOOK_BASE_URL"
    
    print_status "Deployment completed!"
}

# Get service URL
get_service_url() {
    print_status "Getting service URL..."
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --platform=managed \
        --region="$LOCATION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)")
    
    print_status "Service deployed at: $SERVICE_URL"
    print_status "Webhook endpoint: $SERVICE_URL/api/github/webhook"
    print_status "Health check: $SERVICE_URL/health"
}

# Main execution
main() {
    if [ $# -eq 1 ]; then
        PROJECT_ID=$1
    fi
    
    print_status "Starting deployment to Google Cloud Run..."
    print_status "Project ID: $PROJECT_ID"
    print_status "Location: $LOCATION"
    print_status "Service Name: $SERVICE_NAME"
    
    check_prerequisites
    enable_apis
    create_artifact_registry
    create_secrets
    deploy_service
    get_service_url
    
    print_status "🎉 Deployment completed successfully!"
    echo
    print_warning "Next steps:"
    echo "1. Configure your GitHub repositories with the webhook URL: $SERVICE_URL/api/github/webhook"
    echo "2. Set the webhook secret in your GitHub repository settings"
    echo "3. Test the deployment by visiting: $SERVICE_URL/health"
}

# Run main function
main "$@"