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
  const bytes = new Uint8Array(buffer);
  // For small chunks (like 2048 bytes from 1024 samples), spread syntax is fastest
  // and avoids string concatenation overhead.
  return btoa(String.fromCharCode(...bytes));
}

export function downsampleTo16k(buffer: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) {
    return buffer;
  }
  
  const targetSampleRate = 16000;
  const ratio = sampleRate / targetSampleRate;
  const newLength = Math.ceil(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const offset = Math.floor(i * ratio);
    if (offset < buffer.length) {
        result[i] = buffer[offset];
    }
  }
  
  return result;
}

export function pcmToGeminiBlob(data: Float32Array, sampleRate: number): Blob {
  // Float32 to Int16 PCM
  const l = data.length;
  const int16 = new Int16Array(l);
  
  // Unrolling or using simple loop. V8 optimizes this well.
  for (let i = 0; i < l; i++) {
    // Clamp and scale
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
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
  // Raw PCM data decoding
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

export function hasSpeech(buffer: Float32Array, threshold: number = 0.01): boolean {
    let sum = 0;
    const len = buffer.length;
    for (let i = 0; i < len; i++) {
        sum += buffer[i] * buffer[i];
    }
    // RMS
    return Math.sqrt(sum / len) > threshold;
}