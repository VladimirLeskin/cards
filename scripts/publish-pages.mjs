import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = resolve(root, "site");
const worktree = resolve(root, ".pages-work");

export function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

export function standMarkup(label) {
  return `<p class="stand">${escapeHtml(label)}. <a href="../../">Основная сборка</a></p>`;
}

export function rootStandsLink() {
  return `<p class="stands"><a href="./pr/">Стенды пул-реквестов</a></p>`;
}

export function keptOnRootDeploy(name) {
  return name === ".git" || name === "pr";
}

export function prIndexHtml(numbers) {
  const items = [...numbers]
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => `<li><a href="./${id}/">Пул-реквест #${id}</a></li>`)
    .join("\n");
  const list = items || "<li>Открытых стендов нет.</li>";
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Стенды пул-реквестов</title>
    <style>
      body { margin: 0; min-height: 100vh; background: #14110e; color: #f4efe4; font-family: Palatino, Georgia, serif; }
      main { max-width: 640px; margin: 0 auto; padding: 48px 20px; }
      a { color: #e0b15a; }
      li { margin: 0.4rem 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Стенды пул-реквестов</h1>
      <p>Каталог живёт, пока пул-реквест открыт.</p>
      <ul>
        ${list}
      </ul>
      <p><a href="../">К основной сборке</a></p>
    </main>
  </body>
</html>
`;
}

function git(args, cwd = root) {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

function output(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function copyChildren(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    cpSync(resolve(from, name), resolve(to, name), { recursive: true });
  }
}

function writePrIndex(dir) {
  const prRoot = resolve(dir, "pr");
  mkdirSync(prRoot, { recursive: true });
  const numbers = readdirSync(prRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name);
  writeFileSync(resolve(prRoot, "index.html"), prIndexHtml(numbers));
}

function patchRootIndex(dir) {
  const indexPath = resolve(dir, "index.html");
  const html = readFileSync(indexPath, "utf8").replace("<!-- stands -->", rootStandsLink());
  writeFileSync(indexPath, html);
}

export function applyPagesChange(dir, mode, number, source = site) {
  if (mode === "root") {
    for (const name of readdirSync(dir)) {
      if (keptOnRootDeploy(name)) continue;
      rmSync(resolve(dir, name), { recursive: true, force: true });
    }
    copyChildren(source, dir);
    patchRootIndex(dir);
  } else if (mode === "pr") {
    const dest = resolve(dir, "pr", number);
    rmSync(dest, { recursive: true, force: true });
    copyChildren(source, dest);
  } else if (mode === "remove") {
    rmSync(resolve(dir, "pr", number), { recursive: true, force: true });
  } else {
    throw new Error(`Неизвестная цель публикации: ${mode}`);
  }
  writeFileSync(resolve(dir, ".nojekyll"), "");
  writePrIndex(dir);
}

function ensureIdentity(cwd) {
  try {
    output(["config", "user.email"], cwd);
  } catch {
    git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], cwd);
    git(["config", "user.name", "github-actions[bot]"], cwd);
  }
}

function commitMessage(mode, number) {
  if (mode === "root") return "Опубликовать основную сборку.";
  if (mode === "remove") return `Убрать стенд пул-реквеста #${number}.`;
  return `Опубликовать стенд пул-реквеста #${number}.`;
}

function cleanupWorktree() {
  if (!existsSync(worktree)) {
    try {
      git(["worktree", "prune"]);
    } catch {
      // Nothing to prune yet.
    }
    return;
  }
  try {
    git(["worktree", "remove", "--force", worktree]);
  } catch {
    rmSync(worktree, { recursive: true, force: true });
    try {
      git(["worktree", "prune"]);
    } catch {
      // The temporary worktree is already gone.
    }
  }
}

function publishOnce(mode, number) {
  cleanupWorktree();
  git(["fetch", "origin", "gh-pages"]);
  git(["worktree", "add", "--detach", worktree, "origin/gh-pages"]);
  try {
    applyPagesChange(worktree, mode, number);
    git(["add", "-A"], worktree);
    const status = output(["status", "--porcelain"], worktree);
    if (!status.trim()) {
      console.log("Сборка на gh-pages уже совпадает");
      return;
    }
    ensureIdentity(worktree);
    git(["commit", "-m", commitMessage(mode, number)], worktree);
    git(["push", "origin", "HEAD:gh-pages"], worktree);
  } finally {
    cleanupWorktree();
  }
}

export function publishPages(mode, number) {
  if ((mode === "pr" || mode === "remove") && !/^\d+$/.test(number ?? "")) {
    throw new Error("Нужен номер пул-реквеста");
  }
  if ((mode === "root" || mode === "pr") && !readdirSync(site).length) {
    throw new Error("Сначала соберите сайт: npm run build:pages");
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      publishOnce(mode, number);
      return;
    } catch (error) {
      lastError = error;
      cleanupWorktree();
      if (attempt === 3) break;
      console.warn(`Публикация не прошла, повтор ${attempt}`);
    }
  }
  throw lastError;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    publishPages(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
