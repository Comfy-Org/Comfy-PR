await Bun.plugin({
  name: "YAML",
  async setup(build) {
    const { load } = await import("js-yaml");

    // when a .yaml file is imported...
    build.onLoad({ filter: /\.(yaml|yml)$/ }, async (args) => {
      // read and parse the file
      const text = await Bun.file(args.path).text();
      const exports = load(text) as Record<string, unknown>;

      // and returns it as a module
      return {
        exports,
        loader: "object", // special loader for JS objects
      };
    });
  },
});

// 2025-08-15 seems unnecessary
// Bun.plugin({
//   name: "preload-plugin",
//   setup(builder) {
//     builder.onLoad({ filter: /\.ts$/ }, async (args) => {
//       const text = await Bun.file(args.path).text();
//       // console.log("text", text);
//       return { contents: text, loader: args.loader };
//     });
//   },
// });
