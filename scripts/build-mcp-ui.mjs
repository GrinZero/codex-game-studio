import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const result = await build({
  entryPoints: ["src/ui/mcp-workbench.ts"],
  bundle: true,
  write: false,
  format: "esm",
  minify: true,
  target: "es2023",
  loader: { ".svg": "dataurl" },
  outfile: "dist/mcp/app.js",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "sandbox-meshopt-initialization",
      setup(build) {
        build.onLoad({ filter: /meshopt_decoder\.module\.js$/ }, (args) => ({
          // Three eagerly initializes this optional WASM decoder, even for ordinary
          // GLBs. A host that blocks WASM must not produce an unhandled rejection.
          // Keep ready rejected so a compressed model still reports its load error.
          contents:
            readFileSync(args.path, "utf8") +
            "\nMeshoptDecoder.ready?.catch(() => {});\n",
          loader: "js",
        }));
      },
    },
  ],
});
const script = result.outputFiles
  .find((f) => f.path.endsWith(".js"))
  .text.replaceAll("</script", "<\\/script");
const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
mkdirSync("dist/mcp", { recursive: true });
writeFileSync(
  "dist/mcp/index.html",
  `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Game Studio</title><style>${css}</style></head><body><div id="root"></div>
<script type="module">${script}</script></body></html>`,
);
console.log("Built MCP App shell.");
