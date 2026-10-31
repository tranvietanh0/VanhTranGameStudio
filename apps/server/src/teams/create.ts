import { statSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import type { Team } from "@studio/shared";
import { HerdrError, isRecord } from "../herdr/errors.ts";
import type { HerdrCall } from "../herdr/rpc.ts";
import { logInfo } from "../log.ts";
import { gitToplevel as defaultGitToplevel } from "./git.ts";

export class CreateError extends Error {}

export const MAX_NAME_LENGTH = 80;
export const MAX_PROMPT_LENGTH = 8000;
const WORKTREE_ATTEMPTS = 5;

export interface CreateDeps {
  call: HerdrCall;
  teams: () => Team[];
  getTeam: (teamId: string) => Team | undefined;
  hooksSettingsFile: string;
  gitToplevel?: (path: string) => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
  /** Wait for the new shell before typing the launch command. */
  launchDelayMs?: number;
}

export interface CreateInput {
  projectPath: string;
  name?: string;
}

/**
 * Creates a team (herdr pane) for a project folder and starts Claude Code in it.
 * A second team on the same git repo gets its own worktree on a new studio/<slug>-<n> branch.
 * Returns the new pane id.
 */
export async function createTeam(deps: CreateDeps, input: CreateInput): Promise<string> {
  const projectPath = validateProjectPath(input.projectPath);
  const name = validateName(input.name, projectPath);
  const gitTop = deps.gitToplevel ?? defaultGitToplevel;

  const topLevel = await gitTop(projectPath);
  const siblings = topLevel ? await sameRepoTeams(deps, gitTop, topLevel) : [];

  const paneId =
    siblings.length > 0
      ? await createWorktreePane(deps, projectPath, name, siblings.length + 1)
      : await createWorkspacePane(deps, projectPath, name);

  await launchClaude(deps, paneId);
  logInfo("teams", `created team ${paneId}`, { projectPath, worktree: siblings.length > 0 });
  return paneId;
}

/** Sends a prompt to a team's lead with agent.prompt (safe submit, unlike typing). */
export async function promptTeam(deps: Pick<CreateDeps, "call" | "getTeam">, teamId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === "") throw new CreateError("prompt is empty");
  if (text.length > MAX_PROMPT_LENGTH) throw new CreateError(`prompt exceeds ${MAX_PROMPT_LENGTH} characters`);
  if (!deps.getTeam(teamId)) throw new CreateError(`team ${teamId} does not exist`);
  await deps.call("agent.prompt", { target: teamId, text });
}

function validateProjectPath(raw: string): string {
  const path = raw.trim();
  if (path === "" || !isAbsolute(path)) throw new CreateError("projectPath must be an absolute folder path");
  let isDir = false;
  try {
    isDir = statSync(path).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new CreateError(`projectPath is not an existing folder: ${path}`);
  return path;
}

function validateName(raw: string | undefined, projectPath: string): string {
  const name = (raw ?? "").trim() || basename(projectPath);
  if (name.length > MAX_NAME_LENGTH) throw new CreateError(`name exceeds ${MAX_NAME_LENGTH} characters`);
  return name;
}

async function sameRepoTeams(
  deps: CreateDeps,
  gitTop: (path: string) => Promise<string | null>,
  topLevel: string,
): Promise<Team[]> {
  const matches: Team[] = [];
  for (const team of deps.teams()) {
    if (!team.cwd) continue;
    if ((await gitTop(team.cwd)) === topLevel) matches.push(team);
  }
  return matches;
}

async function createWorktreePane(deps: CreateDeps, projectPath: string, name: string, ordinal: number): Promise<string> {
  const slug = slugify(basename(projectPath));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < WORKTREE_ATTEMPTS; attempt++) {
    const branch = `studio/${slug}-${ordinal + attempt}`;
    try {
      const result = await deps.call<unknown>("worktree.create", {
        cwd: projectPath,
        branch,
        label: name,
        focus: false,
      }, { timeoutMs: 30_000 });
      return paneIdFrom(result, "worktree.create");
    } catch (err) {
      lastError = err;
      if (!(err instanceof HerdrError) || !/already exists/i.test(err.message)) throw err;
    }
  }
  throw new CreateError(`no free studio/${slug}-<n> branch after ${WORKTREE_ATTEMPTS} attempts: ${String(lastError)}`);
}

async function createWorkspacePane(deps: CreateDeps, projectPath: string, name: string): Promise<string> {
  const result = await deps.call<unknown>("workspace.create", { cwd: projectPath, label: name, focus: false });
  return paneIdFrom(result, "workspace.create");
}

async function launchClaude(deps: CreateDeps, paneId: string): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => Bun.sleep(ms));
  await sleep(deps.launchDelayMs ?? 1000);
  const command = `claude --settings "${deps.hooksSettingsFile.replace(/\\/g, "/")}"`;
  await deps.call("pane.send_input", { pane_id: paneId, text: command });
  await deps.call("pane.send_keys", { pane_id: paneId, keys: ["Enter"] });
}

/** Reads result.root_pane.pane_id from a workspace.create or worktree.create reply. */
export function paneIdFrom(result: unknown, where: string): string {
  if (!isRecord(result) || !isRecord(result.root_pane) || typeof result.root_pane.pane_id !== "string") {
    throw new HerdrError("protocol", `${where} reply has no root_pane.pane_id`);
  }
  return result.root_pane.pane_id;
}

export function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug === "" ? "team" : slug;
}
