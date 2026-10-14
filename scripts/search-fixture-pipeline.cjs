const at = (record, key) => key.split('.').reduce((value, part) => Array.isArray(value) && !/^\d+$/.test(part) ? value.flatMap(item => item?.[part] ?? []) : value?.[part], record);
function expr(value, row, vars = {}) {
  if (typeof value === 'string') return value.startsWith('$$') ? at(vars, value.slice(2)) : value.startsWith('$') ? at(row, value.slice(1)) : value;
  if (Array.isArray(value)) return value.map(item => expr(item,row,vars));
  if (!value || typeof value !== 'object') return value;
  if ('$ifNull' in value) { const [a,b] = value.$ifNull; return expr(a,row,vars) ?? expr(b,row,vars); }
  if ('$eq' in value) { const [a,b] = expr(value.$eq,row,vars); return a === b; }
  if ('$ne' in value) { const [a,b] = expr(value.$ne,row,vars); return a !== b; }
  if ('$in' in value) { const [a,b] = expr(value.$in,row,vars); return b.includes(a); }
  if ('$and' in value) return expr(value.$and,row,vars).every(Boolean);
  if ('$toLower' in value) return String(expr(value.$toLower,row,vars) || '').toLowerCase();
  if ('$trim' in value) return String(expr(value.$trim.input,row,vars)).trim();
  if ('$convert' in value) { const v = expr(value.$convert.input,row,vars); return v && /^[a-f0-9]{24}$/i.test(v) ? v : null; }
  if ('$map' in value) return expr(value.$map.input,row,vars).map(item => expr(value.$map.in,row,{...vars,[value.$map.as]:item}));
  if ('$setIntersection' in value) { const [a,b] = expr(value.$setIntersection,row,vars); return [...new Set(a)].filter(item => b.includes(item)); }
  throw Error('Unknown fixture expression ' + JSON.stringify(value));
}
function matches(row, query, vars) {
  return Object.entries(query).every(([key,value]) => {
    if (key === '$or') return value.some(condition => matches(row,condition,vars));
    if (key === '$and') return value.every(condition => matches(row,condition,vars));
    if (key === '$expr') return expr(value,row,vars);
    const actual = at(row,key);
    if (value instanceof RegExp) return value.test(String(actual ?? ''));
    if (value?.$ne !== undefined) return actual !== value.$ne;
    if (value?.$exists !== undefined) return (actual !== undefined) === value.$exists;
    if (value?.$in) return value.$in.includes(actual);
    if (value?.$regex !== undefined) return [actual].flat().some(text => typeof text === 'string' && new RegExp(value.$regex,value.$options).test(text));
    return actual === value;
  });
}
function pipeline(rows, stages, db, vars = {}) {
  for (const stage of stages) {
    if (stage.$match) rows = rows.filter(row => matches(row,stage.$match,vars));
    else if (stage.$lookup) rows = rows.map(row => {
      const spec = stage.$lookup;
      const source = db[spec.from].filter(other => !spec.localField || at(row,spec.localField) === at(other,spec.foreignField));
      const bindings = {...vars,...Object.fromEntries(Object.entries(spec.let || {}).map(([key,value]) => [key,expr(value,row,vars)]))};
      return {...row,[spec.as]:pipeline(source,spec.pipeline || [],db,bindings)};
    });
    else if (stage.$unwind) rows = rows.flatMap(row => (at(row,stage.$unwind.slice(1)) || []).map(item => ({...row,[stage.$unwind.slice(1)]:item})));
    else if (stage.$set) rows = rows.map(row => ({...row,...Object.fromEntries(Object.entries(stage.$set).map(([key,value]) => [key,expr(value,row,vars)]))}));
    else if (stage.$limit) rows = rows.slice(0,stage.$limit);
    else if (stage.$skip !== undefined) rows = rows.slice(stage.$skip);
    else if (stage.$count) rows = rows.length ? [{[stage.$count]:rows.length}] : [];
    else if (stage.$sort) rows = [...rows].sort((a,b) => { for (const [key,direction] of Object.entries(stage.$sort)) { const x=at(a,key),y=at(b,key); if(x<y)return -direction; if(x>y)return direction; } return 0; });
    else if (stage.$facet) rows = [Object.fromEntries(Object.entries(stage.$facet).map(([key,stages]) => [key,pipeline(rows,stages,db,vars)]))];
    else if (stage.$group && !rows.length) rows = [];
    else if (stage.$unset) rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => ![stage.$unset].flat().includes(key))));
    else if (stage.$project) rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => stage.$project[key])));
    else throw Error('Unknown fixture stage ' + Object.keys(stage));
  }
  return rows;
}

module.exports = {pipeline,matches};
