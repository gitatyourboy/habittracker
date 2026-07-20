import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const TIMEZONE = "Europe/London";
const DEFAULT_TO_EMAIL = "spacebub126@gmail.com";
// Until a domain is verified in Resend, use onboarding@resend.dev and send only
// to the email address that owns the Resend account.
const FROM_EMAIL = "HabitTracker <onboarding@resend.dev>";

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]!);
}

async function sendEmail(subject: string, heading: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set. Run: npx convex env set RESEND_API_KEY <key>");
  }

  const recipient = process.env.REMINDER_TO_EMAIL ?? DEFAULT_TO_EMAIL;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px"><h2 style="margin:0 0 12px">${heading}</h2><p style="color:#555;margin:0 0 16px">${todayISO()}</p>${body}</div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [recipient], subject, html }),
  });
  if (!response.ok) throw new Error(`Resend failed (${response.status}): ${await response.text()}`);
  console.log(`${subject} sent to ${recipient}.`);
}

export const reminderStatus = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const row = await ctx.db.query("app_state").first();
    const state: any = row?.state;
    if (!state) return null;

    const weightLogged = Array.isArray(state.weight) && state.weight.some((weight: any) => weight?.date === date);
    const todosToday: any[] = state.todosByDate?.[date] ?? [];
    const pendingTodos = todosToday.filter((todo) => !todo?.done).map((todo) => String(todo?.text ?? "").trim()).filter(Boolean);
    const priorityItems: string[] = state.priorities?.items ?? [];
    const completedToday = new Set((state.priorities?.completed ?? []).filter((item: any) => item?.date === date).map((item: any) => item?.text));
    return { weightLogged, pendingTodos, pendingPriorities: priorityItems.filter((item) => !completedToday.has(item)) };
  },
});

export const sendTodoReminder = internalAction({
  args: { slot: v.string() },
  handler: async (ctx, { slot }) => {
    const status = await ctx.runQuery(internal.reminders.reminderStatus, { date: todayISO() });
    const tasks = status?.pendingTodos ?? [];
    const taskList = tasks.length
      ? `<ol>${tasks.slice(0, 20).map((task) => `<li style="margin:6px 0">${escapeHtml(task)}</li>`).join("")}</ol>${tasks.length > 20 ? `<p>Plus ${tasks.length - 20} more tasks.</p>` : ""}`
      : "<p>No open tasks for today. Enjoy the clear list!</p>";
    await sendEmail(`To-do list: ${slot}`, `Your ${slot} to-do list`, taskList);
  },
});

export const sendWeightReminder = internalAction({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.runQuery(internal.reminders.reminderStatus, { date: todayISO() });
    const message = status?.weightLogged
      ? "<p>Your weight is already logged today. Nice work staying consistent.</p>"
      : "<p>Take a moment to weigh in and log your weight in HabitTracker.</p>";
    await sendEmail("Daily weight check-in", "Weight check-in", message);
  },
});

export const sendGoalsReminder = internalAction({
  args: {},
  handler: async () => {
    await sendEmail(
      "Remember to check your lifetime goals",
      "Lifetime goals check-in",
      "<p>Take a moment to check your lifetime goals and make sure you are moving in the direction you want.</p>",
    );
  },
});

export const sendTomorrowGoalsReminder = internalAction({
  args: {},
  handler: async () => {
    await sendEmail(
      "Write down tomorrow's goals",
      "Plan tomorrow",
      "<p>Before you finish for the day, write down the goals and priorities you want to complete tomorrow.</p>",
    );
  },
});
