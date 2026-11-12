/* Reuse the established tracker regressions without overwriting their old
 * baselines or evidence. Each child uses the same task-owned output with disposable OS browser profiles. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'), task=path.resolve(process.argv[process.argv.indexOf('--task')+1]);
if(path.dirname(task)!==path.join(root,'tmp')||!path.basename(task).startsWith('tracker-responsive-task-'))throw Error('Task output scope mismatch');
const stages=[['verify-tracker-create.cjs'],['verify-tracker-configure-ui.cjs'],['verify-tracker-editing.cjs'],['verify-tracker-editing.cjs','--productivity'],['verify-tracker-search.cjs','opening'],['verify-tracker-navigation.cjs'],['verify-workflow-editor.cjs'],['verify-workflow-template.cjs'],['verify-workflow-delivery.cjs'],['verify-workflow-review.cjs'],['verify-workflow-style-navigation.cjs'],['verify-email-delivery-review.cjs'],['verify-email-delivery-activity-ui.cjs']];
const receipt=path.join(task,'regression-results.json');
const records=fs.existsSync(receipt)?JSON.parse(fs.readFileSync(receipt,'utf8')):[];
fs.mkdirSync(path.join(task,'regression-logs'),{recursive:true});
const onlyAt=process.argv.indexOf('--only'),only=onlyAt<0?null:process.argv[onlyAt+1].split(',');
for(const [name,mode] of stages.filter(([name])=>!only||only.some(value=>name.includes(value)))){
 const bootstrap=`
 const fs=require('fs'),path=require('path'),Module=require('module'),puppeteer=require('puppeteer-core');
 const root=${JSON.stringify(root)},task=${JSON.stringify(task)},originalRead=fs.readFileSync;
 fs.readFileSync=function(file,...options){const value=originalRead.call(this,file,...options);if(typeof file==='string'&&file===path.join(root,'app/client-profile-premium.css')&&typeof value==='string')return value+'\\n'+originalRead(path.join(root,'components/client-trackers/tracker-responsive.css'),'utf8');return value;};
 const file=path.join(root,'scripts',${JSON.stringify(name)});
 let source=originalRead(file,'utf8').replace(/path.join\\(root,\\s*(['\"])tmp\\/[^'\"]*(?:tests|ui)\\1/g,()=> 'path.join('+JSON.stringify(task)+',"regression-output"');
 if(${JSON.stringify(name)}==='verify-tracker-create.cjs')source=source.replace("url.pathname==='/fixture.js'","url.pathname.endsWith('.js')").replace("fs.readFileSync(path.join(output,'fixture.js'))","fs.readFileSync(path.join(output,path.basename(url.pathname)))");
 if(${JSON.stringify(mode)}==='opening')process.env.TRACKER_OPENING_ONLY='1';else if(${JSON.stringify(mode)})process.argv.push(${JSON.stringify(mode)});
 const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));loaded._compile(source,file);
 `;
 const result=spawnSync(process.execPath,['-e',bootstrap],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:5*1024*1024});
 fs.writeFileSync(path.join(task,'regression-logs',name.replace('.cjs','')+(mode?'_'+mode.replaceAll('-',''):'')+'.log'),(result.stdout||'')+(result.stderr||''));
 const record={name,mode:mode||null,exitCode:result.status,completed:new Date().toISOString()};const previous=records.findIndex(row=>row.name===record.name&&row.mode===record.mode);if(previous<0)records.push(record);else records[previous]=record;
 fs.writeFileSync(path.join(task,'regression-results.json'),JSON.stringify(records,null,2));
 if(result.error||result.status!==0){console.error((result.stdout||'').slice(-5000)+(result.stderr||'').slice(-6000));throw result.error||Error(name+' failed ('+result.status+')');}
 console.log('PASS: '+name+' '+(mode||''));
}
