// Bound model work per segment, but give corrected basketball data its own
// retry budget. Reserve two attempts for the settled final feed.
export class AnalysisRetryPolicy {
  states = new Map();

  observe(key, signature, now) {
    let state = this.states.get(key);
    if (!state) {
      state = { signature, changedAt: now, attempts: 0, total: 0, corrected: false };
      this.states.set(key, state);
    } else if (state.signature !== signature) {
      Object.assign(state, { signature, changedAt: now, attempts: 0, corrected: true });
    }
    return state;
  }

  begin(key, signature, now, final = false) {
    const state = this.observe(key, signature, now);
    if (state.attempts >= 3 || state.total >= (final ? 8 : 6)
      || (state.corrected && now - state.changedAt < 60_000)) return false;
    state.attempts++;
    state.total++;
    return true;
  }

  defer(key, signature) {
    const state = this.states.get(key);
    if (!state || state.signature !== signature) return;
    state.attempts = Math.max(0, state.attempts - 1);
    state.total = Math.max(0, state.total - 1);
  }
}
