import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { LineUi } from '../src/extensions/line-ui.mjs';

const CHAT = 'Example Test Chat';
const TARGET = {
  app_name: 'LINE.exe',
  title: 'LINE',
  pid: 42,
  window_id: 99,
  bounds: { x: 0, y: 0, width: 400, height: 600 },
  is_on_screen: true,
  minimized: false,
};

// Sanitized geometry from the current main LINE window. Its right-pane header
// reaches one UIA pixel beyond the screenshot root (1385 vs 1384).
const CURRENT_MAIN_TARGET = {
  ...TARGET,
  bounds: { x: 645, y: 293, width: 739, height: 777 },
};

function element(index, values = {}) {
  return {
    element_index: index,
    element_token: `token-${index}-${values.tokenSuffix ?? ''}`,
    enabled: true,
    ...values,
  };
}

function header() {
  return headerFor(CHAT);
}

function headerFor(chatName) {
  return element(1, {
    label: chatName,
    role: 'Header',
    parent_index: 52,
    frame: { x: 110, y: 10, w: 80, h: 19 },
  });
}

function composer(value = '') {
  return element(2, { role: 'Edit', semantic_role: 'composer', value });
}

function message(text, index = 3) {
  return element(index, { label: text, semantic_role: 'message', role: 'Text' });
}

function state(elements, suffix = '') {
  return {
    snapshot_id: `snapshot-${suffix}`,
    elements,
  };
}

function mainStructure() {
  return [
    element(47, { role: 'Group', frame: { x: 0, y: 0, w: 400, h: 600 } }),
    element(48, { role: 'Group', parent_index: 47, frame: { x: 100, y: 0, w: 300, h: 600 } }),
    element(52, { role: 'Group', parent_index: 48, frame: { x: 100, y: 0, w: 300, h: 50 } }),
    element(62, { role: 'Group', parent_index: 48, frame: { x: 100, y: 50, w: 300, h: 550 } }),
    element(72, { role: 'Edit', parent_index: 62, frame: { x: 110, y: 500, w: 280, h: 60 } }),
    element(73, { role: 'Group', label: 'qt_scrollarea_viewport', parent_index: 72 }),
  ];
}

function mainHeaderToolbar({ includeSeparator = false, includeUnrelatedMore = false } = {}) {
  const controls = [
    header(),
    element(10, { role: 'Group', parent_index: 52, frame: { x: 280, y: 10, w: 24, h: 24 } }),
    element(11, { role: 'Group', parent_index: 52, frame: { x: 310, y: 10, w: 24, h: 24 } }),
    element(12, { role: 'Group', parent_index: 52, frame: { x: 340, y: 10, w: 24, h: 24 } }),
    element(13, { role: 'Group', parent_index: 52, frame: { x: 370, y: 10, w: 16, h: 24 } }),
  ];
  if (includeSeparator) controls.push(
    element(61, { role: 'Group', parent_index: 48, frame: { x: 100, y: 49, w: 300, h: 1 } }),
  );
  if (includeUnrelatedMore) controls.push(
    element(30, { label: 'More', role: 'Button', parent_index: 47, frame: { x: 10, y: 10, w: 24, h: 24 } }),
  );
  return controls;
}

function mainSearchBar() {
  return [
    element(140, { role: 'Group', parent_index: 62, frame: { x: 100, y: 50, w: 300, h: 450 } }),
    element(141, { role: 'Group', parent_index: 140, frame: { x: 100, y: 50, w: 300, h: 56 } }),
    element(142, { role: 'Group', parent_index: 141, frame: { x: 110, y: 62, w: 230, h: 32 } }),
    element(143, { role: 'Group', parent_index: 142, frame: { x: 116, y: 66, w: 24, h: 24 } }),
    element(144, { role: 'Edit', parent_index: 142, frame: { x: 140, y: 63, w: 200, h: 30 } }),
    element(145, { role: 'Group', parent_index: 142, frame: { x: 340, y: 62, w: 1, h: 32 } }),
  ];
}

function outsideMainSearchEdit() {
  return element(160, { role: 'Edit', parent_index: 47, frame: { x: 8, y: 60, w: 80, h: 30 } });
}

function visualImage(hash = 'a') {
  return {
    type: 'image',
    mimeType: 'image/png',
    data: `source-${hash}`,
    width: 400,
    height: 600,
    hash,
  };
}

function screenshotState(elements, suffix = '') {
  return {
    ...state(elements, suffix),
    images: [visualImage(suffix || 'a')],
    screenshot_width: 400,
    screenshot_height: 600,
  };
}

function nestedMainElements(draft = '') {
  return [
    element(0, { role: 'Window', frame: { x: 0, y: 0, w: 400, h: 600 } }),
    element(51, { role: 'Group', parent_index: 0, frame: { x: 100, y: 50, w: 300, h: 550 } }),
    element(52, { role: 'Group', parent_index: 51, frame: { x: 100, y: 50, w: 300, h: 50 } }),
    element(53, { role: 'Group', parent_index: 52, frame: { x: 112, y: 65, w: 72, h: 19 } }),
    element(54, { role: 'Group', parent_index: 52, frame: { x: 184, y: 65, w: 23, h: 19 } }),
    element(62, { role: 'Group', parent_index: 51, frame: { x: 100, y: 100, w: 300, h: 1 } }),
    element(63, { role: 'Group', parent_index: 51, frame: { x: 100, y: 100, w: 300, h: 500 } }),
    element(64, { role: 'Custom', parent_index: 63, frame: { x: 100, y: 100, w: 300, h: 500 } }),
    element(65, { role: 'Group', parent_index: 64, frame: { x: 100, y: 450, w: 300, h: 150 } }),
    element(72, { role: 'Group', parent_index: 65, frame: { x: 100, y: 460, w: 300, h: 80 } }),
    element(73, { role: 'Edit', semantic_role: 'composer', parent_index: 72, frame: { x: 110, y: 465, w: 280, h: 60 }, value: draft }),
    element(74, { role: 'Group', label: 'qt_scrollarea_viewport', parent_index: 73 }),
  ];
}

function nestedVisualState(draft = '', suffix = '', hash = 'a') {
  return {
    ...state(nestedMainElements(draft), suffix),
    mainStructure: false,
    images: [visualImage(hash)],
    screenshot_width: 400,
    screenshot_height: 600,
  };
}

function currentMainVisualImage(hash = 'a') {
  return {
    type: 'image',
    mimeType: 'image/png',
    data: `current-main-${hash}`,
    width: 739,
    height: 777,
    hash,
  };
}

function currentMainVisualState({
  suffix = '',
  hash = 'a',
  headerWidth = 375,
  editorValue,
  editorLabel,
  includeGlobalSearch = false,
  extraMainComposer = false,
  includeModal = false,
} = {}) {
  const editor = {
    role: 'Edit',
    parent_index: 71,
    frame: { x: 1020, y: 956, w: 357, h: 76 },
    ...(editorValue === undefined ? {} : { value: editorValue }),
    ...(editorLabel === undefined ? {} : { label: editorLabel }),
  };
  const elements = [
    element(0, { role: 'Window', frame: { x: 645, y: 293, w: 739, h: 777 } }),
    element(51, { role: 'Group', parent_index: 0, frame: { x: 1010, y: 344, w: 375, h: 726 } }),
    element(52, { role: 'Group', parent_index: 51, frame: { x: 1010, y: 348, w: headerWidth, h: 52 } }),
    element(53, { role: 'Group', parent_index: 52, frame: { x: 1022, y: 364, w: 49, h: 19 } }),
    element(54, { role: 'Group', parent_index: 52, frame: { x: 1071, y: 364, w: 20, h: 19 } }),
    element(61, { role: 'Group', parent_index: 51, frame: { x: 1010, y: 400, w: 375, h: 1 } }),
    element(62, { role: 'Group', parent_index: 51, frame: { x: 1010, y: 401, w: 375, h: 669 } }),
    element(63, { role: 'Custom', parent_index: 62, frame: { x: 1010, y: 401, w: 375, h: 669 } }),
    element(64, { role: 'Group', parent_index: 63, frame: { x: 1010, y: 950, w: 375, h: 120 } }),
    element(71, { role: 'Group', parent_index: 64, frame: { x: 1010, y: 950, w: 375, h: 82 } }),
    element(72, editor),
    element(73, { role: 'Group', label: 'qt_scrollarea_viewport', parent_index: 72, frame: { x: 1020, y: 956, w: 357, h: 76 } }),
  ];
  if (extraMainComposer) {
    elements.push(
      element(80, { role: 'Edit', parent_index: 71, frame: { x: 1020, y: 956, w: 300, h: 76 } }),
      element(81, { role: 'Group', label: 'qt_scrollarea_viewport', parent_index: 80, frame: { x: 1020, y: 956, w: 300, h: 76 } }),
    );
  }
  if (includeGlobalSearch) {
    elements.push(
      element(108, { role: 'Group', parent_index: 0, frame: { x: 707, y: 344, w: 302, h: 576 } }),
      element(109, { role: 'Edit', parent_index: 108, frame: { x: 719, y: 356, w: 264, h: 38 }, value: 'sidebar query' }),
    );
  }
  if (includeModal) elements.push(element(90, { role: 'Dialog', parent_index: 0 }));
  return {
    ...state(elements, suffix),
    mainStructure: false,
    images: [currentMainVisualImage(hash)],
    screenshot_width: 739,
    screenshot_height: 777,
  };
}

function visualHelpers() {
  return {
    recognizeImage: async image => ({
      coordinateSpace: 'input-png-pixels',
      scaleFactor: 1,
      width: image.width,
      height: image.height,
      lines: [],
    }),
    imageDimensions: image => ({ width: image.width, height: image.height }),
    fingerprintRegion: async (image, region, { includeImage = false } = {}) => ({
      sha256: image.hash.repeat(64),
      width: region.width,
      height: region.height,
      region: { ...region },
      ...(includeImage ? {
        image: {
          type: 'image',
          mimeType: 'image/png',
          data: `crop-${image.hash}`,
          width: region.width,
          height: region.height,
          hash: image.hash,
        },
      } : {}),
    }),
  };
}

function fakeEnvironment({
  states = [],
  windows = [TARGET],
  handlers = {},
  tools = [
    'list_windows',
    'get_window_state',
    'click',
    'right_click',
    'set_value',
    'hotkey',
    'clipboard_read',
  ],
  recognizeImage,
  findImageLabel,
  fingerprintRegion,
  imageDimensions,
  randomToken,
  now,
  innerAutomation,
  activateLine,
} = {}) {
  const calls = [];
  const automationCalls = [];
  const locks = [];
  const queue = [...states];
  const api = {
    tools: new Set(tools),
    serverVersion: 'fake-cua',
    async call(name, args) {
      calls.push({ name, args });
      if (handlers[name]) return handlers[name](args, calls);
      if (name === 'list_windows') return { windows };
      if (name === 'get_window_state') {
        if (queue.length === 0) throw new Error('unexpected get_window_state');
        const next = queue.shift();
        if (args.window_id === TARGET.window_id && next?.mainStructure !== false) {
          const { mainStructure: _ignored, ...result } = next;
          return { ...result, elements: [...result.elements, ...mainStructure()] };
        }
        return next;
      }
      return { effect: 'confirmed', route: 'accessibility' };
    },
  };
  const automation = {
    async activateLine() {
      automationCalls.push('activate');
      return activateLine ? activateLine() : { success: true };
    },
    async selectChat(name) {
      automationCalls.push(['select', name]);
      return true;
    },
    async pageUp(times) {
      automationCalls.push(['pageUp', times]);
    },
    ...(innerAutomation ? { automation: innerAutomation } : {}),
  };
  const ui = new LineUi({
    automation,
    withClient: async callback => callback(api),
    runOperation: async (kind, callback) => {
      locks.push(kind);
      return callback();
    },
    ...(recognizeImage ? { recognizeImage } : {}),
    ...(findImageLabel ? { findImageLabel } : {}),
    ...(fingerprintRegion ? { fingerprintRegion } : {}),
    ...(imageDimensions ? { imageDimensions } : {}),
    ...(randomToken ? { randomToken } : {}),
    ...(now ? { now } : {}),
  });
  return { ui, calls, automation, automationCalls, locks, api };
}

function actionCalls(calls) {
  return calls.filter(call => !['list_windows', 'get_window_state'].includes(call.name));
}

test('does not treat a sidebar or global-search hit as an active chat header', async () => {
  const { ui, calls, automationCalls, locks } = fakeEnvironment({
    states: Array.from({ length: 4 }, (_, index) => state([
      element(1, { label: CHAT, role: 'ListItem', semantic_role: 'search-result' }),
      element(2, { label: CHAT, role: 'Edit', value: CHAT }),
    ], `generic-${index}`)),
  });

  await assert.rejects(ui.openChat({ chatName: CHAT }), { code: 'LINE_CHAT_UNVERIFIED' });
  assert.deepEqual(automationCalls, ['activate', ['select', CHAT]]);
  assert.deepEqual(locks, ['ui-open-chat']);
  assert.deepEqual(calls.map(call => call.name), [
    'list_windows', 'list_windows', 'get_window_state', 'get_window_state',
    'list_windows', 'get_window_state', 'get_window_state',
  ]);
});

test('accepts an exact detached LINE window title without mistaking a sidebar entry for a header', async () => {
  const detached = { ...TARGET, title: CHAT, window_id: 100 };
  const { ui } = fakeEnvironment({
    windows: [TARGET, detached],
    states: [state([], 'detached')],
  });

  const result = await ui.openChat({ chatName: CHAT });
  assert.equal(result.success, true);
  assert.equal(result.verification, 'exact-top-level-window-title');
  assert.equal(result.confidence, 'high');
});

test('uses the observed detached rich-composer structure to distinguish an empty draft from unreadable UI', async () => {
  const detached = { ...TARGET, title: CHAT, window_id: 100 };
  const emptyComposer = () => [
    element(12, { role: 'Edit' }),
    element(13, { role: 'Group', label: 'qt_scrollarea_viewport', parent_index: 12 }),
  ];
  const draftedComposer = () => [
    element(12, { role: 'Edit', label: 'draft preserved by readback', value: 'draft preserved by readback' }),
    element(13, { role: 'Group', label: 'qt_scrollarea_viewport', parent_index: 12 }),
  ];
  const { ui, calls } = fakeEnvironment({
    windows: [detached],
    states: [
      state(emptyComposer(), 'inspect'),
      state(emptyComposer(), 'initial-read'),
      state(emptyComposer(), 'write-before'),
      state(draftedComposer(), 'write-after'),
    ],
  });

  const result = await ui.setDraft({ chatName: CHAT, message: 'draft preserved by readback' });
  assert.equal(result.changed, true);
  assert.equal(result.verification.draft, 'detached-composer-value-readback');
  const write = calls.find(call => call.name === 'set_value');
  assert.match(write.args.element_token, /^token-12/);
  assert.equal('delivery_mode' in write.args, false);
});

test('getStatus returns only metadata, not window titles or UI state', async () => {
  const privateTitle = { ...TARGET, title: 'private chat title' };
  const { ui, locks } = fakeEnvironment({ windows: [privateTitle] });

  const result = await ui.getStatus();
  assert.equal(result.appName, 'LINE.exe');
  assert.equal(result.lineWindowCount, 1);
  assert.equal(result.visibleLineWindowCount, 1);
  assert.equal(JSON.stringify(result).includes('private chat title'), false);
  assert.deepEqual(locks, ['ui-get-status']);
});

test('setDraft rejects drift before calling a mutating CUA tool', async () => {
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('existing draft')], 'inspect'),
      state([header(), composer('existing draft')], 'write-before'),
    ],
  });

  await assert.rejects(
    ui.setDraft({ chatName: CHAT, message: 'replacement', expectedDraft: 'stale draft' }),
    { code: 'LINE_DRAFT_CONFLICT' },
  );
  assert.equal(calls.some(call => call.name === 'set_value'), false);
  assert.equal(calls.some(call => call.name === 'press_key'), false);
});

test('setDraft uses snapshot-bound background set_value and verifies the full readback without Enter', async () => {
  const { ui, calls, locks } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'initial-read'),
      state([header(), composer('')], 'write-before'),
      state([header(), composer('ready to review')], 'write-after'),
    ],
  });

  const result = await ui.setDraft({ chatName: CHAT, message: 'ready to review' });
  assert.equal(result.changed, true);
  assert.equal(result.verification.draft, 'exact-composer-value');
  const write = calls.find(call => call.name === 'set_value');
  assert.deepEqual(write.args.value, 'ready to review');
  assert.equal('delivery_mode' in write.args, false);
  assert.match(write.args.element_token, /^token-2/);
  assert.equal(calls.some(call => call.name === 'press_key'), false);
  assert.deepEqual(locks, ['ui-set-draft']);
  assert.deepEqual(calls.map(call => call.name), [
    'list_windows', 'list_windows', 'get_window_state', 'get_window_state', 'get_window_state', 'set_value', 'get_window_state',
  ]);
});

test('a no-op draft write is not reported as success', async () => {
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'initial-read'),
      state([header(), composer('')], 'write-before'),
      state([header(), composer('')], 'write-after'),
    ],
  });

  await assert.rejects(
    ui.setDraft({ chatName: CHAT, message: 'not reflected' }),
    error => error?.code === 'LINE_DRAFT_WRITE_UNVERIFIED' && error?.operationMayHaveCompleted === true,
  );
  assert.equal(calls.filter(call => call.name === 'set_value').length, 1);
  assert.equal(calls.some(call => call.name === 'press_key'), false);
});

test('a CUA write failure stops without an ungrounded follow-up action', async () => {
  const expected = new Error('driver refused write');
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'initial-read'),
      state([header(), composer('')], 'write-before'),
    ],
    handlers: {
      set_value: () => { throw expected; },
    },
  });

  await assert.rejects(ui.setDraft({ chatName: CHAT, message: 'will not retry' }), error => error === expected);
  assert.deepEqual(calls.map(call => call.name), [
    'list_windows', 'list_windows', 'get_window_state', 'get_window_state', 'get_window_state', 'set_value',
  ]);
});

test('clearDraft requires an exact optimistic-concurrency value', async () => {
  const { ui, calls } = fakeEnvironment();
  await assert.rejects(ui.clearDraft({ chatName: CHAT }), { code: 'LINE_INVALID_ARGUMENT' });
  assert.deepEqual(calls, []);
});

test('message actions refuse duplicate exact message text before opening a context menu', async () => {
  const text = 'same visible message';
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header()], 'inspect'),
      state([header(), message(text, 3), message(text, 4)], 'message-before'),
    ],
  });

  await assert.rejects(
    ui.messageAction({ chatName: CHAT, messageText: text, action: 'copy' }),
    { code: 'LINE_MESSAGE_NOT_UNIQUE' },
  );
  assert.equal(calls.some(call => call.name === 'right_click'), false);
});

test('copy verifies the clipboard after a fresh exact context-menu action', async () => {
  const text = 'copy this exact message';
  const menu = element(8, { label: 'Copy', role: 'MenuItem' });
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header()], 'inspect'),
      state([header(), message(text)], 'right-before'),
      state([header(), message(text), menu], 'right-after'),
      state([header(), message(text), menu], 'guard-before-copy'),
      state([header(), message(text), menu], 'copy-before'),
      state([header(), message(text)], 'copy-after'),
    ],
    handlers: {
      clipboard_read: () => ({ text }),
    },
  });

  const result = await ui.messageAction({ chatName: CHAT, messageText: text, action: 'copy' });
  assert.equal(result.clipboardVerified, true);
  assert.deepEqual(calls.map(call => call.name), [
    'list_windows', 'list_windows', 'get_window_state', 'get_window_state', 'right_click', 'get_window_state',
    'get_window_state', 'get_window_state', 'click', 'get_window_state', 'clipboard_read',
  ]);
  for (const call of actionCalls(calls).filter(call => ['right_click', 'click'].includes(call.name))) {
    assert.equal(call.args.delivery_mode, 'background');
    assert.ok(call.args.element_token);
  }
});

test('reply stops before staging replyText when quoted context is not verified', async () => {
  const text = 'reply source';
  const menu = element(8, { label: 'Reply', role: 'MenuItem' });
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header()], 'inspect'),
      state([header(), message(text), composer('')], 'right-before'),
      state([header(), message(text), composer(''), menu], 'right-after'),
      state([header(), message(text), composer(''), menu], 'guard-before-reply'),
      state([header(), message(text), composer(''), menu], 'reply-before'),
      state([header(), message(text), composer('')], 'reply-after-no-quote'),
    ],
  });

  await assert.rejects(
    ui.messageAction({ chatName: CHAT, messageText: text, action: 'reply', replyText: 'draft only' }),
    { code: 'LINE_REPLY_UNVERIFIED' },
  );
  assert.equal(calls.some(call => call.name === 'set_value'), false);
  assert.equal(calls.some(call => call.name === 'press_key'), false);
});

test('forward stops at a verified recipient dialog and never sends', async () => {
  const text = 'forward source';
  const menu = element(8, { label: 'Forward', role: 'MenuItem' });
  const dialog = element(9, { label: 'Forward', role: 'Dialog', semantic_role: 'forward-dialog' });
  const recipients = element(10, { role: 'List', semantic_role: 'recipient-selector' });
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header()], 'inspect'),
      state([header(), message(text)], 'right-before'),
      state([header(), message(text), menu], 'right-after'),
      state([header(), message(text), menu], 'guard-before-forward'),
      state([header(), message(text), menu], 'forward-before'),
      state([header(), message(text), dialog, recipients], 'forward-after'),
    ],
  });

  const result = await ui.messageAction({ chatName: CHAT, messageText: text, action: 'forward' });
  assert.equal(result.staged, true);
  assert.equal(result.sent, false);
  assert.equal(calls.some(call => ['type_text', 'set_value', 'press_key', 'hotkey'].includes(call.name)), false);
});

test('feature opening verifies a newly added scoped main-chat search bar and ignores a global Edit', async () => {
  const root = element(7, { role: 'Window' });
  const { ui, calls } = fakeEnvironment({
    states: [
      screenshotState([...mainHeaderToolbar(), root, outsideMainSearchEdit()], 'inspect'),
      screenshotState([...mainHeaderToolbar(), root, outsideMainSearchEdit()], 'search-preflight'),
      screenshotState([...mainHeaderToolbar(), root, outsideMainSearchEdit()], 'search-before'),
      screenshotState([...mainHeaderToolbar(), root, outsideMainSearchEdit(), ...mainSearchBar()], 'search-after'),
      screenshotState([...mainHeaderToolbar(), root, outsideMainSearchEdit(), ...mainSearchBar()], 'outcome-main'),
    ],
    ...visualHelpers(),
  });

  const result = await ui.openFeature({ chatName: CHAT, feature: 'search' });
  const click = calls.find(call => call.name === 'click');
  assert.equal(result.opened, true);
  assert.equal(result.verification, 'structural-main-chat-search-bar');
  assert.equal(click.args.x, 292);
  assert.equal(click.args.y, 22);
  assert.equal('element_token' in click.args, false);
  assert.equal(click.args.delivery_mode, 'background');
  assert.equal(calls.some(call => call.name === 'hotkey'), false);
});

test('an already-open scoped main-chat search bar is idempotent and is never clicked closed', async () => {
  const root = element(7, { role: 'Window' });
  const { ui, calls } = fakeEnvironment({
    states: [
      screenshotState([...mainHeaderToolbar(), root, ...mainSearchBar()], 'search-open-inspect'),
      screenshotState([...mainHeaderToolbar(), root, ...mainSearchBar()], 'search-open-preflight'),
    ],
    ...visualHelpers(),
  });

  const result = await ui.openFeature({ chatName: CHAT, feature: 'search' });
  assert.equal(result.opened, false);
  assert.equal(result.alreadyOpen, true);
  assert.equal(result.verification, 'structural-main-chat-search-bar');
  assert.equal(calls.some(call => call.name === 'click'), false);
});

test('a Search bar that appears after preflight short-circuits the authoritative input snapshot', async () => {
  const root = element(7, { role: 'Window' });
  const { ui, calls } = fakeEnvironment({
    states: [
      screenshotState([...mainHeaderToolbar(), root], 'search-race-inspect'),
      screenshotState([...mainHeaderToolbar(), root], 'search-race-preflight'),
      screenshotState([...mainHeaderToolbar(), root, ...mainSearchBar()], 'search-race-input-before'),
    ],
    ...visualHelpers(),
  });

  const result = await ui.openFeature({ chatName: CHAT, feature: 'search' });
  assert.equal(result.opened, false);
  assert.equal(result.alreadyOpen, true);
  assert.equal(result.verification, 'structural-main-chat-search-bar');
  assert.equal(calls.some(call => call.name === 'click'), false);
});

test('a structural More toolbar ignores the direct one-pixel separator and opens its verified feature path', async () => {
  const menu = element(20, { label: 'Albums', role: 'MenuItem' });
  const surface = element(21, { label: 'Albums', role: 'Dialog' });
  const toolbar = () => mainHeaderToolbar({ includeSeparator: true, includeUnrelatedMore: true });
  const { ui, calls, automationCalls } = fakeEnvironment({
    states: [
      screenshotState(toolbar(), 'albums-inspect'),
      screenshotState(toolbar(), 'albums-preflight'),
      screenshotState(toolbar(), 'albums-more-before'),
      screenshotState([...toolbar(), menu], 'albums-more-after'),
      screenshotState([...toolbar(), menu], 'albums-main-guard'),
      screenshotState([...toolbar(), menu], 'albums-item-before'),
      screenshotState([...toolbar(), surface], 'albums-item-after'),
      screenshotState([...toolbar(), surface], 'albums-outcome'),
    ],
    ...visualHelpers(),
  });

  const result = await ui.openFeature({ chatName: CHAT, feature: 'albums', deliveryMode: 'foreground' });
  const clicks = calls.filter(call => call.name === 'click');
  assert.equal(result.opened, true);
  assert.equal(result.verification, 'exact-feature-surface');
  assert.equal(clicks[0].args.x, 378);
  assert.equal(clicks[0].args.y, 22);
  assert.equal('element_token' in clicks[0].args, false);
  assert.equal(clicks[0].args.delivery_mode, 'foreground');
  assert.match(clicks[1].args.element_token, /^token-20/);
  assert.equal(clicks[1].args.delivery_mode, 'foreground');
  assert.deepEqual(automationCalls, ['activate']);
});

test('feature shortcuts accept explicit foreground delivery without changing normal input routes', async () => {
  const surface = element(40, { label: 'Notes', role: 'Dialog' });
  const { ui, calls, automationCalls } = fakeEnvironment({
    states: [
      state([header()], 'notes-inspect'),
      state([header()], 'notes-preflight'),
      state([header()], 'notes-before'),
      state([header(), surface], 'notes-after'),
      state([header(), surface], 'notes-outcome'),
    ],
  });

  const result = await ui.openFeature({ chatName: CHAT, feature: 'notes', deliveryMode: 'foreground' });
  const hotkey = calls.find(call => call.name === 'hotkey');
  assert.equal(result.opened, true);
  assert.deepEqual(hotkey.args.keys, ['ctrl', 'n']);
  assert.equal(hotkey.args.delivery_mode, 'foreground');
  assert.equal(calls.some(call => ['set_value', 'press_key'].includes(call.name)), false);
  assert.deepEqual(automationCalls, ['activate']);
});

test('foreground feature navigation refuses an unverified facade activation before CUA input', async () => {
  const { ui, calls, automationCalls } = fakeEnvironment({
    states: [state([header()], 'foreground-activation-inspect')],
    activateLine: async () => ({ success: false }),
  });
  await assert.rejects(
    ui.openFeature({ chatName: CHAT, feature: 'notes', deliveryMode: 'foreground' }),
    { code: 'LINE_FOCUS_UNAVAILABLE' },
  );
  assert.deepEqual(automationCalls, ['activate']);
  assert.equal(calls.some(call => ['click', 'hotkey'].includes(call.name)), false);
});

test('openFeature rejects an unsupported delivery mode before inspecting LINE', async () => {
  const { ui, calls } = fakeEnvironment();
  await assert.rejects(
    ui.openFeature({ chatName: CHAT, feature: 'search', deliveryMode: 'automatic' }),
    { code: 'LINE_INVALID_ARGUMENT' },
  );
  assert.deepEqual(calls, []);
});

test('openFeature refuses unavailable members navigation before inspecting LINE', async () => {
  const { ui, calls } = fakeEnvironment();
  await assert.rejects(
    ui.openFeature({ chatName: CHAT, feature: 'members' }),
    { code: 'LINE_INVALID_ARGUMENT' },
  );
  assert.deepEqual(calls, []);
});

test('anonymous main-header navigation refuses missing screenshots and invalid bounds before any click', async () => {
  const missingScreenshot = fakeEnvironment({
    states: [
      state(mainHeaderToolbar(), 'missing-screenshot-inspect'),
      state(mainHeaderToolbar(), 'missing-screenshot-preflight'),
      state(mainHeaderToolbar(), 'missing-screenshot-before'),
    ],
    ...visualHelpers(),
  });
  await assert.rejects(
    missingScreenshot.ui.openFeature({ chatName: CHAT, feature: 'search' }),
    { code: 'LINE_UI_SELECTOR_UNAVAILABLE' },
  );
  assert.equal(missingScreenshot.calls.some(call => call.name === 'click'), false);

  const invalidBounds = fakeEnvironment({
    windows: [{ ...TARGET, bounds: { x: 0, y: 0, width: 0, height: 600 } }],
    states: [
      screenshotState(mainHeaderToolbar(), 'invalid-bounds-inspect'),
      screenshotState(mainHeaderToolbar(), 'invalid-bounds-preflight'),
      screenshotState(mainHeaderToolbar(), 'invalid-bounds-before'),
    ],
    ...visualHelpers(),
  });
  await assert.rejects(
    invalidBounds.ui.openFeature({ chatName: CHAT, feature: 'search' }),
    { code: 'LINE_UI_SELECTOR_UNAVAILABLE' },
  );
  assert.equal(invalidBounds.calls.some(call => call.name === 'click'), false);
});

test('a failed menu resolution after More reports that navigation may have completed', async () => {
  const toolbar = () => mainHeaderToolbar({ includeSeparator: true });
  const { ui, calls } = fakeEnvironment({
    states: [
      screenshotState(toolbar(), 'more-failure-inspect'),
      screenshotState(toolbar(), 'more-failure-preflight'),
      screenshotState(toolbar(), 'more-failure-before'),
      screenshotState(toolbar(), 'more-failure-after'),
    ],
    ...visualHelpers(),
  });
  await assert.rejects(
    ui.openFeature({ chatName: CHAT, feature: 'albums' }),
    error => error?.code === 'LINE_FEATURE_UNAVAILABLE' && error?.operationMayHaveCompleted === true,
  );
  assert.equal(calls.filter(call => call.name === 'click').length, 1);
});

test('getState keeps image content out unless the caller requested it', async () => {
  const image = { type: 'image', data: 'base64-not-real' };
  const { ui } = fakeEnvironment({
    states: [{ ...state([header()], 'state'), images: [image], screenshot_data: 'raw' }],
  });

  const result = await ui.getState({ chatName: CHAT, includeScreenshot: false });
  assert.equal('images' in result, false);
  assert.equal('screenshot_data' in result.raw, false);
});

test('visual header crop clips one Qt UIA outer-edge pixel but refuses a wider overflow', async () => {
  const accepted = fakeEnvironment({
    windows: [CURRENT_MAIN_TARGET],
    states: Array.from({ length: 2 }, (_, index) => currentMainVisualState({ suffix: `edge-${index}` })),
    ...visualHelpers(),
  });
  const pending = await accepted.ui.getState({ chatName: CHAT, includeScreenshot: true });
  assert.equal(pending.verification, 'visual-header-confirmation-pending');
  assert.equal(pending.images[0].data, 'crop-a');

  const rejected = fakeEnvironment({
    windows: [CURRENT_MAIN_TARGET],
    states: Array.from({ length: 2 }, (_, index) => currentMainVisualState({
      suffix: `wide-edge-${index}`,
      headerWidth: 376,
    })),
    ...visualHelpers(),
  });
  await assert.rejects(
    rejected.ui.getState({ chatName: CHAT, includeScreenshot: true }),
    { code: 'LINE_CHAT_UNVERIFIED' },
  );
});

test('visual header confirmation returns only a title crop and carries a fresh cache into guarded reads', async () => {
  const { ui, automationCalls, locks } = fakeEnvironment({
    states: Array.from({ length: 7 }, (_, index) => nestedVisualState('', `visual-${index}`)),
    ...visualHelpers(),
    randomToken: () => 'pending-header-token',
    now: () => 1_000_000,
  });

  const pending = await ui.getState({ chatName: CHAT, includeScreenshot: true });
  assert.equal(pending.success, true);
  assert.equal(pending.verification, 'visual-header-confirmation-pending');
  assert.equal(pending.visualVerification.token, 'pending-header-token');
  assert.equal('raw' in pending, false);
  assert.equal(pending.images.length, 1);
  assert.equal(pending.images[0].data, 'crop-a');
  assert.deepEqual(automationCalls, []);

  const confirmed = await ui.confirmChat({
    chatName: CHAT,
    token: pending.visualVerification.token,
    observedHeader: CHAT,
  });
  assert.equal(confirmed.verification, 'caller-confirmed-fresh-header-crop');

  const draft = await ui.getDraft({ chatName: CHAT });
  assert.equal(draft.draft, '');
  assert.equal(draft.verification.chat, 'cached-caller-confirmed-main-header-crop');
  assert.deepEqual(locks, ['ui-get-state', 'ui-confirm-chat-view', 'ui-get-draft']);
});

test('a caller-confirmed main header accepts an unlabeled empty rich composer only inside its unique body', async () => {
  const { ui } = fakeEnvironment({
    windows: [CURRENT_MAIN_TARGET],
    states: Array.from({ length: 7 }, (_, index) => currentMainVisualState({ suffix: `main-empty-${index}` })),
    ...visualHelpers(),
    randomToken: () => 'main-empty-token',
    now: () => 1_000_000,
  });

  const pending = await ui.getState({ chatName: CHAT, includeScreenshot: true });
  await ui.confirmChat({ chatName: CHAT, token: pending.visualVerification.token, observedHeader: CHAT });
  const draft = await ui.getDraft({ chatName: CHAT });
  assert.equal(draft.draft, '');
  assert.equal(draft.verification.draft, 'main-composer-empty-structure');
});

test('a main structural composer does not write a global-search Edit', async () => {
  const message = 'only the main composer may receive this';
  const states = Array.from({ length: 8 }, (_, index) => currentMainVisualState({
    suffix: `scoped-write-${index}`,
    includeGlobalSearch: true,
  }));
  states.push(currentMainVisualState({
    suffix: 'scoped-write-after',
    editorValue: message,
    includeGlobalSearch: true,
  }));
  const { ui, calls } = fakeEnvironment({
    windows: [CURRENT_MAIN_TARGET],
    states,
    ...visualHelpers(),
    randomToken: () => 'scoped-write-token',
    now: () => 1_000_000,
  });

  const pending = await ui.getState({ chatName: CHAT, includeScreenshot: true });
  await ui.confirmChat({ chatName: CHAT, token: pending.visualVerification.token, observedHeader: CHAT });
  const result = await ui.setDraft({ chatName: CHAT, message });
  const write = calls.find(call => call.name === 'set_value');
  assert.equal(result.changed, true);
  assert.match(write.args.element_token, /^token-72/);
  assert.doesNotMatch(write.args.element_token, /^token-109/);
});

test('ambiguous rich editors in the verified main body are refused', async () => {
  const { ui } = fakeEnvironment({
    windows: [CURRENT_MAIN_TARGET],
    states: Array.from({ length: 7 }, (_, index) => currentMainVisualState({
      suffix: `ambiguous-main-${index}`,
      extraMainComposer: true,
    })),
    ...visualHelpers(),
    randomToken: () => 'ambiguous-main-token',
    now: () => 1_000_000,
  });

  const pending = await ui.getState({ chatName: CHAT, includeScreenshot: true });
  await ui.confirmChat({ chatName: CHAT, token: pending.visualVerification.token, observedHeader: CHAT });
  await assert.rejects(ui.getDraft({ chatName: CHAT }), { code: 'LINE_COMPOSER_UNVERIFIED' });
});

test('a semantic main header switch before set_value refuses the mutation', async () => {
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'read-before-write'),
      state([headerFor('另一個聊天室'), composer('')], 'switched-before-set-value'),
    ],
  });

  await assert.rejects(
    ui.setDraft({ chatName: CHAT, message: 'must not reach another chat' }),
    { code: 'LINE_CHAT_STALE' },
  );
  assert.equal(calls.some(call => call.name === 'set_value'), false);
});

test('a semantic main header switch before Return leaves the staged draft unsent', async () => {
  const text = 'stage but do not dispatch after a chat switch';
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'write-initial'),
      state([header(), composer('')], 'write-before'),
      state([header(), composer(text)], 'write-after'),
      state([headerFor('另一個聊天室'), composer(text)], 'switched-before-return'),
    ],
  });

  await assert.rejects(
    ui.sendText({ chatName: CHAT, message: text, autoSend: true }),
    error => error?.code === 'LINE_SEND_UNVERIFIED'
      && error?.operationMayHaveCompleted === true
      && error?.details?.draftMayBeStaged === true
      && error?.details?.sendDispatched === false
      && error?.details?.previousCode === 'LINE_CHAT_STALE',
  );
  assert.equal(calls.filter(call => call.name === 'set_value').length, 1);
  assert.equal(calls.some(call => call.name === 'press_key'), false);
});

test('an uncertain Return transport is not reported as a known skipped dispatch', async () => {
  const text = 'the Return transport may already have reached LINE';
  const uncertain = Object.assign(new Error('transport timed out'), {
    code: 'LINE_UI_ACTION_UNCERTAIN',
    operationMayHaveCompleted: true,
  });
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'write-initial'),
      state([header(), composer('')], 'write-before'),
      state([header(), composer(text)], 'write-after'),
      state([header(), composer(text)], 'return-before'),
    ],
    handlers: {
      press_key: () => { throw uncertain; },
    },
  });

  await assert.rejects(ui.sendText({ chatName: CHAT, message: text, autoSend: true }), error => error === uncertain);
  assert.equal(calls.filter(call => call.name === 'press_key').length, 1);
});

test('a pre-Return schema refusal reports the already-staged draft as partial local state', async () => {
  const text = 'draft remains after schema refusal';
  const schemaRefusal = Object.assign(new Error('runtime schema rejected press_key'), {
    code: 'LINE_UI_INVALID_ARGUMENT',
    operationMayHaveCompleted: false,
  });
  const { ui, calls } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'write-initial'),
      state([header(), composer('')], 'write-before'),
      state([header(), composer(text)], 'write-after'),
      state([header(), composer(text)], 'return-before-schema-refusal'),
    ],
    handlers: {
      press_key: () => { throw schemaRefusal; },
    },
  });

  await assert.rejects(
    ui.sendText({ chatName: CHAT, message: text, autoSend: true }),
    error => error?.code === 'LINE_SEND_UNVERIFIED'
      && error?.operationMayHaveCompleted === true
      && error?.details?.draftMayBeStaged === true
      && error?.details?.sendDispatched === false
      && error?.details?.previousCode === 'LINE_UI_INVALID_ARGUMENT',
  );
  assert.equal(calls.filter(call => call.name === 'press_key').length, 1);
});

test('file-picker failure after an optional draft is reported as partial local state', async () => {
  const { ui } = fakeEnvironment({
    states: [
      state([header(), composer('')], 'inspect'),
      state([header(), composer('')], 'stage-initial'),
      state([header(), composer('')], 'optional-write-initial'),
      state([header(), composer('')], 'optional-write-before'),
      state([header(), composer('attachment note')], 'optional-write-after'),
      state([header(), composer('attachment note')], 'fresh-before-picker'),
    ],
    innerAutomation: {
      async stageFileManual() {
        return { success: false, error: 'picker did not verify' };
      },
    },
  });

  await assert.rejects(
    ui.stageFile({
      chatName: CHAT,
      filePath: path.resolve('test-fixtures', 'attachment.pdf'),
      optionalMessage: 'attachment note',
    }),
    error => error?.code === 'LINE_STAGE_UNVERIFIED'
      && error?.operationMayHaveCompleted === true
      && error?.details?.draftMayBeStaged === true
      && error?.details?.pickerMayBeOpen === true,
  );
});
