import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const CACHE_DIR = "northline-apprentice";
const CACHE_FILE = "elevenlabs.json";

/** Vercel and Lambda mount the deployment at /var/task and reject writes there. */
const FUNCTION_BUNDLE = "/var/task";

export type AgentCache = {
  agent_id: string;
  tool_id: string;
  permit_tool_id?: string;
};

type CacheWriter = {
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
};

let memoryCache: AgentCache | null = null;

function isFunctionBundlePath(dir: string): boolean {
  const resolved = path.resolve(dir);
  return resolved === FUNCTION_BUNDLE || resolved.startsWith(`${FUNCTION_BUNDLE}${path.sep}`);
}

/**
 * Ephemeral location for the ElevenLabs agent ids.
 * Defaults to the OS temp dir (`/tmp` on Vercel), never the read-only function bundle.
 */
export function agentCachePath(tmpdir: string = os.tmpdir()): string {
  const root = isFunctionBundlePath(tmpdir) ? "/tmp" : path.resolve(tmpdir);
  return path.join(root, CACHE_DIR, CACHE_FILE);
}

export function clearAgentCacheMemory(): void {
  memoryCache = null;
}

function parseCache(raw: string): AgentCache | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AgentCache>;
    if (!parsed.agent_id || !parsed.tool_id) return null;
    return {
      agent_id: parsed.agent_id,
      tool_id: parsed.tool_id,
      permit_tool_id: parsed.permit_tool_id,
    };
  } catch {
    return null;
  }
}

export async function readAgentCache(filePath: string = agentCachePath()): Promise<AgentCache | null> {
  if (memoryCache) return memoryCache;
  try {
    const cache = parseCache(await readFile(filePath, "utf8"));
    if (cache) memoryCache = cache;
    return cache;
  } catch {
    return null;
  }
}

/**
 * Remember the agent ids for this isolate, then try to write them under the temp dir.
 * A read-only bundle (`ENOENT` mkdir `/var/task/data`) must not fail the voice session.
 */
export async function writeAgentCache(
  cache: AgentCache,
  filePath: string = agentCachePath(),
  io: CacheWriter = { mkdir, writeFile },
): Promise<void> {
  memoryCache = cache;
  try {
    await io.mkdir(path.dirname(filePath), { recursive: true });
    await io.writeFile(filePath, JSON.stringify(cache), "utf8");
  } catch {
    // Persistence is an optimization across warm starts. The in-memory copy
    // still serves this isolate, and a cold start rediscovers the agent.
  }
}
