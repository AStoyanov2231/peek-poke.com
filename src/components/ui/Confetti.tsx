"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ConfettiProps {
  isActive: boolean;
  duration?: number;
  particleCount?: number;
  className?: string;
}

interface Particle {
  id: number;
  x: number;
  delay: number;
  color: string;
  size: number;
  rotation: number;
  borderRadius: string;
  animationDuration: string;
}

const colors = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--cat-pink))",
  "hsl(var(--warm))",
  "hsl(var(--success))",
];

export function Confetti({
  isActive,
  duration = 3000,
  particleCount = 50,
  className,
}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Generate particles
      const newParticles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        borderRadius: Math.random() > 0.5 ? "50%" : "2px",
        animationDuration: `${2 + Math.random()}s`,
      }));
      setParticles(newParticles);
      setShow(true);

      // Hide after duration
      const timer = setTimeout(() => {
        setShow(false);
        setParticles([]);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isActive, duration, particleCount]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 pointer-events-none z-50 overflow-hidden",
        className
      )}
    >
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute animate-confetti"
          style={{
            left: `${particle.x}%`,
            top: "-20px",
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            borderRadius: particle.borderRadius,
            transform: `rotate(${particle.rotation}deg)`,
            animationDelay: `${particle.delay}s`,
            animationDuration: particle.animationDuration,
          }}
        />
      ))}
    </div>
  );
}

// Hook to trigger confetti
export function useConfetti() {
  const [isActive, setIsActive] = useState(false);

  const trigger = () => {
    setIsActive(true);
    setTimeout(() => setIsActive(false), 100);
  };

  return { isActive, trigger };
}
