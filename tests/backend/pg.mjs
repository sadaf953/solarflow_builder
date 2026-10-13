// PGlite helpers shared by the backend suites.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_STUB } from './supabaseStub.mjs';

export const schema = await readFile(new URL('../../template/backend/schema.sql', import.meta.url), 'utf8');

export const newDb = async () => {
    const db = new PGlite();
    await db.exec(SUPABASE_STUB);
    return db;
};
export const rows = async (tx, sql, params) => (await tx.query(sql, params)).rows;
export const one = async (tx, sql, params) => (await rows(tx, sql, params))[0];

// Runs fn inside a transaction as a signed-in user (or anon when uid is null),
// the way PostgREST does: role switch plus request.jwt.claims.
export const as = (db, uid, fn) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' })]);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return fn(tx);
});

export const addAuthUser = async (db, email, appMeta = {}) => {
    const id = randomUUID();
    await db.query('insert into auth.users(id, email, raw_app_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(appMeta)]);
    return id;
};
export const viaAddUser = (userType, extra = {}) => ({ created_via: 'add_user', user_type: userType, ...extra });
