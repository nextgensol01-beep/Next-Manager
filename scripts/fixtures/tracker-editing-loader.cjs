const transpile = require('./workflow-editor-loader.cjs');
module.exports = function(source) {
  if (this.resourcePath.replaceAll('\\', '/').endsWith('/page.tsx')) {
    source = source.replace('const value = entry.values[field.key];',
      'globalThis.trackerEditorRenders = (globalThis.trackerEditorRenders || 0) + 1; const value = entry.values[field.key];');
  }
  return transpile.call(this, source);
};
