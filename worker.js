// The document stays in this worker. Numeric tokens are never converted to Number.
const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const ws = c => c === ' ' || c === '\n' || c === '\r' || c === '\t';
function fail(message, pos) { const e = new Error(message); e.pos = pos; throw e; }
export function token(text, offset) {
  let p=offset; while(ws(text[p]))p++;
  const start=p, c=text[p];
  if(p>=text.length)return {kind:'eof',start,end:p};
  if('{}[],:'.includes(c))return {kind:c,start,end:p+1};
  if(c==='"') {
    p++;
    while(p<text.length) {
      const code=text.charCodeAt(p);
      if(code===34)return {kind:'string',start,end:p+1};
      if(code<32)fail('Unescaped control character in string',p);
      if(code===92) {
        p++; const escape=text[p];
        if(escape==='u') { for(let k=1;k<=4;k++)if(!/[0-9a-fA-F]/.test(text[p+k]||'!'))fail('Expected four hexadecimal digits after \\u',p); p+=4; }
        else if(!escape || !'"\\/bfnrt'.includes(escape))fail('Invalid string escape',p);
      }
      p++;
    }
    fail('Unterminated string',start);
  }
  for(const word of ['true','false','null'])if(text.startsWith(word,p))return {kind:word,start,end:p+word.length};
  number.lastIndex=p; const match=number.exec(text);
  if(match)return {kind:'number',start,end:number.lastIndex};
  fail(`Unexpected character ${JSON.stringify(c)}`,p);
}
export function validate(text) {
  const stack=[{type:'root',state:'value'}]; let p=0, tokens=0, maxDepth=0, root;
  while(true) {
    const t=token(text,p), f=stack.at(-1); p=t.end;
    if(!root)root=t;
    if(t.kind==='eof') { if(stack.length===1&&f.state==='end')return {root:describe(text,root.start,text.length),tokens,maxDepth}; fail('Unexpected end of JSON',t.start); }
    tokens++;
    if(f.type==='object' && (f.state==='keyOrEnd'||f.state==='key')) {
      if(t.kind==='}'&&f.state==='keyOrEnd'){stack.pop();continue;}
      if(t.kind!=='string')fail('Expected a quoted property name',t.start);
      f.state='colon';continue;
    }
    if(f.state==='colon') { if(t.kind!==':')fail('Expected : after property name',t.start);f.state='value';continue; }
    if(f.state==='commaOrEnd') {
      const close=f.type==='object'?'}':']';
      if(t.kind===close){stack.pop();continue;}
      if(t.kind!==',')fail(`Expected , or ${close}`,t.start);
      f.state=f.type==='object'?'key':'value';continue;
    }
    if(f.type==='array'&&f.state==='valueOrEnd'&&t.kind===']'){stack.pop();continue;}
    if(f.state==='end')fail('Unexpected content after the JSON value',t.start);
    if(!['value','valueOrEnd'].includes(f.state))fail('Expected a JSON value',t.start);
    f.state=f.type==='root'?'end':'commaOrEnd';
    if(t.kind==='{'||t.kind==='[') {
      stack.push({type:t.kind==='{'?'object':'array',state:t.kind==='{'?'keyOrEnd':'valueOrEnd'});
      maxDepth=Math.max(maxDepth,stack.length-1);
    } else if(!['string','number','true','false','null'].includes(t.kind))fail('Expected a JSON value',t.start);
  }
}
function valueEnd(text,start) {
  let t=token(text,start), depth=0;
  if(t.kind!=='{'&&t.kind!=='[')return t.end;
  do { if(t.kind==='{'||t.kind==='[')depth++;if(t.kind==='}'||t.kind===']')depth--; if(!depth)return t.end;t=token(text,t.end);if(t.kind==='eof')fail('Unexpected end',t.start); }while(true);
}
export function describe(text,start,end) {
  const t=token(text,start), kind=t.kind;
  const type=kind==='{'?'object':kind==='['?'array':kind==='true'||kind==='false'?'boolean':kind;
  return {start:t.start,end,type,preview:type==='object'?'{ … }':type==='array'?'[ … ]':text.slice(t.start,Math.min(end,t.start+160))+(end-t.start>160?'…':'')};
}
export function children(text,start,cursor=null,index=0,limit=100) {
  const first=token(text,start), object=first.kind==='{';
  let p=cursor??first.end; const rows=[];
  while(rows.length<limit) {
    let t=token(text,p);
    if(t.kind==='}'||t.kind===']')return {rows,next:null,index};
    if(t.kind===',')t=token(text,t.end);
    let key=String(index);
    if(object){key=JSON.parse(text.slice(t.start,t.end));t=token(text,token(text,t.end).end);}
    const end=valueEnd(text,t.start);
    rows.push({...describe(text,t.start,end),key,index}); index++;p=end;
  }
  const next=token(text,p);
  return {rows,next:next.kind===','?p:null,index};
}
export function formatJSON(text,indent='  ') {
  validate(text);
  let p=0, depth=0, previous='', chunk='', parts=[], written=0;
  const write=s=>{written+=s.length;if(written>100*1024*1024)throw new Error('Formatted output exceeds 100 MB. Try fewer indentation spaces or Minify.');chunk+=s;if(chunk.length>65536){parts.push(chunk);chunk='';}};
  const newline=()=>write('\n'+indent.repeat(depth));
  while(true){
    const t=token(text,p);if(t.kind==='eof')break;p=t.end;
    const raw=text.slice(t.start,t.end),k=t.kind;
    if(!indent){write(raw);continue;}
    if(k==='{'||k==='['){write(raw);depth++;const next=token(text,p);if(next.kind!=='}'&&next.kind!==']')newline();}
    else if(k==='}'||k===']'){depth--;if(previous!=='{'&&previous!=='[')newline();write(raw);}
    else if(k===','){write(',');newline();}
    else if(k===':')write(': ');
    else write(raw);
    previous=k;
  }
  parts.push(chunk);return parts.join('');
}
let source='';
const EDIT_LIMIT=5*1024*1024, PREVIEW=200000;
function snapshot(meta) { return {...meta,text:source.slice(0,source.length>EDIT_LIMIT?PREVIEW:source.length),large:source.length>EDIT_LIMIT,length:source.length,bytes:new Blob([source]).size}; }
export async function handle(m) {
  if(m.action==='load') {
    if(m.file&&m.file.size>100*1024*1024)throw new Error('This browser tool supports files up to 100 MB.');
    source=(m.file?await m.file.text():m.text).replace(/^\uFEFF/,'');
    const meta=validate(source);return snapshot(meta);
  }
  if(m.action==='value'){if(m.end-m.start>EDIT_LIMIT)throw new Error('This value is too large to edit here (5 MB limit).');return {text:source.slice(m.start,m.end)};}
  if(m.action==='children')return children(source,m.start,m.cursor,m.index);
  if(m.action==='format'){source=formatJSON(source,m.indent);return snapshot(validate(source));}
  if(m.action==='download')return {blob:new Blob([source],{type:'application/json'})};
  if(m.action==='copy')return {text:source};
  if(m.action==='replace') {
    validate(m.text);const candidate=source.slice(0,m.start)+m.text+source.slice(m.end);
    const meta=validate(candidate);source=candidate;return snapshot(meta);
  }
  if(m.action==='search') {
    const at=source.toLowerCase().indexOf(m.query.toLowerCase(),m.start||0);
    return {at,context:at<0?'':source.slice(Math.max(0,at-60),at+180)};
  }
  throw new Error('Unknown action');
}
if(typeof self!=='undefined')self.onmessage=async ({data:m})=>{
  try{self.postMessage({id:m.id,result:await handle(m)});}
  catch(e){let line=1,column=1;if(e.pos!==undefined){for(let i=0;i<e.pos;i++){if(source[i]==='\n'){line++;column=1;}else column++;}}self.postMessage({id:m.id,error:e.message,pos:e.pos,line,column});}
};
