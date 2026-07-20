import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Convex schedules use UTC. These times are UK summer time (BST, UTC+1).
// Update the UTC hour values when the UK returns to GMT in late October.
const crons = cronJobs();

// Your current to-do list, delivered at 8am, 4pm, and 8pm UK time.
crons.daily("morning to-do list", { hourUTC: 7, minuteUTC: 0 }, internal.reminders.sendTodoReminder, { slot: "8am" });
crons.daily("afternoon to-do list", { hourUTC: 15, minuteUTC: 0 }, internal.reminders.sendTodoReminder, { slot: "4pm" });
crons.daily("evening to-do list", { hourUTC: 19, minuteUTC: 0 }, internal.reminders.sendTodoReminder, { slot: "8pm" });

// Separate daily prompts, so they are not hidden by completed to-dos.
crons.daily("weight check-in", { hourUTC: 7, minuteUTC: 5 }, internal.reminders.sendWeightReminder, {});
crons.daily("lifetime goals check-in", { hourUTC: 19, minuteUTC: 5 }, internal.reminders.sendGoalsReminder, {});
crons.daily("tomorrow's goals prompt", { hourUTC: 20, minuteUTC: 0 }, internal.reminders.sendTomorrowGoalsReminder, {});

export default crons;
