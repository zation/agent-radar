import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Wrangler binds the production feedback D1 database and preserves dashboard variables", async () => {
  const config = await readFile("wrangler.toml", "utf8");
  assert.match(config, /keep_vars\s*=\s*true/);
  assert.match(config, /\[\[d1_databases\]\][\s\S]*binding\s*=\s*"DB"/);
  assert.match(config, /database_name\s*=\s*"agent-radar"/);
  assert.match(config, /database_id\s*=\s*"19e96958-6bc9-454b-8c0e-4ab447da48ae"/);
  assert.match(config, /migrations_dir\s*=\s*"migrations"/);
});
