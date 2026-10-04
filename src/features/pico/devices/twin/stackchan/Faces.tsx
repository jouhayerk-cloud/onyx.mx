import React from 'react';

type FaceProps = { className?: string };

const FaceBase: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <svg viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-full h-full text-emerald-400 ${className || ''}`}>
    <rect width="320" height="240" fill="black" />
    <g stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);

export const Faces = {
  neutral: (props: FaceProps) => (
    <FaceBase {...props}>
      <circle cx="100" cy="100" r="16" fill="currentColor" stroke="none" />
      <circle cx="220" cy="100" r="16" fill="currentColor" stroke="none" />
      <line x1="140" y1="160" x2="180" y2="160" />
    </FaceBase>
  ),
  happy: (props: FaceProps) => (
    <FaceBase {...props}>
      <path d="M 80 100 Q 100 80 120 100" fill="none" />
      <path d="M 200 100 Q 220 80 240 100" fill="none" />
      <path d="M 120 150 Q 160 190 200 150" fill="none" />
    </FaceBase>
  ),
  sad: (props: FaceProps) => (
    <FaceBase {...props}>
      <circle cx="100" cy="110" r="16" fill="currentColor" stroke="none" />
      <circle cx="220" cy="110" r="16" fill="currentColor" stroke="none" />
      <path d="M 120 170 Q 160 140 200 170" fill="none" />
    </FaceBase>
  ),
  angry: (props: FaceProps) => (
    <FaceBase {...props}>
      <circle cx="100" cy="110" r="16" fill="currentColor" stroke="none" />
      <circle cx="220" cy="110" r="16" fill="currentColor" stroke="none" />
      <line x1="70" y1="80" x2="110" y2="100" />
      <line x1="250" y1="80" x2="210" y2="100" />
      <line x1="130" y1="160" x2="190" y2="160" />
    </FaceBase>
  ),
  surprised: (props: FaceProps) => (
    <FaceBase {...props}>
      <circle cx="100" cy="100" r="24" fill="none" />
      <circle cx="220" cy="100" r="24" fill="none" />
      <circle cx="160" cy="170" r="16" fill="none" />
    </FaceBase>
  ),
  sleepy: (props: FaceProps) => (
    <FaceBase {...props}>
      <line x1="80" y1="110" x2="120" y2="110" />
      <line x1="200" y1="110" x2="240" y2="110" />
      <circle cx="160" cy="160" r="8" fill="currentColor" stroke="none" />
      <text x="240" y="80" fill="currentColor" stroke="none" fontSize="24" fontFamily="monospace">Z</text>
      <text x="260" y="60" fill="currentColor" stroke="none" fontSize="16" fontFamily="monospace">z</text>
    </FaceBase>
  ),
  listening: (props: FaceProps) => (
    <FaceBase {...props}>
      <circle cx="100" cy="100" r="16" fill="currentColor" stroke="none" />
      <circle cx="220" cy="100" r="16" fill="currentColor" stroke="none" />
      <circle cx="160" cy="160" r="4" fill="currentColor" stroke="none" />
      <circle cx="140" cy="160" r="4" fill="currentColor" stroke="none" />
      <circle cx="180" cy="160" r="4" fill="currentColor" stroke="none" />
    </FaceBase>
  ),
  speaking: (props: FaceProps) => (
    <FaceBase {...props}>
      <circle cx="100" cy="100" r="16" fill="currentColor" stroke="none" />
      <circle cx="220" cy="100" r="16" fill="currentColor" stroke="none" />
      <ellipse cx="160" cy="160" rx="30" ry="20" fill="currentColor" stroke="none" />
    </FaceBase>
  )
};
