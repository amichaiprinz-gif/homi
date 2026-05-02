import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          borderRadius: 102,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 300,
        }}
      >
        🏠
      </div>
    ),
    { width: 512, height: 512 }
  )
}
