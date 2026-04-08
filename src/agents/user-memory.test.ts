import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readUserProfileContent } from "./user-memory.js";

describe("readUserProfileContent", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "user-memory-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when channel is missing", async () => {
    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
      channel: null,
      userId: "123",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when userId is missing", async () => {
    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
      channel: "telegram",
      userId: null,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when both channel and userId are missing", async () => {
    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when profile.md does not exist", async () => {
    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
      channel: "telegram",
      userId: "349052843",
    });
    expect(result).toBeUndefined();
  });

  it("returns file content when profile.md exists", async () => {
    const profileDir = path.join(tmpDir, "memory", "users", "telegram", "349052843");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, "profile.md"), "Name: Alice\nLanguage: English");

    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
      channel: "telegram",
      userId: "349052843",
    });
    expect(result).toBe("Name: Alice\nLanguage: English");
  });

  it("resolves path as memory/users/<channel>/<userId>/profile.md", async () => {
    const profileDir = path.join(tmpDir, "memory", "users", "discord", "789");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, "profile.md"), "Role: admin");

    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
      channel: "discord",
      userId: "789",
    });
    expect(result).toBe("Role: admin");
  });

  it("returns undefined on read error (e.g. permission issue) without throwing", async () => {
    // Write a file at the profile.md path location as a directory to cause read error
    const profilePath = path.join(tmpDir, "memory", "users", "telegram", "999");
    await fs.mkdir(path.join(profilePath, "profile.md"), { recursive: true });

    const result = await readUserProfileContent({
      workspaceDir: tmpDir,
      channel: "telegram",
      userId: "999",
    });
    expect(result).toBeUndefined();
  });
});
