import { ImageResponse } from 'next/og'

export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'linear-gradient(135deg, #6366f1 0%, #22d3ee 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '40px',
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Cat face */}
          <circle cx="70" cy="80" r="50" fill="white" fillOpacity="0.95" />
          {/* Ears */}
          <path d="M25 35 L40 75 L12 65 Z" fill="white" fillOpacity="0.95" />
          <path d="M115 35 L100 75 L128 65 Z" fill="white" fillOpacity="0.95" />
          {/* Inner ears */}
          <path d="M30 42 L40 68 L20 60 Z" fill="#F472B6" fillOpacity="0.6" />
          <path d="M110 42 L100 68 L120 60 Z" fill="#F472B6" fillOpacity="0.6" />
          {/* Eyes */}
          <circle cx="50" cy="72" r="10" fill="#1e1b4b" />
          <circle cx="90" cy="72" r="10" fill="#1e1b4b" />
          {/* Eye shine */}
          <circle cx="47" cy="69" r="3" fill="white" />
          <circle cx="87" cy="69" r="3" fill="white" />
          {/* Nose */}
          <ellipse cx="70" cy="92" rx="8" ry="6" fill="#F472B6" />
          {/* Mouth */}
          <path d="M70 98 L62 110 M70 98 L78 110" stroke="#1e1b4b" strokeWidth="3" strokeLinecap="round" />
          {/* Whiskers */}
          <path d="M45 88 L20 82 M45 94 L20 100" stroke="#1e1b4b" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
          <path d="M95 88 L120 82 M95 94 L120 100" stroke="#1e1b4b" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  )
}
