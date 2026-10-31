import type { ServerMessage } from "@studio/shared";
import { logInfo, logWarn } from "../log.ts";
import { spawnControl, type ControlProcess } from "./control.ts";

export class TerminalError extends Error {}

export interface BridgeDeps {
  herdrBin: string;
  resolveTerminal: (teamId: string) => string | undefined;
  send: (clientIds: Iterable<string>, message: ServerMessage) => void;
  /** Time a transient control process needs before it accepts input. */
  transientReadyMs?: number;
  /** Replay buffer cap per session, in base64 characters. */
  replayCap?: number;
}

interface Session {
  teamId: string;
  terminalId: string;
  control: ControlProcess | null;
  viewers: Set<string>;
  /** Frames since the last full repaint, replayed to viewers that join later. */
  replay: ReplayFrame[];
  replayChars: number;
  cols: number;
  rows: number;
}

interface ReplayFrame {
  data: string;
  full: boolean;
}

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const DEFAULT_REPLAY_CAP = 2 * 1024 * 1024;

/**
 * One herdr control stream per team with a viewer, shared by every WS client that
 * has the team open. The stream is killed when the last viewer leaves.
 */
export class TerminalBridge {
  private readonly sessions = new Map<string, Session>();
  private readonly transientReadyMs: number;
  private readonly replayCap: number;

  constructor(private readonly deps: BridgeDeps) {
    this.transientReadyMs = deps.transientReadyMs ?? 800;
    this.replayCap = deps.replayCap ?? DEFAULT_REPLAY_CAP;
  }

  open(teamId: string, clientId: string, cols: number, rows: number): void {
    const existing = this.sessions.get(teamId);
    if (existing) {
      existing.viewers.add(clientId);
      this.replayTo(existing, clientId);
      return;
    }
    const terminalId = this.deps.resolveTerminal(teamId);
    if (!terminalId) throw new TerminalError(`team ${teamId} does not exist`);
    const session: Session = {
      teamId,
      terminalId,
      control: null,
      viewers: new Set([clientId]),
      replay: [],
      replayChars: 0,
      cols,
      rows,
    };
    this.sessions.set(teamId, session);
    session.control = this.spawn(session, cols, rows, true);
    logInfo("terminal", `opened stream for ${teamId}`, { viewers: 1 });
  }

  input(teamId: string, clientId: string, bytesBase64: string): void {
    const session = this.requireViewer(teamId, clientId);
    if (!session.control) throw new TerminalError(`stream for ${teamId} is not running`);
    session.control.sendInput(bytesBase64);
  }

  resize(teamId: string, clientId: string, cols: number, rows: number): void {
    const session = this.requireViewer(teamId, clientId);
    if (!session.control) throw new TerminalError(`stream for ${teamId} is not running`);
    session.cols = cols;
    session.rows = rows;
    session.control.resize(cols, rows);
  }

  close(teamId: string, clientId: string): void {
    const session = this.sessions.get(teamId);
    if (!session) return;
    session.viewers.delete(clientId);
    if (session.viewers.size > 0) return;
    this.sessions.delete(teamId);
    session.control?.kill();
    logInfo("terminal", `closed stream for ${teamId}`, { viewers: 0 });
  }

  /** Called when a WS client disconnects: drops it from every session it viewed. */
  dropClient(clientId: string): void {
    for (const teamId of [...this.sessions.keys()]) this.close(teamId, clientId);
  }

  /** Ends the stream for a team that no longer exists, telling its viewers why. */
  endTeam(teamId: string, reason: string): void {
    const session = this.sessions.get(teamId);
    if (!session) return;
    this.sessions.delete(teamId);
    this.deps.send(session.viewers, { type: "terminal.closed", teamId, reason });
    session.control?.kill();
  }

  closeAll(): void {
    for (const session of this.sessions.values()) session.control?.kill();
    this.sessions.clear();
  }

  /**
   * Runs `fn` with a write function for the team's terminal. Uses the live stream when a
   * viewer has it open, otherwise a short-lived control process that is killed afterwards.
   */
  async withInput(teamId: string, fn: (write: (text: string) => void) => Promise<void>): Promise<void> {
    const live = this.sessions.get(teamId);
    if (live?.control) {
      const control = live.control;
      await fn((text) => control.sendInput(Buffer.from(text, "utf8").toString("base64")));
      return;
    }
    const terminalId = this.deps.resolveTerminal(teamId);
    if (!terminalId) throw new TerminalError(`team ${teamId} does not exist`);
    const transient: Session = {
      teamId, terminalId, control: null, viewers: new Set(), replay: [], replayChars: 0,
      cols: DEFAULT_COLS, rows: DEFAULT_ROWS,
    };
    const control = this.spawn(transient, DEFAULT_COLS, DEFAULT_ROWS, false);
    try {
      await Bun.sleep(this.transientReadyMs);
      await fn((text) => control.sendInput(Buffer.from(text, "utf8").toString("base64")));
    } finally {
      control.kill();
    }
  }

  private spawn(session: Session, cols: number, rows: number, keepFrames: boolean): ControlProcess {
    return spawnControl(this.deps.herdrBin, session.terminalId, cols, rows, {
      onFrame: (bytes, full) => {
        if (keepFrames) this.onFrame(session, bytes, full);
      },
      onExit: (reason) => {
        if (!keepFrames) return;
        if (this.sessions.get(session.teamId) !== session) return;
        this.sessions.delete(session.teamId);
        logWarn("terminal", `stream for ${session.teamId} ended`, reason);
        this.deps.send(session.viewers, { type: "terminal.closed", teamId: session.teamId, reason });
      },
    });
  }

  private onFrame(session: Session, bytes: string, full: boolean): void {
    if (full) {
      session.replay = [];
      session.replayChars = 0;
    }
    if (session.replayChars + bytes.length > this.replayCap) {
      logWarn("terminal", `replay buffer for ${session.teamId} overflowed; new viewers wait for the next full frame`);
      session.replay = [];
      session.replayChars = 0;
    } else {
      session.replay.push({ data: bytes, full });
      session.replayChars += bytes.length;
    }
    this.deps.send(session.viewers, { type: "terminal.frame", teamId: session.teamId, data: bytes, full });
  }

  private replayTo(session: Session, clientId: string): void {
    for (const frame of session.replay) {
      this.deps.send([clientId], { type: "terminal.frame", teamId: session.teamId, data: frame.data, full: frame.full });
    }
  }

  private requireViewer(teamId: string, clientId: string): Session {
    const session = this.sessions.get(teamId);
    if (!session || !session.viewers.has(clientId)) {
      throw new TerminalError(`no open terminal for ${teamId} on this connection`);
    }
    return session;
  }
}
