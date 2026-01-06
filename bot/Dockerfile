# Use Debian base image
FROM debian:bookworm-slim

# Set SHELL to use bash for RUN commands
SHELL ["/bin/bash", "-c"]

# Install dependencies
RUN apt-get update -y && \
    apt-get install -y curl unzip ca-certificates git libatomic1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install nvm
ENV NVM_DIR="/root/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# Install latest Node.js using nvm and set it as default
RUN source "$NVM_DIR/nvm.sh" && \
    nvm install node && \
    nvm alias default node && \
    nvm use default

# Create a script to load nvm and add it to PATH
RUN printf '#!/bin/bash\nexport NVM_DIR="/root/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"\nexec "$@"\n' > /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# Set NODE_PATH and PATH for direct access
RUN source "$NVM_DIR/nvm.sh" && \
    ln -s "$NVM_DIR/versions/node/$(node -v)/bin/node" /usr/local/bin/node && \
    ln -s "$NVM_DIR/versions/node/$(node -v)/bin/npm" /usr/local/bin/npm && \
    ln -s "$NVM_DIR/versions/node/$(node -v)/bin/npx" /usr/local/bin/npx

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Verify installations
RUN node --version && npm --version && bun --version

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