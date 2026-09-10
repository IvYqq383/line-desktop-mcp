import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));
const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const startupTimeoutMs = 4_000;

function within(promise, timeoutMs, description) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms: ${description}`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function descendantNames(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const descendants = await Promise.all(entries.map(async entry => {
    const name = `${prefix}${entry.name}`;
    if (!entry.isDirectory()) return [name];
    return descendantNames(join(directory, entry.name), `${name}/`);
  }));
  return descendants.flat().sort();
}

async function startIsolatedServer(t, extensionsEnabled) {
  const directory = await mkdtemp(join(tmpdir(), 'line-desktop-mcp-startup-'));
  const paths = {
    appData: join(directory, 'app-data'),
    emptyPath: join(directory, 'empty-path'),
    home: join(directory, 'home'),
    localAppData: join(directory, 'local-app-data'),
    programFiles: join(directory, 'program-files'),
    programFilesX86: join(directory, 'program-files-x86'),
    temp: join(directory, 'temp'),
    workingDirectory: join(directory, 'working-directory'),
  };
  await Promise.all(Object.values(paths).map(directoryPath => mkdir(directoryPath)));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: paths.workingDirectory,
    env: {
      APPDATA: paths.appData,
      CHAT_LOG_ON: 'false',
      HOME: paths.home,
      LINE_MCP_EXTENSIONS: extensionsEnabled ? '1' : '0',
      LOCALAPPDATA: paths.localAppData,
      PATH: paths.emptyPath,
      PROGRAMFILES: paths.programFiles,
      'PROGRAMFILES(X86)': paths.programFilesX86,
      TEMP: paths.temp,
      TMP: paths.temp,
      USERPROFILE: paths.home,
    },
    stderr: 'pipe',
  });
  const stderr = [];
  transport.stderr?.on('data', chunk => stderr.push(chunk.toString()));

  const client = new Client({ name: 'server-startup-regression', version: '1.0.0' });
  let stopPromise;
  const stop = () => {
    stopPromise ??= (async () => {
      try {
        await client.close();
      } finally {
        await transport.close();
      }
    })();
    return stopPromise;
  };

  t.after(async () => {
    await stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });

  await within(client.connect(transport), startupTimeoutMs, 'isolated stdio MCP initialization');

  return {
    client,
    async assertNoStartupSideEffects() {
      await stop();
      for (const [name, directoryPath] of Object.entries({
        appData: paths.appData,
        home: paths.home,
        localAppData: paths.localAppData,
        temp: paths.temp,
        workingDirectory: paths.workingDirectory,
      })) {
        assert.deepEqual(await descendantNames(directoryPath), [], `${name} must remain untouched during metadata startup`);
      }
      const output = stderr.join('');
      assert.match(output, /Starting server in stdio mode/);
      assert.match(output, /LINE Desktop MCP Server running on stdio/);
      assert.doesNotMatch(output, /first-time setup|autohotkey|cliclick|brew install|setup-claude-extension/i);
    },
  };
}

test('Windows fresh stdio startup is noninteractive without AutoHotkey and serves default and opt-in metadata', {
  skip: process.platform !== 'win32' ? 'Windows-only startup regression' : false,
  timeout: 15_000,
}, async t => {
  for (const [extensionsEnabled, expectedToolCount] of [[false, 5], [true, 24]]) {
    const server = await startIsolatedServer(t, extensionsEnabled);
    const tools = await within(server.client.listTools(), startupTimeoutMs, 'list static tool metadata');

    assert.deepEqual(server.client.getServerVersion(), {
      name: 'line-desktop-mcp',
      version: packageVersion,
    });
    assert.equal(tools.tools.length, expectedToolCount);
    assert.equal(new Set(tools.tools.map(tool => tool.name)).size, expectedToolCount);

    await server.assertNoStartupSideEffects();
  }
});
