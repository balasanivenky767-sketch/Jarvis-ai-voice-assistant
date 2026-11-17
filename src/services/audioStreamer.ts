/**
 * AudioStreamer manages:
 * 1. Microphone capture at 16,000 Hz, linear PCM 16-bit encoding, and RMS calculation.
 * 2. Response audio playback at 24,000 Hz using Web Audio API with gapless scheduling
 *    and real-time FFT frequency / waveform analysis.
 * 3. Instant interruption handling (clearing queue, stopping active source nodes).
 */

export class AudioStreamer {
  // Input (Microphone -> 16kHz PCM16)
  private inputContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private inputSourceNode: MediaStreamAudioSourceNode | null = null;
  private isCapturing: boolean = false;
  private inputVolume: number = 0;

  // Output (Speaker -> 24kHz PCM16)
  private outputContext: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;
  private nextStartTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isPlaying: boolean = false;
  private playbackEndTimeout: any = null;

  // Callbacks
  public onAudioChunk?: (base64Chunk: string, rms: number) => void;
  public onInputVolumeChange?: (volume: number) => void;
  public onPlaybackStarted?: () => void;
  public onPlaybackEnded?: () => void;
  public onError?: (error: Error) => void;

  constructor() {}

  /**
   * Initializes or returns the output AudioContext (24kHz).
   * Web Audio requires user interaction to resume or instantiate.
   */
  private ensureOutputContext(): AudioContext {
    if (!this.outputContext || this.outputContext.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      // Gemini Live outputs at 24,000 Hz
      try {
        this.outputContext = new AudioCtx({ sampleRate: 24000 });
      } catch (e) {
        // Fallback if browser forces hardware sample rate
        this.outputContext = new AudioCtx();
      }

      this.outputAnalyser = this.outputContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.8;

      this.outputGain = this.outputContext.createGain();
      this.outputGain.gain.value = 1.0;

      this.outputAnalyser.connect(this.outputGain);
      this.outputGain.connect(this.outputContext.destination);
    }

    if (this.outputContext.state === "suspended") {
      this.outputContext.resume();
    }

    return this.outputContext;
  }

  /**
   * Starts capturing microphone audio at 16,000 Hz.
   */
  public async startCapture(): Promise<void> {
    if (this.isCapturing) return;

    try {
      this.ensureOutputContext();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaStream = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      try {
        this.inputContext = new AudioCtx({ sampleRate: 16000 });
      } catch (e) {
        this.inputContext = new AudioCtx();
      }

      if (this.inputContext.state === "suspended") {
        await this.inputContext.resume();
      }

      this.inputSourceNode = this.inputContext.createMediaStreamSource(stream);

      // Buffer size 4096 = ~256ms at 16kHz
      this.processorNode = this.inputContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isCapturing) return;

        const inputChannelData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS volume on raw input
        let sum = 0;
        for (let i = 0; i < inputChannelData.length; i++) {
          sum += inputChannelData[i] * inputChannelData[i];
        }
        const rms = Math.sqrt(sum / inputChannelData.length);
        this.inputVolume = Math.min(1.0, rms * 4.0); // Boost for visual sensitivity

        if (this.onInputVolumeChange) {
          this.onInputVolumeChange(this.inputVolume);
        }

        // Resample input to guaranteed 16,000 Hz PCM for Gemini Live API
        const actualSampleRate = this.inputContext?.sampleRate || 48000;
        const resampled16k = this.downsampleTo16000(inputChannelData, actualSampleRate);
        const pcm16 = this.float32ToInt16(resampled16k);

        // Convert Int16Array to base64
        const base64 = this.int16ToBase64(pcm16);
        if (this.onAudioChunk) {
          this.onAudioChunk(base64, this.inputVolume);
        }
      };

      this.inputSourceNode.connect(this.processorNode);
      this.processorNode.connect(this.inputContext.destination);

      this.isCapturing = true;
    } catch (err: any) {
      console.error("Microphone capture error:", err);
      this.isCapturing = false;
      if (this.onError) {
        this.onError(new Error(err?.message || "Failed to access microphone. Please grant permission."));
      }
      throw err;
    }
  }

  /**
   * Stops microphone capture.
   */
  public stopCapture(): void {
    this.isCapturing = false;
    this.inputVolume = 0;
    if (this.onInputVolumeChange) {
      this.onInputVolumeChange(0);
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.inputSourceNode) {
      this.inputSourceNode.disconnect();
      this.inputSourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.inputContext && this.inputContext.state !== "closed") {
      this.inputContext.close();
      this.inputContext = null;
    }
  }

  /**
   * Plays a 24kHz PCM16 base64 chunk received from Gemini Live API.
   * Schedules it seamlessly after any currently playing audio.
   */
  public playChunk(base64Data: string): void {
    const ctx = this.ensureOutputContext();
    if (!this.outputAnalyser) return;

    // Convert base64 to Float32Array (Gemini audio is 24kHz mono 16-bit PCM little-endian)
    const float32Array = this.base64ToFloat32(base64Data);
    if (!float32Array || float32Array.length === 0) return;

    // Create AudioBuffer
    const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputAnalyser);

    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);
    source.start(startTime);

    this.nextStartTime = startTime + audioBuffer.duration;
    this.activeSources.push(source);

    if (!this.isPlaying) {
      this.isPlaying = true;
      if (this.onPlaybackStarted) {
        this.onPlaybackStarted();
      }
    }

    if (this.playbackEndTimeout) {
      clearTimeout(this.playbackEndTimeout);
    }

    const remainingTimeMs = Math.max(0, (this.nextStartTime - currentTime) * 1000 + 80);
    this.playbackEndTimeout = setTimeout(() => {
      this.isPlaying = false;
      this.activeSources = [];
      if (this.onPlaybackEnded) {
        this.onPlaybackEnded();
      }
    }, remainingTimeMs);

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
      if (this.activeSources.length === 0 && ctx.currentTime >= this.nextStartTime - 0.05) {
        this.isPlaying = false;
        if (this.onPlaybackEnded) {
          this.onPlaybackEnded();
        }
      }
    };
  }

  /**
   * Immediately stops any currently playing audio and clears the queue.
   * Called on interruption or barge-in.
   */
  public interrupt(): void {
    if (this.playbackEndTimeout) {
      clearTimeout(this.playbackEndTimeout);
      this.playbackEndTimeout = null;
    }

    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    }

    this.activeSources = [];
    if (this.outputContext) {
      this.nextStartTime = this.outputContext.currentTime;
    } else {
      this.nextStartTime = 0;
    }

    const wasPlaying = this.isPlaying;
    this.isPlaying = false;

    if (wasPlaying && this.onPlaybackEnded) {
      this.onPlaybackEnded();
    }
  }

  /**
   * Retrieves frequency data (0-255) from output analyser for visualizer.
   */
  public getFrequencyData(array: Uint8Array): void {
    if (this.outputAnalyser && this.isPlaying) {
      (this.outputAnalyser as any).getByteFrequencyData(array);
    } else {
      array.fill(0);
    }
  }

  /**
   * Retrieves current input volume (0.0 - 1.0).
   */
  public getInputVolume(): number {
    return this.inputVolume;
  }

  public isAudioPlaying(): boolean {
    return this.isPlaying;
  }

  public isMicCapturing(): boolean {
    return this.isCapturing;
  }

  /**
   * Cleanup everything.
   */
  public destroy(): void {
    this.stopCapture();
    this.interrupt();

    if (this.outputContext && this.outputContext.state !== "closed") {
      this.outputContext.close();
      this.outputContext = null;
    }
  }

  // --- Audio Conversion Helpers ---

  private downsampleTo16000(buffer: Float32Array, inputSampleRate: number): Float32Array {
    if (inputSampleRate === 16000 || !inputSampleRate) return buffer;
    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcPos = i * ratio;
      const srcIndex = Math.floor(srcPos);
      const nextIndex = Math.min(buffer.length - 1, srcIndex + 1);
      const t = srcPos - srcIndex;
      result[i] = buffer[srcIndex] * (1 - t) + buffer[nextIndex] * t;
    }
    return result;
  }

  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  private int16ToBase64(int16: Int16Array): string {
    const bytes = new Uint8Array(int16.buffer as ArrayBuffer, int16.byteOffset, int16.byteLength);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToFloat32(base64: string): Float32Array {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }
}
