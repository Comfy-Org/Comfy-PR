FROM node

RUN apt update -y && \
    # install python
    apt install -y python3 python3-pip python3-venv && \
    # prepare bun
    apt install unzip && curl -fsSL https://bun.sh/install | bash

WORKDIR /app

COPY package.json bun.lockb ./
RUN npm i -g bun && bun i && ln -s $(which bun) /usr/bin

# setup envs
ENV SALT=Q51fPMvQ7VdJnQjX
ENV GIT_USEREMAIL=comfy-ci@drip.art
ENV GIT_USERNAME=comfy-ci
ENV FORK_PREFIX=PR-
ENV FORK_OWNER=drip-art
ENV GH_TOKEN=

RUN python3 -m venv .venv && \
    chmod +x ./.venv/bin/* && \
    bash -c " \
    source ./.venv/bin/activate && \
    pip3 install comfy-cli \
    "

COPY src ./
COPY . ./
RUN chmod +x ./entry.sh
ENTRYPOINT bash ./entry.sh
HEALTHCHECK --interval=30m --timeout=1m --start-period=5m --retries=3 CMD curl localhost:80