import { executeAndResolve } from "./commands";
import { rejectionReason } from "./legal";
import { runUntilBlocked } from "./phases";
import type { ApplyResult, Command, GameModule, GameState } from "./types";

export function applyCommand(state: GameState, module: GameModule, command: Command): ApplyResult {
  const error = rejectionReason(state, module, command);
  if (error) return { ok: false, error, events: [], state };
  const draft = structuredClone(state);
  const from = draft.log.length;
  executeAndResolve(draft, module, command);
  runUntilBlocked(draft, module);
  return { ok: true, events: draft.log.slice(from), state: draft };
}
