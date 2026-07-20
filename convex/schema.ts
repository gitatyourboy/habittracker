import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const byUser = (table: ReturnType<typeof defineTable>) =>
  table.index("by_user", ["user_id"]);

export default defineSchema({
  app_state: defineTable({
    user_id: v.string(),
    profile_id: v.optional(v.string()),
    state: v.any(),
    updated_at: v.string(),
    version: v.number(),
  }).index("by_user", ["user_id"]).index("by_profile", ["profile_id"]),

  cloud_profiles: defineTable({
    profile_id: v.string(), name: v.string(), login_name: v.optional(v.string()),
    pin_salt: v.string(), pin_proof: v.string(), created_at: v.number(),
  }).index("by_profile", ["profile_id"]).index("by_login_name", ["login_name"]),

  profile_sessions: defineTable({
    profile_id: v.string(), token_hash: v.string(), created_at: v.number(), expires_at: v.number(),
  }).index("by_token", ["token_hash"]).index("by_profile", ["profile_id"]),

  login_attempts: defineTable({
    profile_id: v.string(), count: v.number(), window_start: v.number(), locked_until: v.optional(v.number()),
  }).index("by_profile", ["profile_id"]),

  budget_categories: byUser(defineTable({
    id: v.string(), user_id: v.string(), name: v.string(), percent: v.number(), created_at: v.string(),
  })).index("by_user_name", ["user_id", "name"]),

  budget_category_items: byUser(defineTable({
    id: v.string(), user_id: v.string(), category_id: v.string(), name: v.string(), cost: v.number(), created_at: v.string(),
  })).index("by_user_category", ["user_id", "category_id"]),

  calorie_log: byUser(defineTable({
    id: v.string(), user_id: v.string(), date: v.string(), meal_type: v.string(), name: v.string(),
    calories: v.number(), protein: v.number(), carbs: v.number(), fat: v.number(), time: v.string(), created_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  calorie_targets: byUser(defineTable({
    user_id: v.string(), calories: v.number(), protein: v.number(), carbs: v.number(), fat: v.number(), updated_at: v.string(),
  })),

  finance_months: byUser(defineTable({
    id: v.string(), user_id: v.string(), month_key: v.string(), total_cash: v.number(),
    month_start_date: v.optional(v.string()), created_at: v.string(), updated_at: v.string(),
  })).index("by_user_month", ["user_id", "month_key"]),

  finance_transactions: byUser(defineTable({
    id: v.string(), user_id: v.string(), finance_month_id: v.string(), month_key: v.string(), name: v.string(),
    amount: v.number(), type: v.string(), date: v.optional(v.string()), created_at: v.string(),
  })).index("by_user_month", ["user_id", "month_key"]),

  fixed_expenses: byUser(defineTable({
    id: v.string(), user_id: v.string(), name: v.string(), cost: v.number(), created_at: v.string(),
  })),

  goals: byUser(defineTable({
    id: v.string(), user_id: v.string(), title: v.string(), description: v.string(), progress: v.number(),
    created_at: v.string(), updated_at: v.string(),
  })),

  gym_exercises: byUser(defineTable({
    id: v.string(), user_id: v.string(), muscle_group: v.string(), exercise_name: v.string(), created_at: v.string(),
  })).index("by_user_muscle", ["user_id", "muscle_group"]),

  gym_prs: byUser(defineTable({
    id: v.string(), user_id: v.string(), exercise_name: v.string(), max_weight: v.number(), updated_at: v.string(),
  })).index("by_user_exercise", ["user_id", "exercise_name"]),

  gym_sessions: byUser(defineTable({
    id: v.string(), user_id: v.string(), exercise_id: v.string(), date: v.string(), sets: v.number(), reps: v.number(),
    weight: v.number(), ease: v.optional(v.number()), created_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  habit_logs: byUser(defineTable({
    id: v.string(), user_id: v.string(), habit: v.string(), date: v.string(), created_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  note_bullets: byUser(defineTable({
    id: v.string(), user_id: v.string(), note_id: v.string(), text: v.string(), sort_order: v.number(),
    created_at: v.string(), updated_at: v.string(),
  })).index("by_user_note", ["user_id", "note_id"]),

  note_folders: byUser(defineTable({
    id: v.string(), user_id: v.string(), name: v.string(), created_at: v.string(), updated_at: v.string(),
  })),

  notes: byUser(defineTable({
    id: v.string(), user_id: v.string(), folder_id: v.string(), title: v.string(), sort_order: v.number(),
    created_at: v.string(), updated_at: v.string(),
  })).index("by_user_folder", ["user_id", "folder_id"]),

  priority_completions: byUser(defineTable({
    id: v.string(), user_id: v.string(), date: v.string(), text: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  priority_items: byUser(defineTable({
    id: v.string(), user_id: v.string(), text: v.string(), position: v.number(),
  })),

  reserved_funds: byUser(defineTable({
    id: v.string(), user_id: v.string(), name: v.string(), amount: v.number(), starting_amount: v.number(), created_at: v.string(),
  })),

  saved_meals: byUser(defineTable({
    id: v.string(), user_id: v.string(), name: v.string(), meal_type: v.string(), calories: v.number(),
    protein: v.number(), carbs: v.number(), fat: v.number(), created_at: v.string(),
  })),

  sleep_logs: byUser(defineTable({
    id: v.string(), user_id: v.string(), date: v.string(), sleep_from: v.string(), sleep_to: v.string(),
    hours: v.number(), quality: v.number(), created_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  todo_history: byUser(defineTable({
    id: v.string(), user_id: v.string(), date: v.string(), tasks: v.any(), completed_count: v.number(),
    skipped_count: v.number(), completion_pct: v.number(), created_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  todos: byUser(defineTable({
    id: v.string(), user_id: v.string(), date: v.string(), text: v.string(), start_time: v.string(), end_time: v.string(),
    priority: v.string(), progress: v.number(), done: v.boolean(), sort_order: v.number(), created_at: v.string(), updated_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),

  weight_logs: byUser(defineTable({
    id: v.string(), user_id: v.string(), date: v.string(), weight: v.number(), note: v.string(), created_at: v.string(),
  })).index("by_user_date", ["user_id", "date"]),
});
