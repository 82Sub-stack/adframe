const sharp = require('sharp');

async function compareCreativePixels(expectedBuffer, actualBuffer) {
  const normalize = (buffer) => sharp(buffer)
    .flatten({ background: '#fff' }).resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const [expected, actual] = await Promise.all([normalize(expectedBuffer), normalize(actualBuffer)]);
  let matching = 0;
  let totalDelta = 0;
  for (let i = 0; i < expected.length; i += 3) {
    const delta = (Math.abs(expected[i] - actual[i]) + Math.abs(expected[i + 1] - actual[i + 1]) + Math.abs(expected[i + 2] - actual[i + 2])) / 3;
    totalDelta += delta;
    if (delta <= 24) matching++;
  }
  const pixels = expected.length / 3;
  const matchedRatio = matching / pixels;
  const meanDelta = totalDelta / pixels;
  return { passed: matchedRatio >= 0.92 && meanDelta <= 12, matchedRatio: Number(matchedRatio.toFixed(3)), meanDelta: Number(meanDelta.toFixed(2)) };
}

async function verifyFinalCreative(screenshot, creative, placement, width, height) {
  const metadata = await sharp(screenshot).metadata();
  const x = Math.round(placement.x);
  const y = Math.round(placement.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x + width > metadata.width || y + height > metadata.height) {
    return { passed: false, reason: 'placement-out-of-bounds' };
  }
  const clip = await sharp(screenshot).extract({ left: x, top: y, width, height }).png().toBuffer();
  const result = await compareCreativePixels(creative, clip);
  return { ...result, reason: result.passed ? null : 'creative-not-visible-in-final-image' };
}

module.exports = { compareCreativePixels, verifyFinalCreative };
