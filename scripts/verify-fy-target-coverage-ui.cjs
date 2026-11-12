/* Extend the existing real-profile FY regression fixture in a task-owned output
 * directory. Existing fixtures/evidence and the live database are never modified. */
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const root = path.resolve(__dirname, '..');
const taskArg = process.argv.indexOf('--task');
const task = taskArg < 0 ? fs.mkdtempSync(path.join(root, 'tmp/fy-target-coverage-task-')) : path.resolve(process.argv[taskArg + 1]);
if (path.dirname(task) !== path.join(root, 'tmp') || !path.basename(task).startsWith('fy-target-coverage-task-')) throw Error('Unexpected task output');
fs.mkdirSync(task, { recursive: true });
console.log('Task output: ' + task);
const filename = path.join(__dirname, 'verify-financial-year-ui.cjs');
let source = fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n');
function replace(before, after) { if (!source.includes(before)) throw Error('Fixture changed: ' + before.slice(0,80)); source = source.replace(before, () => after); }
replace('output = path.join(root, "tmp/financial-year-tests")', 'output = ' + JSON.stringify(task));
replace('const enrich = (record) => {', `let coverageFixture = null;
const enrich = (record) => {
  if (coverageFixture && record.clientId === 'PIBO') {
    const result = {...record, ...coverageFixture, totalTarget:0, totalAchieved:0};
    for(const id of ['1','2','3','4']) {
      const target = (record.targets || []).filter(e=>e.categoryId===id).reduce((s,e)=>s+e.value,0);
      const recorded = (coverageFixture.achievedByType || []).filter(e=>e.categoryId===id).reduce((s,e)=>s+e.value,0);
      result['cat'+id+'Target']=target; result['achievedCat'+id]=recorded;
      result.totalTarget+=target; result.totalAchieved+=recorded;
    }
    if(coverageFixture.legacy) {result.achievedCat2=50; result.totalAchieved=50;}
    return result;
  }`);
// The real dashboard provides page padding; the old bare fixture omitted it.
replace('<div id="root"></div>', '<div id="root" style="padding:16px"></div>');
replace('    let locationClient = "PIBO";', `
    const coverageChecks = [], coverageGeometry = [];
    const originalRecords = structuredClone(records);
    const e = (categoryId,type,value) => ({categoryId,type,value});
    const target = (r,t) => [e('2','RECYCLING',r),e('2','EOL',t)];
    const openCoverage = async () => {
      await page.goto(base+'/dashboard/clients/PIBO');
      await page.waitForFunction(()=>document.body.textContent.includes('Evergreen Packaging'));
      const compact = await page.$eval('.client-profile-compact-primary',node=>!!node.getClientRects().length).catch(()=>false);
      if(compact) await page.click('.client-profile-compact-primary');
      await clickText('Compliance');
      if(compact) await clickText('Targets'); else await clickText('FY Targets / Credits');
      await page.waitForSelector('.client-profile-fy-progress'); await settle();
    };
    const totals = () => page.$$eval('.client-profile-fy-total strong',nodes=>nodes.map(n=>n.textContent));
    const coveredText = () => page.$eval('.client-profile-fy-ring strong',node=>node.textContent);
    await page.setViewport({width:1440,height:1000,hasTouch:true});
    for(const [name,rT,eT,rA,eA,expected,pending] of [
      ['A',17,26,0,200,'60.5%',17], ['B',20,10,20,10,'100%',0], ['C',20,10,10,5,'50%',15],
      ['D',20,10,30,15,'100%',0], ['E',20,10,5,100,'50%',15], ['F',0,0,0,0,'—',0]
    ]) {
      records[0].targets=target(rT,eT);coverageFixture={achievedByType:target(rA,eA)};
      await openCoverage();assert.equal(await coveredText(),expected);assert.equal((await totals())[2],String(pending));
      const text=await page.$eval('.client-profile-fy-progress',n=>n.textContent);
      assert(!/gross/i.test(text));assert(![...text.matchAll(/([\\d.]+)%/g)].some(m=>Number(m[1])>100));
      if(name==='A') {
        assert.deepEqual(await totals(),['43','26','17']);
        assert.equal(await page.$$eval('.client-profile-fy-categories > div',nodes=>nodes.filter(n=>n.textContent.includes('No target')).length),3);
        await clickText('Breakdown');await page.waitForSelector('[role=dialog]');
        const detail=await page.$eval('[role=dialog]',n=>n.textContent);assert(detail.includes('60.5%'));assert(detail.includes('Recorded 200 MT'));assert(detail.includes('Above target 174 MT'));
        assert(!detail.includes('-157')); await page.keyboard.press('Escape');await settle();
        await clickText('Edit FY');await page.waitForSelector(quantity(1));await settle();
        assert.deepEqual(await page.$$eval('.fy-summary-grid strong',nodes=>nodes.map(n=>n.textContent.trim())),['43MT','26MT','17MT']);
        await clickText('Category & type breakdown');
        assert((await page.$eval('.fy-breakdown-table',n=>n.textContent)).includes('26'));
        await clickText('Cancel','.fy-modal-footer button');await settle();
      }
      coverageChecks.push('Real profile case '+name+' = '+expected+'; pending '+pending);
    }
    for(const category of ['Producer','Importer','Brand Owner']) {
      clients[0].category=category;records[0].targets=target(17,26);coverageFixture={achievedByType:target(0,200)};
      await openCoverage();assert.equal(await coveredText(),'60.5%');coverageChecks.push(category+' profile uses identical independent coverage');
    }
    records[0].targets=target(17,26);coverageFixture={achievedByType:[],legacy:true};await openCoverage();
    assert.equal(await coveredText(),'—');assert((await page.$eval('.client-profile-fy-progress',n=>n.textContent)).includes('Needs verification'));
    await clickText('Breakdown');await page.waitForSelector('[role=dialog]');assert((await page.$eval('[role=dialog]',n=>n.textContent)).includes('Recorded category quantity: 50 MT'));
    await page.keyboard.press('Escape');await settle();coverageChecks.push('Legacy achievement 50 MT retained without a fabricated type split');
    coverageFixture={achievedByType:target(0,200)};records[0].targets=target(17,26);
    for(const width of [320,390,768,1440]) {
      await page.setViewport({width,height:1000,hasTouch:true});await openCoverage();
      for(const dark of [false,true]) {
        await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await settle();
        const geometry=await page.$eval('.client-profile-fy-progress',panel=>{const r=panel.getBoundingClientRect();return{width:innerWidth,left:r.left,right:r.right,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,ring:!!panel.querySelector('.client-profile-fy-ring'),categories:panel.querySelectorAll('.client-profile-fy-categories > div').length}});
        assert(geometry.left>=-1&&geometry.right<=width+1,JSON.stringify(geometry));assert(geometry.scrollWidth<=geometry.clientWidth+1,JSON.stringify(geometry));assert(geometry.ring&&geometry.categories===4);
        assert.equal(await coveredText(),'60.5%');coverageGeometry.push({width,dark,...geometry});
        if(width===390||width===1440){await page.$eval('.client-profile-fy-progress',n=>n.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,'coverage-'+width+'-'+(dark?'dark':'light')+'.png')});}
      }
    }
    coverageChecks.push('Existing ring/cards and unclipped layout at 320/390/768/1440px, light and dark');
    await page.setViewport({width:1440,height:1000,hasTouch:true});await openCoverage();
    await clickText('Edit FY');await page.waitForSelector(quantity(1));await settle();await write(quantity(1),'20');
    assert.deepEqual(await page.$$eval('.fy-summary-grid strong',nodes=>nodes.map(n=>n.textContent.trim())),['46MT','26MT','20MT']);
    await clickText('Save Changes');await page.waitForSelector('.fy-record-modal',{hidden:true});await settle();
    assert.deepEqual(await totals(),['46','26','20']);assert.equal(await coveredText(),'56.5%');
    await clickText('Breakdown');await page.waitForSelector('[role=dialog]');assert((await page.$eval('[role=dialog]',n=>n.textContent)).includes('56.5%'));
    await page.keyboard.press('Escape');await settle();
    coverageChecks.push('Edit FY preview, saved profile and Breakdown reconcile the same new targets without truncating the 200 MT ledger record');
    assert.equal(coverageFixture.achievedByType[1].value,200);
    fs.writeFileSync(path.join(output,'coverage-verification.json'),JSON.stringify({passed:true,checks:coverageChecks,geometry:coverageGeometry},null,2));
    console.log('PASS: additional target-coverage browser matrix ('+coverageChecks.length+' checks, '+coverageGeometry.length+' geometry cases)');
    await page.goto('about:blank');await settle();records=originalRecords;clients[0].category='Producer';coverageFixture=null;writes=[];requests=[];revision=0;
    let locationClient = "PIBO";`);
const moduleInstance = new Module(filename, module); moduleInstance.filename = filename; moduleInstance.paths = Module._nodeModulePaths(__dirname);
moduleInstance._compile(source, filename);
