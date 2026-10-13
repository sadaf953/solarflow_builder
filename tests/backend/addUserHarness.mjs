// Runs the add_user Edge Function in Node against a PGlite database.
// The Supabase client is replaced by a small fake that runs the same
// queries as the service role (RLS bypassed, triggers fire) and an auth
// admin API backed by auth.users. A bearer token is simply a user id.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const SOURCE_URL = new URL('../../template/backend/functions/add_user/index.ts', import.meta.url);
const IMPORT = 'import { createClient } from "npm:@supabase/supabase-js@2.45.4";';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ident = name => `"${name.replaceAll('"', '""')}"`;

class Query {
    constructor(db, table) {
        Object.assign(this, { db, table, op: 'select', columns: '*', filters: [], max: null, single: false });
    }
    select(columns = '*') { if (this.op === 'select') this.columns = columns; return this; }
    eq(column, value) { this.filters.push([column, '=', value]); return this; }
    ilike(column, value) { this.filters.push([column, 'ilike', value]); return this; }
    is(column) { this.filters.push([column, 'is null']); return this; }
    limit(n) { this.max = n; return this; }
    maybeSingle() { this.single = true; return this; }
    update(values) { Object.assign(this, { op: 'update', values }); return this; }
    upsert(values, { onConflict = 'id' } = {}) { Object.assign(this, { op: 'upsert', values, onConflict }); return this; }
    delete() { this.op = 'delete'; return this; }
    then(resolve, reject) { return this.run().then(resolve, reject); }

    async run() {
        const params = [];
        const param = value => { params.push(value); return `$${params.length}`; };
        const table = `public.${ident(this.table)}`;
        let sql;
        if (this.op === 'upsert') {
            const keys = Object.keys(this.values);
            sql = `insert into ${table}(${keys.map(ident).join(', ')}) values (${keys.map(k => param(this.values[k])).join(', ')})
                on conflict (${ident(this.onConflict)}) do update set ${keys.map(k => `${ident(k)} = excluded.${ident(k)}`).join(', ')} returning *`;
        } else {
            const where = this.filters.length ? ` where ${this.filters.map(([c, op, v]) => (op === 'is null' ? `${ident(c)} is null` : `${ident(c)} ${op} ${param(v)}`)).join(' and ')}` : '';
            if (this.op === 'select') {
                const columns = this.columns === '*' ? '*' : this.columns.split(',').map(c => ident(c.trim())).join(', ');
                sql = `select ${columns} from ${table}${where}${this.max ? ` limit ${Number(this.max)}` : ''}`;
            } else if (this.op === 'update') {
                const sets = Object.entries(this.values).map(([k, v]) => `${ident(k)} = ${param(v)}`).join(', ');
                sql = `update ${table} set ${sets}${where} returning *`;
            } else {
                sql = `delete from ${table}${where} returning *`;
            }
        }
        try {
            const { rows } = await this.db.query(sql, params);
            return { data: this.single ? rows[0] ?? null : rows, error: null };
        } catch (error) {
            return { data: null, error: { message: error.message } };
        }
    }
}

const fakeClient = (db, bans) => ({
    from: table => new Query(db, table),
    auth: {
        async getUser(token) {
            const user = UUID.test(token) ? (await db.query('select id, email from auth.users where id = $1', [token])).rows[0] : null;
            return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
        },
        admin: {
            async createUser({ email, app_metadata = {}, user_metadata = {} }) {
                if ((await db.query('select 1 from auth.users where lower(email) = lower($1)', [email])).rows.length) {
                    return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
                }
                const id = randomUUID();
                await db.query('insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)',
                    [id, email, JSON.stringify(app_metadata), JSON.stringify(user_metadata)]);
                return { data: { user: { id, email, app_metadata, user_metadata } }, error: null };
            },
            async updateUserById(id, { email, ban_duration }) {
                if (email) await db.query('update auth.users set email = $2 where id = $1', [id, email]);
                if (ban_duration) bans.set(id, ban_duration);
                return { data: { user: { id } }, error: null };
            },
            async deleteUser(id) {
                await db.query('delete from auth.users where id = $1', [id]);
                return { data: {}, error: null };
            },
        },
    },
});

// Loads a fresh copy of the function with the given environment and returns
// call(token, body, { origin }) -> { status, body }, plus the recorded bans.
export async function loadAddUser(db, env = {}) {
    const source = await readFile(SOURCE_URL, 'utf8');
    if (!source.includes(IMPORT)) throw new Error('add_user import line changed; update addUserHarness.mjs');
    const { code } = await transformWithEsbuild(source.replace(IMPORT, 'const { createClient } = globalThis.__addUserClient;'), 'index.ts', { loader: 'ts', format: 'esm' });

    const bans = new Map();
    let handler;
    globalThis.__addUserClient = { createClient: () => fakeClient(db, bans) };
    globalThis.Deno = {
        env: { get: key => ({ SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', ...env })[key] },
        serve: fn => { handler = fn; },
    };
    await import(`data:text/javascript;base64,${Buffer.from(`${code}\n// ${randomUUID()}`).toString('base64')}`);

    const call = async (token, body, { origin } = {}) => {
        const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) };
        const response = await handler(new Request('http://supabase.test/functions/v1/add_user', { method: 'POST', headers, body: JSON.stringify(body) }));
        return { status: response.status, body: await response.json() };
    };
    return { call, bans };
}
