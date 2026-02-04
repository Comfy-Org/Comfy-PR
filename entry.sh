#!/usr/bin/env bash

# assume venv is installed by Dockerfile
python3 -m venv .venv && \
chmod +x ./.venv/bin/* && \
source ./.venv/bin/activate && \
pip3 install comfy-cli
comfy --help

# activate venv
source ./.venv/bin/activate

# Start Next.js server
export PORT=80
bun --bun start
