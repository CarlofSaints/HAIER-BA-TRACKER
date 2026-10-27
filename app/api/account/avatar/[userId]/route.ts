import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { IMAGE_TYPES, isUserId } from '@/lib/avatarImage';

export const dynamic = 'force-dynamic';

// No auth: <img src> needs it public. So the id must be a real user-id shape (no
// "../" can reach another blob) and only image types are ever served, with headers
// that stop a browser treating the response as a page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!isUserId(userId)) return new NextResponse(null, { status: 404 });
  try {
    const result = await get(`avatars/${userId}`, { access: 'private', useCache: false });
    const ct = result?.statusCode === 200 ? (result.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() : '';
    if (result && result.statusCode === 200 && IMAGE_TYPES.includes(ct)) {
      return new Response(result.stream, {
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
  } catch { /* not found */ }
  return new NextResponse(null, { status: 404 });
}
