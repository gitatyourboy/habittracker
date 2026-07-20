import { internalQuery } from "./_generated/server";

const tableNames = [
  "budget_categories", "budget_category_items", "calorie_log", "calorie_targets",
  "finance_months", "finance_transactions", "fixed_expenses", "goals",
  "gym_exercises", "gym_prs", "gym_sessions", "habit_logs", "note_bullets",
  "note_folders", "notes", "priority_completions", "priority_items", "reserved_funds",
  "saved_meals", "sleep_logs", "todo_history", "todos", "weight_logs",
] as const;

export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of tableNames) {
      counts[table] = (await ctx.db.query(table).collect()).length;
    }
    return counts;
  },
});
