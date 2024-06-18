# Add pyproject.toml for Custom Node Registry

We are building a global registry for custom nodes (similar to PyPI) with dr.lt.data and comfyanon. The main benefits are that authors can

- publish nodes by version, and users can safely update nodes knowing their workflows won't break. 
- automate testing against new commits in the comfy repo and existing workflows (check out our [CI/CD dashboard](https://comfydocs.org/registry/cicd))

Eventually, the registry will be used as a backend for the UI-manager and all nodes will go through a verification proess before being published to users. Here’s some [more information](https://comfydocs.org/registry/overview#introduction) on the registry.

Action Required:

- [ ] Go to the [registry](https://comfyregistry.org/). Login and create a publisher id. Add the publisher id into the pyproject.toml file.
- [ ] Write a short description.
- [ ] Merge the separate Github Actions PR and run the workflow.

If you want to publish the node manually, [install the cli](https://comfydocs.org/comfy-cli/getting-started#install-cli) and run `comfy node publish`. Please message me on [Discord](https://discord.com/invite/comfyorg) if you have any questions!
