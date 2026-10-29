# The TypeScript sample installed with pnpm, which Corepack downloads on first use.
# shellcheck disable=SC1091
. "$here/cases/typescript/case.sh"
OVERLAYS=typescript
prepare() {
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, `${JSON.stringify({ ...manifest, packageManager: "pnpm@10.34.5" }, null, 2)}\n`);
  ' "$work/package.json"
}
# pnpm does not hoist vite, which nitpicker's Vitest config imports from the project (#569).
vite=$(node -p "require('$repo/package-lock.json').packages['node_modules/vite'].version")
SETUP="pnpm add --save-dev $packages vite@$vite"
