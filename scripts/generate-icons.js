import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';
const svg = readFileSync('public/favicon.svg', 'utf-8');
if (!existsSync('public/icons')) mkdirSync('public/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  writeFileSync(`public/icons/icon${size}.png`, resvg.render().asPng());
}
