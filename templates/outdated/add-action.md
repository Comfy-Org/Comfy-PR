# Add Github Action for Publishing to Comfy Registry

This PR adds a Github Action (publish-node-action) that will run whenever the pyproject.toml file changes. The pyproject.toml defines the custom node version you want to publish (added in another PR).

Action Required:

- [ ] Create an api key on the Registry for publishing from Github. [Instructions](https://www.comfydocs.org/registry/overview#create-an-api-key-for-publishing).
- [ ] Add it to your Github Repository Secrets as `REGISTRY_ACCESS_TOKEN`.
      More info on the [registry](https://www.comfyregistry.org/). Please message me on [Discord](https://discord.com/invite/comfycontrib) if you have any questions!
