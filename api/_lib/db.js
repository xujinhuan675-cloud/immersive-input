import pg from 'pg';

const { Pool } = pg;

export function getDbPool() {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
        throw new Error('Missing SUPABASE_DB_URL');
    }
    return new Pool({ connectionString });
}
