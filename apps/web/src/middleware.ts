import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-request-id', request.headers.get('x-request-id') ?? crypto.randomUUID());
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', headers.get('x-request-id') ?? '');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
