const $=id=>document.getElementById(id);
const sample={project:'JSON Studio',description:'A little clarity for your JSON.',version:'1.0.0',settings:{theme:'light',indentSize:2,autosave:false},features:['Format & minify','Explore your data','Edit with confidence'],privacy:{localOnly:true,serverUploads:null},limits:{maxFileSize:'100 MB',largeFileMode:true}};
let worker=new Worker('./worker.js',{type:'module'}), sequence=0, pending=new Map(), revision=0, timer, current=null, filename='example.json', dirty=false, selected=null, searchAt=0, searchQuery='', busy=false, totalLines=1;
worker.onmessage=({data:m})=>{const item=pending.get(m.id);if(!item)return;pending.delete(m.id);m.error?item.reject(m):item.resolve(m.result);};
worker.onerror=()=>{for(const item of pending.values())item.reject({error:'The background worker stopped. Reload this page to restart.'});pending.clear();};
function ask(action,data={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,...data});});}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,2800);}
function size(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';}
function setDirty(value){dirty=value;$('dirty').hidden=!value;}
function lock(value){busy=value;for(const id of ['format','minify','validate','copy','download','upload','sample','clear','indent','search','find','collapse'])$(id).disabled=value;$('editor').readOnly=value||!!current?.large;}
function status(message,error=false){$('validation').textContent=(error?'×  ':'✓  ')+message;$('validation').style.color=error?'#bd6262':'#4a967b';}
function errorView(e){current=null;$('notice').hidden=false;$('notice').textContent=e.pos!==undefined?`${e.error} · Line ${e.line}, column ${e.column}`:e.error||String(e);status('Invalid JSON',true);$('tree').replaceChildren();emptyTree('Fix the JSON in the editor to explore its structure.');for(const id of ['node-stat','depth-stat'])$(id).textContent='';}
function emptyTree(message){const el=document.createElement('div');el.className='empty';const icon=document.createElement('b');icon.textContent='{ }';el.append(icon,document.createTextNode(message));$('tree').append(el);}
function refreshGutter(){const top=$('editor').scrollTop,first=Math.max(0,Math.floor(top/23));const count=Math.ceil($('editor').clientHeight/23)+2;$('line-numbers').textContent=Array.from({length:Math.min(count,Math.max(0,totalLines-first))},(_,i)=>first+i+1).join('\n');$('line-numbers').style.paddingTop=(18-(top%23))+'px';}
function updateLines(){totalLines=1;for(const c of $('editor').value)if(c==='\n')totalLines++;refreshGutter();cursor();}
function cursor(){const editor=$('editor'),at=editor.selectionStart;const before=editor.value.slice(0,at);const lines=before.match(/\n/g);$('cursor').textContent=`Ln ${(lines?.length||0)+1}, Col ${at-before.lastIndexOf('\n')}`;}
function render(result,replaceText=true){
  current=result;$('notice').hidden=true;$('large-banner').hidden=!result.large;$('editor-mode').textContent=result.large?'Large file mode':'JSON';$('editor').readOnly=result.large||busy;
  if(replaceText){$('editor').value=result.text;$('editor').scrollTop=0;updateLines();}
  $('filename').textContent=filename;$('file-size').textContent=size(result.bytes);$('node-stat').textContent=result.tokens.toLocaleString()+' tokens';$('depth-stat').textContent='Depth '+result.maxDepth;$('char-stat').textContent=result.length.toLocaleString()+' characters';status('Valid JSON');$('tree').replaceChildren();$('search-result').hidden=true;searchAt=0;selected=null;$('selected-path').textContent='$';const r=makeNode({...result.root,key:'$',index:0},'$',true);$('tree').append(r.element);if(r.expandable)r.toggle();
}
async function load(text,{file,name,modified=false}={}){
  clearTimeout(timer);const version=++revision;lock(true);status(file?'Reading and validating file…':'Validating…');
  if(name)filename=name;
  if(text!==undefined){$('editor').value=text;updateLines();}
  try{const result=await ask('load',file?{file}:{text});if(version!==revision)return;setDirty(modified);render(result);}
  catch(e){if(version===revision){if(file){$('editor').value='';updateLines();$('filename').textContent=filename;}errorView(e);}}
  finally{lock(false);}
}
function pathFor(path,node,array){return array?`${path}[${node.index}]`:`${path}[${JSON.stringify(node.key)}]`;}
function makeNode(node,path,isRoot=false){
  const element=document.createElement('div');element.className='tree-item';element.setAttribute('role','treeitem');
  const row=document.createElement('div');row.className='node-row';const toggleButton=document.createElement('button');toggleButton.className='toggle';
  const expandable=node.type==='object'||node.type==='array';toggleButton.textContent=expandable?'▸':'·';toggleButton.disabled=!expandable;toggleButton.setAttribute('aria-label',`Expand ${node.key}`);
  const key=document.createElement('span');key.className='node-key';key.textContent=node.key;key.title=node.key;
  const colon=document.createElement('span');colon.className='colon';colon.textContent=':';
  const value=document.createElement('button');value.className='node-value '+node.type;value.textContent=node.preview;value.title=expandable?'Expand container':'Edit value';
  const type=document.createElement('span');type.className='node-type';type.textContent=node.type;
  row.append(toggleButton,key,colon,value,type);element.append(row);
  const group=document.createElement('div');group.className='node-children';group.hidden=true;group.setAttribute('role','group');element.append(group);let loaded=false,open=false;
  const version=revision;
  async function page(cursor=null,index=0){
    const loading=document.createElement('span');loading.textContent='Loading…';loading.className='muted';group.append(loading);
    try{const result=await ask('children',{start:node.start,cursor,index});loading.remove();if(version!==revision)return;for(const child of result.rows){const childPath=pathFor(path,child,node.type==='array');group.append(makeNode(child,childPath).element);}if(result.next!==null){const more=document.createElement('button');more.className='more';more.textContent='Show next 100…';more.onclick=()=>{more.remove();page(result.next,result.index);};group.append(more);}if(!result.rows.length&&cursor===null){const empty=document.createElement('span');empty.className='muted';empty.textContent='Empty '+node.type;group.append(empty);}}
    catch(e){loading.textContent=e.error||'Unable to load children';}
  }
  async function toggle(){if(version!==revision)return;open=!open;group.hidden=!open;toggleButton.textContent=open?'▾':'▸';element.setAttribute('aria-expanded',String(open));toggleButton.setAttribute('aria-label',`${open?'Collapse':'Expand'} ${node.key}`);if(open&&!loaded){loaded=true;await page();}}
  toggleButton.onclick=toggle;
  value.onclick=async()=>{
    if(version!==revision||busy)return;$('selected-path').textContent=path;
    if(expandable){toggle();return;}
    // Values can be bigger than the preview: request the original range, never the abbreviated display.
    selected={...node,path};$('edit-path').textContent=path;$('edit-error').textContent='';
    const data=await ask('value',{start:node.start,end:node.end}).catch(e=>{toast(e.error);return null;});
    if(!data||version!==revision)return;$('value-editor').value=data.text;$('edit-dialog').showModal();$('value-editor').focus();
  };
  return {element,toggle,expandable};
}
async function operation(action,data={}){
  if(busy)return;clearTimeout(timer);const previous=current;lock(true);const version=++revision;status('Working…');
  try{
    if(!current){const result=await ask('load',{text:$('editor').value});current=result;}
    const result=action==='validate'?await ask('load',{text:$('editor').value}):await ask(action,data);
    if(version!==revision)return;render(result);if(action!=='validate')setDirty(true);else toast('JSON is valid');
  }catch(e){if(previous){render(previous);$('notice').hidden=false;$('notice').textContent=e.error||String(e);}else errorView(e);}finally{lock(false);}
}
$('editor').addEventListener('input',()=>{
  setDirty(true);current=null;++revision;clearTimeout(timer);$('tree').replaceChildren();emptyTree('Checking your changes…');updateLines();status('Checking…');
  const version=revision;timer=setTimeout(async()=>{try{const result=await ask('load',{text:$('editor').value});if(version===revision)render(result,false);}catch(e){if(version===revision)errorView(e);}},500);
});
$('editor').addEventListener('scroll',refreshGutter);$('editor').addEventListener('click',cursor);$('editor').addEventListener('keyup',cursor);window.addEventListener('resize',refreshGutter);
$('editor').addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey&&!$('editor').readOnly){e.preventDefault();const t=$('editor'),space=$('indent').value==='tab'?'\t':' '.repeat(Number($('indent').value));t.setRangeText(space,t.selectionStart,t.selectionEnd,'end');t.dispatchEvent(new Event('input'));}});
$('upload').onclick=()=>$('file').click();
async function openFile(file){if(!file)return;if(file.size>100*1024*1024){toast('Choose a JSON file up to 100 MB.');return;}await load(undefined,{file,name:file.name});}
$('file').onchange=()=>{openFile($('file').files[0]);$('file').value='';};
$('sample').onclick=()=>load(JSON.stringify(sample,null,2),{name:'example.json'});
$('clear').onclick=()=>load('{}',{name:'untitled.json',modified:true});
$('format').onclick=()=>operation('format',{indent:$('indent').value==='tab'?'\t':' '.repeat(Number($('indent').value))});
$('minify').onclick=()=>operation('format',{indent:''});
$('validate').onclick=async()=>{if(current?.large){status('Valid JSON');toast('Complete file is valid JSON');return;}await operation('validate');};
async function sync(){clearTimeout(timer);if(!current){const result=await ask('load',{text:$('editor').value});render(result,false);}return current;}
$('copy').onclick=async()=>{try{await sync();if(current.large){toast('Use Download for files over 5 MB.');return;}const result=await ask('copy');await navigator.clipboard.writeText(result.text);toast('JSON copied to clipboard');}catch(e){toast(e.error||'Clipboard unavailable. Select the source and copy it.');}};
$('download').onclick=async()=>{try{await sync();const {blob}=await ask('download');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename.replace(/\.[^.]+$/,'')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setDirty(false);toast('JSON downloaded');}catch(e){errorView(e);}};
$('collapse').onclick=()=>{if(!current)return;$('tree').replaceChildren();$('tree').append(makeNode({...current.root,key:'$',index:0},'$',true).element);};
async function find(){
  const query=$('search').value;if(!query){$('search-result').hidden=true;return;}
  try{await sync();if(query!==searchQuery){searchAt=0;searchQuery=query;}let result=await ask('search',{query,start:searchAt});if(result.at<0&&searchAt){result=await ask('search',{query,start:0});}searchAt=result.at<0?0:result.at+query.length;$('search-result').hidden=false;$('search-result').textContent=result.at<0?'No matches found':`Character ${result.at.toLocaleString()}: …${result.context}…`;if(result.at>=0&&result.at+query.length<=$('editor').value.length){$('editor').focus();$('editor').setSelectionRange(result.at,result.at+query.length);const line=$('editor').value.slice(0,result.at).split('\n').length;$('editor').scrollTop=(line-4)*23;refreshGutter();cursor();}}
  catch(e){toast(e.error||'Fix the JSON before searching.');}
}
$('find').onclick=find;$('search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find();}};$('search').oninput=()=>{searchAt=0;if(!$('search').value)$('search-result').hidden=true;};
$('close-dialog').onclick=$('cancel-edit').onclick=()=>$('edit-dialog').close();
$('edit-form').onsubmit=async e=>{e.preventDefault();if(!selected)return;const button=$('edit-form').querySelector('[type=submit]');button.disabled=true;try{const result=await ask('replace',{start:selected.start,end:selected.end,text:$('value-editor').value});++revision;render(result);setDirty(true);$('edit-dialog').close();toast('Value updated');}catch(e){$('edit-error').textContent=e.error||'Invalid JSON value';}finally{button.disabled=false;}};
let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',()=>{dragDepth--;if(dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if(!busy)openFile(e.dataTransfer.files[0]);});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();$('format').click();}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
load(JSON.stringify(sample,null,2));
