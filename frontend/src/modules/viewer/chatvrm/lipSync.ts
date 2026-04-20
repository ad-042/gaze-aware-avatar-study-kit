/**
 * Amplitude-based lip-sync analysis using Web Audio API.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/features/lipSync/lipSync.ts
 *
 * The original uses playFromArrayBuffer for TTS audio.
 * For Realtime integration, the analyser is connected to a
 * WebRTC MediaStream source instead.
 *
 * Adapted for @pixiv/three-vrm 3.5.x.
 */

import type { LipSyncAnalyzeResult } from "./lipSyncAnalyzeResult.js";

const TIME_DOMAIN_DATA_LENGTH = 2048;

export class LipSync {
  public readonly audio: AudioContext;
  public readonly analyser: AnalyserNode;
  public readonly timeDomainData: Float32Array<ArrayBuffer>;

  public constructor(audio: AudioContext) {
    this.audio = audio;

    this.analyser = audio.createAnalyser();
    this.timeDomainData = new Float32Array(TIME_DOMAIN_DATA_LENGTH) as Float32Array<ArrayBuffer>;
  }

  public update(): LipSyncAnalyzeResult {
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    let volume = 0.0;
    for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
      volume = Math.max(volume, Math.abs(this.timeDomainData[i]));
    }

    // Sigmoid curve for natural-feeling volume mapping
    volume = 1 / (1 + Math.exp(-45 * volume + 5));
    if (volume < 0.1) volume = 0;

    return { volume };
  }

  public async playFromArrayBuffer(
    buffer: ArrayBuffer,
    onEnded?: () => void,
  ): Promise<void> {
    const audioBuffer = await this.audio.decodeAudioData(buffer);

    const bufferSource = this.audio.createBufferSource();
    bufferSource.buffer = audioBuffer;

    bufferSource.connect(this.audio.destination);
    bufferSource.connect(this.analyser);
    bufferSource.start();
    if (onEnded) {
      bufferSource.addEventListener("ended", onEnded);
    }
  }

  public async playFromURL(
    url: string,
    onEnded?: () => void,
  ): Promise<void> {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    await this.playFromArrayBuffer(buffer, onEnded);
  }
}
