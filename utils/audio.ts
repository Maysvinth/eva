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
  
