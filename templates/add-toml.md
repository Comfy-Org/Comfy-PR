# Add pyproject.toml for Custom Node Registry

Hey! My name is Robin and I'm from [comfy-org](https://comfy.org/)! We would love to have you join the Comfy Registry, a public collection of custom nodes which lets authors publish nodes by version and automate testing against existing workflows. 

Eventually, the registry will be integrated as a backend for the UI-manager where all nodes will go through a security scan. Nodes that pass these checks will have a verification flag (✅) beside their name on the UI-manager. Feel free to read up more on the registry [here](https://docs.comfy.org/registry/overview#introduction)

Action Required:

- [ ] Go to the [registry](https://registry.comfy.org). Login and create a publisher id (everything after the `@` sign on your registry profile). 
- [ ] Add the publisher id into the pyproject.toml file.
- [ ] Merge the separate Github Actions PR, then merge this PR.

If you want to publish the node manually, [install the cli](https://docs.comfy.org/comfy-cli/getting-started#install-cli) by running `pip install comfy-cli`, then run `comfy node publish`

Otherwise, if you have any questions, please message me on discord at robinken or join our [server](https://discord.com/invite/comfyorg)!
