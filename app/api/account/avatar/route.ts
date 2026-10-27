import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAnyUser, noCacheHeaders } from '@/lib/auth';
import { sniffImageType } from '@/lib/avatarImage';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requireAnyUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }

    // Limit to 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // The type comes from the file's own bytes, never the uploader's claim (an HTML 'avatar' would run script).
    const type = sniffImageType(bytes);
    if (!type) {
      return NextResponse.json({ error: 'Please upload a PNG, JPEG, GIF or WebP image' }, { status: 400 });
    }
    await put(`avatars/${user.id}`, bytes, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: type,
    });

    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (err) {
    console.error('Avatar upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
