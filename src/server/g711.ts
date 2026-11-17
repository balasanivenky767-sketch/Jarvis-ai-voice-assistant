/**
 * G.711 mu-law (PCMU) codec and audio resampling utilities.
 * Used for bridging Twilio Media Streams (8kHz mu-law) with
 * Gemini Live API (16kHz PCM input, 24kHz PCM output).
 */

// Precomputed 8-bit mu-law to 16-bit linear PCM lookup table
const ULAW_TO_LINEAR_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i;
  const sign = u & 0x80 ? -1 : 1;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 132) << exponent;
  sample -= 132;
  ULAW_TO_LINEAR_TABLE[i] = sign * sample;
}

/**
 * Decodes 8kHz mu-law buffer into 16-bit linear PCM Int16Array.
 */
export function decodeUlawToLinear(ulawBuffer: Buffer | Uint8Array): Int16Array {
  const len = ulawBuffer.length;
  const linear = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    linear[i] = ULAW_TO_LINEAR_TABLE[ulawBuffer[i]];
  }
  return linear;
}

/**
 * Encodes a 16-bit linear PCM sample (-32768 to 32767) to an 8-bit mu-law byte.
 */
export function linearSampleToUlaw(sample: number): number {
  const CLIP = 32635;
  const BIAS = 0x84;
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/**
 * Encodes a 16-bit linear PCM Int16Array into an 8kHz mu-law Buffer.
 */
export function encodeLinearToUlaw(linear: Int16Array): Buffer {
  const len = linear.length;
  const buf = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    buf[i] = linearSampleToUlaw(linear[i]);
  }
  return buf;
}

/**
 * Upsamples an 8kHz linear PCM Int16Array to 16kHz linear PCM Int16Array (factor of 2).
 * Uses linear interpolation for smooth reproduction.
 */
export function resample8kTo16k(pcm8k: Int16Array): Int16Array {
  const len8k = pcm8k.length;
  const pcm16k = new Int16Array(len8k * 2);

  for (let i = 0; i < len8k; i++) {
    const current = pcm8k[i];
    const next = i + 1 < len8k ? pcm8k[i + 1] : current;

    pcm16k[i * 2] = current;
    pcm16k[i * 2 + 1] = Math.round((current + next) / 2);
  }

  return pcm16k;
}

/**
 * Downsamples a 24kHz linear PCM Int16Array to 8kHz linear PCM Int16Array (factor of 3).
 * Uses 3-tap averaging to prevent aliasing.
 */
export function resample24kTo8k(pcm24k: Int16Array): Int16Array {
  const len8k = Math.floor(pcm24k.length / 3);
  const pcm8k = new Int16Array(len8k);

  for (let i = 0; i < len8k; i++) {
    const idx = i * 3;
    const s0 = pcm24k[idx] || 0;
    const s1 = pcm24k[idx + 1] || s0;
    const s2 = pcm24k[idx + 2] || s1;
    pcm8k[i] = Math.round((s0 + s1 + s2) / 3);
  }

  return pcm8k;
}
