// Anonymous bootstrap only: no credentials, library data, image downloads, or response bodies in evidence.
const {app,net}=require('electron')
const {mkdirSync,writeFileSync}=require('node:fs')
const {resolve,join}=require('node:path')
require('tsx/cjs')
const {createJmApiFetchPort}=require('../src/main/content/jmAppApiFetchPort.ts')
const {createAnonymousApiProvider}=require('../src/main/content/jmAppApiRuntime.ts')
const root=resolve('work/network-smoke');mkdirSync(root,{recursive:true});app.setPath('userData',root);app.setPath('sessionData',root)
const requests=[],trials=[]
app.whenReady().then(async()=>{
  for(let i=0;i<3;i++){
    const port=createJmApiFetchPort(async(url,init)=>{
      const started=performance.now()
      try{const response=await net.fetch(url,init);requests.push({trial:i,host:new URL(url).host,path:new URL(url).pathname,status:response.status,headersMs:performance.now()-started});return response}
      catch(error){requests.push({trial:i,host:new URL(url).host,path:new URL(url).pathname,error:error.name,headersMs:performance.now()-started});throw error}
    })
    const started=performance.now()
    try{await createAnonymousApiProvider(port).prewarm();trials.push({trial:i,ok:true,durationMs:performance.now()-started})}
    catch(error){trials.push({trial:i,ok:false,reason:error.message,durationMs:performance.now()-started})}
  }
  const path=resolve('outputs/ablations');mkdirSync(path,{recursive:true})
  writeFileSync(join(path,'public-network.json'),JSON.stringify({timestamp:new Date().toISOString(),scope:'Three anonymous production bootstrap trials; no image or account requests; not a representative network benchmark.',versions:process.versions,requests,trials},null,2))
  console.log(JSON.stringify(trials));app.exit(0)
}).catch(error=>{console.error(error.name,error.message);app.exit(1)})
setTimeout(()=>{console.error('Network smoke timeout');app.exit(1)},120000).unref()
