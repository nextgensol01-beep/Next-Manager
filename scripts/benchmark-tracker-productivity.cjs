const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.artifacts/tracker-productivity');
fs.mkdirSync(output,{recursive:true});
for(const [variant,args]of [['before',['--before','--baseline-productivity']],['after',['--benchmark-only']]]) {
  const result=spawnSync(process.execPath,[path.join(__dirname,'verify-tracker-editing.cjs'),...args],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.status!==0){process.exitCode=result.status||1;break;}
  fs.copyFileSync(path.join(root,'tmp/tracker-editing-tests',variant,'measurements.json'),path.join(output,variant+'.json'));
}
