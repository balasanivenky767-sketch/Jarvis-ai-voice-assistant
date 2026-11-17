import React, { useEffect, useRef } from "react";
import { SessionState } from "../services/liveSession";

interface AudioVisualizerCanvasProps {
  state: SessionState;
  getFrequencyData: (array: Uint8Array) => void;
  inputVolume: number; // 0.0 - 1.0
  primaryColor: string; // e.g. '#f43f5e' or '#06b6d4'
  secondaryColor: string; // e.g. '#a855f7'
}

export const AudioVisualizerCanvas: React.FC<AudioVisualizerCanvasProps> = ({
  state,
  getFrequencyData,
  inputVolume,
  primaryColor,
  secondaryColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const freqDataRef = useRef<Uint8Array>(new Uint8Array(128));
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio || 320);
    let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio || 320);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio || 320;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio || 320;
    };

    window.addEventListener("resize", handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.28;

      phaseRef.current += 0.03;
      const phase = phaseRef.current;

      if (state === "disconnected") {
        // Subtle standby idle pulse
        const idleRadius = baseRadius + Math.sin(phase * 1.5) * 4;

        // Outer glow circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, idleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Inner breathing core
        const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, idleRadius);
        grad.addColorStop(0, "rgba(71, 85, 105, 0.25)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, idleRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (state === "connecting") {
        // Quantum scanning radar pulse
        const scanAngle = (phase * 3) % (Math.PI * 2);

        // Circular track
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(6, 182, 212, 0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Sweeping radar wedge
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, baseRadius * 1.15, scanAngle, scanAngle + Math.PI * 0.4);
        ctx.closePath();
        const scanGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 1.15);
        scanGrad.addColorStop(0, "rgba(6, 182, 212, 0.4)");
        scanGrad.addColorStop(1, "transparent");
        ctx.fillStyle = scanGrad;
        ctx.fill();

        // Rotating dashes
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(phase * 2);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.1, 0, Math.PI * 2);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 3;
        ctx.setLineDash([15, 25]);
        ctx.stroke();
        ctx.restore();
      } else if (state === "listening") {
        // Reactive waveform listening to microphone input
        const vol = Math.min(1.0, inputVolume);
        const dynamicRadius = baseRadius + vol * 30 + Math.sin(phase * 2) * 3;

        // Glowing backdrop orb
        const listenGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, dynamicRadius * 1.3);
        listenGrad.addColorStop(0, `${primaryColor}33`);
        listenGrad.addColorStop(0.7, `${secondaryColor}15`);
        listenGrad.addColorStop(1, "transparent");
        ctx.fillStyle = listenGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, dynamicRadius * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Wavy perimeter representing incoming microphone audio
        const points = 60;
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const wave = Math.sin(angle * 6 + phase * 4) * (6 + vol * 22);
          const r = dynamicRadius + wave;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner harmonic wave
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const wave = Math.cos(angle * 8 - phase * 3) * (4 + vol * 14);
          const r = dynamicRadius * 0.85 + wave;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `${secondaryColor}aa`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (state === "speaking") {
        // High-energy reactive FFT frequency visualizer from Jarvis's voice output
        getFrequencyData(freqDataRef.current);
        const data = freqDataRef.current;

        // Calculate average output power
        let sum = 0;
        for (let i = 0; i < 32; i++) {
          sum += data[i];
        }
        const avgPower = (sum / 32 / 255.0);
        const coreRadius = baseRadius + avgPower * 35;

        // Intense glowing plasma aura
        const speakGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 1.6);
        speakGrad.addColorStop(0, `${primaryColor}66`);
        speakGrad.addColorStop(0.5, `${secondaryColor}33`);
        speakGrad.addColorStop(1, "transparent");
        ctx.fillStyle = speakGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, coreRadius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Radial frequency bars around circle
        const barCount = 48;
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2;
          const dataIndex = Math.floor((i / barCount) * (data.length * 0.6));
          const val = data[dataIndex] || 0;
          const barHeight = Math.max(6, (val / 255) * 55 + Math.sin(phase * 4 + i) * 3);

          const x1 = centerX + Math.cos(angle) * (coreRadius - 2);
          const y1 = centerY + Math.sin(angle) * (coreRadius - 2);
          const x2 = centerX + Math.cos(angle) * (coreRadius + barHeight);
          const y2 = centerY + Math.sin(angle) * (coreRadius + barHeight);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = i % 2 === 0 ? primaryColor : secondaryColor;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // Inner pulsing reactor ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, coreRadius * 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state, getFrequencyData, inputVolume, primaryColor, secondaryColor]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full absolute inset-0 pointer-events-none"
    />
  );
};
