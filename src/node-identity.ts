import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type ClaudeCodeIdentity,
	discoverClaudeCodeIdentity,
	type IdentityEnvironment,
	parseClaudeCodeIdentity,
} from "./claude-code-protocol.ts";

/**
 * Reads the identity Claude Code stores in `~/.claude.json`. Node only: this
 * module is the one place the provider layer touches the filesystem, so a
 * Worker can import `pi-black/provider` and `pi-black/protocol` without it.
 */
export async function readClaudeCodeIdentityFromDisk(
	env: IdentityEnvironment = process.env,
	configPath?: string,
): Promise<ClaudeCodeIdentity | undefined> {
	const path =
		configPath ?? join(env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json");
	try {
		return parseClaudeCodeIdentity(JSON.parse(await readFile(path, "utf8")));
	} catch {
		return undefined;
	}
}

/** Environment values first, then Claude Code's on-disk state. */
export async function discoverClaudeCodeIdentityInNode(
	env: IdentityEnvironment = process.env,
	configPath?: string,
): Promise<ClaudeCodeIdentity | undefined> {
	return (
		(await discoverClaudeCodeIdentity(env)) ??
		(await readClaudeCodeIdentityFromDisk(env, configPath))
	);
}
