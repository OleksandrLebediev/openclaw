import fs from "node:fs/promises";
import path from "node:path";

/**
 * Reads a user's long-term profile from `memory/users/<channel>/<userId>/profile.md`.
 * Returns the file content, or undefined if the file does not exist or any parameter is missing.
 */
export async function readUserProfileContent(params: {
  workspaceDir: string;
  channel?: string | null;
  userId?: string | null;
}): Promise<string | undefined> {
  if (!params.channel || !params.userId) {
    return undefined;
  }
  const profilePath = path.join(
    params.workspaceDir,
    "memory",
    "users",
    params.channel,
    params.userId,
    "profile.md",
  );
  try {
    return await fs.readFile(profilePath, "utf-8");
  } catch {
    return undefined;
  }
}
