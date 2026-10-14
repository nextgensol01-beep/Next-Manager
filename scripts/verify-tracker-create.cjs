/* Real creation page + real design primitives, with isolated client/API fixtures. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module'), ts = require('typescript');
const puppeteer = require('puppeteer-core'), compiledWebpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'tmp/tracker-create-tests');
const categories = ['PWP','Producer','Importer','Brand Owner','SIMP'];
const clients = Array.from({length: process.env.TRACKER_CREATE_STRESS_ONLY ? 3005 : 505}, (_, index) => ({clientId:`C${index}`,companyName:index === 504 ? 'Needle Works' : `Company ${index}`,category:categories[index % 5],state:index % 2 ? 'Delhi' : 'Gujarat'}));
const posts = [], reads = []; let failPost = false;
const loaded = new Map();
function load(relative) {
  const filename = path.join(root, relative); if (loaded.has(filename)) return loaded.get(filename).exports;
  const module = new Module(filename); module.filename = filename; module.paths = Module._nodeModulePaths(path.dirname(filename)); loaded.set(filename, module);
  const original = module.require.bind(module); module.require = name => name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : original(name);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename); return module.exports;
}
const create = load('lib/tracker-create.ts'), colorLib = load('lib/tracker-option-colors.ts'), json = value => JSON.parse(JSON.stringify(value));
function compatibility() {
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/tracker-create-baseline.json'),'utf8'));
  for (const key of ['FIELD_TYPES','TRACKER_STARTERS','LIVE_DATA_SOURCES','LIVE_DATA_DISPLAYS']) assert.deepEqual(json(create[key]),baseline[key],`${key} is unchanged`);
  assert.deepEqual(json(create.blankField()),baseline.blank);
  for (const [display,type] of Object.entries(baseline.liveTypes)) assert.equal(create.liveFieldType(display),type);
  assert.deepEqual(json(create.emptyTrackerDraft()),baseline.payloads[0].draft);
  for (const {draft,payload} of baseline.payloads) {
    const withIds = {...draft,fields:draft.fields.map(create.draftField)};
    const expected = { ...payload, fields: payload.fields.map(field => ["select", "multiSelect", "tags"].includes(field.type) ? { ...field, optionColors: colorLib.normalizeTrackerOptionColors(field.options, field.optionColors) } : field) };
    assert.deepEqual(json(create.trackerCreatePayload(withIds)),expected,'Existing POST values preserved; draft identity stripped and displayed colors included');
  }
  const draft = create.emptyTrackerDraft();
  assert.equal(Object.values(create.trackerCreateErrors(draft))[0],'Give this tracker a name.');
  draft.name='Worklist'; assert.deepEqual(json(create.trackerCreateErrors(draft)),{},'No new optional-field requirements');
  draft.fields=[create.draftField({key:'upload',label:'Upload',type:'toggle',dataLink:{source:'purchaseUploads',display:'yesNo'}})];
  assert.equal(create.trackerCreateErrors(draft).financialYear,'Choose a financial year for CPCB upload data.');
  draft.fields[0].dataLink.source='saleUploads'; assert(create.trackerCreateErrors(draft).financialYear);
  draft.financialYear='2025-26'; draft.scope='categories'; assert.equal(create.trackerCreateErrors(draft).audience,'Choose at least one client category.');
  draft.selectedCategories=['PWP']; assert.deepEqual(json(create.trackerCreateErrors(draft)),{});
  draft.scope='selected'; assert.equal(create.trackerCreateErrors(draft).audience,'Select at least one client.');
  draft.selected=['C504']; assert.deepEqual(json(create.trackerCreateErrors(draft)),{});
  assert.equal(create.trackerAudience(clients,draft)[0].companyName,'Needle Works');
  draft.scope='categories'; assert.equal(create.trackerAudience(clients,draft).length,clients.filter(client=>client.category==='PWP').length);
  const fields=[create.draftField({key:'a',label:'A',type:'number'}),create.draftField({key:'b',label:'B',type:'number'})];
  const computed=create.computedFieldPatch(fields,create.blankField());
  assert.deepEqual(json(computed.computed),{kind:'percentage',primaryFieldKey:'a',secondaryFieldKey:'b'});
  assert.equal(computed.type,'number');
  const third=create.draftField({key:'c',label:'C',type:'number',computed:computed.computed});
  assert.deepEqual(json(create.computedSourceFields([...fields,third],fields[0])).map(field=>field.key),['b']);
  for (const source of baseline.LIVE_DATA_SOURCES) {
    const patch=create.liveSourcePatch(source.value);
    assert.equal(patch.dataLink.display,baseline.LIVE_DATA_DISPLAYS[source.value][0].value);
    assert.equal(patch.type,create.liveFieldType(patch.dataLink.display));
  }
  assert.equal(new Set(Array.from({length:30},()=>create.draftField().uiId)).size,30);
  const starter=create.TRACKER_STARTERS[1].fields;
  const signature=create.trackerColumnSignature(starter.map(create.draftField),true);
  assert.equal(signature,create.trackerColumnSignature(starter.map(create.draftField),true),'Draft IDs do not produce false dirty state');
  assert.notEqual(signature,create.trackerColumnSignature(starter.map(create.draftField).reverse(),true),'Reordering is a real column customization');
  console.log('PASS: original starters, all field types, source/display derivation, computed references, validation, audience and POST contract');
}

async function main() {
  compatibility(); fs.mkdirSync(output,{recursive:true}); compiledWebpack.init();
  await new Promise((resolve,reject)=>{
    const compiler=compiledWebpack.webpack({mode:'development',devtool:false,context:root,entry:path.join(__dirname,'fixtures/tracker-create.tsx'),output:{path:output,filename:'fixture.js'},
      resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root,'next/link':path.join(__dirname,'fixtures/tracker-next-link.cjs'),'next-auth/react':path.join(__dirname,'fixtures/tracker-session.cjs')}},
      module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(__dirname,'fixtures/workflow-editor-loader.cjs')}]}});
    compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
  });
  const built=await require('postcss')([require('tailwindcss')(path.join(root,'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace(/^@import .+$/gm,''),{from:path.join(root,'app/globals.css')});
  const css=built.css+['components/ui/liquid-glass/liquid-glass.css','app/client-profile-premium.css','app/tracker-create.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')+'body{font-family:Inter,Arial,sans-serif;margin:0;background:var(--color-surface);color:var(--color-text)}';
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost');
    if (url.pathname==='/fixture.js') {response.setHeader('Content-Type','application/javascript');response.end(fs.readFileSync(path.join(output,'fixture.js')));}
    else if (url.pathname==='/fixture.css') {response.setHeader('Content-Type','text/css');response.end(css);}
    else if (url.pathname.startsWith('/api/')) {
      response.setHeader('Content-Type','application/json');
      if (request.method==='POST') {
        let body=''; request.on('data',chunk=>body+=chunk); request.on('end',()=>{
          posts.push(JSON.parse(body)); const fail=failPost;failPost=false;
          setTimeout(()=>{response.statusCode=fail?500:201;response.end(JSON.stringify(fail?{error:'Fixture creation failed.'}:{_id:'new-tracker',entryCount:posts.at(-1).scope==='selected'?posts.at(-1).clientIds.length:505}));},500);
        });
      } else {reads.push(url.pathname);response.end(JSON.stringify(url.pathname==='/api/clients'?clients:[]));}
    } else {response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); let browser;
  try {
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu']});
    const page=await browser.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width:1440,height:1000}); await page.goto(`http://127.0.0.1:${server.address().port}`);
    const settle=()=>page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,330)));
    const click=async selector=>{await page.$eval(selector,node=>node.scrollIntoView({block:'center'}));await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,60)));await page.click(selector);await settle();};
    const text=selector=>page.$eval(selector,node=>node.textContent);
    const write=async(selector,value)=>{await click(selector);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type(value);await settle();};
    const choose=async(label,value)=>{
      await click(`.create-column-editor-wrap:not([inert]) button[aria-label="${label}"], .create-fy button[aria-label="${label}"]`);
      await page.waitForSelector(`[role="listbox"][aria-label="${label}"]`);
      await page.$$eval(`[role="listbox"][aria-label="${label}"] [role="option"]`,(nodes,value)=>{const option=nodes.find(node=>node.textContent.trim()===value);if(!option)throw Error(`Missing option ${value}`);option.click();},value);await settle();
    };
    const starter=async id=>{await click(`.create-starters [role=radio][aria-checked="${id==='blank'?'true':'false'}"]`);};
    const radio=async(label,value)=>{await page.$$eval(`[role=radiogroup][aria-label="${label}"] [role=radio]`,(nodes,value)=>{const match=nodes.find(node=>!node.closest('[inert]')&&node.textContent.startsWith(value));if(!match)throw Error(`Missing radio ${value}`);match.click();},value);await settle();};
    const open=async()=>{await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(node=>node.textContent.trim()==='Create tracker').click());await page.waitForSelector('.create-workbench');await settle();};
    await open(); assert.equal(await text('.create-preview-identity h4'),'Untitled tracker');
    if(process.env.TRACKER_CREATE_VISUAL_ONLY) {
      await write('#create-tracker-name','Monthly client worklist');await radio('Tracker starter','Follow-up');
      await click('.create-column-row:nth-child(3) .create-column-expand');await click('.create-column-editor-wrap:not([inert]) .create-option-color-trigger');
      await page.screenshot({path:path.join(output,'options-editor.png')});await page.keyboard.press('Escape');
      await radio('Column data source','Live');await click('.create-column-editor-wrap:not([inert]) button[aria-label="Live source"]');
      await page.screenshot({path:path.join(output,'live-source-menu.png')});await page.keyboard.press('Escape');
      await page.evaluate(()=>document.documentElement.classList.add('dark'));await settle();await page.screenshot({path:path.join(output,'live-editor-dark.png')});
      await click('.create-add-column');await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]','Coverage');await radio('Column data source','Computed');
      await page.screenshot({path:path.join(output,'computed-editor-dark.png')});assert.deepEqual(errors,[]);console.log('PASS: option palette, live-source menu and computed-editor visual checks');return;
    }
    if(process.env.TRACKER_CREATE_STRESS_ONLY) {
      await write('#create-tracker-name','Large worklist');
      for(let index=0;index<20;index++) {await click('.create-add-column');await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]',`Column ${index+1}`);}
      assert.equal(await page.$$('.create-column-row').then(nodes=>nodes.length),20);assert((await text('.create-preview-meta')).includes('3005 clients'));
      assert.equal(await page.$$('.create-column-editor-wrap:not([inert])').then(nodes=>nodes.length),1);
      await click('.create-column-editor-wrap:not([inert]) button[aria-label="Move Column 20 up"]');assert((await text('.create-column-row:nth-child(19) .create-column-title')).includes('Column 20'));
      await page.$eval('.create-preview-table-scroll',node=>node.scrollLeft=node.scrollWidth);assert((await text('.create-preview-scroll-hint')).includes('24 columns'));
      await page.screenshot({path:path.join(output,'large-worklist.png')});
      await radio('Client scope','Specific clients');await write('input[aria-label="Search clients"]','Company 3004');await click('.create-client-row');assert((await text('.create-preview-table')).includes('Company 3004'));
      await click('.tracker-create-modal .tracker-modal-primary');await page.waitForSelector('.tracker-create-modal',{hidden:true});assert.equal(posts[0].fields.length,20);assert.deepEqual(posts[0].clientIds,['C3004']);assert.deepEqual(errors,[]);
      console.log('PASS: 20 stable columns with 3,005 loaded clients, bounded client picker, reorder, preview scrolling and compatible creation');return;
    }
    assert((await text('.create-audience-count')).includes('505 clients'));
    assert.equal(await page.$$('.create-workbench nav').then(nodes=>nodes.length),0);
    await click('.tracker-create-modal .tracker-modal-primary');assert((await text('#create-name-error')).includes('Give this tracker a name'));assert.equal(posts.length,0);
    await write('#create-tracker-name','September follow-ups');assert.equal(await text('.create-preview-identity h4'),'September follow-ups');
    await radio('Tracker starter','Follow-up');assert.equal(await page.$$('.create-column-row').then(nodes=>nodes.length),4);
    await click('.create-column-expand');assert.equal(await page.$$('.create-column-editor-wrap:not([inert])').then(nodes=>nodes.length),1);
    const id=await page.$eval('.create-column-row',node=>{window.firstColumn=node;return node.dataset.columnId;});
    await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]','Owner');
    assert(await page.evaluate(()=>window.firstColumn===document.querySelector('.create-column-row')),'Renaming does not remount the row');
    assert((await text(`[data-preview-column="${id}"]`)).includes('Owner'));
    await radio('Tracker starter','CPCB');assert.equal(await page.$$('.create-column-row').then(nodes=>nodes.length),4,'Customized columns remain until replacement confirmed');
    assert(await page.$('.create-starter-confirm')); await click('.create-starter-confirm .create-text-action');
    for (const type of create.FIELD_TYPES) {
      await choose('Field type',type.label);
      if(type.id==='quantity') {await write('input[aria-label="Quantity unit"]','MT');assert(await page.$('input[aria-label="Quantity unit"]'));}
    }
    await choose('Field type','Dropdown'); await write('input[aria-label="Option 1"]','Pending');
    await click('.create-column-editor-wrap:not([inert]) .create-option-color-trigger');assert(await page.$('.create-color-palette'));
    await click('.create-color-palette [role=radio][aria-label="rose"]');assert.equal(await page.$eval('.create-column-editor-wrap:not([inert]) .create-option-dot',node=>node.dataset.color),'rose');
    await click('.create-column-editor-wrap:not([inert]) .create-text-action');await write('input[aria-label="Option 3"]','Done');
    await page.$eval('.create-builder-scroll',node=>{node.scrollTop=500;window.previousScroll=node.scrollTop;});
    await page.$eval('input[aria-label="Option 1"]',node=>node.focus({preventScroll:true}));await page.$eval('input[aria-label="Option 1"]',node=>node.blur());await settle();
    assert.equal(await page.$eval('.create-builder-scroll',node=>node.scrollTop),await page.evaluate(()=>window.previousScroll),'Input blur preserves builder scroll');
    await radio('Column data source','Live');
    for (const source of create.LIVE_DATA_SOURCES) {
      await choose('Live source',source.label);
      for (const display of create.LIVE_DATA_DISPLAYS[source.value]) await choose('Live display',display.label);
    }
    assert(await page.$('.create-required'),'Upload sources require FY only when blank');
    await radio('Column data source','Manual');assert.equal(await page.$$('.create-required').then(nodes=>nodes.length),0);
    await choose('Field type','Dropdown');await write('.create-column-editor-wrap:not([inert]) input[aria-label="Option 1"]','Pending');
    await click('.create-column-editor-wrap:not([inert]) .create-option-color-trigger');await click('.create-color-palette [role=radio][aria-label="rose"]');
    await click('.create-column-editor-wrap:not([inert]) .create-text-action');await write('.create-column-editor-wrap:not([inert]) input[aria-label="Option 3"]','Done');
    await click('.create-add-column');await write('.create-column-editor-wrap:not([inert]) input[aria-label="Column name"]','Coverage');await radio('Column data source','Computed');
    assert((await text('.create-computed-heading')).includes('Coverage percentage'));
    await choose('Covered / uploaded field','Priority');await choose('Required / received field','Next action');
    const newId=await page.$eval('.create-column-row:last-child',node=>node.dataset.columnId);
    await click('.create-column-editor-wrap:not([inert]) button[aria-label="Move Coverage up"]');
    assert.equal(await page.$eval('.create-column-row:nth-child(4)',node=>node.dataset.columnId),newId);
    await page.focus(`.create-column-row[data-column-id="${newId}"] .create-column-drag`);await page.keyboard.press('ArrowUp');await settle();
    assert.equal(await page.$eval('.create-column-row:nth-child(3)',node=>node.dataset.columnId),newId,'Keyboard reorders without changing column identity');
    assert.deepEqual(await page.$$eval('.create-column-row',nodes=>nodes.map(node=>node.dataset.columnId)),await page.$$eval('[role=columnheader][data-preview-column^="tracker-column-"]',nodes=>nodes.map(node=>node.dataset.previewColumn)));
    await click('.create-column-editor-wrap:not([inert]) .create-remove-column');await page.waitForSelector(`[data-column-id="${newId}"]`,{hidden:true});
    await page.$eval('.create-column-stack',node=>node.scrollIntoView({block:'center'}));await settle();
    const beforeDrag=await page.$$eval('.create-column-row',nodes=>nodes.map(node=>node.dataset.columnId));
    const dragPoints=await page.evaluate(()=>{const a=document.querySelector('.create-column-row .create-column-drag').getBoundingClientRect(),b=document.querySelector('.create-column-row:last-child').getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2,end:b.bottom-8};});
    await page.mouse.move(dragPoints.x,dragPoints.y);await page.mouse.down();await page.mouse.move(dragPoints.x,dragPoints.end,{steps:20});await page.mouse.up();await settle();
    const afterDrag=await page.$$eval('.create-column-row',nodes=>nodes.map(node=>node.dataset.columnId));assert.notDeepEqual(afterDrag,beforeDrag,'Pointer drag changes canonical order');assert.deepEqual([...afterDrag].sort(),[...beforeDrag].sort());
    assert.deepEqual(afterDrag,await page.$$eval('[role=columnheader][data-preview-column^="tracker-column-"]',nodes=>nodes.map(node=>node.dataset.previewColumn)),'Preview follows pointer drag ordering');
    await radio('Client scope','By category');await click('.tracker-create-modal .tracker-modal-primary');assert(await page.$('#create-audience-error'));assert.equal(posts.length,0);
    await radio('Category membership','Keep in sync');await click('.create-chips[aria-label="Client categories"] button');assert((await text('.create-audience-count')).includes('101 clients'));
    await radio('Client scope','Specific clients');await write('input[aria-label="Search clients"]','  nEEdLe  ');await click('.create-client-row');
    assert((await text('.create-preview-table')).includes('Needle Works'));await write('input[aria-label="Search clients"]','Company 2');await click('.create-client-row');await write('input[aria-label="Search clients"]','unmatched');
    assert((await text('.create-client-picker > .create-help')).includes('2 selected'));assert((await text('.create-audience-count')).includes('2 clients'));
    await click('.create-chips[aria-label="Visible client details"] button[aria-pressed="true"]');await page.waitForSelector('[data-preview-column="detail-state"]',{hidden:true});
    await page.$$eval('.create-chips[aria-label="Visible client details"] button',nodes=>nodes.find(node=>node.textContent.includes('GST number')).click());await settle();
    assert(await page.$('[data-preview-column="detail-gstNumber"]'));assert(!(await text('.create-preview-table')).includes('GSTIN'));
    await click('[aria-label="Include Status column"]');await page.waitForSelector('[data-preview-column="system-status"]',{hidden:true});
    await click('[aria-label="Enable email updates"]');assert((await text('.create-preview-email')).includes('Email tools enabled'));
    console.log('PASS: actual builder interactions, option colors, all types/displays, computed fields, stable identity, keyboard ordering, audience, details, toggles and scroll preservation');
    for (const dark of [false,true]) {
      await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await page.setViewport({width:1440,height:1000});await page.$eval('.create-builder-scroll',node=>node.scrollTop=0);await settle();
      const layout=await page.evaluate(()=>{const left=document.querySelector('.create-build').getBoundingClientRect(),rail=document.querySelector('.create-preview-rail').getBoundingClientRect();return {ratio:left.width/(left.width+rail.width),railTop:rail.top};});
      assert(layout.ratio>=.64&&layout.ratio<=.66);await page.screenshot({path:path.join(output,`${dark?'dark':'light'}-desktop.png`)});
      await page.$eval('.create-builder-scroll',node=>node.scrollTop=node.scrollHeight);await settle();assert.equal(await page.$eval('.create-preview-rail',node=>node.getBoundingClientRect().top),layout.railTop,'Preview stays visible while builder scrolls');
      await page.screenshot({path:path.join(output,`${dark?'dark':'light'}-columns.png`)});
      for (const width of [390,800]) {
        await page.setViewport({width,height:844});await settle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
        await click('.create-preview-trigger');assert(await page.$eval('.create-build',node=>node.inert));await page.screenshot({path:path.join(output,`${dark?'dark':'light'}-${width}-preview.png`)});
        await page.keyboard.press('Escape');await settle();assert(await page.$eval('.create-preview-rail',node=>getComputedStyle(node).display==='none'));assert(await page.evaluate(()=>document.activeElement===document.querySelector('.create-preview-trigger')));
        const footer=await page.$eval('.tracker-create-modal .tracker-modal-footer',node=>node.getBoundingClientRect().bottom);assert(footer<=844,'Footer remains accessible');
      }
    }
    await page.setViewport({width:1440,height:1000});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await settle();
    failPost=true;await click('.tracker-create-modal .tracker-modal-primary');assert((await text('.tracker-create-modal .tracker-modal-primary')).includes('Creating'));
    await page.$eval('#create-client-tracker',node=>{node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    await page.waitForSelector('.create-server-error');assert.equal(posts.length,1,'Duplicate submission guarded');assert.equal(await text('.create-server-error'),'Fixture creation failed.');
    assert.equal(await page.$eval('#create-tracker-name',node=>node.value),'September follow-ups');assert.equal(posts[0].scope,'selected');assert.equal(posts[0].clientIds.length,2);assert.equal(posts[0].clientMembershipMode,'snapshot');assert.equal(posts[0].includeStatus,false);assert.equal(posts[0].emailEnabled,true);assert.deepEqual(posts[0].clientColumns,['gstNumber']);assert(!JSON.stringify(posts[0]).includes('uiId'));
    const owner=posts[0].fields.find(field=>field.label==='Owner');assert.deepEqual(owner.options,['Pending','Option 2','Done']);assert.deepEqual(owner.optionColors,{Pending:'rose','Option 2':'blue',Done:'violet'});
    await click('.tracker-create-modal .tracker-modal-primary');await page.waitForSelector('.tracker-create-modal',{hidden:true});assert.equal(posts.length,2);assert(reads.filter(url=>url==='/api/client-trackers').length>=2,'Success refreshes the tracker list');
    await open();assert.equal(await page.$eval('#create-tracker-name',node=>node.value),'');assert.equal(await page.$$('.create-column-row').then(nodes=>nodes.length),0);assert.equal(await page.$eval('[aria-label="Include Status column"]',node=>node.getAttribute('aria-checked')),'true');
    await radio('Tracker starter','CPCB');assert.equal(await page.$$('.create-column-row').then(nodes=>nodes.length),10);assert(await page.$('.create-required'));
    await write('#create-tracker-name','CPCB tracker');await click('.tracker-create-modal .tracker-modal-primary');assert(await page.$('#create-fy-error'));assert.equal(posts.length,2);
    await choose('Financial year','2025-26');assert.equal(await page.$$('.create-required').then(nodes=>nodes.length),0);
    await page.$eval('.create-builder-scroll',node=>node.scrollTop=node.scrollHeight);await settle();await page.screenshot({path:path.join(output,'cpcb-columns.png')});
    await click('.tracker-create-modal .tracker-modal-primary');await page.waitForSelector('.tracker-create-modal',{hidden:true});assert.equal(posts[2].financialYear,'2025-26');assert.equal(posts[2].fields.length,10);assert.equal(posts[2].fields[2].dataLink.source,'purchaseUploads');
    assert.deepEqual(errors,[],'No runtime errors');assert(reads.every(url=>['/api/clients','/api/client-trackers'].includes(url)),'Structural preview never fetches invoices or uploads');
    console.log('PASS: light/dark desktop, medium/mobile preview, reduced motion, inline validation, API recovery, guarded submission, compatible POST, fresh reopening and success refresh');
    console.log(`Visual captures: ${output}`);
  } catch(error) {
    if(browser) {
      const page=(await browser.pages()).at(-1);
      await page.screenshot({path:path.join(output,'failure.png')});
      fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify(await page.evaluate(()=>({
        details:Array.from(document.querySelectorAll('.create-chips[aria-label="Visible client details"] button')).map(node=>({text:node.textContent,pressed:node.getAttribute('aria-pressed')})),
        headers:Array.from(document.querySelectorAll('[role=columnheader]')).map(node=>({text:node.textContent,id:node.dataset.previewColumn,opacity:getComputedStyle(node).opacity,transform:getComputedStyle(node).transform})),
        active:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')},
      })),null,2));
    }
    throw error;
  } finally {
    if(browser){const timer=setTimeout(()=>browser.process()?.kill(),15000);try{await browser.close();}finally{clearTimeout(timer);}}
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
