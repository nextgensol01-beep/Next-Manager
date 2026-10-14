const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core');
const compiledWebpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname,'..'), output = path.join(root,'tmp/search-browser-tests');
const clients = Array.from({length:130},(_,index) => ({clientId:'C'+index,companyName:index === 128 ? 'Needle Corporation' : 'Company '+index,category:index===129?'Producer':'PWP',legalName:'Legal '+index,
  searchValues:['C'+index,index===128?'Needle Corporation':'Company '+index,'Legal '+index,'Person '+index,index===128?'98765 43210':'phone-'+index,index===128?'needle@company.example':'contact-'+index+'@example.com',index===128?'Custom Region West':'Custom '+index]}));
const records = [128,129].map(index => ({_id:'R'+index,clientId:'C'+index,financialYear:'2025-26',targets:[{categoryId:'1',type:'RECYCLING',value:10}],generated:[{categoryId:'1',type:'RECYCLING',value:10}],cat1Target:10,cat1Generated:10}));
const bills = [128,129].map(index => ({_id:'B'+index,clientId:'C'+index,financialYear:'2025-26',billType:'general',billTitle:index===128?'Service Alpha':'Service Beta',govtCharges:0,consultancyCharges:100,targetCharges:0,otherCharges:0,totalAmount:100,totalPaid:0,pendingAmount:100,paymentStatus:'Unpaid'}));
const requests = [];
async function main() {
  fs.mkdirSync(output,{recursive:true}); compiledWebpack.init();
  await new Promise((resolve,reject) => {
    const compiler = compiledWebpack.webpack({mode:'development',devtool:false,context:root,entry:path.join(__dirname,'fixtures/search-architecture.tsx'),output:{path:output,filename:'fixture.js'},
      resolve:{extensions:['.tsx','.ts','.js','.cjs'],fallback:{fs:false,crypto:false,path:false},alias:{'@/app/providers':path.join(__dirname,'fixtures/search-providers.cjs'),'next/navigation':path.join(__dirname,'fixtures/search-navigation.cjs'),'next/link':path.join(__dirname,'fixtures/tracker-next-link.cjs'),'next-auth/react':path.join(__dirname,'fixtures/tracker-session.cjs'),'@':root}},
      module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(__dirname,'fixtures/workflow-editor-loader.cjs')}]},
    });
    compiler.run((error,stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({all:false,errors:true}))) : resolve()));
  });
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.endsWith('.js')) {res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(output,path.basename(url.pathname))));return;}
    if (url.pathname.startsWith('/api/')) {
      requests.push(url.pathname+url.search);
      if (['/api/email-log','/api/trash'].includes(url.pathname)) {
        const email = url.pathname === '/api/email-log';
        const items = Array.from({length:305},(_,index)=>email
          ? {_id:'E'+index,type:'custom',subject:'Message '+index,clientName:'Company '+index,to:['recipient@example.com'],financialYear:'2025-26',sentAt:'2025-10-01T10:00:00Z',status:'Sent'}
          : {_id:'D'+index,recordType:'billing',label:'Deleted record '+index,subLabel:'Billing',deletedAt:'2026-10-01T10:00:00Z',deletedBy:'Fixture',data:{}});
        const search = (url.searchParams.get('search') || '').toLowerCase();
        const filtered = items.filter(item=>!search || String(email?item.subject:item.label).toLowerCase().includes(search));
        const offset=Number(url.searchParams.get('offset') || 0);
        const body={items:filtered.slice(offset,offset+200),hasMore:offset+200<filtered.length,nextOffset:offset+200<filtered.length?offset+200:null};
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return;
      }
      const data = url.pathname === '/api/clients' ? clients : url.pathname === '/api/financial-year' ? records : url.pathname === '/api/billing' ? bills : url.pathname === '/api/payments' ? []
        : url.pathname === '/api/credit-transactions' ? [{_id:'T1',financialYear:'2025-26',fromClientId:'C128',toClientId:'C129',creditType:'Recycling',notes:'ledger-marker',totalAmount:100,date:'2025-10-01',cat1:5}]
        : url.pathname === '/api/upload-records' ? [128,129].map(index => ({_id:'U'+index,clientId:'C'+index,financialYear:'2025-26',uploadType:index===128?'sale':'purchase',cat1:1,cat2:0,cat3:0,cat4:0,invoiceCount:1,createdAt:'2025-10-01'}))
        : url.pathname === '/api/annual-return' ? [128,129].map(index=>({_id:'AR'+index,clientId:'C'+index,financialYear:'2025-26',status:index===128?'Pending':'Filed',updatedAt:'2025-10-01',client:{companyName:clients[index].companyName,category:clients[index].category,state:'Gujarat',contacts:[]}}))
        : url.pathname === '/api/persons' ? [{_id:'P1',name:'Person Needle',phoneNumbers:['98765 43210'],emails:['needle@company.example'],createdAt:'2025-10-01'},{_id:'P2',name:'Person Other',phoneNumbers:['1111111111'],emails:['other@example.com'],createdAt:'2025-10-01'}]
        : url.pathname === '/api/contacts' ? [] : [];
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  let browser,page;
  try {
    browser = await puppeteer.launch({executablePath,headless:true,userDataDir:fs.mkdtempSync(path.join(output,'profile-')),args:['--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check']});
    page = await browser.newPage(); await page.setViewport({width:1400,height:1000});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const visit = async screen => {await page.goto(`http://127.0.0.1:${server.address().port}/?screen=${screen}`);};
    const fill = async (selector,text) => {await page.focus(selector);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await page.type(selector,text);};
    const waitText = async text => page.waitForFunction(text=>document.body.innerText.includes(text),{},text);
    for (const [screen,selector,queries,expected,excluded] of [
      ['financial','input[placeholder="Search by client name, ID or category..."]',['9876543210','needle@company','Legal 128','Custom Region West','C128'],'Needle Corporation','Company 129'],
      ['billing','input[placeholder="Search clients..."]',['9876543210','Person 128','Service Alpha'],'Needle Corporation','Company 129'],
      ['uploads','input[placeholder="Search by client name, ID, sale, or purchase..."]',['9876543210','needle@company','Sale'],'Needle Corporation','Company 129'],
      ['credits','input[placeholder="Search by client name, ID, type, or date…"]',['9876543210','contact-129@example.com','ledger-marker'],'Needle Corporation',null],
      ['contacts','input[placeholder="Search by name, phone, or email..."]',['9876543210','NEEDLE@COMPANY'],'Person Needle','Person Other'],
      ['annual','input[placeholder="Search company name…"]',['9876543210','Needle Corporation','Custom Region West'],'Needle Corporation','Company 129'],
      ['audience','input[aria-label="Search clients"]',['9876543210','Custom Region West'],'Needle Corporation','Company 129'],
      ['configure','input[aria-label="Search tracker clients"]',['9876543210','Person 128'],'Needle Corporation','Company 129'],
    ]) {
      await visit(screen);await page.waitForSelector(selector);await page.waitForNetworkIdle({idleTime:200});const before=requests.length;
      for (const query of queries) {
        await fill(selector,query);await waitText(expected);
        if (excluded) await page.waitForFunction(text=>!document.body.innerText.includes(text),{},excluded);
        assert.equal(requests.length,before,screen+' typing must not request');
      }
      await new Promise(resolve=>setTimeout(resolve,400));assert.equal(requests.length,before,screen+' must not schedule a delayed request');
      await fill(selector,'no-such-result-xyz');await page.waitForFunction(text=>!document.body.innerText.includes(text),{},expected);
      await fill(selector,'');
      if (!['audience','configure'].includes(screen)) await waitText(expected);
      assert.equal(requests.length,before,screen+' clearing must not request');
      if (['credits','annual'].includes(screen)) {
        const clickFilter = async label => page.evaluate(label => {
          const button=Array.from(document.querySelectorAll('button.glass-pill')).find(node=>node.textContent.trim()===label);
          if(!button) throw Error('Missing filter '+label);
          button.click();
        },label);
        await fill(selector,'9876543210');await waitText(expected);
        await clickFilter(screen==='credits'?'E.O.L':'Filed');
        await page.waitForFunction(text=>!document.body.innerText.includes(text),{},expected);
        await clickFilter(screen==='credits'?'Recycling':'Not Started');await waitText(expected);
        await new Promise(resolve=>setTimeout(resolve,400));
        assert.equal(requests.length,before,screen+' local type/status AND text filters must not request');
        console.log('PASS: '+screen+' type/status filters compose with client text immediately and without requests');
      }
      console.log('PASS: '+screen+' production component local matching, clearing and zero text requests');
    }
    for (const [screen,selector,last,query] of [
      ['email','input[placeholder="Search by subject, client, recipient, or FY…"]','Message 304','Message 304'],
      ['trash','input[placeholder="Search deleted records…"]','Deleted record 304','Deleted record 304'],
    ]) {
      await visit(screen);await page.waitForSelector(selector);await page.waitForNetworkIdle({idleTime:200});
      await fill(selector,query);await waitText(last);
      assert(requests.some(url=>url.includes('search='+encodeURIComponent(query).replace(/%20/g,'+'))),'Remote text is included in the request key');
      await fill(selector,'');await page.waitForNetworkIdle({idleTime:400});
      await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await waitText(last);
      assert(requests.some(url=>url.includes(screen==='email'?'/api/email-log?':'/api/trash?')&&url.includes('offset=200')),'Continuation page is fetched');
      console.log('PASS: '+screen+' remote matching beyond initial 200 and scroll continuation without new controls');
    }
    await visit('cache');await page.waitForFunction(()=>window.pendingSearchReads.length===1);
    await page.evaluate(()=>window.cacheControls.next('B'));await page.waitForFunction(()=>window.pendingSearchReads.length===2);
    await page.evaluate(()=>window.pendingSearchReads[1].complete('latest-B'));await waitText('latest-B');
    await page.evaluate(()=>window.pendingSearchReads[0].complete('stale-A'));await new Promise(resolve=>setTimeout(resolve,50));
    assert((await page.$eval('#cache-result',node=>node.textContent)).includes('latest-B'));
    await page.evaluate(()=>{window.cacheControls.next('C');});await page.waitForFunction(()=>window.pendingSearchReads.length===3);
    await page.evaluate(()=>window.cacheControls.mutate({value:'optimistic-C'}));await waitText('optimistic-C');
    await page.evaluate(()=>window.pendingSearchReads[2].complete('stale-C'));await new Promise(resolve=>setTimeout(resolve,50));
    assert((await page.$eval('#cache-result',node=>node.textContent)).includes('optimistic-C'));
    console.log('PASS: useCache reverse completion and optimistic update races');
    assert.deepEqual(errors,[]);
  } catch(error) {if(page) console.error('Fixture page:',(await page.$eval('body',node=>node.innerText)).slice(0,2500));throw error;}
  finally {if(browser) await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
