import sharp from 'sharp';

const width = 800;
const height = 600;

const svgWatermark = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="200" cy="200" r="80" fill="rgba(255,255,255,0.3)"/>
  <circle cx="600" cy="400" r="100" fill="rgba(255,255,255,0.2)"/>
  <rect x="100" y="450" width="200" height="100" fill="rgba(255,255,255,0.15)" rx="10"/>
  <text x="400" y="320" font-family="Arial" font-size="72" font-weight="bold" fill="rgba(255,255,255,0.4)" text-anchor="middle">WATERMARK</text>
  <text x="400" y="400" font-family="Arial" font-size="36" fill="rgba(255,255,255,0.3)" text-anchor="middle">SAMPLE TEXT</text>
</svg>
`;

await sharp(Buffer.from(svgWatermark))
  .png()
  .toFile('/Volumes/代码/solo/lp0055/test-watermark.png');

console.log('Test image generated: test-watermark.png');
console.log('Size:', width, 'x', height);
