import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 112,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 168,
              fontWeight: 900,
              letterSpacing: -8,
              color: '#f7f7fb',
              lineHeight: 1,
            }}
          >
            Build<span style={{ color: '#7c5cff' }}>IQ</span>
          </div>
          <div
            style={{
              width: 220,
              height: 10,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #22c55e, #7c5cff)',
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
