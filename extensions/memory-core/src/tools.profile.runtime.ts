import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveAgentWorkspaceDir,
  writeFileWithinRoot,
} from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core-host-runtime-core";

export async function writeUserProfileFile(params: {
  cfg: OpenClawConfig;
  agentId: string;
  channel: string;
  userId: string;
  content: string;
  mode: "replace" | "merge";
}): Promise<{ path: string }> {
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
  const relPath = `memory/users/${params.channel}/${params.userId}/profile.md`;

  let finalContent = params.content;
  if (params.mode === "merge") {
    const absPath = path.join(workspaceDir, relPath);
    try {
      const existing = await fs.readFile(absPath, "utf-8");
      const trimmedExisting = existing.trimEnd();
      const trimmedNew = params.content.trimStart();
      finalContent = trimmedExisting ? `${trimmedExisting}\n\n${trimmedNew}` : trimmedNew;
    } catch {
      // File doesn't exist yet — use content as-is
    }
  }

  await writeFileWithinRoot({
    rootDir: workspaceDir,
    relativePath: relPath,
    data: finalContent,
    mkdir: true,
  });

  return { path: relPath };
}
