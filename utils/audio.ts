import { Blob } from "@google/genai";

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function downsampleTo16k(buffer: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) {
    return buffer;
  }
  
  const targetSampleRate = 16000;
  const ratio = sampleRate / targetSampleRate;
  const newLength = Math.ceil(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  // Fast nearest-neighbor downsampling for performance
  for (let i = 0; i < newLength; i++) {
    const offset = Math.floor(i * ratio);
    if (offset < buffer.length) {
        result[i] = buffer[offset];
    }
  }
  
  return result;
}

export function pcmToGeminiBlob(data: Float32Array, sampleRate: number): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Fast clamp
    const s = data[i];
    const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
  }
  
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// NOISE GATE CALCULATOR
export function hasSpeech(buffer: Float32Array, threshold: number = 0.01): boolean {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    return rms > threshold;
}