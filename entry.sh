#!/usr/bin/env bash
python3 -m venv .venv && \
chmod +x ./.venv/bin/* && \
source ./.venv/bin/activate && \
pip3 install comfy-cli
comfy --help

ls .venv
bun index.ts $*
