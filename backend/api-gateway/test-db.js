require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function test() {
  try {
    const r = await pool.query('SELECT NOW()');
    console.log('Supabase connected:', r.rows[0].now);

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('Tables found:');
    tables.rows.forEach(row => console.log('  -', row.table_name));

  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await pool.end();
  }
}

test();