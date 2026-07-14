import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const logoPath = "/logo.svg";

test("the new Agent Radar logo is used consistently across public surfaces", async () => {
  const [logo, readme, index, appShell] = await Promise.all([
    readFile("public/logo.svg", "utf8"),
    readFile("README.md", "utf8"),
    readFile("index.html", "utf8"),
    readFile("src/ui/app-shell.tsx", "utf8"),
  ]);

  assert.match(logo, /viewBox="40 160 944 560"/);
  assert.doesNotMatch(logo, /<svg[^>]+(?:width|height)=/);
  assert.match(logo, /stroke="#12382F"/);
  assert.match(readme, /public\/logo\.svg/);
  assert.match(index, new RegExp(`<link rel="icon" type="image/svg\\+xml" href="${logoPath}"`));
  assert.match(appShell, new RegExp(`<img[^>]+src="${logoPath}"[^>]+alt=""`));
  assert.match(appShell, /className="h-8 w-auto"/);

  for (const surface of [readme, index, appShell]) {
    assert.doesNotMatch(surface, /agent-radar-logo\.svg/);
  }
});

test("the initial loading state uses a reduced-motion-safe branded radar", async () => {
  const [app, styles] = await Promise.all([
    readFile("src/ui/App.tsx", "utf8"),
    readFile("src/ui/styles.css", "utf8"),
  ]);

  assert.match(app, /className="loading-radar"/);
  assert.match(app, /<img src="\/logo\.svg" alt="" aria-hidden="true" className="loading-radar-logo"/);
  assert.match(app, /className="loading-radar-wave" aria-hidden="true"/);
  assert.doesNotMatch(app, /<Bot\b|className="spin"/);
  assert.match(styles, /\.loading-radar-wave\s*\{[^}]*animation:/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*\.loading-radar-wave[\s\S]*animation: none/);
});
