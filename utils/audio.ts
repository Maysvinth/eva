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
  return btoa(String.fromCharCode(...bytes));
}

export function downsampleTo16k(buffer: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) {
    return buffer;
  }
  
  const ratio = sampleRate / 16000;
  const newLength = Math.floor(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  // Optimization: use simple loop and avoid frequent property access if possible
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.floor(i * ratio)];
  }
  
  return result;
}

export function pcmToGeminiBlob(data: Float32Array, sampleRate: number): Blob {
  // If data is not 16k, downsample first
  let inputData = data;
  if (sampleRate !== 16000) {
      inputData = downsampleTo16k(data, sampleRate);
  }

  const l = inputData.length;
  const int16 = new Int16Array(l);
  
  for (let i = 0; i < l; i++) {
    let s = inputData[i];
    // Clamp manually to avoid Math.max/min call overhead in hot path
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    
    // Float to Int16
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: "audio/pcm;rate=16000",
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

export function hasSpeech(buffer: Float32Array, threshold: number = 0.01): boolean {
    let sum = 0;
    const len = buffer.length;
    for (let i = 0; i < len; i++) {
        sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / len) > threshold;
}