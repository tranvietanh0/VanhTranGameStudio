import { create } from "zustand";
import type { LeadQuestion, Team } from "@studio/shared";

export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "mock";
export type ToastTone = "ok" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

export interface OfficeState {
  connection: ConnectionState;
  reconnectAttempt: number;
  herdrConnected: boolean;
  teams: Record<string, Team>;
  questions: Record<string, LeadQuestion>;
  toasts: Toast[];
  selectedTeamId: string | null;
  /** Team whose terminal panel is open (only one xterm instance lives at a time). */
  terminalTeamId: string | null;
  /** Question shown in the CEO dialog. */
  activeQuestionId: string | null;
  addTeamOpen: boolean;
  /** Bumped on every data change. The 3D scene uses it to wake the demand-mode render loop. */
  revision: number;
  setConnection: (connection: ConnectionState, attempt?: number) => void;
  hydrate: (teams: Team[], questions: LeadQuestion[], herdrConnected: boolean) => void;
  upsertTeam: (team: Team) => void;
  removeTeam: (teamId: string) => void;
  upsertQuestion: (question: LeadQuestion) => void;
  removeQuestion: (questionId: string) => void;
  setHerdrConnected: (connected: boolean) => void;
  selectTeam: (teamId: string | null) => void;
  openTerminal: (teamId: string | null) => void;
  openQuestion: (questionId: string | null) => void;
  setAddTeamOpen: (open: boolean) => void;
  pushToast: (tone: ToastTone, text: string) => void;
  dismissToast: (id: number) => void;
}

const TOAST_TTL_MS = 4_000;
const MAX_TOASTS = 5;
let toastSeq = 0;

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export const useOfficeStore = create<OfficeState>()((set, get) => ({
  connection: "idle",
  reconnectAttempt: 0,
  herdrConnected: false,
  teams: {},
  questions: {},
  toasts: [],
  selectedTeamId: null,
  terminalTeamId: null,
  activeQuestionId: null,
  addTeamOpen: false,
  revision: 0,

  setConnection: (connection, attempt = 0) => set({ connection, reconnectAttempt: attempt }),

  hydrate: (teams, questions, herdrConnected) =>
    set((s) => ({
      teams: indexById(teams),
      questions: indexById(questions),
      herdrConnected,
      revision: s.revision + 1,
    })),

  upsertTeam: (team) => set((s) => ({ teams: { ...s.teams, [team.id]: team }, revision: s.revision + 1 })),

  removeTeam: (teamId) =>
    set((s) => {
      const teams = { ...s.teams };
      delete teams[teamId];
      const questions = Object.fromEntries(Object.entries(s.questions).filter(([, q]) => q.teamId !== teamId));
      return {
        teams,
        questions,
        selectedTeamId: s.selectedTeamId === teamId ? null : s.selectedTeamId,
        terminalTeamId: s.terminalTeamId === teamId ? null : s.terminalTeamId,
        revision: s.revision + 1,
      };
    }),

  upsertQuestion: (question) =>
    set((s) => ({ questions: { ...s.questions, [question.id]: question }, revision: s.revision + 1 })),

  removeQuestion: (questionId) =>
    set((s) => {
      const questions = { ...s.questions };
      delete questions[questionId];
      return { questions, activeQuestionId: s.activeQuestionId === questionId ? null : s.activeQuestionId, revision: s.revision + 1 };
    }),

  setHerdrConnected: (herdrConnected) => set((s) => ({ herdrConnected, revision: s.revision + 1 })),

  selectTeam: (selectedTeamId) => set((s) => ({ selectedTeamId, revision: s.revision + 1 })),
  openTerminal: (terminalTeamId) => set({ terminalTeamId }),
  openQuestion: (activeQuestionId) => set({ activeQuestionId }),
  setAddTeamOpen: (addTeamOpen) => set({ addTeamOpen }),

  pushToast: (tone, text) => {
    toastSeq += 1;
    const id = toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, tone, text }].slice(-MAX_TOASTS) }));
    setTimeout(() => get().dismissToast(id), TOAST_TTL_MS);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
