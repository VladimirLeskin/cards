import type { ApplyResult, ClientView, Command } from "./types";
import type { Match } from "./match";

export interface SeatBinding {
  /** Secret per connection. The host maps it to a player id and never trusts the command alone. */
  token: string;
  playerId: string;
}

/**
 * Authoritative table for local hotseat or a future network host.
 * Clients send commands; the session rejects a token that does not own `command.playerId`.
 */
export class TableSession {
  private readonly seats = new Map<string, string>();

  constructor(
    readonly match: Match,
    bindings: SeatBinding[],
  ) {
    for (const binding of bindings) {
      if (this.seats.has(binding.token)) throw new Error(`Повтор токена места: ${binding.token}`);
      this.seats.set(binding.token, binding.playerId);
    }
  }

  playerIdFor(token: string): string | undefined {
    return this.seats.get(token);
  }

  view(token: string): ClientView {
    const playerId = this.seats.get(token);
    if (!playerId) throw new Error("Unknown seat");
    return this.match.view(playerId);
  }

  act(token: string, command: Command): ApplyResult {
    const playerId = this.seats.get(token);
    if (!playerId) {
      return { ok: false, error: "Unknown seat", events: [], state: this.match.getState() };
    }
    if (command.playerId !== playerId) {
      return { ok: false, error: "Seat mismatch", events: [], state: this.match.getState() };
    }
    return this.match.submit(command);
  }
}
