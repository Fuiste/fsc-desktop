#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover, exportBatch } from './engine.mjs';
export function parseArgs(args) {
  let input, output, mode = 'watermark';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help:true };
    if (arg === '--version' || arg === '-v') return { version:true };
    if (arg === '--panorama' || arg === '-p') mode = 'panorama';
    else if (arg === '--smart' || arg === '-s') mode = 'smart';
    else if (arg === '--output' || arg === '-o') {
      output = args[++i]; if (!output || output.startsWith('-')) throw new Error('missing output directory');
    } else if (arg.startsWith('--output=')) { output = arg.slice(9); if (!output) throw new Error('missing output directory'); }
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    else { if (input) throw new Error('only one input file or folder is allowed'); input = arg; }
  }
  return { input: input || '.', output: output ? path.resolve(output) : input ? null : path.resolve('matted'), mode };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log('fsc [image-or-folder] [-p|--panorama] [-s|--smart] [-o|--output folder]\n\njpeg framing with exposure metadata. no input: current folder → ./matted.\nexplicit input: output beside each source unless --output is provided.\nexisting files are never overwritten.'); return; }
  if (args.version) { console.log('fsc-desktop 0.1.1'); return; }
  const files = await discover([args.input]);
  if (!files.length) throw new Error('no jpeg photos found');
  let failed = false;
  for (const file of files) {
    const report = await exportBatch([{ id:file, path:file }], args.output || path.dirname(file), args.mode);
    const result = report.results[0];
    if (result.error) { console.error(`${result.name}: ${result.error}`); failed = true; }
    else result.paths.forEach(output => console.log(output));
  }
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
