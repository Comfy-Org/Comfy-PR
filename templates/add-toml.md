# Add pyproject.toml for Custom Node Registry

We are working with dr.lt.data and comfyanon to build a global registry for custom nodes (similar to PyPI). Eventually, the registry will be used as a backend for the UI-manager. All nodes go through a verification proess before being published to users.

The main benefits are that authors can
- publish nodes by version and users can safely update nodes knowing their workflows won't break
- automate testing against new commits in the comfy repo and existing workflows through our CI/CD dashboard

Action Required:

- [ ] Go to the [registry](https://registry.comfy.org). Login and create a publisher id. Add the publisher id into the pyproject.toml file.
- [ ] Write a short description.
- [ ] Merge the separate Github Actions PR and run the workflow.

If you want to publish the node manually, [install the cli](https://docs.comfy.org/comfy-cli/getting-started#install-cli) and run `comfy node publish`

Check out our [docs](https://docs.comfy.org/registry/overview#introduction) if you want to know more about the registry. Otherwise, feel free to message me on discord at haohao_81202 or join our [server](https://discord.com/invite/comfyorg) if you have any questions!
