// Controlled mechanism experiments: real production modules, synthetic network, isolated disk.
// These results describe this fixture, not Internet speeds or compositor frame rate.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, readFile, writeFile, rename } from 'node:fs/promises'
import * as fsp from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, totalmem, platform, release } from 'node:os'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import initSqlJs from 'sql.js'
import { createContentCache } from '../src/main/contentCache'
import { createContentGateway, type ContentProvider } from '../src/main/contentGateway'
import { createImageRequestScheduler, type SchedulerOptions } from '../src/main/imageRequestScheduler'
import { createPageCacheState, touchPage, saveSnapshot, takeSnapshot, type PrimaryPageId } from '../src/renderer/src/navigation/pageStateCache'
import { loadModule } from '../src/main/__tests__/helpers/loadModule'

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const rootBase = resolve('work')
const samples: Array<Record<string, unknown>> = []
const summary = (numbers: number[]) => {
  const sorted = [...numbers].sort((a,b)=>a-b)
  const pick = (q: number) => Number((sorted[Math.max(0, Math.ceil(q*sorted.length)-1)] ?? 0).toFixed(3))
  return { n: sorted.length, min: pick(0), p50: pick(.5), p95: pick(.95), max: pick(1) }
}

async function main() {
  await mkdir(rootBase, { recursive: true })
  const root = await mkdtemp(join(rootBase, 'ablation-'))
  try {
    // All downloads share one 8 MiB/s budget. Headers do not release scheduler slots.
    async function scheduling(options: SchedulerOptions) {
      const scheduler = createImageRequestScheduler(options)
      const transfers = new Set<{ left: number; resolve: () => void }>()
      let peak = 0, criticalWaitMs = 0
      let lastTick = performance.now()
      const tick = setInterval(() => {
        const now=performance.now(), share = 8*1024*1024*(now-lastTick)/1000 / Math.max(1,transfers.size)
        lastTick=now
        for (const transfer of transfers) {
          transfer.left -= share
          if (transfer.left<=0) { transfers.delete(transfer); transfer.resolve() }
        }
      },5)
      const started = performance.now()
      const request = (index: number, priority: 'background'|'critical') => {
        const queued = performance.now()
        return scheduler.run({ key: String(index), host: `cdn-${index%2}`, priority }, async () => {
          if (priority==='critical') criticalWaitMs = performance.now()-queued
          const done = (async()=>{
            await delay(15)
            await new Promise<void>(resolve=>{ transfers.add({left:64*1024,resolve}); peak=Math.max(peak,transfers.size) })
          })()
          return { done }
        }, result=>result.done).then(result=>result.done)
      }
      try {
        const pending = Array.from({length:16},(_,i)=>request(i,'background'))
        await delay(3); pending.push(request(99,'critical'))
        await Promise.all(pending); await delay(0)
        assert.equal(scheduler.pendingCount(),0); assert.equal(scheduler.activeCount(),0)
        return { durationMs:performance.now()-started, criticalWaitMs, peakTransfers:peak, bytes:17*64*1024 }
      } finally { clearInterval(tick) }
    }
    const schedulerCases: Record<string,SchedulerOptions> = {
      current:{maxConcurrent:6,maxPerHost:4,maxBackground:2},
      noBackgroundBudget:{maxConcurrent:6,maxPerHost:4},
      concurrency2:{maxConcurrent:2,maxPerHost:4,maxBackground:2},
      concurrency8:{maxConcurrent:8,maxPerHost:4,maxBackground:2}
    }
    for(let i=0;i<10;i++) for(const name of (i%2 ? Object.keys(schedulerCases).reverse():Object.keys(schedulerCases))) {
      samples.push({experiment:'scheduler',phase:'exploration',variant:name,repeat:i,...await scheduling(schedulerCases[name])})
    }
    console.log('ABLATION scheduler exploration: 40 trials completed')
    for(let i=0;i<50;i++) for(const name of (i%2 ? ['noBackgroundBudget','current']:['current','noBackgroundBudget'])) {
      samples.push({experiment:'scheduler',phase:'confirmation',variant:name,repeat:i,...await scheduling(schedulerCases[name])})
    }
    console.log('ABLATION scheduler confirmation: 100 interleaved trials completed')

    for(let i=0;i<60;i++) for(const enabled of (i%2 ? [false,true]:[true,false])) {
      const cache = createContentCache({ filePath:join(root,`cache-${i}-${enabled}.json`),flushDelayMs:1000 })
      let calls=0
      const value={pages:Array.from({length:40},(_,index)=>({index,imageUrl:`https://cdn.example/${index}.jpg`}))}
      const load=async()=>{calls++;await delay(3);return value}
      const started=performance.now()
      for(let n=0;n<20;n++) {
        const actual=enabled?(await cache.resolve('pages:1',load,(v):v is typeof value=>Boolean(v && typeof v==='object' && 'pages' in v))).value:await load()
        assert.deepEqual(actual,value)
      }
      samples.push({experiment:'content-cache',phase:i<10?'exploration':'confirmation',variant:enabled?'on':'off',repeat:i,durationMs:performance.now()-started,providerCalls:calls})
      await cache.waitForIdle()
      if(enabled) {
        const reloaded=createContentCache({filePath:join(root,`cache-${i}-${enabled}.json`)})
        assert.equal((await reloaded.resolve('pages:1',load,(v):v is typeof value=>Boolean(v && typeof v==='object' && 'pages' in v))).state,'fresh')
        assert.equal(calls,1);await reloaded.waitForIdle()
      }
    }
    console.log('ABLATION cache: 120 trials plus persisted reload correctness completed')

    const SQL = await initSqlJs()
    for(let i=0;i<60;i++) for(const coalesced of (i%2 ? [false,true]:[true,false])) {
      const path=join(root,`database-${i}-${coalesced}.db`)
      let writes=0, exports:number[]=[]
      const database=loadModule<typeof import('../src/main/database')>('src/main/database.ts', {
        electron:{app:{getPath:()=>root}},
        './dataPaths':{getDatabasePath:()=>path,getAppDataDir:()=>root,getLegacyDatabasePath:()=>'',migrateLegacyDatabase(){}},
        './performanceTrace':{beginMainPerfSpan:()=>({finish(){}})},'./ioMetrics':{beginIoPerfSpan:()=>({finish(){}})},
        'fs/promises':{...fsp,rename:async(from:string,to:string)=>{writes++;return rename(from,to)}}
      })
      const db=await database.getDatabase()
      db.run("INSERT INTO settings(key,value) VALUES('fixture',?),('counter','0')",['x'.repeat(256*1024)])
      await database.saveDatabase();writes=0
      const original=db.export.bind(db)
      db.export=()=>{const began=performance.now();const value=original();exports.push(performance.now()-began);return value}
      const started=performance.now()
      for(let update=1;update<=20;update++) {
        db.run("UPDATE settings SET value=? WHERE key='counter'",[String(update)])
        if(coalesced) database.scheduleDatabaseSave('download');else await database.saveDatabase()
        await delay(5)
      }
      await database.closeDatabase()
      const durationMs=performance.now()-started
      const bytes=await readFile(path),disk=new SQL.Database(bytes)
      assert.equal(disk.exec("SELECT value FROM settings WHERE key='counter'")[0].values[0][0],'20');disk.close()
      samples.push({experiment:'database',phase:i<10?'exploration':'confirmation',variant:coalesced?'coalesced':'each-update',repeat:i,durationMs,writes,bytes:bytes.length,exportMaxMs:Math.max(...exports)})
    }
    console.log('ABLATION database: 120 trials with exact disk state verified')

    for(const limit of [1,3]) {
      let state=createPageCacheState('home'),mounts=1
      state=saveSnapshot(state,'home',{scrollTop:1234,filters:{tag:'fixture'}})
      for(let i=0;i<20;i++) for(const page of ['home','search','favorites'] as PrimaryPageId[]) {
        if(!state.mounted.includes(page))mounts++
        state=touchPage(state,page,limit)
        assert.ok(state.mounted.length<=limit)
      }
      assert.equal(takeSnapshot(state,'home')?.scrollTop,1234)
      samples.push({experiment:'page-cache',variant:`limit-${limit}`,mounts,retainedPages:state.mounted.length,restoredOffset:1234})
    }
    for(const remove of ['none','api','direct','browser']) {
      let ok=0,failed=0;const counts={api:0,direct:0,browser:0}
      for(let i=0;i<20;i++) {
        const make=(name:'api'|'direct'|'browser'):ContentProvider=>({
          async pages(){counts[name]++; if(remove===name || (name==='api'&&i%4===0) || (name==='direct'&&i%8===0))throw Error('controlled unavailable');return {pages:[{index:0,imageUrl:'https://cdn.example/page.png'}],scrambleId:0}},
          async homepage(){return []},async search(){throw Error('unused')},async category(){throw Error('unused')},async detail(){throw Error('unused')}
        })
        const gateway=createContentGateway({api:remove==='api'?undefined:make('api'),direct:make('direct'),browser:make('browser'),ttlMs:0})
        try{const result=await gateway.pages(`/photo/${i}`);assert.equal(result.data.pages.length,1);ok++}catch{failed++}
      }
      samples.push({experiment:'fallback',variant:`remove-${remove}`,ok,failed,providerCalls:counts})
    }
    const groups:Record<string,Record<string,unknown>>={}
    for(const sample of samples) {
      if(typeof sample.durationMs!=='number')continue
      const key=`${sample.experiment}/${sample.phase}/${sample.variant}`
      groups[key]??={}
      for(const metric of ['durationMs','criticalWaitMs','writes','providerCalls','exportMaxMs']) {
        const values=samples.filter(s=>`${s.experiment}/${s.phase}/${s.variant}`===key && typeof s[metric]==='number').map(s=>s[metric] as number)
        if(values.length)groups[key][metric]=summary(values)
      }
    }
    const sources:Record<string,string>={}
    for(const path of ['src/main/contentCache.ts','src/main/imageRequestScheduler.ts','src/main/database.ts','src/main/databaseWriteCoordinator.ts','src/main/contentGateway.ts']) {
      sources[path]=createHash('sha256').update(await readFile(path)).digest('hex')
    }
    const report={timestamp:new Date().toISOString(),environment:{node:process.version,os:`${platform()} ${release()}`,cpu:cpus()[0]?.model,ramBytes:totalmem()},
      scope:'Controlled production-module experiments; fixed synthetic latency and shared bandwidth; no live Internet or UI claims.',sources,groups,samples}
    await mkdir(resolve('outputs/ablations'),{recursive:true})
    await writeFile(resolve('outputs/ablations/mechanisms.json'),JSON.stringify(report,null,2))
    console.log(JSON.stringify(groups,null,2))
    console.log('ABLATION complete: outputs/ablations/mechanisms.json')
  } finally { await rm(root,{recursive:true,force:true}) }
}
void main().catch(error=>{console.error(error);process.exitCode=1})
