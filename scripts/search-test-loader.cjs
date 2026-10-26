const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
module.exports = function createLoader(mocks = {}, sourceOverrides = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, loaded);
    loaded.require = request => {
      if (Object.hasOwn(mocks, request)) return mocks[request];
      if (request.startsWith('@/') || request.startsWith('.')) {
        const base = request.startsWith('@/') ? path.join(root, request.slice(2)) : path.resolve(path.dirname(filename), request);
        const resolved = [base, base + '.ts', base + '.tsx', base + '.js'].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (resolved && /\.tsx?$/.test(resolved)) return load(resolved);
        if (resolved) return require(resolved);
      }
      return Module.createRequire(filename)(request);
    };
    const relative = path.relative(root, filename).replaceAll('\\', '/');
    const source = sourceOverrides[relative] ?? fs.readFileSync(filename, 'utf8');
    loaded._compile(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, fileName: filename }).outputText, filename);
    return loaded.exports;
  }
  return load;
};
