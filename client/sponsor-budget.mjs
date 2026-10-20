// The sponsor's daily SOL budget.
//
// The count limits (seals per day, sends per person) don't bound money: a run of brand campaigns
// or sends could still drain the sponsor wallet inside them. This tracks what the wallet actually
// lost today, read from its balance, and says no to new sponsored work once that passes the cap.
// A top-up raises the day's baseline rather than looking like spending went down, so adding SOL
// never hides what was spent. Resets at midnight UTC. A cap of 0 turns it off.
export function createBudget(capSol, now = () => new Date()) {
  let day = '', baseline = null, last = null, prev = null;
  const today = () => now().toISOString().slice(0, 10);
  return {
    cap: capSol,
    observe(sol) {
      if (sol == null || !Number.isFinite(sol)) return;
      const d = today();
      if (d !== day || baseline == null) {
        if (baseline != null) prev = { day, spent: this.spent(), balance: last }; // kept for the daily report
        day = d; baseline = sol; last = sol; return;
      }
      if (sol > last) baseline += sol - last; // a top-up, not a refund of today's spending
      last = sol;
    },
    spent() { return baseline == null ? 0 : Math.max(0, Math.round((baseline - last) * 1e4) / 1e4); },
    allows() { return !(this.cap > 0) || this.spent() < this.cap; },
    day() { return day; },
    previous() { return prev; },
  };
}
