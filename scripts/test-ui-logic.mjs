import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /id="planner-schedule-overlay"/, 'planner scheduling dialog should exist');
assert.match(html, /id="planner-schedule-start"/, 'planner scheduling dialog should ask for a start time');
assert.match(html, /id="planner-schedule-end"/, 'planner scheduling dialog should ask for an end time');
assert.match(html, /function plannerPointerStart/, 'mobile pointer dragging should be implemented');
assert.match(html, />Set time<\//, 'mobile planner should provide a direct scheduling fallback');
assert.match(html, /toggleTodoLock/, 'to-do items should expose a lock control');
assert.match(html, /togglePlannerItemLock/, 'planner items should expose a lock control');
assert.match(html, /Did it on time/, 'planner items should expose the on-time outcome');
assert.match(html, /Did not do it/, 'planner items should expose the missed outcome');
assert.match(html, /id="consistency-timing-metrics"/, 'consistency should include task timing metrics');
assert.ok(html.indexOf('id="consistency-timing-metrics"') < html.indexOf('id="consistency-details"'), 'task timing should remain visible outside collapsed completion details');
assert.match(html, /function toggleConsistencyTiming/, 'the Timing section should be foldable');
const inlineScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('const DB ='));

if (!inlineScript) throw new Error('Main inline application script was not found');

const element = () => ({
  style: {},
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {},
  removeEventListener() {},
  setAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
});

const documentStub = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  getElementById() { return element(); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};

const context = vm.createContext({
  assert,
  console,
  document: documentStub,
  window: { addEventListener() {}, removeEventListener() {}, scrollTo() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: {},
  crypto: globalThis.crypto,
  URL,
  Date,
  Math,
  JSON,
  Intl,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame(callback) { callback(); },
});

const tests = `
  assert.equal(_todoEffectiveProgress({ done:true, progress:0 }), 100);
  assert.equal(_todoEffectiveProgress({ done:false, progress:30 }), 30);

  const historyEntry = { tasks:[
    { text:'Finished', done:true, progress:100 },
    { text:'Started', done:false, progress:30 },
  ] };
  _refreshTodoHistoryEntry(historyEntry);
  assert.equal(historyEntry.completedCount, 1);
  assert.equal(historyEntry.skippedCount, 1);
  assert.equal(historyEntry.completionPct, 65);

  const dateKey = today();
  const data = DB.defaults();
  data.todoHistory = [{ id:'history-1', date:dateKey, tasks:historyEntry.tasks }];
  data.todosByDate[dateKey] = [{ id:'live-1', text:'Halfway', done:false, progress:50, priority:'m' }];
  const records = _consistencyRecords(data);
  assert.equal(records[dateKey].total, 3);
  assert.equal(records[dateKey].done, 1);
  assert.equal(_consistencyPct(records[dateKey]), 60);

  const unfinished = _consistencyUnfinishedTasks(data, '7');
  assert.equal(unfinished.length, 2);
  assert.deepEqual(unfinished.map(task => task.progress).sort((a,b) => a-b), [30,50]);
  assert.equal(_consistencyLocateTask(data, 'live', dateKey, 'live-1', 0).task.text, 'Halfway');
  assert.equal(_consistencyLocateTask(data, 'history', dateKey, 'history-1', 1).task.text, 'Started');

  assert.equal(_plannerEndTime('06:30'), '07:30');
  assert.equal(_plannerEndTime('23:30'), '23:59');
  assert.equal(_plannerTimeMinutes('05:30'), 330);
  assert.equal(_plannerValidTimeRange('08:15','09:45'), true);
  assert.equal(_plannerValidTimeRange('09:45','08:15'), false);
  const longEventPosition = _plannerEventPosition({ startTime:'05:00', endTime:'11:11' });
  assert.equal(longEventPosition.top, 283);
  assert.ok(longEventPosition.height > 300, 'long events should span multiple time rows');
  const shortLayouts = _plannerEventLayouts([
    { event:{ id:'short-1', startTime:'06:30', endTime:'06:50' }, kind:'private' },
    { event:{ id:'short-2', startTime:'07:00', endTime:'07:15' }, kind:'private' },
  ]);
  assert.equal(shortLayouts[0].laneCount, 2, 'short cards whose visual boxes collide should use separate lanes');
  assert.equal(shortLayouts[1].laneCount, 2);
  assert.notEqual(shortLayouts[0].lane, shortLayouts[1].lane);

  const scheduleData = DB.defaults();
  scheduleData.selectedTodoDate = dateKey;
  scheduleData.todosByDate[dateKey] = [{ id:'scheduled-1', text:'Exact duration', done:false, progress:0 }];
  DB.get = () => scheduleData;
  DB.update = callback => { callback(scheduleData); return scheduleData; };
  renderPlanner = () => {};
  toast = () => {};
  schedulePlannerTodo('scheduled-1', '08:15', '09:45', dateKey);
  assert.equal(scheduleData.todosByDate[dateKey][0].startTime, '08:15');
  assert.equal(scheduleData.todosByDate[dateKey][0].endTime, '09:45');
  setPlannerOutcome('todo', 'scheduled-1', 'on_time');
  assert.equal(scheduleData.todosByDate[dateKey][0].timingStatus, 'on_time');
  assert.equal(scheduleData.todosByDate[dateKey][0].done, true);
  assert.equal(scheduleData.todosByDate[dateKey][0].progress, 100);
  setPlannerOutcome('todo', 'scheduled-1', 'missed');
  assert.equal(scheduleData.todosByDate[dateKey][0].timingStatus, 'missed');
  assert.equal(scheduleData.todosByDate[dateKey][0].done, false);
  assert.equal(scheduleData.todosByDate[dateKey][0].progress, 0);
  scheduleData.plannerEventsByDate[dateKey] = [
    { id:'event-1', text:'Workout', startTime:'10:00', endTime:'11:00', timingStatus:'on_time' },
    { id:'event-2', text:'Read', startTime:'20:00', endTime:'20:30', timingStatus:'done' },
  ];
  const futureTimingDate = _dateKey(new Date(Date.now() + 86400000));
  scheduleData.todosByDate[futureTimingDate] = [{ id:'future-1', text:'Future task', startTime:'12:00', endTime:'13:00' }];
  scheduleData.todosByDate[dateKey].push({ id:'removed-time-1', text:'Was scheduled', startTime:'', endTime:'', lastScheduledStartTime:'14:00', lastScheduledEndTime:'15:00' });
  const timing = _consistencyTimingSummary(scheduleData);
  assert.equal(timing.items.length, 4);
  assert.equal(timing.items.some(item => item.date === futureTimingDate), false);
  assert.equal(timing.evaluated.length, 3);
  assert.equal(timing.onTime, 1);
  assert.equal(timing.done, 1);
  assert.equal(timing.missed, 1);
  assert.equal(timing.pending, 1);
  assert.equal(timing.score, 33);

  const lockedData = DB.defaults();
  lockedData.todosByDate[dateKey] = [{ id:'daily-task', text:'Read', priority:'h', progress:65, done:false }];
  assert.equal(_toggleTodoLockInData(lockedData, lockedData.todosByDate[dateKey][0]), true);
  assert.equal(lockedData.lockedTodoTemplates.length, 1);
  DB.get = () => lockedData;
  DB.update = callback => { callback(lockedData); return lockedData; };
  schedulePlannerTodo('daily-task', '07:00', '08:20', dateKey);
  assert.equal(lockedData.lockedTodoTemplates[0].startTime, '07:00');
  assert.equal(lockedData.lockedTodoTemplates[0].endTime, '08:20');
  const nextDate = _dateKey(new Date(Date.now() + 86400000));
  _materializeLockedDaily(lockedData, nextDate);
  const repeatedTask = lockedData.todosByDate[nextDate][0];
  assert.equal(repeatedTask.text, 'Read');
  assert.equal(repeatedTask.locked, true);
  assert.equal(repeatedTask.progress, 0);
  assert.equal(repeatedTask.endTime, '08:20');

  lockedData.plannerEventsByDate[dateKey] = [{ id:'daily-event', text:'Gym', startTime:'06:00', endTime:'07:30' }];
  assert.equal(_togglePlannerLockInData(lockedData, lockedData.plannerEventsByDate[dateKey][0]), true);
  const thirdDate = _dateKey(new Date(Date.now() + 172800000));
  _materializeLockedDaily(lockedData, thirdDate);
  assert.equal(lockedData.plannerEventsByDate[thirdDate][0].text, 'Gym');
  assert.equal(lockedData.plannerEventsByDate[thirdDate][0].locked, true);

  assert.equal(_toggleTodoLockInData(lockedData, repeatedTask), false);
  assert.equal(lockedData.lockedTodoTemplates.length, 0);
  assert.equal(lockedData.todosByDate[dateKey][0].locked, false);
`;

const sourceWithoutInit = inlineScript.replace(/\ninitApp\(\);\s*$/, '');
vm.runInContext(sourceWithoutInit + tests, context, { filename: 'index.html' });

console.log('UI logic tests passed');
