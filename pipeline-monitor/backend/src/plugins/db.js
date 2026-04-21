import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()
const { Pool } = pg

export const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'pipeline_monitor',
    user: process.env.DB_USER || 'monitor_user',
    password: process.env.DB_PASSWORD || 'monitor_password',
})

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

export async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id INTEGER PRIMARY KEY,
                project VARCHAR(255) NOT NULL,
                pipeline_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                state VARCHAR(50),
                result VARCHAR(50),
                created_date TIMESTAMP,
                finished_date TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `)
        console.log('[DB] PostgreSQL Connected and table (pipeline_runs) ready')
    } catch (err) {
        console.error('[DB] Connection Error:', err)
    }
}
