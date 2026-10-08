import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from '../app/cli.mjs';
test('cli preserves fsc flags and output defaults', () => {
  assert.deepEqual(parseArgs([]), { input:'.', output:path.resolve('matted'), mode:'watermark' });
  assert.deepEqual(parseArgs(['photo.jpg']), { input:'photo.jpg', output:null, mode:'watermark' });
  assert.equal(parseArgs(['photos','--smart','-o','out']).mode,'smart');
  assert.equal(parseArgs(['photos','-p','--output=out']).output,path.resolve('out'));
  assert.throws(() => parseArgs(['-o'])); assert.throws(() => parseArgs(['--output=']));
  assert.throws(() => parseArgs(['--wrong'])); assert.throws(() => parseArgs(['one','two']));
});
test('cli entry point runs from a path containing spaces', () => {
  assert.match(execFileSync(process.execPath, ['app/cli.mjs','--help'], {encoding:'utf8'}), /fsc \[image-or-folder\]/);
  assert.match(execFileSync(process.execPath, ['app/cli.mjs','--version'], {encoding:'utf8'}), /0\.1\.1/);
});
