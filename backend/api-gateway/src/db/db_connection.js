require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:{
    rejectUnauthorized: false
  }
});

console.log('[db] node version:', process.version);
console.log('[db] effective ssl config:', JSON.stringify(pool.options.ssl));
console.log('[db] DATABASE_URL:', (() => {
  try{
    return new URL(process.env.DATABASE_URL).host;
  }catch{
    return 'unparasable';
  }
})());

pool.on('error', (err) => {
  console.error('Postgres error', err);
});

module.exports = pool;