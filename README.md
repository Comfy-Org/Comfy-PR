# Comfy-PR

Make PRs that publishes ComfyUI Custom Nodes to [ComfyUI Registry](https://www.comfyregistry.org/).

## Project Goals: (aka roadmap)

### cli:

- [x] fork repo
- [x] clone repo locally
- [x] create pyproject branch, run comfy node init . Push branch.
- [x] create publish branch, create in a Github workflow file. Push branch.
- [x] create PR to original repository with template PR description.
- [x] Submit PR
- [x] Clean local debris before clone
- [/] DOING: Export PR status into csv for @haohao

### Github Actions Worker

- [x] Fetch repos from CM & CR list
- [x] Make diff
- [x] Notify to slack channel
- [x] Fetch repo status (private or archived or ...)
- [x] Fetch pr status (open / merged / closed) + comments
- [x] Fetch pr comments
- [x] Automaticaly find candidates, and do the cli does
- [x] Mention related prs in dashboard https://github.com/drip-art/Comfy-Registry-PR/issues/1
- [x] Report Totals into slack
- [ ] email subscriber (not planned)
- [ ] Delete the forked repo which is Merged

### Web

- [ ] A dashboard csv exporter site for @haohao

## Usages

### CLI Usage: Get Started by

```
bunx comfy-pr [...GITHUB_REPO_URLS]
```

### 1. Setup Envs

A demo .env should be sth like:

```sh
# your github token
GH_TOKEN=ghp_WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW

# the pr source organization/ leave it blank to use yourself's account.
FORK_OWNER="ComfyNodePRs"

# PR prefix
FORK_PREFIX="PR-"
```

#### Github API Token (GH_TOKEN)

GO https://github.com/settings/tokens?type=beta to get an Github Access key

Check 3 permissions for all of your repositories

- Pull requests Access: Read and write
- Workflows Access: Read and write
- Metadata Access: Read-only

And save your GH_TOKEN into .env file

#### Github SSH Key (.ssh/id_rsa, .ssh/id_rsa.pub)

Must provide to push code automaticaly, btw prob. you've already setup.

Run `ssh-keygen`, got `id_rsa.pub`, Then add into here https://github.com/settings/keys

### 2. Run!

Ways to run this script

1. Local run
2. Docker run (also local)
3. Docker run at cloud (TODO)

#### 1. Launch by Docker Compose

After configured your .env file, run docker compose build and up.

```sh
git clone https://github.com/drip-art/Comfy-Registry-PR
cd Comfy-Registry-PR
docker compose build
docker compose up
```

#### 2. Docker usage (not stable)

```sh
docker run --rm -it \
    -v $HOME/.ssh:/root/.ssh:ro \
    -e GH_TOKEN=ghp_WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW \
    -e REPO=https://github.com/snomiao/ComfyNode-Registry-test \
    snomiao/comfy-registry-pr
```

#### 3. Run native in Unix/Linux/MacOS/WSL

```sh
git clone https://github.com/drip-art/Comfy-Registry-PR

# setup comfy-cli environment
cd Comfy-Registry-PR
python3 -m venv .venv
chmod +x ./.venv/bin/*
source ./.venv/bin/activate
pip3 install comfy-cli



# setup bun for js-script
curl -fsSL https://bun.sh/install | bash
bun i

# and
bun src/cli.ts [REPO_PATH_NEED_TO_PR]
# for example
bun src/cli.ts https://github.com/snomiao/ComfyNode-Registry-test

```

#### 4. Run natively in Windows

```bat

git clone https://github.com/drip-art/Comfy-Registry-PR

@REM setup comfy-cli environment
cd Comfy-Registry-PR
python3 -m venv .venv
.\.venv\Scripts\activate
pip3 install comfy-cli

@REM run with tsx
npx -y cross-env REPO=https://github.com/snomiao/ComfyNode-Registry-test npx -y tsx src/cli.ts

```

#### Other Configurations in dockerfile

Don't change it unless you know what you are doing.

```dockerfile

ENV FORK_OWNER=drip-art
ENV FORK_PREFIX=PR-

# Unset it into current authorized user's name and email (from your github api token).
ENV GIT_USEREMAIL=comfy-ci@drip.art
ENV GIT_USERNAME=comfy-ci
```


## Github Action Worker & server Development

1. Setup envs in the usages section above

2. Run mongodb with docker compose

```sh
docker compose -f docker-compose.mongodb.yml up
```

```yaml
services:
  mongdb:
    restart: always
    image: mongo
    ports: ["27017:27017"]
    volumes: [./data/mongodb:/data/db]
```

And fill URI into env

```env
MONGODB_URI=mongodb://localhost:27017
```

3. Play with codes...

```sh
# To initialize your database, run:
bun src/index.ts

# To start develop in any of other scripts:
bun src/THAT_FILE_YOU_WANT_TO_RUN.ts

# To check if you didn't break anything?
bun test --watch
```
