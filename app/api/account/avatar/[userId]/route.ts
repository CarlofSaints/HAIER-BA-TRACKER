import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// No auth — browsers can't send custom headers on <img src="..."> requests
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  try {
    const result = await get(`avatars/${userId}`, { access: 'private', useCache: false });
    if (result && result.statusCode === 200) {
      const ct = result.headers.get('content-type') || 'image/png';
      return new Response(result.stream, {
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
  } catch { /* not found */ }
  // Return a transparent 1x1 PNG as fallback
  return new NextResponse(null, { status: 404 });
}
