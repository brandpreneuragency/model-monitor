import postgres from 'postgres';

// Connection happens on first query, keeping `next build` independent of a live database.
export const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://model_monitor:model_monitor@localhost:5433/model_monitor', { max: 10, prepare: false });
