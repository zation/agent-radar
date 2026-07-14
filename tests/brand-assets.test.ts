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
