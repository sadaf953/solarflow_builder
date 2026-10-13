// Deterministic local fixture for application tests. This does not emulate or prove Postgres RLS.
export function memoryClient(seed = {}) {
    const tables = structuredClone({quotations:[],admin:[],profiles:[],...seed});
    let tick=0;
    const state={tables,offline:false,failLinkOnce:false};
    return {state,from(table) {
        const filters=[];let action='select',body,from=0,to=100000,single=false,maybe=false,sort=[];
        const q={
            select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>v===null ? r[k]==null : r[k]===v);return q;},
            order(k,{ascending=true}={}){sort.push([k,ascending]);return q;},range(a,b){from=a;to=b;return q;},
            or(filter){const clauses=filter.split(',').map(c=>c.split('.'));filters.push(r=>clauses.some(([k,op,...tail])=>op==='eq'?String(r[k])===tail.join('.'):String(r[k]||'').toLowerCase().includes(tail.join('.').replaceAll('%','').toLowerCase())));return q;},
            insert(value){action='insert';body=structuredClone(value);return q;},update(value){action='update';body=structuredClone(value);return q;},
            single(){single=true;return q;},maybeSingle(){single=true;maybe=true;return q;},
            then(resolve,reject){return Promise.resolve().then(()=>{
                if(state.offline) throw new Error('Offline fixture');
                const all=tables[table] ||= [];let matched=all.filter(r=>filters.every(f=>f(r)));
                if(action==='insert') {
                    if(all.some(r=>r.id===body.id)) return {data:null,error:{code:'23505',message:'Duplicate key'}};
                    const inserted={...body,created_at:new Date().toISOString(),updated_at:String(++tick)};
                    if(table==='quotations') Object.assign(inserted,{quotation_no:3255+all.length,status:'draft'});
                    all.push(inserted);matched=[inserted];
                }
                if(action==='update') {
                    if(state.failLinkOnce && body.status==='converted'){state.failLinkOnce=false;throw new Error('Link response interrupted');}
                    matched.forEach(r=>Object.assign(r,body,{updated_at:String(++tick)}));
                }
                matched=[...matched].sort((a,b)=>{for(const [k,asc] of sort){if(a[k]!==b[k]) return (a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;});
                const count=matched.length;matched=matched.slice(from,to+1);
                if(single && !matched.length && !maybe)return {data:null,error:{code:'PGRST116',message:'No accessible row'}};
                return {data:structuredClone(single?(matched[0]||null):matched),error:null,count};
            }).then(resolve,reject);},
        };return q;
    }};
}
