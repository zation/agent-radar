#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { homedir } from "node:os";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

/* global AbortController, fetch */

const CLIENT_VERSION = "0.9.0";
const CHANNEL_SCHEMA = "agent_radar_skill_channel.v1";
const MANIFEST_SCHEMA = "agent_radar_skill_data_manifest.v1";
const DATASET_CONTRACT = "agent_radar_skill_dataset.v1";
const DEFAULT_BASE_URL = "https://agent-radar.zation1.workers.dev";
const CHANNEL_PATH = "/data/skill/channels/v1/latest.json";
const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_DATASET_BYTES = 50 * 1024 * 1024;
const FILE_SCHEMAS = new Map([
  ["tool_cards.jsonl", "tool_card.v1"],
  ["ratings.jsonl", "rating_result.v2"],
  ["search_index.json", "search_index.v1"]
]);

function usage() {
  return `Usage:
  agent-radar.mjs sync
  agent-radar.mjs status
  agent-radar.mjs search '{"query":"browser automation","top_k":5}'
  agent-radar.mjs get '<tool_id>'
  agent-radar.mjs explain '<tool_id>'
  agent-radar.mjs context '{"task":"Choose a browser automation MCP server","risk_tolerance":"low"}'

Environment:
  AGENT_RADAR_BASE_URL   Optional HTTPS data origin override
  AGENT_RADAR_CACHE_DIR  Optional local cache directory override`;
}

function fail(message, exitCode = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(exitCode);
}

function parseJsonArgument(command, raw) {
  if (!raw) fail(`${command} requires one JSON object.\n\n${usage()}`, 2);
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not_object");
    return parsed;
  } catch {
    fail(`${command} input must be one valid JSON object.`, 2);
  }
}

function resolveBaseUrl() {
  const raw = process.env.AGENT_RADAR_BASE_URL || DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("AGENT_RADAR_BASE_URL must be a valid HTTP or HTTPS origin.", 2);
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    fail("AGENT_RADAR_BASE_URL must use HTTPS, except for a loopback development server.", 2);
  }
  if (url.username || url.password || url.search || url.hash) {
    fail("AGENT_RADAR_BASE_URL must not contain credentials, query parameters, or fragments.", 2);
  }
  url.pathname = "/";
  return url;
}

function resolveCacheRoot() {
  if (process.env.AGENT_RADAR_CACHE_DIR) return process.env.AGENT_RADAR_CACHE_DIR;
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "agent-radar");
}

async function fetchBytes(url, maximumBytes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json, application/x-ndjson" }, signal: controller.signal });
  } catch (error) {
    throw new Error(error?.name === "AbortError" ? "download_timeout" : "download_unavailable", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`download_http_${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error("download_too_large");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error("download_too_large");
  return bytes;
}

async function syncData() {
  const baseUrl = resolveBaseUrl();
  const cacheRoot = resolveCacheRoot();
  const channelUrl = new URL(CHANNEL_PATH, baseUrl);
  const channelBytes = await fetchBytes(channelUrl, MAX_METADATA_BYTES);
  const channel = parseJsonBytes(channelBytes, "channel_invalid_json");
  validateChannel(channel);

  const expectedManifestPath = `/data/skill/releases/${channel.release_id}/manifest.json`;
  if (channel.manifest_path !== expectedManifestPath) throw new Error("channel_manifest_path_invalid");
  const manifestUrl = new URL(channel.manifest_path, baseUrl);
  if (manifestUrl.origin !== baseUrl.origin) throw new Error("channel_manifest_origin_invalid");
  const manifestBytes = await fetchBytes(manifestUrl, MAX_METADATA_BYTES);
  if (manifestBytes.byteLength !== channel.manifest_size_bytes || sha256(manifestBytes) !== channel.manifest_sha256) {
    throw new Error("manifest_checksum_mismatch");
  }
  const manifest = parseJsonBytes(manifestBytes, "manifest_invalid_json");
  validateManifest(manifest, channel.release_id);

  const releasesRoot = join(cacheRoot, "releases");
  const releaseDir = join(releasesRoot, manifest.release_id);
  await mkdir(releasesRoot, { recursive: true });
  await cleanupTemporaryReleases(releasesRoot);
  if (await pathExists(releaseDir)) {
    await validateLocalRelease(releaseDir, manifest, channel.manifest_sha256);
  } else {
    const temporaryDir = join(releasesRoot, `.${manifest.release_id}.tmp-${randomUUID()}`);
    await mkdir(temporaryDir, { recursive: false });
    try {
      let totalBytes = 0;
      for (const entry of manifest.files) {
        const fileUrl = new URL(entry.path, manifestUrl);
        const expectedPrefix = `/data/skill/releases/${manifest.release_id}/`;
        if (fileUrl.origin !== baseUrl.origin || !fileUrl.pathname.startsWith(expectedPrefix)) throw new Error("dataset_file_url_invalid");
        const contents = await fetchBytes(fileUrl, MAX_FILE_BYTES);
        totalBytes += contents.byteLength;
        if (totalBytes > MAX_DATASET_BYTES) throw new Error("dataset_too_large");
        if (contents.byteLength !== entry.size_bytes || sha256(contents) !== entry.sha256) {
          throw new Error(`dataset_checksum_mismatch:${entry.path}`);
        }
        validateDataFile(entry, contents);
        await writeFile(join(temporaryDir, entry.path), contents);
      }
      await writeFile(join(temporaryDir, "manifest.json"), manifestBytes);
      await writeFile(join(temporaryDir, "_verified.json"), `${JSON.stringify({
        schema_version: "agent_radar_local_release.v1",
        release_id: manifest.release_id,
        commit_sha: manifest.commit_sha,
        data_version: manifest.data_version,
        manifest_sha256: channel.manifest_sha256,
        verified_at: new Date().toISOString()
      }, null, 2)}\n`, "utf8");
      await rename(temporaryDir, releaseDir);
    } catch (error) {
      await rm(temporaryDir, { recursive: true, force: true });
      throw error;
    }
  }

  await mkdir(cacheRoot, { recursive: true });
  const pointer = `${JSON.stringify({ schema_version: "agent_radar_local_pointer.v1", release_id: manifest.release_id }, null, 2)}\n`;
  const temporaryPointer = join(cacheRoot, `.current.json.tmp-${randomUUID()}`);
  await writeFile(temporaryPointer, pointer, "utf8");
  await rename(temporaryPointer, join(cacheRoot, "current.json"));
  return {
    status: "synced",
    client_version: CLIENT_VERSION,
    release_id: manifest.release_id,
    commit_sha: manifest.commit_sha,
    data_version: manifest.data_version,
    cache_dir: releaseDir
  };
}

async function loadCurrentRelease() {
  const cacheRoot = resolveCacheRoot();
  let pointer;
  try {
    pointer = JSON.parse(await readFile(join(cacheRoot, "current.json"), "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new Error("data_not_synced", { cause: error });
    throw error;
  }
  if (pointer?.schema_version !== "agent_radar_local_pointer.v1" || !RELEASE_ID_PATTERN.test(pointer.release_id)) {
    throw new Error("local_pointer_invalid");
  }
  const releaseDir = join(cacheRoot, "releases", pointer.release_id);
  const verified = JSON.parse(await readFile(join(releaseDir, "_verified.json"), "utf8"));
  if (verified?.schema_version !== "agent_radar_local_release.v1" || verified.release_id !== pointer.release_id) {
    throw new Error("local_release_unverified");
  }
  return { cacheRoot, releaseDir, verified };
}

async function status() {
  try {
    const current = await loadCurrentRelease();
    return {
      status: "ready",
      client_version: CLIENT_VERSION,
      release_id: current.verified.release_id,
      commit_sha: current.verified.commit_sha,
      data_version: current.verified.data_version,
      verified_at: current.verified.verified_at,
      cache_dir: current.releaseDir
    };
  } catch (error) {
    if (error instanceof Error && error.message === "data_not_synced") {
      return { status: "not_synced", client_version: CLIENT_VERSION, recovery: "Run agent-radar.mjs sync." };
    }
    throw error;
  }
}

async function loadDataset() {
  const current = await loadCurrentRelease();
  const manifestBytes = await readFile(join(current.releaseDir, "manifest.json"));
  if (sha256(manifestBytes) !== current.verified.manifest_sha256) throw new Error("local_manifest_corrupt");
  const manifest = parseJsonBytes(manifestBytes, "local_manifest_invalid_json");
  validateManifest(manifest, current.verified.release_id);
  const [toolCardsBytes, ratingsBytes, indexBytes] = await Promise.all([
    readFile(join(current.releaseDir, "tool_cards.jsonl")),
    readFile(join(current.releaseDir, "ratings.jsonl")),
    readFile(join(current.releaseDir, "search_index.json"))
  ]);
  const contentsByPath = new Map([
    ["tool_cards.jsonl", toolCardsBytes],
    ["ratings.jsonl", ratingsBytes],
    ["search_index.json", indexBytes]
  ]);
  for (const entry of manifest.files) {
    const contents = contentsByPath.get(entry.path);
    if (!contents || contents.byteLength !== entry.size_bytes || sha256(contents) !== entry.sha256) {
      throw new Error(`local_release_corrupt:${entry.path}`);
    }
    validateDataFile(entry, contents);
  }
  return {
    release: current.verified,
    cards: parseJsonl(toolCardsBytes.toString("utf8")),
    ratings: parseJsonl(ratingsBytes.toString("utf8")),
    index: JSON.parse(indexBytes.toString("utf8"))
  };
}

function searchDataset(dataset, input) {
  const query = typeof input.query === "string" ? input.query.toLowerCase() : "";
  const topK = input.top_k === undefined ? 5 : input.top_k;
  if (!Number.isInteger(topK) || topK < 1 || topK > 50) throw new Error("search_top_k_invalid");
  const filters = input.filters ?? {};
  if (typeof filters !== "object" || filters === null || Array.isArray(filters)) throw new Error("search_filters_invalid");
  const words = query.split(/\s+/).filter(Boolean);
  const results = dataset.index.documents
    .filter((document) => !filters.type || document.type === filters.type)
    .filter((document) => !filters.risk_level || document.risk_level === filters.risk_level)
    .filter((document) => !filters.tags?.length || filters.tags.every((tag) => document.tags.includes(tag)))
    .map((document) => {
      const matchedFields = [
        ...words.filter((word) => document.text.includes(word)).map((word) => `query:${word}`),
        ...document.tags.filter((tag) => words.includes(tag)).map((tag) => `tag:${tag}`)
      ];
      return { document, score: matchedFields.length * 25 + document.rating_overall * 0.2, matchedFields };
    })
    .filter((entry) => query.length === 0 || entry.matchedFields.length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ document, score, matchedFields }) => ({
      tool_id: document.tool_id,
      type: document.type,
      risk_level: document.risk_level,
      confidence: document.confidence,
      score: Math.round(score),
      matched_fields: matchedFields
    }));
  return { schema_version: "search_tools_result.v1", release: releaseSummary(dataset.release), results };
}

async function getTool(toolId) {
  const dataset = await loadDataset();
  const toolCard = dataset.cards.find(({ id }) => id === toolId);
  if (!toolCard) throw new Error(`tool_not_found:${toolId}`);
  return {
    schema_version: "tool_card_lookup_result.v1",
    release: releaseSummary(dataset.release),
    tool_card: toolCard,
    rating: dataset.ratings.find(({ tool_id }) => tool_id === toolId)
  };
}

async function explainRating(toolId) {
  const dataset = await loadDataset();
  const rating = dataset.ratings.find(({ tool_id }) => tool_id === toolId);
  if (!rating) throw new Error(`rating_not_found:${toolId}`);
  return {
    schema_version: "rating_explanation_result.v1",
    release: releaseSummary(dataset.release),
    tool_id: toolId,
    rules_version: rating.rules_version,
    overall_score: rating.overall_score,
    recommendation_level: rating.recommendation_level,
    risk_level: rating.risk_level,
    dimension_scores: rating.dimension_scores,
    explanations: rating.explanations,
    penalties: rating.penalties,
    boosts: rating.boosts
  };
}

async function buildContext(input) {
  if (typeof input.task !== "string" || !input.task.trim()) throw new Error("context_task_required");
  const dataset = await loadDataset();
  const preferredTypes = Array.isArray(input.preferred_tool_types) ? input.preferred_tool_types : [];
  const search = searchDataset(dataset, { query: input.task, top_k: input.top_k ?? 5 });
  const candidates = search.results
    .filter(({ type }) => preferredTypes.length === 0 || preferredTypes.includes(type))
    .map((result) => {
      const toolCard = dataset.cards.find(({ id }) => id === result.tool_id);
      const rating = dataset.ratings.find(({ tool_id }) => tool_id === result.tool_id);
      return {
        ...result,
        maximum_allowed_action: maximumAllowedAction(toolCard, rating, input),
        tool_card: toolCard,
        rating
      };
    });
  return {
    schema_version: "local_recommendation_context.v1",
    release: releaseSummary(dataset.release),
    query: input,
    outcome_when_empty: "no_reliable_match",
    action_order: ["use", "compare", "ask_human", "avoid", "no_reliable_match"],
    instruction: "Use the installed Agent Radar Skill to compare these candidates. Never exceed maximum_allowed_action.",
    candidates
  };
}

function maximumAllowedAction(card, rating, input) {
  const dangerousUnknown = card?.security?.trust_level === "unknown"
    && card.permissions?.some(({ scope }) => scope === "shell" || scope === "code_execution");
  if (dangerousUnknown || rating?.recommendation_level === "avoid") return "avoid";
  const allowedPermissions = Array.isArray(input.allowed_permissions) ? input.allowed_permissions : undefined;
  const permissionOutsideBoundary = allowedPermissions
    && card?.permissions?.some(({ scope, required }) => required && !allowedPermissions.includes(scope));
  const tolerance = { low: 1, medium: 2, high: 3 }[input.risk_tolerance ?? "medium"];
  const risk = { low: 1, medium: 2, high: 3, critical: 4, unknown: 3 }[rating?.risk_level ?? "unknown"];
  if (permissionOutsideBoundary || card?.security?.requires_human_approval || risk > tolerance || risk >= 3) return "ask_human";
  return "use";
}

function validateChannel(channel) {
  if (channel?.schema_version !== CHANNEL_SCHEMA || channel.data_contract_version !== DATASET_CONTRACT) throw new Error("channel_incompatible");
  if (!RELEASE_ID_PATTERN.test(channel.release_id)) throw new Error("channel_release_id_invalid");
  if (!Number.isInteger(channel.manifest_size_bytes) || channel.manifest_size_bytes < 1 || channel.manifest_size_bytes > MAX_METADATA_BYTES) {
    throw new Error("channel_manifest_size_invalid");
  }
  if (!CHECKSUM_PATTERN.test(channel.manifest_sha256)) throw new Error("channel_manifest_checksum_invalid");
}

function validateManifest(manifest, releaseId) {
  if (manifest?.schema_version !== MANIFEST_SCHEMA || manifest.data_contract_version !== DATASET_CONTRACT) throw new Error("manifest_incompatible");
  if (manifest.release_id !== releaseId || !RELEASE_ID_PATTERN.test(manifest.release_id)) throw new Error("manifest_release_id_invalid");
  if (compareVersions(CLIENT_VERSION, manifest.minimum_client_version) < 0) throw new Error("skill_update_required");
  if (!Array.isArray(manifest.files) || manifest.files.length !== FILE_SCHEMAS.size) throw new Error("manifest_file_set_invalid");
  let totalBytes = 0;
  for (const [path, schema] of FILE_SCHEMAS) {
    const entry = manifest.files.find((file) => file.path === path);
    if (!entry || entry.schema_version !== schema || !CHECKSUM_PATTERN.test(entry.sha256)) throw new Error(`manifest_file_invalid:${path}`);
    if (!Number.isInteger(entry.size_bytes) || entry.size_bytes < 1 || entry.size_bytes > MAX_FILE_BYTES) throw new Error(`manifest_file_size_invalid:${path}`);
    totalBytes += entry.size_bytes;
  }
  if (new Set(manifest.files.map(({ path }) => path)).size !== FILE_SCHEMAS.size || totalBytes > MAX_DATASET_BYTES) {
    throw new Error("manifest_file_set_invalid");
  }
}

function validateDataFile(entry, contents) {
  const text = contents.toString("utf8");
  if (entry.path.endsWith(".jsonl")) {
    const records = parseJsonl(text);
    if (records.length === 0 || records.some(({ schema_version }) => schema_version !== entry.schema_version)) {
      throw new Error(`dataset_schema_invalid:${entry.path}`);
    }
    return;
  }
  const value = JSON.parse(text);
  if (value?.schema_version !== entry.schema_version) throw new Error(`dataset_schema_invalid:${entry.path}`);
}

async function validateLocalRelease(releaseDir, manifest, manifestSha256) {
  const marker = JSON.parse(await readFile(join(releaseDir, "_verified.json"), "utf8"));
  if (marker?.schema_version !== "agent_radar_local_release.v1" || marker.release_id !== manifest.release_id || marker.manifest_sha256 !== manifestSha256) {
    throw new Error("local_release_marker_invalid");
  }
  for (const entry of manifest.files) {
    const contents = await readFile(join(releaseDir, entry.path));
    if (contents.byteLength !== entry.size_bytes || sha256(contents) !== entry.sha256) throw new Error(`local_release_corrupt:${entry.path}`);
  }
}

async function cleanupTemporaryReleases(releasesRoot) {
  for (const entry of await readdir(releasesRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(".") && entry.name.includes(".tmp-")) {
      await rm(join(releasesRoot, entry.name), { recursive: true, force: true });
    }
  }
}

function parseJsonBytes(bytes, code) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(code);
  }
}

function parseJsonl(text) {
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function compareVersions(left, right) {
  const parse = (value) => String(value).split(".").map((part) => Number(part));
  const leftParts = parse(left);
  const rightParts = parse(right);
  if ([...leftParts, ...rightParts].some((part) => !Number.isInteger(part) || part < 0)) throw new Error("version_invalid");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function releaseSummary(release) {
  return { release_id: release.release_id, commit_sha: release.commit_sha, data_version: release.data_version };
}

function sha256(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const [command, raw, ...extra] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (extra.length > 0) fail(`Too many arguments.\n\n${usage()}`, 2);
  try {
    let result;
    if (command === "sync") {
      if (raw !== undefined) fail(`sync does not accept an argument.\n\n${usage()}`, 2);
      result = await syncData();
    } else if (command === "status") {
      if (raw !== undefined) fail(`status does not accept an argument.\n\n${usage()}`, 2);
      result = await status();
    } else if (command === "search") {
      const dataset = await loadDataset();
      result = searchDataset(dataset, parseJsonArgument(command, raw));
    } else if (command === "get") {
      if (!raw) fail(`get requires a tool_id.\n\n${usage()}`, 2);
      result = await getTool(raw);
    } else if (command === "explain") {
      if (!raw) fail(`explain requires a tool_id.\n\n${usage()}`, 2);
      result = await explainRating(raw);
    } else if (command === "context") {
      result = await buildContext(parseJsonArgument(command, raw));
    } else {
      fail(`Unknown command.\n\n${usage()}`, 2);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof Error && error.message === "data_not_synced") {
      fail("Agent Radar data is not synced. Run: agent-radar.mjs sync");
    }
    fail(`Agent Radar ${command} failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  }
}

await main();
