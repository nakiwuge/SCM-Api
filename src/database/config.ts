/* eslint-disable no-console */
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString:process.env.DATABASE_URL
});

pool.connect()
  .then(()=>
    console.log('connected to database')
  )
  .catch((e: any)=>  console.log('error'+e));

export default pool;
