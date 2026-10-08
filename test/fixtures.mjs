import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
export async function makeFixture(file, { width = 1800, height = 1200, metadata = true, orientation = 1 } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1800 1200" preserveAspectRatio="none"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#abc7d4"/><stop offset="1" stop-color="#e6ddd0"/></linearGradient><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#688e9f"/><stop offset="1" stop-color="#263f52"/></linearGradient></defs><rect width="1800" height="1200" fill="url(#sky)"/><circle cx="1350" cy="260" r="95" fill="#f6e4b6"/><path d="M0 680 350 280 560 550 810 410 1150 740Z" fill="#8aa0aa"/><path d="M0 670 320 480 630 780 940 590 1270 800Z" fill="#546f78"/><path d="M0 790Q800 660 1800 750V1200H0Z" fill="url(#sea)"/><path d="M0 740 160 720 270 830 390 850 500 1000 650 1030 890 1200H0Z" fill="#223c3c"/><path d="m1230 970 55-140 90 28 40 160Z" fill="#30484f"/><path d="M600 1080Q1100 960 1700 1080M780 850Q1300 800 1800 850" fill="none" stroke="#b6c9cf" stroke-width="7" opacity=".45"/></svg>`;
  let image = sharp(Buffer.from(svg));
  if (metadata) image = image.withMetadata({ orientation, exif: { IFD0: { Make: 'sample', Model: 'camera' }, IFD2: { FNumber: '56/10', ExposureTime: '1/500', ISOSpeedRatings: '100', FocalLength: '28/1', LensModel: '28mm sample lens' } } });
  await image.jpeg({ quality: 94 }).toFile(file);
  return file;
}
