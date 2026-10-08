import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Effect } from 'effect';
import { extractExposure, Watermark, Panorama } from 'exposure-watermark';
import { inspect, render, preview, discover, effectiveMode, saveOutputs, exportBatch } from '../app/engine.mjs';
import { makeFixture } from './fixtures.mjs';

test('image processing, compatibility and safe file handling', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fsc-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const photo = await makeFixture(path.join(root, 'coast.jpg'));
  const inputBytes = await readFile(photo);
  await t.test('reads exposure and emits a decodable thumbnail', async () => {
    const info = await inspect(photo);
    assert.equal(info.camera, 'sample camera'); assert.match(info.exposure, /f\/5.6.*1\/500s.*ISO 100.*28mm/);
    assert.equal(info.lens, '28mm sample lens'); assert.equal(info.warning, '');
    assert.equal((await sharp(Buffer.from(info.thumbnail.split(',')[1], 'base64')).metadata()).format, 'jpeg');
  });
  let framed;
  await t.test('matches the original watermark renderer byte for byte on this platform', async () => {
    framed = await render(photo, 'watermark');
    const exposure = await Effect.runPromise(extractExposure(photo));
    const reference = await Effect.runPromise(Watermark.applyToBuffer(inputBytes, exposure, { position: 'bottom-right' }));
    assert.deepEqual(framed.buffers[0], reference);
    const meta = await sharp(reference).metadata(); assert.equal(meta.width, 3000); assert.equal(meta.height, 4000);
  });
  await t.test('exclusive output naming preserves existing exports and source bytes', async () => {
    const first = await saveOutputs(photo, path.join(root, 'out'), framed);
    await writeFile(first[0], 'sentinel');
    const second = await saveOutputs(photo, path.join(root, 'out'), framed);
    assert.match(second[0], /coast-framed \(2\)\.jpg$/);
    assert.equal(await readFile(first[0], 'utf8'), 'sentinel'); assert.deepEqual(await readFile(photo), inputBytes);
  });
  await t.test('metadata-free exports still get a matte and visible warning', async () => {
    const plain = await makeFixture(path.join(root, 'plain.jpg'), { metadata: false });
    assert.match((await inspect(plain)).warning, /no camera metadata/);
    const result = await render(plain, 'watermark'); const meta = await sharp(result.buffers[0]).metadata();
    assert.equal(meta.width, 3000); assert.equal(meta.height, 4000);
  });
  await t.test('EXIF orientation is normalized before preview and smart classification', async () => {
    const rotated = await makeFixture(path.join(root, 'rotated.jpg'), { width: 900, height: 400, orientation: 6 });
    const info = await inspect(rotated); assert.equal(info.width, 400); assert.equal(info.height, 900);
    assert.equal((await render(rotated, 'smart')).mode, 'watermark');
    assert.equal((await preview(rotated, 'smart', true)).images[0].height, 900);
  });
  await t.test('smart threshold remains strictly greater than 2:1', () => {
    assert.equal(effectiveMode('smart', 2000, 1000), 'watermark'); assert.equal(effectiveMode('smart', 2001, 1000), 'panorama');
    assert.throws(() => effectiveMode('bad', 1, 1));
  });
  await t.test('panorama renders three slices plus full with original renderer parity', async () => {
    const wide = await makeFixture(path.join(root, 'wide.jpg'), { width: 2400, height: 800 });
    const result = await render(wide, 'smart'); assert.equal(result.buffers.length, 4); assert.equal(result.mode, 'panorama');
    const reference = await Effect.runPromise(Panorama.processBuffer(await readFile(wide), await Effect.runPromise(extractExposure(wide)), { position: 'bottom-right' }));
    assert.deepEqual(result.buffers, [...reference.slices, reference.full]);
    for (const buffer of result.buffers) { const meta = await sharp(buffer).metadata(); assert.equal(meta.width, 3000); assert.equal(meta.height, 4000); }
    const out = path.join(root, 'pano'); await mkdir(out); await writeFile(path.join(out, 'wide-framed-2.jpg'), 'sentinel');
    const paths = await saveOutputs(wide, out, result); assert.equal(paths.length, 4); assert.match(paths[0], /\(2\)-1.jpg$/);
    assert.equal(await readFile(path.join(out,'wide-framed-2.jpg'),'utf8'),'sentinel'); assert.equal((await readdir(out)).length, 5);
  });
  await t.test('explicit panorama below 2:1 produces two slices plus full', async () => {
    assert.equal((await render(photo, 'panorama')).buffers.length, 3);
  });
  await t.test('folder discovery ignores subfolders and unsupported files, deduplicates inputs', async () => {
    const folder = path.join(root, 'scan'); await mkdir(folder); await mkdir(path.join(folder, 'folder.jpg'));
    await writeFile(path.join(folder, 'one.JPG'), inputBytes); await writeFile(path.join(folder, 'skip.png'), 'no');
    assert.deepEqual(await discover([folder, path.join(folder,'one.JPG')]), [path.join(folder,'one.JPG')]);
  });
  await t.test('bad files fail individually while later photos still export; cancellation stops at photo boundary', async () => {
    const corrupt = path.join(root, 'broken.jpg'); await writeFile(corrupt, 'invalid');
    const items = [{ id:'bad', path:corrupt }, { id:'good', path:photo }];
    const report = await exportBatch(items, path.join(root,'batch'), 'watermark');
    assert.ok(report.results[0].error); assert.equal(report.results[1].paths.length,1);
    let stop = false;
    const cancelled = await exportBatch(items, path.join(root,'cancel'), 'watermark', event => { if(event.phase === 'done') stop = true; }, () => stop);
    assert.equal(cancelled.cancelled, true); assert.equal(cancelled.results.length, 1);
  });
});
