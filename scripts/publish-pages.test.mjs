import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyPagesChange, keptOnRootDeploy, prIndexHtml, standMarkup } from "./publish-pages.mjs";

test("stand banner links back to the main site", () => {
  assert.equal(
    standMarkup('Стенд пул-реквеста #2'),
    '<p class="stand">Стенд пул-реквеста #2. <a href="../../">Основная сборка</a></p>',
  );
  assert.match(standMarkup("<b>"), /&lt;b&gt;/);
});

test("pull request index sorts stands by number", () => {
  const html = prIndexHtml(["10", "2"]);
  assert.ok(html.indexOf("./2/") < html.indexOf("./10/"));
  assert.match(html, /Пул-реквест #2/);
  assert.match(prIndexHtml([]), /Открытых стендов нет/);
});

test("root deploy keeps existing pull request stands", () => {
  const dir = mkdtempSync(join(tmpdir(), "pages-"));
  const site = join(dir, "incoming");
  const target = join(dir, "branch");
  mkdirSync(join(site), { recursive: true });
  writeFileSync(join(site, "index.html"), "<main><!-- stands --></main>");
  writeFileSync(join(site, "app.txt"), "new");
  mkdirSync(join(target, "pr", "2"), { recursive: true });
  writeFileSync(join(target, "pr", "2", "index.html"), "preview");
  writeFileSync(join(target, "old.txt"), "stale");
  mkdirSync(join(target, ".git"));

  applyPagesChange(target, "root", undefined, site);

  assert.equal(readFileSync(join(target, "app.txt"), "utf8"), "new");
  assert.equal(readFileSync(join(target, "pr", "2", "index.html"), "utf8"), "preview");
  assert.equal(readdirSync(target).includes("old.txt"), false);
  assert.match(readFileSync(join(target, "index.html"), "utf8"), /href="\.\/pr\/"/);
  assert.match(readFileSync(join(target, "pr", "index.html"), "utf8"), /Пул-реквест #2/);
  assert.equal(keptOnRootDeploy(".git"), true);
  rmSync(dir, { recursive: true, force: true });
});
