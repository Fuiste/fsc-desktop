import { readFile, readdir, stat, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Effect, Option } from 'effect';
import { Exif, Exposure, Watermark, Panorama } from 'exposure-watermark';

export const MODES = ['watermark', 'panorama', 'smart'];
const config = { position: 'bottom-right' };
export const supported = file => /\.jpe?g$/i.test(file);
export const effectiveMode = (mode, width, height) => {
  if (!MODES.includes(mode)) throw new Error('unknown processing mode');
  return mode === 'smart' ? (width / height > 2 ? 'panorama' : 'watermark') : mode;
};
export async function discover(inputs) {
  const found = [];
  for (const input of inputs) {
    const full = path.resolve(input);
    const info = await stat(full);
    if (info.isDirectory()) {
      for (const entry of (await readdir(full, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
        if (entry.isFile() && supported(entry.name)) found.push(path.join(full, entry.name));
      }
    } else if (info.isFile() && supported(full)) found.push(full);
  }
  return [...new Map(found.map(file => [process.platform === 'win32' ? file.toLowerCase() : file, file])).values()];
}
async function source(file) {
  const bytes = await readFile(file);
  const meta = await sharp(bytes).metadata();
  if (meta.format !== 'jpeg') throw new Error('this file is not a valid jpeg');
  let exposure;
  try { exposure = await Effect.runPromise(Exif.extractFromBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))); }
  catch { throw new Error('could not read image metadata; the jpeg may be damaged'); }
  // Read EXIF before normalization, then honor rotation without writing to the original.
  const rotated = meta.orientation && meta.orientation !== 1;
  const buffer = rotated ? await sharp(bytes).rotate().jpeg({ quality: 100 }).toBuffer() : bytes;
  const oriented = rotated ? await sharp(buffer).metadata() : meta;
  return { buffer, exposure, width: oriented.width, height: oriented.height };
}
const text = exposure => ({
  camera: Option.getOrElse(Exposure.formatCamera(exposure), () => ''),
  lens: Option.getOrElse(exposure.lens, () => ''),
  exposure: Exposure.format(exposure)
});
export async function inspect(file) {
  const src = await source(file);
  const metadata = text(src.exposure);
  return {
    name: path.basename(file), width: src.width, height: src.height, ...metadata,
    warning: Object.values(metadata).some(Boolean) ? '' : 'no camera metadata — exports will have a plain white matte',
    thumbnail: 'data:image/jpeg;base64,' + (await sharp(src.buffer).resize(240, 160, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString('base64')
  };
}
async function plainMatte(buffer) {
  const resized = await sharp(buffer).resize(2878, 3878, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 100 }).toBuffer();
  const meta = await sharp(resized).metadata();
  return sharp({ create: { width: 3000, height: 4000, channels: 3, background: 'white' } })
    .composite([{ input: resized, left: Math.round((3000-meta.width)/2), top: Math.round((4000-meta.height)/2) }]).jpeg({ quality: 100 }).toBuffer();
}
export async function render(file, mode) {
  const src = await source(file);
  const actual = effectiveMode(mode, src.width, src.height);
  const hasText = Object.values(text(src.exposure)).some(Boolean);
  if (actual === 'panorama') {
    const result = await Effect.runPromise(Panorama.processBuffer(src.buffer, src.exposure, config));
    return { mode: actual, buffers: [...result.slices, hasText ? result.full : await plainMatte(src.buffer)] };
  }
  return { mode: actual, buffers: [hasText ? await Effect.runPromise(Watermark.applyToBuffer(src.buffer, src.exposure, config)) : await plainMatte(src.buffer)] };
}
export async function preview(file, mode, original = false) {
  const result = original ? { mode: 'original', buffers: [(await source(file)).buffer] } : await render(file, mode);
  const images = [];
  for (const buffer of result.buffers) {
    const meta = await sharp(buffer).metadata();
    images.push({ width: meta.width, height: meta.height, url: 'data:image/jpeg;base64,' + (await sharp(buffer).resize(1050, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).toString('base64') });
  }
  return { mode: result.mode, images };
}
export async function saveOutputs(file, outputDir, result) {
  await mkdir(outputDir, { recursive: true });
  const base = path.basename(file, path.extname(file));
  // Reserve the entire group exclusively. Never replace an existing file, even under races.
  for (let attempt = 0; attempt < 10000; attempt++) {
    const stem = `${base}-framed${attempt ? ` (${attempt + 1})` : ''}`;
    const targets = result.buffers.map((_, i) => path.join(outputDir, `${stem}${result.mode === 'panorama' ? `-${i + 1}` : ''}.jpg`));
    const handles = [];
    try {
      for (const target of targets) handles.push({ target, handle: await open(target, 'wx') });
    } catch (error) {
      for (const item of handles) { await item.handle.close(); await unlink(item.target); }
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    try {
      for (let i = 0; i < handles.length; i++) await handles[i].handle.writeFile(result.buffers[i]);
    } catch (error) {
      for (const item of handles) { await item.handle.close(); await unlink(item.target); }
      throw error;
    }
    for (const item of handles) await item.handle.close();
    return targets;
  }
  throw new Error('too many files with the same name in the output folder');
}
export async function exportBatch(items, outputDir, mode, progress = () => {}, cancelled = () => false) {
  if (!MODES.includes(mode)) throw new Error('unknown processing mode');
  const results = [];
  for (let index = 0; index < items.length; index++) {
    if (cancelled()) break;
    const item = items[index];
    progress({ index, total: items.length, id: item.id, name: path.basename(item.path), phase: 'working' });
    try {
      const rendered = await render(item.path, mode);
      results.push({ id: item.id, name: path.basename(item.path), paths: await saveOutputs(item.path, outputDir, rendered) });
    } catch (error) { results.push({ id: item.id, name: path.basename(item.path), error: error.message || 'image processing failed' }); }
    progress({ index: index + 1, total: items.length, id: item.id, phase: 'done', result: results.at(-1) });
  }
  return { results, cancelled: results.length < items.length };
}
