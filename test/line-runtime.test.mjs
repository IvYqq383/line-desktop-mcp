import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_ROOT, runtimeRequire } from '../src/extensions/line-runtime.mjs';

test('resolves runtime dependencies from this package root', () => {
  const expectedRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
  assert.equal(PACKAGE_ROOT, expectedRoot);
  assert.equal(runtimeRequire().resolve('./package.json'), path.join(expectedRoot, 'package.json'));
});
