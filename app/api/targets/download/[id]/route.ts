import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { loadTargetData } from '@/lib/targetData';
import { get } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(req, ['admin', 'super_admin']);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const data = await loadTargetData();
    const meta = data.uploads.find(u => u.id === id);
    if (!meta) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    const blobKey = `targets/file/${id}.xlsx`;
    const result = await get(blobKey, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
    }

    const bytes = await new Response(result.stream).arrayBuffer();
    const fileName = meta.fileName || `targets-${id}.xlsx`;

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('Target download error:', err);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
}
