# Update PyProject Toml - License

Hey! Robin from [comfy.org](https://comfy.org/) again 😊.

As a heads up, the `license` field is **optional** but in the case that it is filled out, the license file should be referenced either by the file path or by the name of the license.

- `license = { file = "LICENSE" }` ✅
- `license = {text = "MIT License"}` ✅
- `license = "LICENSE"` ❌
- `license = "MIT LICENSE"` ❌

This was brought up in our discord and so we're creating a small PR to update that optional field. For more info check out toml file [standards](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/#license) or our [docs](https://docs.comfy.org/registry/specifications#license) page!
