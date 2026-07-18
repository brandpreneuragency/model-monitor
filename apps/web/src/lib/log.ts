export type LogFields = Record<string, boolean | number | string | null | undefined>;
const redact = (fields: LogFields) => Object.fromEntries(Object.entries(fields).filter(([key]) => !/token|secret|authorization|cookie/i.test(key)));
export const log = (level: 'error' | 'info', operation: string, fields: LogFields = {}) => console[level](JSON.stringify({ level, operation, ...redact(fields), timestamp: new Date().toISOString() }));
