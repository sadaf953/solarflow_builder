import test from 'node:test';
import assert from 'node:assert/strict';

test('auth, database, storage and functions never contact the network', async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { calls++; throw new Error('Unexpected network request'); };
  try {
    const { supabase } = await import('../../src/supabase.js');
    const session = await supabase.auth.getSession();
    assert.equal(session.data.session, null);
    for (const result of await Promise.all([
      supabase.auth.signInWithPassword({ email: 'demo@example.invalid', password: 'test-only' }),
      supabase.auth.resetPasswordForEmail('demo@example.invalid'),
      supabase.from('admin').select('*'),
      supabase.from('admin').insert({ name: 'Synthetic test' }),
      supabase.storage.from('documents').upload('test.txt', new Blob(['test'])),
      supabase.functions.invoke('send-lead-to-vendor', { body: {} }),
    ])) assert.ok(result.error);
    assert.throws(() => supabase.channel('isolation-test').subscribe(), /new SolarFlow demo/i);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('configured client accepts only new project public keys and blocks email functions', async () => {
 const { createDemoClient } = await import('../../src/supabase.js');
 const { DEMO_URL } = await import('../../src/demo/config.js');
 assert.throws(()=>createDemoClient('https://other-project.supabase.co','sb_publishable_demo'));
 assert.throws(()=>createDemoClient(DEMO_URL,'sb_secret_forbidden'));
 let calls=0;
 const client=createDemoClient(DEMO_URL,'sb_publishable_demo',async()=>{calls++;return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});});
 assert.equal((await client.from('demo_roles').select('*')).error,null);
 assert.equal(calls,1);
 assert.ok((await client.functions.invoke('send-lead-to-vendor')).error);
 assert.equal(calls,1);
 await client.auth.stopAutoRefresh();
});
