import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = resolve(root, "site");

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

for (const app of ["hogwarts", "anatomy-park"]) {
  execSync(`npx vite build --base ./ --emptyOutDir --outDir ../../site/${app}`, {
    cwd: resolve(root, "apps", app),
    stdio: "inherit",
  });
}

cpSync(resolve(root, "pages", "index.html"), resolve(site, "index.html"));
writeFileSync(resolve(site, ".nojekyll"), "");
console.log(`Pages site written to ${site}`);
