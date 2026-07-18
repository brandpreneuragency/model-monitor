import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';

export const requestId = async () => (await headers()).get('x-request-id') ?? randomUUID();
