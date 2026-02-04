#!/bin/sh

# A helper script to run terraform commands with the necessary environment variables.
GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token) terraform "$@"
