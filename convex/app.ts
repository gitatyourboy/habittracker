import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./auth";

async function primaryUserId(ctx: any): Promise<string> {
  const existing = await ctx.db.query("app_state").first();
  if (existing?.user_id) return existing.user_id;
  for (const table of ["weight_logs", "todos", "notes", "goals", "calorie_targets", "finance_months"] as const) {
    const row = await ctx.db.query(table).first();
    if (row?.user_id) return row.user_id;
  }
  throw new Error("No migrated user was found in Convex.");
}

function withoutSystemFields<T extends Record<string, any>>(row: T) {
  const { _id, _creationTime, user_id, ...value } = row;
  return value;
}

async function stateFromNormalizedTables(ctx: any, userId: string) {
  const byUser = async (table: string) =>
    await ctx.db.query(table).withIndex("by_user", (q: any) => q.eq("user_id", userId)).collect();

  const [
    budgetCategories, budgetItems, calorieLog, calorieTargets, financeMonths,
    financeTransactions, fixedExpenses, goals, gymExercises, gymPrs, gymSessions,
    habitLogs, noteBullets, noteFolders, notes, priorityCompletions, priorityItems,
    reservedFunds, savedMeals, sleepLogs, todoHistory, todos, weightLogs,
  ] = await Promise.all([
    byUser("budget_categories"), byUser("budget_category_items"), byUser("calorie_log"),
    byUser("calorie_targets"), byUser("finance_months"), byUser("finance_transactions"),
    byUser("fixed_expenses"), byUser("goals"), byUser("gym_exercises"), byUser("gym_prs"),
    byUser("gym_sessions"), byUser("habit_logs"), byUser("note_bullets"), byUser("note_folders"),
    byUser("notes"), byUser("priority_completions"), byUser("priority_items"), byUser("reserved_funds"),
    byUser("saved_meals"), byUser("sleep_logs"), byUser("todo_history"), byUser("todos"), byUser("weight_logs"),
  ]);

  const calorieByDate: Record<string, any[]> = {};
  for (const row of calorieLog) {
    (calorieByDate[row.date] ??= []).push({
      id: row.id, date: row.date, mealType: row.meal_type, name: row.name,
      calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat,
      time: row.time, createdAt: row.created_at,
    });
  }

  const todosByDate: Record<string, any[]> = {};
  for (const row of todos) {
    (todosByDate[row.date] ??= []).push({
      id: row.id, date: row.date, text: row.text, startTime: row.start_time,
      endTime: row.end_time, priority: row.priority, progress: row.progress,
      done: row.done, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at,
    });
  }
  for (const bucket of Object.values(todosByDate)) bucket.sort((a, b) => a.order - b.order);

  const bulletsByNote: Record<string, any[]> = {};
  for (const row of noteBullets) {
    (bulletsByNote[row.note_id] ??= []).push({
      id: row.id, text: row.text, order: row.sort_order,
      createdAt: row.created_at, updatedAt: row.updated_at,
    });
  }
  for (const bucket of Object.values(bulletsByNote)) bucket.sort((a, b) => a.order - b.order);

  const monthBuckets: Record<string, any> = {};
  for (const row of financeMonths) {
    monthBuckets[row.month_key] = {
      id: row.id,
      totalCash: row.total_cash,
      monthStartDate: row.month_start_date ?? `${row.month_key}-01`,
      quickLog: { items: [] },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  for (const row of financeTransactions) {
    const bucket = monthBuckets[row.month_key] ??= {
      totalCash: 0, monthStartDate: `${row.month_key}-01`, quickLog: { items: [] },
    };
    bucket.quickLog.items.push({
      id: row.id, name: row.name, amount: row.amount, type: row.type,
      date: row.date ?? `${row.month_key}-01`, createdAt: row.created_at,
    });
  }

  const gymData: Record<string, any[]> = {};
  for (const exercise of gymExercises) {
    const sessions = gymSessions.filter((row: any) => row.exercise_id === exercise.id).map((row: any) => ({
      id: row.id, date: row.date, sets: row.sets, reps: row.reps,
      weight: row.weight, ease: row.ease, createdAt: row.created_at,
    }));
    (gymData[exercise.muscle_group] ??= []).push({ exerciseName: exercise.exercise_name, sessions });
  }
  const prs = Object.fromEntries(gymPrs.map((row: any) => [row.exercise_name, row.max_weight]));

  const habits: Record<string, string[]> = {
    reading: [], gym: [], noPorn: [], coding: [], japanese: [], socialExposure: [],
  };
  for (const row of habitLogs) (habits[row.habit] ??= []).push(row.date);

  const orderedPriorities = [...priorityItems].sort((a: any, b: any) => a.position - b.position);
  const weights = [...weightLogs].sort((a: any, b: any) => a.date.localeCompare(b.date));
  const monthKeys = Object.keys(monthBuckets).sort();

  return {
    checkins: [],
    habits,
    priorities: {
      items: orderedPriorities.length ? orderedPriorities.map((row: any) => row.text) : ["Gym", "Coding", "Business"],
      completed: priorityCompletions.map((row: any) => ({ id: row.id, date: row.date, text: row.text })),
    },
    sleep: sleepLogs.map((row: any) => ({
      id: row.id, date: row.date, from: row.sleep_from, to: row.sleep_to,
      hours: row.hours, quality: row.quality, createdAt: row.created_at,
    })),
    weight: weights.map((row: any) => ({
      id: row.id, date: row.date, weight: row.weight, note: row.note, createdAt: row.created_at,
    })),
    startingWeight: weights[0]?.weight ?? null,
    weightMode: null,
    goals: goals.map((row: any) => ({
      id: row.id, title: row.title, desc: row.description, progress: row.progress,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })),
    transactions: [],
    financeMonths: monthBuckets,
    selectedFinanceMonth: monthKeys.at(-1) ?? null,
    fixedExpenses: fixedExpenses.map((row: any) => ({
      id: row.id, name: row.name, cost: row.cost, createdAt: row.created_at,
    })),
    reservedFunds: reservedFunds.map((row: any) => ({
      id: row.id, name: row.name, amount: row.amount,
      startingAmount: row.starting_amount, createdAt: row.created_at,
    })),
    budgetCategories: budgetCategories.map((row: any) => ({
      id: row.id, name: row.name, percent: row.percent, createdAt: row.created_at,
      items: budgetItems.filter((item: any) => item.category_id === row.id).map((item: any) => ({
        id: item.id, name: item.name, cost: item.cost, createdAt: item.created_at,
      })),
    })),
    gym: { gymData, workouts: [], prs, _migrated: true },
    todos: [],
    todosByDate,
    todosDeleted: {},
    todoHistory: todoHistory.map((row: any) => ({
      id: row.id, date: row.date, tasks: row.tasks, completedCount: row.completed_count,
      skippedCount: row.skipped_count, completionPct: row.completion_pct, createdAt: row.created_at,
    })),
    notes: notes.map((row: any) => ({
      id: row.id, folderId: row.folder_id, title: row.title, order: row.sort_order,
      bullets: bulletsByNote[row.id] ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
    })),
    folders: noteFolders.map((row: any) => ({
      id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at,
    })),
    notesDeleted: [],
    foldersDeleted: [],
    calorieTargets: calorieTargets[0]
      ? withoutSystemFields(calorieTargets[0])
      : { calories: 2000, protein: 150, carbs: 200, fat: 65 },
    calorieLog: calorieByDate,
    savedMeals: savedMeals.map((row: any) => ({
      id: row.id, name: row.name, mealType: row.meal_type, calories: row.calories,
      protein: row.protein, carbs: row.carbs, fat: row.fat, createdAt: row.created_at,
    })),
  };
}

export const load = query({
  args: { profileId: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.profileId, args.sessionToken);
    const existing = await ctx.db.query("app_state").withIndex("by_profile", (q) => q.eq("profile_id", args.profileId)).unique();
    return existing
      ? { state: existing.state, updatedAt: existing.updated_at, version: existing.version }
      : { state: null, updatedAt: null, version: 0 };
  },
});

export const save = mutation({
  args: { profileId: v.string(), sessionToken: v.string(), state: v.any(), baseVersion: v.number() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.profileId, args.sessionToken);
    const state = args.state;
    const encoded = JSON.stringify(state);
    if (encoded.length > 900_000) throw new Error("Tracker state is too large to store safely.");
    const existing = await ctx.db.query("app_state").withIndex("by_profile", (q) => q.eq("profile_id", args.profileId)).unique();
    const currentVersion = existing?.version ?? 0;
    if (args.baseVersion !== currentVersion) {
      return {
        conflict: true, state: existing?.state ?? null,
        updatedAt: existing?.updated_at ?? null, version: currentVersion,
      };
    }
    const updatedAt = new Date().toISOString();
    const version = currentVersion + 1;
    if (existing) await ctx.db.patch(existing._id, { state, updated_at: updatedAt, version });
    else await ctx.db.insert("app_state", {
      user_id: args.profileId, profile_id: args.profileId, state, updated_at: updatedAt, version,
    });
    return { conflict: false, state: null, updatedAt, version };
  },
});

export const status = query({
  args: { profileId: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.profileId, args.sessionToken);
    const state = await ctx.db.query("app_state").withIndex("by_profile", (q) => q.eq("profile_id", args.profileId)).unique();
    return { connected: true, initialized: Boolean(state), version: state?.version ?? 0 };
  },
});
