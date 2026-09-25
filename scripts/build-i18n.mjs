import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const srcPath=path.join(ROOT,'index.html');
let src=await fs.readFile(srcPath,'utf8');
const outDir=path.join(ROOT,'public');
await fs.rm(outDir,{recursive:true,force:true});
await fs.mkdir(outDir,{recursive:true});

function collectArabicText(html){
  const clean=html
    .replace(/<script\b[\s\S]*?<\/script>/gi,'')
    .replace(/<style\b[\s\S]*?<\/style>/gi,'');
  const set=new Set();
  for(const m of clean.matchAll(/>([^<>]+)</g)){
    const t=m[1].trim();
    if(t && /[\u0600-\u06FF]/.test(t)) set.add(t);
  }
  return [...set];
}

async function externalizeAssets(html){
  const start=html.indexOf('const __A=');
  const tail=';document.querySelectorAll("img[data-a]").forEach(i=>i.src=__A[i.dataset.a]);';
  const tailPos=html.indexOf(tail,start);
  if(start<0 || tailPos<0) return {html,count:0};
  const jsonStart=start+'const __A='.length;
  const jsonEnd=tailPos;
  const assets=JSON.parse(html.slice(jsonStart,jsonEnd));
  const assetDir=path.join(outDir,'assets');
  await fs.mkdir(assetDir,{recursive:true});
  const exts={};
  let count=0;
  for(const [key,uri] of Object.entries(assets)){
    const m=String(uri).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s);
    if(!m) continue;
    const ext=m[1]==='jpeg'?'jpg':m[1];
    exts[key]=ext;
    await fs.writeFile(path.join(assetDir,key+'.'+ext),Buffer.from(m[2],'base64'));
    count++;
  }
  const scriptStart=html.lastIndexOf('<script',start);
  const scriptEnd=html.indexOf('</script>',tailPos)+9;
  const loader='<script>window.__VIVIT_ASSETS__='+JSON.stringify(exts)+';<\/script>';
  html=html.slice(0,scriptStart)+loader+html.slice(scriptEnd);
  return {html,count};
}

const ext=await externalizeAssets(src);
src=ext.html;
src=src.replace('<script src="/i18n-data.js"></script>\n','');
src=src.replace('<script src="/i18n-data.js"></script>','');

const sourceTexts=collectArabicText(src);
const targets=['en','de','fr','zh-CN','pl','sv','es'];
const SEP='|||VIVITSEP9|||';

const overrides={
  en:{
    'ملايين الجنيهات':'Millions of EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'managed in media buying by our team.'
  },
  de:{
    'ملايين الجنيهات':'Millionen EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'von unserem Team im Media Buying verwaltet.'
  },
  fr:{
    'ملايين الجنيهات':'Des millions d’EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'gérés en media buying par notre équipe.'
  },
  'zh-CN':{
    'ملايين الجنيهات':'数百万埃及镑（EGP）',
    'اتصرفت في الميديا باينج على إيدينا.':'由我们的团队负责媒体投放管理。'
  },
  pl:{
    'ملايين الجنيهات':'Miliony EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'zarządzane przez nasz zespół w ramach media buyingu.'
  },
  sv:{
    'ملايين الجنيهات':'Miljoner EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'hanterade av vårt team inom media buying.'
  },
  es:{
    'ملايين الجنيهات':'Millones de EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'gestionados por nuestro equipo de media buying.'
  }
};

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

const i18nDir=path.join(outDir,'i18n');
await fs.mkdir(i18nDir,{recursive:true});
for(const tl of targets){
  const map={};
  const bs=batches(sourceTexts);
  for(let i=0;i<bs.length;i++){
    const batch=bs[i];
    let vals;
    for(let attempt=0;;attempt++){
      try{ vals=await translateBatch(tl,batch); break }
      catch(e){ if(attempt>=2) throw e; await new Promise(r=>setTimeout(r,500*(attempt+1))) }
    }
    batch.forEach((s,k)=>map[s]=vals[k]||s);
  }
  Object.assign(map,overrides[tl]||{});
  await fs.writeFile(path.join(i18nDir,tl+'.js'),'window.__VIVIT_DICT__='+JSON.stringify(map)+';','utf8');
}

await fs.copyFile(path.join(ROOT,'local-i18n.js'),path.join(outDir,'local-i18n.js'));
await fs.writeFile(path.join(outDir,'index.html'),src,'utf8');
console.log('Built '+sourceTexts.length+' translatable strings for '+targets.length+' languages; externalized '+ext.count+' image assets.');
