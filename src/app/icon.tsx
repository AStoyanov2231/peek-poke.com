import { ImageResponse } from 'next/og'

export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 50%, #06B6D4 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
        }}
      >
        {/* Ghost shape */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ghost body */}
          <path
            d="M12 2C8 2 5 5.5 5 9.5V21L7.5 19L10 21L12 19L14 21L16.5 19L19 21V9.5C19 5.5 16 2 12 2Z"
            fill="white"
            fillOpacity="0.95"
          />
          {/* Eyes */}
          <circle cx="9.5" cy="10" r="1.5" fill="#1e1b4b" />
          <circle cx="14.5" cy="10" r="1.5" fill="#1e1b4b" />
          {/* Eye shine */}
          <circle cx="9" cy="9.5" r="0.5" fill="white" />
          <circle cx="14" cy="9.5" r="0.5" fill="white" />
          {/* Smile */}
          <path
            d="M10 13.5 Q12 15 14 13.5"
            stroke="#1e1b4b"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  )
}
