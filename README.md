# Comfy-PR

Let's grow with [Comfy.org](https://comfy.org)! We help Comfy Custom Node authors publish their custom nodes in [the Comfy Registry](https://registry.comfy.org/). We regularly clone Comfy Custom Node GitHub repositories, perform automated updates to `pyproject.toml` and GitHub Actions initialization, and then create pull requests (PRs) to the original repositories. We continue to provide follow-up PRs to solve authors' problems with custom node uploading and publishing.

## Comfy-PR Project Goals

The Comfy-PR project aims to support and streamline the process for Custom Node Authors to publish their work in the Comfy Registry. Here's why this initiative is essential:

1. **Simplify Node Publishing**: Provide tools and assistance to make publishing Custom Nodes straightforward, allowing authors to concentrate on development rather than the complexities of the publishing process.

2. **Expand Node Availability**: Streamlined publishing will increase the number of Custom Nodes in the Comfy Registry, enriching the ecosystem and offering more options to users.

3. **Encourage Collaboration**: Scanning GitHub repositories and providing follow-up support fosters collaboration, knowledge-sharing, and a stronger sense of community among Custom Node Authors and users.

4. **Ensure Quality and Compliance**: Automate checks and provide guidance to maintain high-quality standards and compliance within the Comfy Registry.

5. **Resolve Publishing Issues Promptly**: Address Custom Node Authors' issues during the publishing process quickly, reducing frustration and improving the overall user experience.

6. **Strengthen the Comfy Community**: Help solve users' problems with Custom Node uploading and publishing, contributing to a more vibrant, supportive, and engaged community.

7. **Promote Innovation**: Lower barriers to publishing Custom Nodes to encourage innovation and creativity within the community, leading to the development of novel and exciting nodes.

Through these efforts, Comfy-PR seeks to create an environment where Custom Node Authors can thrive and users can access a diverse and high-quality array of Custom Nodes.

## Developer Document

### Cli usage:

- [x] fork repo
- [x] clone repo locally
- [x] create pyproject branch, run comfy node init . Push branch.
- [x] create publish branch, create in a Github workflow file. Push branch.
- [x] create PR to original repository with template PR description.
- [x] Submit PR
- [x] Clean local debris before clone
- [x] DOING: Export PR status into csv for @robin

### Github Actions Workerds

- [x] Fetch repos from CM & CR list
- [x] Make diff
- [x] Notify to slack channel
- [x] Fetch repo status (private or archived or ...)
- [x] Fetch pr status (open / merged / closed) + comments
- [x] Fetch pr comments
- [x] Automaticaly find candidates, and do the cli does
- [x] Mention related prs in dashboard https://github.com/drip-art/Comfy-Registry-PR/issues/1
- [x] Analyze Totals
- [x] license schema updator
- [x] bypass repo
- [ ] Follow-up prs by state
  - [ ] Issues Comment
  - [ ] Slack
  - [ ] Email
- [ ] Delete the forked repo which is Merged

### Web Site https://comfy-pr.vercel.app

- [x] A dashboard csv/yaml exporter site for @robin
- [x] pr dashboard

## Admin

### Changing PR Owner

If you wish to change which Github account the Pull Requests come from, then you need to place a Github token into the **[Actions Secrets](https://github.com/drip-art/Comfy-Registry-PR/settings/secrets/actions)**

`GH_TOKEN_COMFY_PR = ************`

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

## Development

### Cli

```sh
# Create comfy pr dir and go into it
mkdir comfy-pr
cd comfy-pr

# Prepare code and environments
git clone https://github.com/drip-art/Comfy-Registry-PR .

# Prepare bun
# go here - [Installation \| Bun Docs]( https://bun.sh/docs/installation )

# Install project
bun i

# Prepare bun
bun i
```

### Github Action Worker & server

1. Setup envs in the usages section above (plz check bun src/cli.ts runnable first)

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
# Feel free to run any scripts in src/, they are safe to re-run and stop in any time.
bun src/THAT_FILE_YOU_WANT_TO_RUN.ts

# To check if you didn't break anything?
bun test --watch
```

## DB Inspecting

Make .env.development.local as

```sh
MONGODB_URI_INSPECT={{production db, readonly-permission uri}}
MONGODB_URI=$MONGODB_URI_INSPECT
```

And inspect db with script, e.g. `src/checkPRsFailures.ts`
