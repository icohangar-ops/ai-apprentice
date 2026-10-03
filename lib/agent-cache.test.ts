import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentCachePath,
  clearAgentCacheMemory,
  readAgentCache,
  writeAgentCache,
  type AgentCache,
} from "./agent-cache";

const sample: AgentCache = {
  agent_id: "agent-1",
  tool_id: "tool-1",
  permit_tool_id: "permit-1",
};

describe("serverless agent cache", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    clearAgentCacheMemory();
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("stores the cache under the OS temp dir, not the function bundle", () => {
    const cachePath = agentCachePath();
    const relativeToTmp = path.relative(os.tmpdir(), cachePath);
    expect(relativeToTmp.startsWith("..")).toBe(false);
    expect(cachePath).not.toContain(`${path.sep}var${path.sep}task${path.sep}`);
    expect(cachePath).not.toContain(`${path.sep}.data${path.sep}`);
    expect(agentCachePath("/var/task")).toBe(path.join("/tmp", "northline-apprentice", "elevenlabs.json"));
    expect(agentCachePath("/var/task/data")).toBe(path.join("/tmp", "northline-apprentice", "elevenlabs.json"));
  });

  it("round-trips the cache in a writable temp directory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-cache-"));
    dirs.push(dir);
    const filePath = path.join(dir, "elevenlabs.json");

    await writeAgentCache(sample, filePath);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(sample);

    clearAgentCacheMemory();
    expect(await readAgentCache(filePath)).toEqual(sample);
  });

  it("keeps the voice cache in memory when mkdir /var/task/data throws ENOENT", async () => {
    const mkdirError = Object.assign(
      new Error("ENOENT: no such file or directory, mkdir '/var/task/data'"),
      { code: "ENOENT", syscall: "mkdir", path: "/var/task/data" },
    );
    const mkdir = async () => {
      throw mkdirError;
    };
    const write = async () => {
      throw new Error("writeFile should not run after mkdir fails");
    };

    await expect(
      writeAgentCache(sample, "/var/task/data/elevenlabs.json", { mkdir, writeFile: write }),
    ).resolves.toBeUndefined();

    expect(await readAgentCache("/var/task/data/elevenlabs.json")).toEqual(sample);
    clearAgentCacheMemory();
    expect(await readAgentCache("/var/task/data/elevenlabs.json")).toBeNull();
  });

  it("does not throw when the cache parent is not a directory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-cache-ro-"));
    dirs.push(dir);
    const blocker = path.join(dir, "not-a-directory");
    await writeFile(blocker, "x");
    const filePath = path.join(blocker, "data", "elevenlabs.json");

    await expect(writeAgentCache(sample, filePath)).resolves.toBeUndefined();
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({
      code: expect.stringMatching(/ENOTDIR|ENOENT/),
    });
    expect(await readAgentCache(filePath)).toEqual(sample);
  });
});
