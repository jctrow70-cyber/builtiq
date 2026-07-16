import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0e141d 0%, #070a11 55%, #151028 100%)',
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            letterSpacing: -3,
            color: '#f7f7fb',
            lineHeight: 1,
          }}
        >
          Build<span style={{ color: '#7c5cff' }}>IQ</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
