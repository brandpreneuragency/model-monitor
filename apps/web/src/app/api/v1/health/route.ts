import { NextResponse } from 'next/server';
import { sql } from '@model-monitor/database/client';
import { log } from '@/lib/log';
import { requestId } from '@/lib/request';

export async function GET() {
  const id = await requestId(); const started = performance.now();
  try {
    await sql`SELECT 1`;
    log('info', 'health', { requestId: id, durationMs: Math.round(performance.now() - started), result: 'ok' });
    return NextResponse.json({ data: { application: 'ok', database: 'ok' }, requestId: id }, { headers: { 'x-request-id': id } });
  } catch {
    log('error', 'health', { requestId: id, durationMs: Math.round(performance.now() - started), result: 'database_unavailable' });
    return NextResponse.json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', requestId: id } }, { status: 503, headers: { 'x-request-id': id } });
  }
}
