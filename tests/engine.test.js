import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,formatJSON,children,handle} from '../worker.js';
test('accepts all JSON root types and nested documents',()=>{
  for(const text of ['null','42','-0','true','false','"hello"','[]','{}','{"a":[1,{"b":false}],"empty":{}}','  \r\n [1,2]\t '])assert.doesNotThrow(()=>validate(text));
});
test('rejects malformed JSON with exact offsets',()=>{
  for(const text of ['', ' ', '{a:1}', '{"a":}', '[1,]', '{"a":1,}', '01', '1.', '1e', 'true false','"bad\nescape"','"\\x"','"\\u000Z"','[}', '{"a" 2}', 'NaN','undefined','{"a": [1}'])assert.throws(()=>validate(text),Error,text);
  assert.throws(()=>validate('{"a":}'),e=>e.pos===5);
});
test('formatter preserves numeric lexemes, duplicate keys and strings',()=>{
  const text=' {"id":9007199254740993123456789,"n":-0,"x":1.2300e+400,"a":1,"a":2,"s":"hi \\u0061 \\""} ';
  const compact=formatJSON(text,'');assert.equal(compact,text.trim());assert.equal(formatJSON(formatJSON(text),'') ,compact);
  assert.equal(formatJSON('{"a":[1,true],"b":{}}','  '),'{\n  "a": [\n    1,\n    true\n  ],\n  "b": {}\n}');
});
test('lazy tree paginates and retains exact offsets',()=>{
  const text=JSON.stringify({items:Array.from({length:251},(_,i)=>({id:i})), '__proto__':'safe'});
  const top=children(text,0);assert.equal(top.rows[0].key,'items');
  const a=children(text,top.rows[0].start);assert.equal(a.rows.length,100);assert.equal(a.rows[99].index,99);
  const b=children(text,top.rows[0].start,a.next,a.index);assert.equal(b.rows[0].index,100);
  const c=children(text,top.rows[0].start,b.next,b.index);assert.equal(c.rows.length,51);assert.equal(c.next,null);
  const inner=children(text,c.rows[0].start);assert.equal(text.slice(inner.rows[0].start,inner.rows[0].end),'200');
});
test('handles deep trees without recursive stack overflow',()=>{
 const text='['.repeat(12000)+'0'+']'.repeat(12000);assert.equal(validate(text).maxDepth,12000);assert.equal(children(text,0).rows.length,1);
});
test('validates and minifies a 25 MB document',()=>{
 const text='[\n'+Array(25000).fill('"'+'x'.repeat(1000)+'"').join(',\n')+'\n]';
 assert.ok(text.length>25e6);assert.equal(validate(text).root.type,'array');const out=formatJSON(text,'');assert.equal(out.length,text.length-25001);assert.equal(children(text,0).rows.length,100);
});

test('large-file worker lifecycle keeps full source for edits, search and download',async()=>{
 const text='{"id":9007199254740993123456789,"padding":"'+'x'.repeat(6*1024*1024)+'","tail":"finish"}';
 const loaded=await handle({action:'load',file:{size:text.length,text:async()=>text}});
 assert.equal(loaded.large,true);assert.equal(loaded.text.length,200000);
 const tree=await handle({action:'children',start:0});
 const id=tree.rows[0];await handle({action:'replace',start:id.start,end:id.end,text:'9007199254740993123456788'});
 const found=await handle({action:'search',query:'finish',start:0});assert.ok(found.at>6*1024*1024);
 await handle({action:'format',indent:'  '});const {blob}=await handle({action:'download'});
 const saved=await blob.text();assert.ok(saved.includes('9007199254740993123456788'));assert.ok(saved.endsWith('"finish"\n}'));
 await assert.rejects(handle({action:'load',file:{size:101*1024*1024}}),/up to 100 MB/);
});
