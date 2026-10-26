const {spawnSync}=require('node:child_process');
for(const args of [['--before'],['--benchmark-only']]) {
  const result=spawnSync(process.execPath,['scripts/verify-tracker-editing.cjs',...args],{stdio:'inherit',windowsHide:true});
  if(result.status!==0) { process.exitCode=result.status||1;break; }
}
