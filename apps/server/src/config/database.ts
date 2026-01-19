import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './environment.js';
import * as schema from '../db/schema.js';

const client = postgres(env.databaseUrl);

export const db = drizzle(client, { schema });

export type Database = typeof db;
