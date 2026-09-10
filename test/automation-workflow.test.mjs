import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LineAutomation } from '../src/automation/line-automation.js';
import { withLineOperation } from '../src/automation/line-operation-lock.mjs';

function fakeWindowsFacade() {
  const instance = Object.create(LineAutomation.prototype);
  instance.platform = 'win32';
  instance.runOperation = async (_kind, action) => action();
  const calls = [];
  instance.automation = {
    switchToEnglish: async () => {
      calls.push('switch');
    },
    activateLine: async () => {
      calls.push('activate');
      return { success: true };
    },
    selectChat: async chatName => {
      calls.push(['select', chatName]);
      return true;
    },
    pageUp: async times => {
      calls.push(['page-up', times]);
    },
    copyAllChatToClipboard: async () => {
      calls.push('copy');
      return 'fixture chat history';
    },
    sendMessage: async (chatName, message, autoSend) => {
      calls.push(['send', chatName, message, autoSend]);
      return { success: true, error: null };
    },
    stageFileManual: async filePath => {
      calls.push(['stage-file', filePath]);
      return { success: true, error: null };
    },
  };
  return { instance, calls };
}

test('Windows facade stops history, send, and file workflows before chat selection when activation is unverified', async () => {
  const { instance, calls } = fakeWindowsFacade();
  instance.automation.activateLine = async () => {
    calls.push('activate');
    return { success: false };
  };

  for (const action of [
    () => instance.getChatHistory('sample group'),
    () => instance.sendChatMessage('sample group', 'not sent', true),
    () => instance.stageFileManual('sample group', 'C:\\temporary\\file.txt'),
  ]) {
    await assert.rejects(action(), { code: 'LINE_FOCUS_UNAVAILABLE' });
  }

  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'select'), false);
  assert.deepEqual(calls, ['switch', 'activate', 'switch', 'activate', 'switch', 'activate']);
});

test('Windows facade treats empty or error clipboard output as a failed history read', async () => {
  for (const value of [null, '', ' ', 'ERROR: Clipboard is empty']) {
    const { instance } = fakeWindowsFacade();
    instance.automation.copyAllChatToClipboard = async () => value;
    await assert.rejects(
      instance.getChatHistory('sample group'),
      error => error?.code === 'HISTORY_READ_FAILED' && /Do not treat this as empty history/i.test(error.message),
    );
  }
});

test('optional attachment text failure stops before the native file picker is staged', async () => {
  const { instance, calls } = fakeWindowsFacade();
  instance.automation.sendMessage = async (chatName, message, autoSend) => {
    calls.push(['send', chatName, message, autoSend]);
    return { success: false, error: 'LINE_SEND_TEXT_FAILED' };
  };

  const result = await instance.stageFileManual(
    'sample group',
    'C:\\temporary\\file.txt',
    'attachment note',
  );

  assert.deepEqual(result, { success: false, error: 'LINE_SEND_TEXT_FAILED' });
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'stage-file'), false);
});

test('Windows facade shares one operation lock across send, history, and file flows without replaying work', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'line-stage-workflow-'));
  const lockPath = path.join(directory, 'operation.lock');
  t.after(() => rm(directory, { recursive: true, force: true }));

  const { instance } = fakeWindowsFacade();
  instance.runOperation = (kind, action) => withLineOperation(kind, action, { lockPath });

  let release;
  let starts = 0;
  let startedResolve;
  const started = new Promise(resolve => {
    startedResolve = resolve;
  });
  instance._sendChatMessage = async () => {
    starts += 1;
    startedResolve();
    await new Promise(resolve => {
      release = resolve;
    });
    return { success: true, error: null };
  };

  const running = instance.sendChatMessage('sample group', 'draft only');
  await started;
  await assert.rejects(instance.getChatHistory('sample group'), { code: 'LINE_BUSY' });
  await assert.rejects(instance.stageFileManual('sample group', 'C:\\temporary\\file.txt'), { code: 'LINE_BUSY' });
  release();

  assert.deepEqual(await running, { success: true, error: null });
  assert.equal(starts, 1);
});

test('lock ownership loss after a completed workflow reports uncertainty and preserves the foreign lock', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'line-stage-lock-'));
  const lockPath = path.join(directory, 'operation.lock');
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    withLineOperation('stage-file', async () => ({ staged: true }), {
      lockPath,
      testHooks: {
        beforeRelease: async () => {
          await writeFile(lockPath, 'foreign replacement', 'utf8');
        },
      },
    }),
    error => error?.code === 'LINE_LOCK_CLEANUP_FAILED'
      && error?.operationMayHaveCompleted === true
      && error?.reason === 'LINE_LOCK_OWNERSHIP_LOST',
  );
  assert.equal(await readFile(lockPath, 'utf8'), 'foreign replacement');
});
