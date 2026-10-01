import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { standMarkup } from "./publish-pages.mjs";

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

const label = process.env.PAGES_LABEL?.trim();
const banner = label ? standMarkup(label) : "";
const html = readFileSync(resolve(root, "pages", "index.html"), "utf8").replace("<!-- stand -->", banner);
writeFileSync(resolve(site, "index.html"), html);
writeFileSync(resolve(site, ".nojekyll"), "");
console.log(`Pages site written to ${site}`);
