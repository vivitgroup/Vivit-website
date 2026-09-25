import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const src=await fs.readFile(path.join(ROOT,'index.html'),'utf8');
const outDir=path.join(ROOT,'public');
await fs.rm(outDir,{recursive:true,force:true});
await fs.mkdir(outDir,{recursive:true});

function collectArabicText(html){
  const clean=html
    .replace(/<script\b[\s\S]*?<\/script>/gi,'')
    .replace(/<style\b[\s\S]*?<\/style>/gi,'');
  const set=new Set();
  for(const m of clean.matchAll(/>([^<>]+)</g)){
    const raw=m[1];
    const t=raw.trim();
    if(t && /[\u0600-\u06FF]/.test(t)) set.add(t);
  }
  return [...set];
}

const sourceTexts=collectArabicText(src);
const targets=['en','de','fr','zh-CN','pl','sv','es'];
const maps={ar:{}};
const SEP='|||VIVITSEP9|||';

async function translateOne(tl,q){
  const u='https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl='+encodeURIComponent(tl)+'&dt=t&q='+encodeURIComponent(q);
  const r=await fetch(u);
  if(!r.ok) throw new Error('translate '+tl+' '+r.status);
  const j=await r.json();
  return (j[0]||[]).map(x=>x[0]).join('')||q;
}
function batches(items){
  const out=[]; let cur=[]; let n=0;
  for(const s of items){
    const add=s.length+SEP.length+2;
    if(cur.length && n+add>2800){out.push(cur);cur=[];n=0}
    cur.push(s); n+=add;
  }
  if(cur.length) out.push(cur);
  return out;
}
async function translateBatch(tl,arr){
  if(arr.length===1) return [await translateOne(tl,arr[0])];
  const joined=arr.join('\n'+SEP+'\n');
  const got=await translateOne(tl,joined);
  const parts=got.split(/\s*\|\|\|VIVITSEP9\|\|\|\s*/);
  if(parts.length===arr.length) return parts;
  const vals=[];
  for(const s of arr) vals.push(await translateOne(tl,s));
  return vals;
}
for(const tl of targets){
  const map={};
  const bs=batches(sourceTexts);
  let i=0;
  for(const batch of bs){
    let vals;
    for(let attempt=0;;attempt++){
      try{ vals=await translateBatch(tl,batch); break }
      catch(e){ if(attempt>=2) throw e; await new Promise(r=>setTimeout(r,700*(attempt+1))) }
    }
    batch.forEach((s,k)=>map[s]=vals[k]||s);
    i++;
    if(i%10===0) console.log(tl,i+'/'+bs.length);
  }
  maps[tl]=map;
}
await fs.writeFile(path.join(outDir,'i18n-data.js'),'window.__VIVIT_I18N__='+JSON.stringify(maps)+';','utf8');
await fs.copyFile(path.join(ROOT,'local-i18n.js'),path.join(outDir,'local-i18n.js'));
await fs.writeFile(path.join(outDir,'index.html'),src,'utf8');
console.log('Built '+sourceTexts.length+' translatable strings for '+targets.length+' languages.');
