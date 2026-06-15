// app/api/download/[runId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import JSZip from 'jszip';
import { prisma } from '@/lib/db/prisma';
import { TestSuiteSchema } from '@/lib/schemas/test-spec';
import { emitTestFiles } from '@/lib/generator/emitter';

export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } },
) {
  // Auth — same dev-bypass pattern as your other routes
  const { userId } = await auth();
  const devBypass =
    req.headers.get('x-dev-secret') === process.env.DEV_SECRET;

  if (!userId && !devBypass) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { runId } = params;

  const run = await prisma.testRun.findUnique({ where: { id: runId } });

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // Ownership check — skip for dev bypass
  if (userId && run.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!run.generatedSpec) {
    return NextResponse.json(
      { error: 'No generated spec for this run — pipeline may still be running' },
      { status: 400 },
    );
  }

  // Re-validate the stored JSON through Zod before trusting it
  const parsed = TestSuiteSchema.safeParse(run.generatedSpec);
  if (!parsed.success) {
    console.error('[download] stored spec failed validation', parsed.error.issues);
    return NextResponse.json(
      { error: 'Stored spec is invalid', issues: parsed.error.issues },
      { status: 500 },
    );
  }

  // Emit .spec.ts + playwright.config.ts
  const files = emitTestFiles(parsed.data);

  // Package into a ZIP with a named top-level folder
  const zip = new JSZip();
  const folderName = toSlug(parsed.data.suiteName);
  const folder = zip.folder(folderName) ?? zip;

  for (const { filename, content } of files) {
    folder.file(filename, content);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
    },
  });
}

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'test-suite'
  );
}