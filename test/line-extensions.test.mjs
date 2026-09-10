import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createLineExtensions, LINE_TOOL_DESCRIPTORS, validateExportPath } from '../src/extensions/line-extensions.mjs';

const history = '2026.09.09 星期三\n09:01 *Alice* first\n09:02 *Bob* 二行\n第二行😀\n2026.09.10 星期四\n10:00 *Alice* exact\n10:01 *Alice* not exact\n10:02 *Bob* 最後';
const body = result => JSON.parse(result.content[0].text);
function fixture(raw = history, options = {}) {
  const calls = [];
  const automation = {
    async getChatHistory(...args) { calls.push(['history', ...args]); return raw; },
    async sendChatMessage(...args) { calls.push(['send', ...args]); return { success: true }; },
    async stageFileManual(...args) { calls.push(['file', ...args]); return { success: true }; },
  };
  const ui = {
    getStatus: async () => ({ available: true }),
    sendText: async args => { calls.push(['safe-send', args]); return {success:true}; },
    stageFile: async args => { calls.push(['safe-file', args]); return {success:true}; },
  };
  return { extension: createLineExtensions(automation, { ui, now: () => new Date('2026-09-10T09:00:00Z'), ...options }), automation, ui, calls };
}

test('tool catalogue is unique, closed-schema and exposes the original names plus file staging', () => {
  const names = LINE_TOOL_DESCRIPTORS.map(item => item.name);
  assert.equal(names.length, new Set(names).size);
  assert.equal(names.length, 24);
  for (const name of ['get_line_chatroom_history_short', 'get_line_chatroom_history_default', 'get_line_chatroom_history_long', 'send_message_manual', 'send_message_auto', 'send_file_manual']) assert.ok(names.includes(name));
  for (const item of LINE_TOOL_DESCRIPTORS) assert.equal(item.inputSchema.additionalProperties, false);
});

test('invalid schemas, exact-chat inputs and impossible dates never reach LINE', async () => {
  const { extension, calls } = fixture();
  for (const args of [
    {}, { chatName: 'Test', messageLimit: 0 }, { chatName: 'Test', messageLimit: 1.5 },
    { chatName: 'Test', date: '2026-02-30' }, { chatName: 'Test', dateFrom: '2026-09-11', dateTo: '2026-09-10' },
    { chatName: 'Test', dangerousOption: true }, { chatName: 'Test\nOther' }, { chatName: ' Test' },
  ]) assert.equal((await extension.call('get_line_chat_messages', args)).isError, true);
  assert.deepEqual(calls, []);
});

test('history returns exact date/count bounds without losing multiline Unicode', async () => {
  const { extension, calls } = fixture();
  const result = body(await extension.call('get_line_chat_messages', { chatName: 'Test', date: '2026-09-09', messageLimit: 1 }));
  assert.equal(result.count, 1);
  assert.equal(result.messages[0].text, '二行\n第二行😀');
  assert.equal(result.scope.totalHistoryKnown, false);
  assert.equal(result.scope.filtersApplied, true);
  assert.equal(calls[0][4], 5);
  const legacy = body(await extension.call('get_line_chatroom_history_long', { chatName: 'Test', messageLimit: 2 }));
  assert.equal(legacy.count, 2);
  assert.match(legacy.history, /最後/);
  assert.doesNotMatch(legacy.history, /first/);
  assert.equal(calls[1][4], 50);
});

test('search is literal and bounded; unknown formats are not successful empty results', async () => {
  const { extension } = fixture();
  assert.equal(body(await extension.call('search_line_chat_messages', { chatName: 'Test', query: 'EXACT', messageLimit: 10 })).count, 2);
  assert.equal(body(await extension.call('search_line_chat_messages', { chatName: 'Test', query: '.*' })).count, 0);
  const bad = fixture('unknown UI content');
  const result = await bad.extension.call('get_line_chat_messages', { chatName: 'Test' });
  assert.equal(result.isError, true);
  assert.equal(body(result).code, 'HISTORY_FORMAT_UNRECOGNIZED');
  assert.equal(JSON.stringify(result).includes('unknown UI content'), false);
});

test('verification uses exact full message/sender and never claims new delivery', async () => {
  const { extension } = fixture();
  const result = body(await extension.call('verify_line_message', { chatName: 'Test', message: 'exact', sender: 'Alice' }));
  assert.equal(result.matchCount, 1);
  assert.equal(result.deliveryVerified, false);
  assert.equal(result.mentionVerified, false);
  assert.equal(body(await extension.call('verify_line_message', { chatName: 'Test', message: 'exact', sender: 'Ali' })).found, false);
});

test('send/stage distinguish dispatch, draft and delivery; failures remain MCP errors', async () => {
  const { extension, ui, calls } = fixture();
  const manual = body(await extension.call('send_message_manual', { chatName: 'Test', message: '@All literal\nnext' }));
  assert.equal(manual.staged, true);
  assert.equal(manual.sendDispatched, false);
  const auto = body(await extension.call('send_message_auto', { chatName: 'Test', message: 'approved' }));
  assert.equal(auto.sendDispatched, true);
  assert.equal(auto.deliveryVerified, false);
  assert.deepEqual(calls[0], ['safe-send', {chatName:'Test', message:'@All literal\nnext', autoSend:false}]);
  assert.equal(calls.some(call=>call[0]==='send'),false);
  ui.sendText = async () => ({ success: false, error: 'typing failed' });
  assert.equal((await extension.call('send_message_auto', { chatName: 'Test', message: 'approved' })).isError, true);
});

test('UI structured refusals and screenshots are preserved without calling legacy sends', async () => {
  const { extension, ui, calls } = fixture();
  ui.getState = async () => ({ verified: true, images: [{ type: 'image', data: 'test', mimeType: 'image/png' }] });
  const result = await extension.call('get_line_ui_state', { chatName: 'Test', includeScreenshot: true });
  assert.equal(result.content[1].type, 'image');
  ui.setDraft = async () => { const e = new Error('Draft changed'); e.code = 'LINE_DRAFT_CHANGED'; throw e; };
  const failed = await extension.call('set_line_draft', { chatName: 'Test', message: 'test' });
  assert.equal(failed.isError, true);
  assert.equal(body(failed).code, 'LINE_DRAFT_CHANGED');
  assert.deepEqual(calls, []);
});

test('exports are exclusive, reconciled by hash, and invalid paths never read chats', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'line-export-test-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
  try {
    const { extension, calls } = fixture();
    const outputPath = path.join(directory, 'messages.json');
    const exported = body(await extension.call('export_line_chat_history', { chatName: 'Test', outputPath, format: 'json', messageLimit: 2 }));
    assert.equal(exported.verified, true);
    const bytes = await fs.readFile(outputPath);
    assert.equal(exported.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(JSON.parse(bytes).count, 2);
    const count = calls.length;
    assert.equal((await extension.call('export_line_chat_history', { chatName: 'Test', outputPath, format: 'json' })).isError, true);
    assert.equal(calls.length, count);
    await assert.rejects(validateExportPath('relative.json', 'json'));
    await assert.rejects(validateExportPath(path.join(directory, 'wrong.exe'), 'json'));
    if (process.platform === 'win32') {
      const junction = path.join(directory, 'junction');
      const target = path.join(directory, 'target');
      await fs.mkdir(target);
      await fs.symlink(target, junction, 'junction');
      await assert.rejects(validateExportPath(path.join(junction, 'file.json').replaceAll('\\', '/'), 'json'), /junctions or symlinks/);
      await assert.rejects(validateExportPath('\\relative-root.json', 'json'), /drive-qualified/);
      const adsPath = `${path.join(directory, 'base.txt')}:stream.json`;
      const beforeAds = calls.length;
      const ads = await extension.call('export_line_chat_history', { chatName: 'Test', outputPath: adsPath, format: 'json' });
      assert.equal(ads.isError, true);
      assert.equal(body(ads).code, 'LINE_INVALID_ARGUMENT');
      assert.equal(calls.length, beforeAds, 'ADS rejection must happen before LINE history is read');
      await assert.rejects(validateExportPath(adsPath, 'json'), /alternate data stream/);
      await fs.unlink(junction);
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('post-create export failures preserve the file and report uncertainty', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'line-export-unverified-test-'));
  try {
    const outputPath = path.join(directory, 'messages.json');
    const failingFileSystem = {
      ...fs,
      async open(...args) {
        const handle = await fs.open(...args);
        return {
          writeFile: (...writeArgs) => handle.writeFile(...writeArgs),
          sync: async () => { throw new Error('injected sync failure after file creation'); },
          close: () => handle.close(),
        };
      },
    };
    const { extension, calls } = fixture(history, { fileSystem: failingFileSystem });
    const result = await extension.call('export_line_chat_history', { chatName: 'Test', outputPath, format: 'json' });
    const failed = body(result);
    assert.equal(result.isError, true);
    assert.equal(failed.code, 'LINE_EXPORT_UNVERIFIED');
    assert.equal(failed.operationMayHaveCompleted, true);
    assert.equal(failed.outputPathCreated, true);
    assert.doesNotMatch(failed.message, /injected sync failure/);
    assert.equal(calls.filter(call => call[0] === 'history').length, 1);
    const bytes = await fs.readFile(outputPath);
    assert.ok(bytes.length > 0, 'the created file must be preserved for inspection');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('capability and visual workflow queries perform no UI work', async () => {
  const { extension, calls } = fixture();
  const capabilities = body(await extension.call('get_line_capabilities', { mode: 'guided_ui' }));
  assert.ok(capabilities.capabilities.every(item => item.mode === 'guided_ui'));
  const workflow = body(await extension.call('get_line_workflow', { workflow: 'polls' }));
  assert.equal(workflow.performedAction, false);
  assert.equal(workflow.execution, 'guidance_only');
  assert.deepEqual(calls, []);
});
