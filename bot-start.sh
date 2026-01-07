#!/bin/bash
cd "$(dirname "$0")"
exec /root/.bun/bin/bun bot/index.ts --continue
