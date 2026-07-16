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
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            lineHeight: 1,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 900, color: '#f7f7fb' }}>Build</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#7c5cff' }}>IQ</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
