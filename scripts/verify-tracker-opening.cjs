/* Focused regressions use task-owned output. Existing historical fixtures and
 * screenshots are never overwritten; successful disposable output is removed. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nextgen-tracker-opening-'));
const all = process.argv.includes('--all');
const tests = all ? [
  ['verify-tracker-sync.cjs'], ['verify-tracker-linked-data.cjs'], ['verify-tracker-editing-routes.cjs'],
  ['verify-tracker-search.cjs'], ['verify-tracker-search.cjs', 'opening'],
  ['verify-tracker-editing.cjs'], ['verify-tracker-editing.cjs', 'productivity'], ['verify-tracker-navigation.cjs'],
] : [['verify-tracker-search.cjs', 'opening']];
let success = false;
try {
  for (const [name, mode] of tests) {
    const bootstrap = `
      const fs=require('fs'),path=require('path'),Module=require('module');
      const root=${JSON.stringify(root)},output=${JSON.stringify(temporary)};
      const file=path.join(root,'scripts',${JSON.stringify(name)});
      const original=fs.readFileSync(file,'utf8');
      const script=original.replace(/path.join\\(root,\\s*(['\"])(tmp\\/tracker-(?:search-tests|editing-tests|navigation-tests))\\1/g,
        (_match,_quote,name)=>'path.join('+JSON.stringify(output)+','+JSON.stringify(name));
      const makeTemporary=fs.mkdtempSync;fs.mkdtempSync=(prefix,...args)=>{
        if(!path.basename(prefix).startsWith('profile-'))return makeTemporary(prefix,...args);
        const profile=path.join(output,'browser-profile');fs.mkdirSync(profile,{recursive:true});return profile;
      };
      if(${JSON.stringify(mode)}==='opening')process.env.TRACKER_OPENING_ONLY='1';
      if(${JSON.stringify(mode)}==='productivity')process.argv.push('--productivity');
      const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));loaded._compile(script,file);
    `;
    const result = spawnSync(process.execPath, ['-e', bootstrap], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`${name} ${mode || ''} failed (${result.status})`);
  }
  success = true;
} finally {
  if (success) {
    const resolved = fs.realpathSync(temporary), parent = fs.realpathSync(os.tmpdir());
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('nextgen-tracker-opening-')) throw Error('Temporary cleanup scope mismatch');
    fs.rmSync(resolved, { recursive: true });
    console.log('PASS: closed test browsers; removed only this run’s disposable fixtures/profiles.');
  } else console.error('Failure evidence retained at ' + temporary);
}
