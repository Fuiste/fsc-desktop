import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="48" fill="#20262c"/><rect x="44" y="39" width="168" height="178" rx="12" fill="none" stroke="#87c8f7" stroke-width="10"/><path d="m48 179 49-63 37 42 28-32 46 55" fill="none" stroke="#87c8f7" stroke-width="10" stroke-linejoin="round"/><circle cx="165" cy="85" r="14" fill="#87c8f7"/></svg>`;
await mkdir('assets', { recursive:true });
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile('app/icon.png', png);
await writeFile('assets/fsc.svg', svg);
const header = Buffer.alloc(22); header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header.writeUInt16LE(1,10); header.writeUInt16LE(32,12); header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
await writeFile('assets/fsc.ico', Buffer.concat([header,png]));
