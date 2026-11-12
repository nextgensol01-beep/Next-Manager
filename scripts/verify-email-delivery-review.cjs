// Production tracker/modal against isolated endpoints. Never sends live mail.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('puppeteer-core'),webpackRuntime=require('next/dist/compiled/webpack/webpack');
const root=path.resolve(__dirname,'..'),output=path.join(root,'tmp/email-delivery-review-tests');
const trackerId='0123456789abcdef01234567',requests=[];
const securityPolicy={draftProtection:'confirmation',directSendProtection:'emailOtp',holdToSend:true,otpExpiryMinutes:5,otpResendCooldownSeconds:45,otpMaxAttempts:5,largeBatchThreshold:50,requireEmailOtpForLargeBatch:true,version:1,approvalEmailMasked:'t••••@example.com',approvalEmailVerified:true,sendPinConfigured:false,auditEnabled:true};
const approvals=new Map(),authorized=new Set();
let failPreview=false,large=false,zero=false,failDelivery=false;
const workflows=['W1','W2'].map((id,index)=>({id,name:index?'Compliance update':'New email workflow',mainFieldKey:'ready',mainValue:'Yes',subject:'Update {{client.companyName}}',body:'<p>Documents</p>',points:[],contentMode:'combinations',contentRules:[0,1,2].map(n=>({id:'S'+n,type:'combination',content:'Scenario '+n,order:n})),recipientStrategy:'selected',signatureGap:2}));
const clients=Array.from({length:500},(_,index)=>({clientId:'C'+index,companyName:index===0?'Arihant Packaging':index===1?'Pearl Plastic':'Client '+index,category:index%2?'PWP':'Producer'}));
const messages=()=>clients.slice(0,zero?0:large?500:3).map((client,index)=>({entryId:'E'+index,clientId:client.clientId,companyName:client.companyName,to:'rahul'+index+'@example.com',suggestedTo:['rahul'+index+'@example.com'],
  recipients:[{email:'rahul'+index+'@example.com',name:'Rahul Sharma',designation:'Director',isPrimary:true},{email:'accounts'+index+'@example.com',name:'Accounts',designation:'Finance',isPrimary:false}],
  subject:'EPR portal update — '+client.companyName,body:'Dear '+client.companyName+',\nPlease review the documents.',html:'<!doctype html><html><body style="font:14px Arial;color:#222;padding:20px"><p>Dear <strong>'+client.companyName+'</strong>,</p><p>Please review your EPR portal documents for FY 2025–26.</p><p>Regards,<br>NextGen Solutions</p></body></html>',points:[],statements:['Documents required','Compliance review'],combinationMessage:'Actual matched content',attachments:[{documentId:index===0?'D1':'D'+(index+1),filename:client.companyName+'-Certificate.pdf',mimeType:'application/pdf',fileSize:4000,category:'certificates',financialYear:'2025-26',required:true}],attachmentWarnings:[{ruleId:'optional-report',required:false,code:'missing_document',message:'Optional supporting document not found.'}],attachmentSnapshot:'isolated-attachment-selection-'+index}));
async function main(){
  fs.mkdirSync(output,{recursive:true});webpackRuntime.init();
  await new Promise((resolve,reject)=>{const compiler=webpackRuntime.webpack({mode:'development',devtool:false,context:root,entry:path.join(__dirname,'fixtures/tracker-search.tsx'),output:{path:output,filename:'fixture.js'},
    resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root,'next/link':path.join(__dirname,'fixtures/tracker-next-link.cjs'),'next-auth/react':path.join(__dirname,'fixtures/tracker-session.cjs')}},
    module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(__dirname,'fixtures/workflow-editor-loader.cjs')},{test:/\.css$/,type:'asset/source'}]}});
    compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));});
  const css=(await require('postcss')([require('tailwindcss')(path.join(root,'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace(/^@import .+$/gm,''),{from:path.join(root,'app/globals.css')})).css
    +['components/ui/liquid-glass/liquid-glass.css','app/client-profile-premium.css','components/client-trackers/email-delivery-review.css','components/client-trackers/email-delivery-security.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')+'body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--color-surface);color:var(--color-text)}';
  const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');
    if(url.pathname.endsWith('.js')){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(output,path.basename(url.pathname))));return;}
    if(url.pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
    if(url.pathname.startsWith('/api/')){
      let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null;requests.push({path:url.pathname,method:req.method,body});
      let data={},delay=60,status=200;
      if(url.pathname===`/api/client-trackers/${trackerId}`)data={_id:trackerId,name:'Compliance tracker',status:'active',fields:[{key:'ready',label:'Ready',type:'toggle'}],entries:clients.slice(0,100).map((client,index)=>({_id:'E'+index,clientId:client.clientId,client,updatedAt:'2026-10-09',values:{ready:true}})),clientIds:clients.map(c=>c.clientId),entryCount:500,totalEntryCount:500,offset:0,hasMore:false,overviewCounts:[],emailEnabled:true,emailWorkflows:workflows};
      else if(url.pathname===`/api/client-trackers/${trackerId}/email`&&req.method==='POST'){delay=1250;if(failPreview){failPreview=false;status=500;data={error:'Fixture preparation failure'};}else data={workflow:{id:body.workflowId,name:workflows.find(w=>w.id===body.workflowId).name,signatureGap:2},messages:messages(),skipped:[{clientId:'C499',companyName:'Electromark',reasonCode:'conditions_not_matched',reason:'Workflow eligibility conditions do not match'},{clientId:'C498',companyName:'XYZ Foods',reasonCode:'no_recipient',reason:'No contact email matches the selected recipient strategy'}]};}
      else if(url.pathname.endsWith('/email/replies')){delay=650;data={checked:3,replied:0};}
      else if(url.pathname==='/api/settings/email-delivery-security')data=securityPolicy;
      else if(url.pathname.endsWith('/approval/request')){data={approvalId:require('node:crypto').randomUUID(),methodsRequired:authorized.has(body.campaignId)?[]:['emailOtp'],methodsVerified:[],approvalEmailMasked:securityPolicy.approvalEmailMasked,expiresAt:new Date(Date.now()+300000).toISOString(),otpExpiresAt:new Date(Date.now()+300000).toISOString(),resendAvailableAt:new Date(Date.now()+45000).toISOString(),status:authorized.has(body.campaignId)?'verified':'pending',resumed:authorized.has(body.campaignId),messageCount:body.messages.length,holdToSend:true};approvals.set(data.approvalId,data);}
      else if(url.pathname.endsWith('/approval/verify')){data={...approvals.get(body.approvalId),methodsVerified:['emailOtp'],status:'verified'};assert.equal(body.otp,'123456');}
      else if(url.pathname.endsWith('/email/deliver')){authorized.add(body.campaignId);if(failDelivery){failDelivery=false;status=500;data={error:'Fixture interrupted delivery'};}else {status=202;data={outcome:'accepted',campaignId:body.campaignId,job:{campaignId:body.campaignId,trackerId,trackerName:'Compliance tracker',workflowName:'New email workflow',kind:body.kind,mode:body.mode,status:'queued',total:body.messages.length,processed:0,sent:0,drafts:0,failed:0,uncertain:0,pending:body.messages.length,delivering:0,executionMode:'browser',canResume:false,controllerLeaseExpiresAt:null,needsHistoryRepair:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),message:'Queued'}};}}
      else if(url.pathname.startsWith('/api/email-delivery/jobs/')){status=404;data={error:'Job not accepted'};}
      else if(url.pathname==='/api/email/default-signature')data={signature:'<div data-gmail-signature="true" style="padding:0 20px;color:#777">Fixture Gmail signature</div>'};
      else if(url.pathname==='/api/clients')data=clients;
      else if(url.pathname==='/api/financial-year-preference')data={settings:{enabled:false}};
      else if(url.pathname.endsWith('/email'))data={logs:[],summary:{}};
      else data={events:[]};
      setTimeout(()=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));},delay);return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
  try{
    browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu']});page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const button=async(text,scope='body')=>{for(const node of await page.$$(scope+' button'))if((await node.evaluate(el=>el.textContent)).trim()===text){await require('./fixtures/wait-for-stable-control.cjs')(node);await node.click();return;}throw Error('Missing button '+text);};
    const wait=async()=>page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,380)));
    const main='.email-delivery-review-modal';
    const open=async()=>{await button('Email clients');await page.waitForSelector(main);await wait();};
    const prepare=async()=>{await page.waitForFunction(()=>Array.from(document.querySelectorAll('.email-review-prepare-action')).some(node=>node.textContent.trim()==='Preview eligible clients'&&!node.disabled));await button('Preview eligible clients',main);await page.waitForSelector('.email-client-processing');};
    const review=async()=>{await page.waitForSelector('.email-review-panes');await page.waitForFunction(()=>!!document.querySelector('.email-review-mail iframe')?.getAttribute('srcdoc')?.includes('Fixture Gmail signature'));await wait();};
    const fill=async(selector,value)=>{await page.focus(selector);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await page.keyboard.type(value);};
    const auth='.email-security-modal';
    const draft=async(count,failed=false)=>{await button('Create Gmail drafts',main);await page.waitForSelector(auth);await page.waitForFunction(()=>document.querySelector('.email-security-commit')?.innerText.includes('Nothing will be sent'));await button(`Create ${count} drafts`,auth);if(failed){await page.waitForFunction(()=>document.querySelector('.email-security-error')?.innerText.includes('Fixture interrupted'));await button('Cancel',auth);await page.waitForSelector(auth,{hidden:true});await wait();}};
    const selectClient=async(name)=>{for(const node of await page.$$('.email-review-client-row'))if((await node.evaluate(el=>el.textContent)).includes(name)){await node.click();await page.waitForFunction(name=>document.querySelector('.email-review-detail-content h2')?.textContent===name,{},name);await wait();return;}throw Error('Missing client '+name);};
    const screenshot=async(name)=>{
      if(name==='zero-eligible'&&process.env.EMAIL_REVIEW_CAPTURE_BASELINE!=='1'){
        assert(await page.$eval('.email-review-send',node=>node.disabled),'Empty eligibility preserves disabled semantics');
        await page.hover('.email-review-send');await wait();
        assert.equal(await page.$eval('.email-review-send',node=>getComputedStyle(node).transform),'none','Disabled Send has no hover lift');
        assert.equal(await page.$eval('.email-review-transmission-cyan',node=>getComputedStyle(node).opacity),'0.25');
        assert.equal(await page.$eval('.email-review-send',node=>getComputedStyle(node).filter),'saturate(0.35)');
        assert.equal(await page.$eval('.email-review-transmission-material',node=>parseFloat(getComputedStyle(node).getPropertyValue('--send-idle-phase'))),0,'Disabled Send stops idle drift');
        await page.mouse.move(0,0);
      }
      await page.screenshot({path:path.join(output,name+'.png')});
    };
    // Compare the explicitly protected UI with the pre-polish production render.
    const protectedAppearance=async(theme)=>{
      await page.mouse.move(0,0);await wait();
      const snapshot=await page.evaluate(()=>{
        const selectors=['.tracker-modal-header h3','.tracker-modal-header p','.tracker-modal-header > div:first-child > div:first-child','.email-review-workflow-control .liquid-glass-trigger','.email-review-context .email-review-segments','.email-review-prepare-action','.email-review-audience .email-review-segments','.email-review-search','.email-review-client-row','.email-review-row-selection','.email-review-status','.email-review-recipient','.email-review-recipients .email-review-segments','.email-review-add-recipient','.email-review-mail','.email-review-mail-sheet','.email-review-mail iframe','.email-review-subject','.email-review-cancel','.email-review-drafts'];
        const properties=['background','border','box-shadow','backdrop-filter','color','opacity','font-size','font-weight','line-height','letter-spacing','padding','margin','border-radius','display','gap'];
        const appearance=(node,pseudo)=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(node,pseudo).getPropertyValue(key)]));
        const result=Object.fromEntries(selectors.map(selector=>[selector,Array.from(document.querySelectorAll(selector)).map(node=>({style:appearance(node),before:appearance(node,'::before'),after:appearance(node,'::after'),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}))]));
        for(const selector of ['.email-delivery-review-modal','.email-review-footer','.email-review-panes','.email-review-send']){const node=document.querySelector(selector),rect=node.getBoundingClientRect();result[selector]={width:rect.width,height:rect.height,padding:getComputedStyle(node).padding,fontSize:getComputedStyle(node).fontSize};}
        return result;
      });
      const file=path.join(root,'../email-polish-baseline',theme+'-protected-ui.json');
      if(process.env.EMAIL_REVIEW_CAPTURE_BASELINE==='1')fs.writeFileSync(file,JSON.stringify(snapshot,null,2));
      else if(fs.existsSync(file)){
        const expected=JSON.parse(fs.readFileSync(file,'utf8'));
        // The repeatable additional-recipient editor now intentionally adds controls here.
        for(const key of ['.email-review-add-recipient','.email-review-recipients .email-review-segments']){delete snapshot[key];delete expected[key];}
        // Actual attachment metadata and optional omissions add content to this
        // scrolling section. Its material/width and all surrounding geometry remain protected.
        for(const state of [snapshot,expected])for(const entry of state['.email-review-mail'])delete entry.height;
        // Shared glass buttons retain their last pointer position after a click.
        // Compare their material independently of that transient gradient origin.
        for(const state of [snapshot,expected])for(const entries of Object.values(state))if(Array.isArray(entries))for(const entry of entries)for(const style of [entry.style,entry.before,entry.after])style.background=style.background.replace(/radial-gradient\(43% 54% at [\d.]+% [\d.]+%/g,'radial-gradient(43% 54% at 50% 35%');
        assert.deepEqual(snapshot,expected,theme+' surrounding controls and geometry stay unchanged');
      }
    };
    const sendState=()=>page.$eval('.email-review-send',node=>{
      const material=getComputedStyle(node.querySelector('.email-review-transmission-material'));
      const matrix=new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return {lightX:parseFloat(material.getPropertyValue('--send-light-x')),lightY:parseFloat(material.getPropertyValue('--send-light-y')),blueX:parseFloat(material.getPropertyValue('--send-blue-x')),blueY:parseFloat(material.getPropertyValue('--send-blue-y')),violetX:parseFloat(material.getPropertyValue('--send-violet-x')),violetY:parseFloat(material.getPropertyValue('--send-violet-y')),specularY:parseFloat(material.getPropertyValue('--send-specular-y')),idlePhase:parseFloat(material.getPropertyValue('--send-idle-phase')),x:matrix.m41,y:matrix.m42,scale:matrix.a};
    });
    const contrastResults={};
    const sendContrast=async(label)=>{
      const copy=await page.$('.email-review-transmission-copy');
      const clip=await copy.evaluate(node=>{const r=node.getBoundingClientRect();node.style.visibility='hidden';return {x:r.x,y:r.y+2,width:r.width,height:r.height-4};});
      let pixels;try{pixels=await require('sharp')(await page.screenshot({clip})).raw().toBuffer({resolveWithObject:true});}finally{await copy.evaluate(node=>node.style.removeProperty('visibility'));}
      let minimum=21;const linear=value=>{const c=value/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);};
      for(let i=0;i<pixels.data.length;i+=pixels.info.channels){const luminance=.2126*linear(pixels.data[i])+.7152*linear(pixels.data[i+1])+.0722*linear(pixels.data[i+2]);minimum=Math.min(minimum,1.05/(luminance+.05));}
      contrastResults[label]=Number(minimum.toFixed(3));fs.writeFileSync(path.join(output,'send-contrast.json'),JSON.stringify(contrastResults,null,2));
      assert(minimum>=4.5,`${label} rendered white label contrast is ${minimum.toFixed(2)}:1`);return minimum;
    };
    const moveOnSend=async(x,y)=>{const rect=await page.$eval('.email-review-send',node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});await page.mouse.move(rect.x+rect.width*x,rect.y+rect.height*y);};
    const settledSendPointer=async(x,y)=>{
      await moveOnSend(x,y);await wait();
      // Wait for the actual spring position instead of assuming a fixed frame rate.
      await page.waitForFunction(({x,y})=>{const material=getComputedStyle(document.querySelector('.email-review-transmission-material'));return Math.abs(parseFloat(material.getPropertyValue('--send-light-x'))-x)<1.5&&Math.abs(parseFloat(material.getPropertyValue('--send-light-y'))-y)<1.5;},{timeout:10000},{x:50+(x*2-1)*24,y:50+(y*2-1)*28});
    };
    const spatialSend=async(theme)=>{
      if(process.env.EMAIL_REVIEW_CAPTURE_BASELINE==='1')return;
      const capture=async(name)=>{await (await page.$('.email-review-send')).screenshot({path:path.join(output,`send-${theme}-${name}.png`)});};
      await page.mouse.move(0,0);await wait();await capture('rest');await sendContrast(theme+' rest');
      const idleStart=await sendState();await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1800)));const idleEnd=await sendState();await capture('idle-drift');
      assert(idleEnd.idlePhase>idleStart.idlePhase,'Normal motion has a calm continuous drift');
      assert(Math.abs(idleEnd.lightX-idleStart.lightX)+Math.abs(idleEnd.lightY-idleStart.lightY)>.4,'Idle drift moves the visible optical bodies');
      assert(Math.abs(idleEnd.x)<.05&&Math.abs(idleEnd.y)<.05,'Only material animates at rest');
      await settledSendPointer(.1,.5);const left=await sendState();await capture('left');
      await settledSendPointer(.9,.5);const right=await sendState();await capture('right');
      await sendContrast(theme+' pointer right');
      assert(right.lightX-left.lightX>30,`Cyan visibly traverses the button: ${JSON.stringify({left,right})}`);
      assert(right.blueX-left.blueX>15&&right.blueX-left.blueX<right.lightX-left.lightX,'Blue follows with smaller amplitude');
      assert(right.violetX<left.violetX-8,'Violet has opposing parallax');
      await settledSendPointer(.5,.15);const top=await sendState();await capture('top');
      await sendContrast(theme+' pointer top');
      await settledSendPointer(.5,.85);const bottom=await sendState();await capture('bottom');
      await sendContrast(theme+' pointer bottom');
      assert(bottom.lightY-top.lightY>30&&bottom.blueY>top.blueY+15&&bottom.violetY<top.violetY-8,'All color bodies respond spatially in Y');
      assert(bottom.specularY>top.specularY+10&&bottom.specularY<25,'Specular reflection follows Y near the top surface');
      for(const point of [[.18,.18],[.82,.18],[.82,.82],[.18,.82]]){await settledSendPointer(...point);const state=await sendState();assert(Math.abs(state.x)<=3.05&&Math.abs(state.y)<=2.05,'Magnetic travel stays within stepper limits');assert(state.lightX>=25&&state.lightX<=75&&state.lightY>=20&&state.lightY<=80,'Optical coordinates stay inside the shell');}
      await moveOnSend(.12,.12);await wait();const start=await sendState();await moveOnSend(.88,.88);const trailing=await sendState();assert(Math.abs(trailing.lightX-start.lightX)<15,'Fast corner changes trail through the spring');await wait();const end=await sendState();assert(end.lightX>start.lightX+25&&end.lightY>start.lightY+30);
      await page.mouse.move(0,0);const leaving=await sendState();assert(Math.abs(leaving.x)>.5,'Leave does not instantly reset magnetic movement');await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,850)));const rest=await sendState();assert(Math.abs(rest.x)<.05&&Math.abs(rest.y)<.05);assert(rest.lightX>=61.9&&rest.lightX<=74.1&&rest.lightY>=17.9&&rest.lightY<=28.1,'Colors settle into the bounded idle composition');
    };
    await page.setViewport({width:1340,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('button');await page.waitForNetworkIdle({idleTime:100});
    await open();await screenshot('preparation-light');const before=requests.filter(r=>r.method==='POST').length;
    await (await page.$('.email-review-type-control')).screenshot({path:path.join(output,'email-type-initial-light.png')});
    await page.click('[role=radio][aria-label=Reminder]');await wait();assert((await page.$eval(main,node=>node.innerText)).includes('Reply status will be checked'));
    await (await page.$('.email-review-type-control')).screenshot({path:path.join(output,'email-type-reminder-light.png')});
    assert.equal(requests.filter(r=>r.method==='POST').length,before,'Context changes never auto-run preparation');
    await page.click('[role=radio][aria-label="Initial email"]');await prepare();await wait();await screenshot('processing-light');await review();await screenshot('review-light');
    await protectedAppearance('light');
    await spatialSend('light');
    assert.equal(await page.$$('.email-review-recipients').then(a=>a.length),1,'Only one full recipient editor mounts');
    assert.equal(await page.$$('.email-review-client-row').then(a=>a.length),3);
    await page.click('[aria-label="Assignment for accounts0@example.com"] [aria-label=CC]');
    const addExtra=async(email,kind='to')=>{
      const count=await page.$$('.email-review-additional-row').then(nodes=>nodes.length);await button('Add another recipient',main);
      const label=`Additional recipient ${count+1} email`;assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),label,'Add focuses the newly created email field');
      await page.type(`[aria-label="${label}"]`,email);if(kind==='cc')await page.click(`[aria-label="Delivery for additional recipient ${count+1}"] [aria-label=CC]`);
    };
    await addExtra('extra@example.com');await addExtra('copy@example.com','cc');await addExtra('third@example.com');await addExtra('fourth@example.com');await addExtra('fifth@example.com','cc');
    assert.equal(await page.$$('.email-review-additional-row').then(nodes=>nodes.length),5);assert(await page.$eval('.email-review-add-recipient',node=>node.disabled),'Add stays visible and disabled at five');
    await page.$eval('.email-review-add-recipient',node=>node.click());assert.equal(await page.$$('.email-review-additional-row').then(nodes=>nodes.length),5,'Cannot add a sixth recipient');
    await page.click('[aria-label="Remove additional recipient 3"]');assert.equal(await page.$$('.email-review-additional-row').then(nodes=>nodes.length),4);assert(!(await page.$eval('.email-review-add-recipient',node=>node.disabled)));await addExtra('replacement@example.com');
    await page.$eval('.email-review-additional',node=>node.scrollIntoView({block:'start'}));await wait();await screenshot('recipients-five-light');
    await selectClient('Pearl Plastic');assert.equal(await page.$$('.email-review-additional-row').then(nodes=>nodes.length),0,'Additional recipients are per client');
    assert((await page.$eval('.email-review-attachments',node=>node.textContent)).includes('Pearl Plastic-Certificate.pdf'));
    assert((await page.$eval('.email-review-attachments',node=>node.textContent)).includes('FY 2025-26'));
    assert((await page.$eval('.email-review-attachments',node=>node.textContent)).includes('Required'));
    assert((await page.$eval('.email-review-personalisation',node=>node.textContent)).includes('Optional supporting document not found.'));
    await addExtra('pearl-extra@example.com');await selectClient('Arihant Packaging');
    for(const name of ['Pearl Plastic','Arihant Packaging','Pearl Plastic','Arihant Packaging']){await selectClient(name);assert((await page.$eval('.email-review-attachments',node=>node.textContent)).includes(name+'-Certificate.pdf'));}
    assert.equal(await page.$$('.email-review-additional-row').then(nodes=>nodes.length),5,'All added rows persist across client navigation');assert.equal(await page.$eval('[aria-label="Additional recipient 1 email"]',node=>node.value),'extra@example.com');assert.equal(await page.$eval('[aria-label="Additional recipient 5 email"]',node=>node.value),'replacement@example.com');
    assert.equal(await page.$eval('[aria-label="Delivery for additional recipient 2"] [aria-label=CC]',node=>node.getAttribute('aria-checked')),'true');assert.equal(await page.$eval('[aria-label="Assignment for accounts0@example.com"] [aria-label=CC]',node=>node.getAttribute('aria-checked')),'true');
    failDelivery=true;await draft(3,true);const fiveDelivery=requests.filter(r=>r.path.endsWith('/email/deliver')).at(-1).body;
    assert.deepEqual(fiveDelivery.messages[0].to,['rahul0@example.com','extra@example.com','fourth@example.com','replacement@example.com']);assert.deepEqual(fiveDelivery.messages[0].cc,['accounts0@example.com','copy@example.com','fifth@example.com']);assert(fiveDelivery.messages[1].to.includes('pearl-extra@example.com'),'Each client\'s extra recipients reach its own payload');
    await page.click('[aria-label="Expand email preview"]');await page.waitForSelector('[aria-label="Email preview"]');assert((await page.$eval('[title="Tracker email preview"]',node=>node.getAttribute('srcdoc'))).includes('Fixture Gmail signature'));
    await page.keyboard.press('Escape');await page.waitForSelector('[aria-label="Email preview"]',{hidden:true});assert(await page.$(main),'Expanded Escape preserves workspace');await wait();assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Expand email preview');
    await page.setViewport({width:900,height:900});await wait();assert(await page.$eval('.email-review-audience',node=>getComputedStyle(node).display!=='none'));assert(await page.$eval('.email-review-detail',node=>getComputedStyle(node).display!=='none'));await screenshot('review-medium');
    await page.setViewport({width:768,height:900});await wait();assert.equal(await page.$eval('.email-review-audience',node=>getComputedStyle(node).display),'none');await button('Back to audience',main);assert(await page.$eval('.email-review-audience',node=>getComputedStyle(node).display!=='none'));assert(await page.$eval(main,node=>node.scrollWidth<=node.clientWidth));await screenshot('audience-tablet');await page.setViewport({width:1340,height:1000});await wait();
    await page.click('[aria-label="Audience filter"] [aria-label="Skipped 2"]');await page.waitForFunction(()=>document.querySelector('.email-review-detail')?.innerText.includes('Workflow eligibility conditions do not match'));assert((await page.$eval('.email-review-detail',node=>node.innerText)).includes('Workflow eligibility conditions do not match'));assert.equal(await page.$$('.email-review-recipients').then(a=>a.length),0);
    await page.click('.email-review-reason-breakdown summary');
    await page.$eval('.email-review-reason-breakdown', node => Array.from(node.querySelectorAll('button')).find(button => button.textContent.includes('No matching contact email')).click());
    await page.waitForFunction(() => document.querySelectorAll('.email-review-client-row').length === 1 && document.querySelector('.email-review-client-row')?.textContent.includes('XYZ Foods'));
    const skippedRequests = requests.length; await fill('[aria-label="Search audience clients"]', 'Electromark');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.email-review-client-row').length), 0, 'Reason filters intersect with client search');
    await fill('[aria-label="Search audience clients"]', '');
    await page.$eval('.email-review-reason-breakdown', node => Array.from(node.querySelectorAll('button')).find(button => button.textContent.includes('All reasons')).click());
    await page.waitForFunction(() => document.querySelectorAll('.email-review-client-row').length === 2);
    assert.equal(requests.length, skippedRequests, 'Skipped-reason filtering remains local');
    await page.screenshot({path:path.join(output,'skipped-reason-filters.png')});
    await selectClient('XYZ Foods');assert((await page.$eval('.email-review-detail',node=>node.innerText)).includes('No contact email matches the selected recipient strategy'));
    await page.click('[aria-label="Audience filter"] [aria-label="Eligible 3"]');await wait();const localBefore=requests.length;await fill('[aria-label="Search audience clients"]','C1');assert.equal(await page.$$('.email-review-client-row').then(a=>a.length),1);await fill('[aria-label="Search audience clients"]','');assert.equal(requests.length,localBefore,'Audience search is local');
    await page.evaluate(()=>document.documentElement.classList.add('dark'));await wait();await screenshot('review-dark');
    await protectedAppearance('dark');
    await spatialSend('dark');
    assert(await page.$$eval('.email-review-additional input',nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgba(255, 255, 255, 0.035)')),'Additional email fields retain dark modal material');
    await page.focus('[aria-label="Additional recipient 1 email"]');await wait();assert.equal(await page.$eval('[aria-label="Additional recipient 1 email"]',node=>getComputedStyle(node).backgroundColor),'rgba(255, 255, 255, 0.035)','Focused additional email field retains dark material');
    await page.$eval('.email-review-additional',node=>node.scrollIntoView({block:'start'}));await screenshot('recipients-five-dark');
    if(process.env.EMAIL_REVIEW_CAPTURE_BASELINE!=='1'){
      assert.equal(await page.$eval(main,node=>getComputedStyle(node).borderTopColor),'rgba(255, 255, 255, 0.08)');
      assert.equal(await page.$eval('.email-review-footer',node=>getComputedStyle(node).borderTopColor),'rgba(255, 255, 255, 0.06)');
      assert(!(await page.$eval('.email-review-footer',node=>getComputedStyle(node).boxShadow)).includes('inset'),'Footer has no bright inherited inset rim');
      const send='.email-review-send',rect=await page.$eval(send,node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
      assert.equal(await page.$eval('.email-review-transmission-copy',node=>getComputedStyle(node).color),'rgb(255, 255, 255)');
      assert.equal(await page.$eval('.email-review-transmission-material',node=>getComputedStyle(node).pointerEvents),'none');
      assert(await page.$$eval('.email-review-transmission-material > span',nodes=>nodes.every(node=>getComputedStyle(node).animationName==='none')),'Send rests without processing animation');
      await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.45);await wait();await screenshot('send-hover-dark');
      assert.equal(await page.$eval('.email-review-transmission-cyan',node=>getComputedStyle(node).opacity),'1');
      const pointer=await sendState();assert(pointer.x>1&&pointer.x<=3,'Stepper spring produces restrained magnetic movement');
      assert(await page.$eval('.email-review-transmission-plane',node=>{const m=new DOMMatrixReadOnly(getComputedStyle(node).transform);return m.m41>=1.5&&m.m41<=2.5&&Math.abs(m.m42)<=1;}),'Plane follows the same pointer system within small limits');
      const deliveriesBefore=requests.filter(r=>r.path.endsWith('/email/deliver')).length;
      await page.mouse.down();await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,140)));await screenshot('send-press-dark');
      const pressed=await sendState();assert(pressed.scale>=.978&&pressed.scale<.986&&Math.abs(pressed.x)<Math.abs(pointer.x)*.6,'Press compresses and reduces magnetic displacement');
      await page.mouse.up();await page.waitForFunction(()=>document.body.innerText.includes('Authorize email delivery'));assert(await page.$eval(main,node=>node.inert),'Underlying review is inert while authorization is open');await page.keyboard.press('Escape');await wait();
      assert(await page.$(main),'Dismissing current confirmation keeps review open');assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).length,deliveriesBefore);
      await page.mouse.move(0,0);await page.focus(send);await wait();
      assert.equal(await page.$eval(send,node=>getComputedStyle(node).outlineStyle),'solid');await screenshot('send-focus-dark');
      await page.keyboard.down('Space');await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,140)));
      assert.equal(await page.$eval(send,node=>node.dataset.pressed),'true');
      await page.keyboard.up('Space');await page.waitForFunction(()=>document.body.innerText.includes('Authorize email delivery'));await page.keyboard.press('Escape');await wait();
      await page.keyboard.press('Enter');await page.waitForFunction(()=>document.body.innerText.includes('Authorize email delivery'));await page.keyboard.press('Escape');await wait();
      assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).length,deliveriesBefore,'Pointer, Space and Enter preserve confirmation before delivery');
    }
    await button('Refresh preview',main);await page.waitForSelector('.email-client-processing');assert(await page.$('.email-review-panes'),'Refresh keeps review shell');await wait();await screenshot('processing-dark');
    await moveOnSend(.8,.5);await page.waitForSelector('.email-client-processing',{hidden:true});await wait();await moveOnSend(.85,.5);await wait();
    assert((await sendState()).lightX>60,'Color response resumes when busy Send is enabled beneath the cursor');
    await page.click('[role=radio][aria-label=Reminder]');await wait();assert.equal(await page.$$('.email-review-panes').then(a=>a.length),0,'Context change removes stale review');assert((await page.$eval(main,node=>node.innerText)).includes('Preview needs to be refreshed'));
    await prepare();await page.waitForFunction(()=>document.querySelector('.email-review-prepare-copy')?.textContent.includes('Checking reply status'));await page.waitForFunction(()=>document.querySelector('.email-review-prepare-copy')?.textContent.includes('Preparing recipients'));await review();
    const posts=requests.filter(r=>r.method==='POST');assert(posts.findIndex(r=>r.path.endsWith('/email/replies'))<posts.findLastIndex(r=>r.path.endsWith('/email')),'Reminder reply refresh precedes preparation');
    await page.click('[role=radio][aria-label="Initial email"]');await wait();failPreview=true;await prepare();await page.waitForSelector('.email-review-error[role=alert]');assert.equal(await page.$$('.email-client-processing').then(a=>a.length),0,'Failure stops animation');await button('Try again',main);await review();
    await page.click('[aria-label="Assignment for rahul0@example.com"] [aria-label="Not included"]');await wait();assert((await page.$eval('.email-review-footer-status',node=>node.textContent)).includes('1 recipient issue'));const noSendBefore=requests.filter(r=>r.path.endsWith('/email/deliver')).length;await button('Create Gmail drafts',main);await wait();assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).length,noSendBefore,'Existing validation blocks invalid delivery');await page.click('[aria-label="Assignment for rahul0@example.com"] [aria-label=To]');
    await addExtra('extra@example.com, bypass@example.com');await wait();const invalidExtraBefore=requests.filter(r=>r.path.endsWith('/email/deliver')).length;await button('Create Gmail drafts',main);await wait();assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).length,invalidExtraBefore,'One address per row prevents bypassing the limit with comma lists');
    await fill('[aria-label="Additional recipient 1 email"]','EXTRA@example.com');await addExtra('rahul0@example.com');await addExtra('copy@example.com','cc');await addExtra('EXTRA@example.com','cc');await addExtra('last@example.com');failDelivery=true;await draft(3,true);
    let delivery=requests.filter(r=>r.path.endsWith('/email/deliver')).at(-1).body;assert.equal(delivery.mode,'draft');assert.deepEqual(delivery.messages[0].to,['rahul0@example.com','extra@example.com','last@example.com']);assert.deepEqual(delivery.messages[0].cc,['copy@example.com']);assert.equal(delivery.messages[0].attachments[0].documentId,'D1');const firstCampaign=delivery.campaignId;
    await button('Send 3 emails',main);await page.waitForSelector(auth);await page.waitForFunction(()=>Array.from(document.querySelectorAll('.email-security-modal button')).some(node=>node.textContent==='Send verification code'));
    assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).at(-1).body.mode,'draft','Authorization opens before sending');await button('Send verification code',auth);await page.waitForSelector('[aria-label="Verification code"]');await fill('[aria-label="Verification code"]','123456');await button('Verify',auth);await page.waitForSelector('.email-security-hold');
    const beforeHold=requests.filter(r=>r.path.endsWith('/email/deliver')).length;await page.click('.email-security-hold');await wait();assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).length,beforeHold,'A click does not send');
    await page.focus('.email-security-hold');await page.keyboard.down('Space');await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,250)));await page.keyboard.up('Space');await wait();assert.equal(requests.filter(r=>r.path.endsWith('/email/deliver')).length,beforeHold,'Early release cancels the hold');
    await page.screenshot({path:path.join(output,'delivery-authorized-dark.png')});failDelivery=true;await page.keyboard.down('Enter');await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1200)));await page.keyboard.up('Enter');await page.waitForSelector('.email-security-error');
    delivery=requests.filter(r=>r.path.endsWith('/email/deliver')).at(-1).body;const sendCampaign=delivery.campaignId;assert.notEqual(sendCampaign,firstCampaign,'Mode changes require a new campaign');assert.equal(delivery.resume,false);assert(delivery.approvalId);
    await button('Cancel',auth);await page.waitForSelector(auth,{hidden:true});await wait();await button('Send 3 emails',main);await page.waitForFunction(()=>Array.from(document.querySelectorAll('.email-security-modal button')).some(node=>node.textContent==='Resume authorized campaign'));const requestsBeforeResume=requests.filter(r=>r.path.endsWith('/approval/verify')).length;
    await button('Resume authorized campaign',auth);await page.waitForSelector('.email-security-hold');await page.focus('.email-security-hold');await page.keyboard.down('Space');await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1200)));await page.keyboard.up('Space');await page.waitForSelector(main,{hidden:true});delivery=requests.filter(r=>r.path.endsWith('/email/deliver')).at(-1).body;assert.equal(delivery.confirmed,true);assert.equal(delivery.mode,'send');assert.equal(delivery.campaignId,sendCampaign);assert.equal(delivery.resume,true);assert.equal(requests.filter(r=>r.path.endsWith('/approval/verify')).length,requestsBeforeResume,'Unchanged authorized retry does not repeat OTP');
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));await open();zero=true;await prepare();await page.waitForSelector('.email-review-panes');await wait();assert.equal(await page.$eval('[aria-label="Skipped 2"]',node=>node.getAttribute('aria-checked')),'true');assert((await page.$eval(main,node=>node.innerText)).includes('No eligible clients'));await screenshot('zero-eligible');await button('Cancel',main);await page.waitForSelector(main,{hidden:true});zero=false;large=true;
    await open();await prepare();await review();assert.equal(await page.$$('.email-review-client-row').then(a=>a.length),500);assert.equal(await page.$$('.email-review-recipients').then(a=>a.length),1);await fill('[aria-label="Search audience clients"]','C499');await selectClient('Client 499');assert((await page.$eval('.email-review-client-heading',node=>node.innerText)).includes('C499'));await screenshot('large-audience');
    await page.setViewport({width:390,height:844});await button('Back to audience',main);await wait();await screenshot('audience-mobile');await selectClient('Client 499');await screenshot('detail-mobile');assert.equal(await page.$eval('.email-review-audience',node=>getComputedStyle(node).display),'none');assert(await page.$eval('.email-review-footer',node=>node.getBoundingClientRect().bottom<=innerHeight));assert.equal(await page.$eval(main,node=>node.scrollWidth<=node.clientWidth),true,'No horizontal overflow');
    await addExtra('mobile@example.com','cc');await page.$eval('.email-review-additional',node=>node.scrollIntoView({block:'start'}));await wait();await screenshot('recipient-mobile');assert(await page.$eval(main,node=>node.scrollWidth<=node.clientWidth),'Additional recipient rows fit mobile');
    await button('Cancel',main);await page.waitForSelector(main,{hidden:true});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.click('[aria-label="Select Arihant Packaging"]');await open();assert((await page.$eval(main,node=>node.innerText)).includes('1 selected tracker row'));assert((await page.$eval(main,node=>node.innerText)).includes('Only the selected rows will be evaluated.'));
    const scopeBefore=requests.filter(r=>r.method==='POST').length;
    await page.click('button[aria-label=Workflow]');await page.waitForSelector('[role=option]');await button('Compliance update');await wait();assert.equal(requests.filter(r=>r.method==='POST').length,scopeBefore);
    await page.focus('.email-review-prepare-action');await page.keyboard.press('Enter');await page.waitForSelector('.email-client-processing');assert.equal(await page.$eval('.email-review-processing-body',node=>getComputedStyle(node).animationName),'none');await screenshot('processing-reduced-motion');await review();
    const lastPreview=requests.filter(r=>r.method==='POST'&&r.path.endsWith('/email')).at(-1).body;assert.deepEqual(lastPreview.entryIds,['E0']);assert.equal(lastPreview.workflowId,'W2');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Audience','Keyboard preview moves focus to mounted Audience heading');
    await page.focus('.email-review-client-row');await page.keyboard.press('ArrowDown');await wait();assert.equal(await page.$eval('.email-review-client-row[aria-current=true]',node=>node.textContent.includes('Pearl Plastic')),true,'Audience navigation works by keyboard');
    if(process.env.EMAIL_REVIEW_CAPTURE_BASELINE!=='1'){
      await page.hover('.email-review-send');await wait();await screenshot('send-reduced-motion');
      assert.equal(await page.$eval('.email-review-send',node=>getComputedStyle(node).transform),'none');
      assert.equal(await page.$eval('.email-review-transmission-copy svg',node=>getComputedStyle(node).transform),'none');
      const reduced=await sendState();assert.equal(reduced.lightX,68);assert.equal(reduced.lightY,23);assert.equal(reduced.x,0);assert.equal(reduced.y,0);assert.equal(reduced.idlePhase,0,'Reduced motion stops continuous drift');
      await page.focus('.email-review-send');await page.keyboard.down('Space');await wait();
      assert.equal(await page.$eval('.email-review-send',node=>node.dataset.pressed),'true','Reduced motion retains press feedback');
      await page.keyboard.up('Space');await page.waitForFunction(()=>document.body.innerText.includes('Authorize email delivery'));await page.keyboard.press('Escape');await wait();
    }
    await draft(500);await page.waitForSelector(main,{hidden:true});
    const successfulDraft=requests.filter(r=>r.path.endsWith('/email/deliver')).at(-1).body;assert.equal(successfulDraft.mode,'draft');assert.equal(successfulDraft.messages.length,500);assert.equal(successfulDraft.confirmed,true,'Draft creation has explicit confirmation');assert.equal(successfulDraft.approvalId,undefined,'Confirmation-only drafts do not request OTP');
    assert.deepEqual(errors,[]);console.log('PASS: production Email clients preparation/review, real Reminder phases, edits, inline/expanded signature preview, focus, skipped/zero/500 clients, request-free search, validation, unchanged draft/send payload and confirmation/resume, light/dark/mobile/reduced motion.');
  }catch(error){if(page)console.error('Page excerpt:',(await page.$eval('body',node=>node.innerText)).slice(-5000));throw error;}
  finally{if(browser){const cleanup=setTimeout(()=>browser.process()?.kill(),15000);try{await browser.close();}finally{clearTimeout(cleanup);}}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
