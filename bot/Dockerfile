FROM snomiao/agent-yes

# Set working directory
WORKDIR /app

# Copy package files and patches (build context is project root)
COPY package.json bun.lock* ./
COPY patches ./patches

# Install dependencies
RUN bun install --frozen-lockfile

# Copy entire project
COPY . ./

# Set entrypoint to load nvm
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Run the bot service
CMD ["bun", "bot/index.ts"]
