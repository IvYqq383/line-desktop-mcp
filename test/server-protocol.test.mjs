import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LineDesktopMCPServer } from '../src/server.js';
import { LineUi } from '../src/extensions/line-ui.mjs';

// Captured from upstream c138ace, before adding the opt-in extension.
const legacyTools = JSON.parse(await fs.readFile(new URL('./fixtures/legacy-tools.json', import.meta.url), 'utf8'));
const body = result => JSON.parse(result.content.find(item => item.type === 'text').text);

async function connect(t, options = {}) {
  const calls = [];
  const automation = {
    async getChatHistory(...args) {
      calls.push(['history', ...args]);
      return '2026.09.10 Thursday\n10:00 *Example Sender* hello';
    },
    async sendChatMessage(...args) { calls.push(['send', ...args]); return { success: true }; },
  };
  const ui = new LineUi({ automation, runOperation: (_kind, action) => action() });
  const server = new LineDesktopMCPServer({ automation, ui, ...options });
  const client = new Client({ name: 'protocol-regression', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.server.close(); });
  await server.server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, calls };
}

test('default Windows and macOS tools exactly preserve the five upstream descriptors', async t => {
  for (const runtimePlatform of ['win32', 'darwin']) {
    const { client } = await connect(t, { extensionsEnabled: false, runtimePlatform });
    assert.deepEqual((await client.listTools()).tools, legacyTools);
  }
});

test('the Windows-only opt-in leaves macOS on its original five tools', async t => {
  const { client } = await connect(t, { extensionsEnabled: true, runtimePlatform: 'darwin' });
  assert.deepEqual((await client.listTools()).tools, legacyTools);
});

test('default history and manual send use the original handlers and response shapes', async t => {
  const { client, calls } = await connect(t, { extensionsEnabled: false, runtimePlatform: 'win32' });
  const history = body(await client.callTool({ name: 'get_line_chatroom_history_short', arguments: { chatName: 'Example Chat', date: '2026-09-10', messageLimit: 4 } }));
  assert.equal(history.chatName, 'Example Chat');
  assert.equal(history.date, '2026-09-10');
  assert.equal(history.messageLimit, 4);
  assert.match(history.history, /Example Sender/);
  assert.equal(history.messages, undefined);
  await client.callTool({ name: 'send_message_manual', arguments: { chatName: 'Example Chat', message: 'draft' } });
  assert.deepEqual(calls, [
    ['history', 'Example Chat', '2026-09-10', 4, 5],
    ['send', 'Example Chat', 'draft', false],
  ]);
});

test('opt-in exposes 24 unique tools and validates history before any automation', async t => {
  const { client, calls } = await connect(t, { extensionsEnabled: true, runtimePlatform: 'win32' });
  const { tools } = await client.listTools();
  assert.equal(tools.length, 24);
  assert.equal(new Set(tools.map(tool => tool.name)).size, 24);
  assert.ok(tools.some(tool => tool.name === 'send_file_manual'));
  const capabilities = body(await client.callTool({ name: 'get_line_capabilities', arguments: {} }));
  assert.equal(capabilities.capabilities.length, 33);
  assert.deepEqual(calls, []);
  const invalid = await client.callTool({ name: 'get_line_chat_messages', arguments: { chatName: 'Example Chat', date: '2026-02-30' } });
  assert.equal(invalid.isError, true);
  assert.equal(body(invalid).code, 'LINE_INVALID_ARGUMENT');
  assert.deepEqual(calls, []);
  const history = body(await client.callTool({ name: 'get_line_chat_messages', arguments: { chatName: 'Example Chat', messageLimit: 1 } }));
  assert.equal(history.count, 1);
  assert.equal(history.messages[0].text, 'hello');
  assert.equal(calls.length, 1);
});

test('missing optional CUA does not prevent metadata or history and never falls through to legacy sends', async t => {
  const previous = process.env.LINE_MCP_CUA_DRIVER;
  delete process.env.LINE_MCP_CUA_DRIVER;
  t.after(() => { if (previous === undefined) delete process.env.LINE_MCP_CUA_DRIVER; else process.env.LINE_MCP_CUA_DRIVER = previous; });
  const { client, calls } = await connect(t, { extensionsEnabled: true, runtimePlatform: 'win32' });
  assert.equal(body(await client.callTool({ name: 'get_line_workflow', arguments: { workflow: 'members' } })).performedAction, false);
  const status = await client.callTool({ name: 'get_line_status', arguments: {} });
  assert.equal(status.isError, true);
  assert.equal(body(status).code, 'LINE_UI_BACKEND_UNAVAILABLE');
  const send = await client.callTool({ name: 'send_message_auto', arguments: { chatName: 'Example Chat', message: 'not sent' } });
  assert.equal(send.isError, true);
  assert.equal(body(send).code, 'LINE_UI_BACKEND_UNAVAILABLE');
  assert.deepEqual(calls, []);
});
