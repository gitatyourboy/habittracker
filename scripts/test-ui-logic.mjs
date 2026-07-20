import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
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
`;

const sourceWithoutInit = inlineScript.replace(/\ninitApp\(\);\s*$/, '');
vm.runInContext(sourceWithoutInit + tests, context, { filename: 'index.html' });

console.log('UI logic tests passed');
