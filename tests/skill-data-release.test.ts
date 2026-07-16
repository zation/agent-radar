import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildSkillDataRelease,
  validateSkillDataReleaseDirectory,
  type SkillDataChannel,
} from "../src/skill-data/release.js";

test("builds a versioned Skill dataset channel with verified files", async (t) => {
  const first = await createPublicDataFixture("skill-release-first-");
  const second = await createPublicDataFixture("skill-release-second-");
  t.after(async () => {
    await Promise.all([rm(first.root, { recursive: true, force: true }), rm(second.root, { recursive: true, force: true })]);
  });
  const firstResult = await buildSkillDataRelease({
    publicDataDir: first.dataDir,
    release: { release_id: "all-v0.9.1", commit_sha: "1111111111111111" },
    dataVersion: "data-first",
    publishedAt: "2026-07-16T00:00:00Z",
  });
  assert.equal(firstResult.channel.release_id, "all-v0.9.1");
  await validateSkillDataReleaseDirectory(join(first.dataDir, "skill", "releases", "all-v0.9.1"));

  await buildSkillDataRelease({
    publicDataDir: second.dataDir,
    release: { release_id: "all-v0.9.2", commit_sha: "2222222222222222" },
    dataVersion: "data-second",
    publishedAt: "2026-07-16T01:00:00Z",
    previousSkillDataRoot: join(first.dataDir, "skill"),
  });
  await access(join(second.dataDir, "skill", "releases", "all-v0.9.1", "manifest.json"));
  await validateSkillDataReleaseDirectory(join(second.dataDir, "skill", "releases", "all-v0.9.2"));
  const channel = JSON.parse(await readFile(join(second.dataDir, "skill", "channels", "v1", "latest.json"), "utf8")) as SkillDataChannel;
  assert.equal(channel.release_id, "all-v0.9.2");
  assert.equal(channel.manifest_path, "/data/skill/releases/all-v0.9.2/manifest.json");
});

test("refuses to inherit a tampered previous Skill release", async (t) => {
  const first = await createPublicDataFixture("skill-release-tamper-first-");
  const second = await createPublicDataFixture("skill-release-tamper-second-");
  t.after(async () => {
    await Promise.all([rm(first.root, { recursive: true, force: true }), rm(second.root, { recursive: true, force: true })]);
  });
  await buildSkillDataRelease({
    publicDataDir: first.dataDir,
    release: { release_id: "all-v0.9.1", commit_sha: "1111111111111111" },
    dataVersion: "data-first",
    publishedAt: "2026-07-16T00:00:00Z",
  });
  await writeFile(join(first.dataDir, "skill", "releases", "all-v0.9.1", "tool_cards.jsonl"), "tampered\n", "utf8");

  await assert.rejects(buildSkillDataRelease({
    publicDataDir: second.dataDir,
    release: { release_id: "all-v0.9.2", commit_sha: "2222222222222222" },
    dataVersion: "data-second",
    publishedAt: "2026-07-16T01:00:00Z",
    previousSkillDataRoot: join(first.dataDir, "skill"),
  }), /skill_data_file_checksum_mismatch/);
});

async function createPublicDataFixture(prefix: string): Promise<{ root: string; dataDir: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "tool_cards.jsonl"), '{"id":"tool","schema_version":"tool_card.v1"}\n', "utf8");
  await writeFile(join(dataDir, "ratings.jsonl"), '{"tool_id":"tool","schema_version":"rating_result.v2"}\n', "utf8");
  await writeFile(join(dataDir, "search_index.json"), '{"schema_version":"search_index.v1","documents":[]}\n', "utf8");
  return { root, dataDir };
}
