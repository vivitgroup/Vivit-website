import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const src=await fs.readFile(path.join(ROOT,'index.html'),'utf8');
const outDir=path.join(ROOT,'public');
await fs.rm(outDir,{recursive:true,force:true});
await fs.mkdir(outDir,{recursive:true});

const LANGS={
  ar:{code:'ar',name:'العربية',flag:'🇪🇬',dir:'rtl'},
  en:{code:'en',name:'English',flag:'🇬🇧',dir:'ltr'},
  de:{code:'de',name:'Deutsch',flag:'🇩🇪',dir:'ltr'},
  fr:{code:'fr',name:'Français',flag:'🇫🇷',dir:'ltr'},
  'zh-CN':{code:'zh-CN',name:'中文',flag:'🇨🇳',dir:'ltr'},
  pl:{code:'pl',name:'Polski',flag:'🇵🇱',dir:'ltr'},
  sv:{code:'sv',name:'Svenska',flag:'🇸🇪',dir:'ltr'},
  es:{code:'es',name:'Español',flag:'🇪🇸',dir:'ltr'},
  ru:{code:'ru',name:'Русский',flag:'🇷🇺',dir:'ltr'},
  pt:{code:'pt',name:'Português',flag:'🇵🇹',dir:'ltr'}
};

const TARGETS=Object.keys(LANGS).filter(x=>x!=='ar');
const SEP='|||VIVITSEP9|||';

function extractAssetBlock(html){
  const start=html.indexOf('const __A=');
  const tail=';document.querySelectorAll("img[data-a]").forEach(i=>i.src=__A[i.dataset.a]);';
  const tailPos=html.indexOf(tail,start);
  if(start<0 || tailPos<0) return {html,assets:{},count:0};
  const jsonStart=start+'const __A='.length;
  const jsonEnd=tailPos;
  const assets=JSON.parse(html.slice(jsonStart,jsonEnd));
  const scriptStart=html.lastIndexOf('<script',start);
  const scriptEnd=html.indexOf('</script>',tailPos)+9;
  const exts={};
  for(const [key,uri] of Object.entries(assets)){
    const m=String(uri).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s);
    if(!m) continue;
    exts[key]=m[1]==='jpeg'?'jpg':m[1];
  }
  const loader='<script>window.__VIVIT_ASSETS__='+JSON.stringify(exts)+';<\/script>';
  return {html:html.slice(0,scriptStart)+loader+html.slice(scriptEnd),assets,count:Object.keys(exts).length};
}

async function writeAssets(assets){
  const dir=path.join(outDir,'assets');
  await fs.mkdir(dir,{recursive:true});
  for(const [key,uri] of Object.entries(assets)){
    const m=String(uri).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s);
    if(!m) continue;
    const ext=m[1]==='jpeg'?'jpg':m[1];
    await fs.writeFile(path.join(dir,key+'.'+ext),Buffer.from(m[2],'base64'));
  }
}

function removeOldI18n(html){
  return html
    .replace(/<script src="\/i18n-data\.js"><\/script>\s*/g,'')
    .replace(/<script src="\/local-i18n\.js"><\/script>\s*/g,'')
    .replace(/<script src="\/i18n\/[^"]+"><\/script>\s*/g,'');
}

function collectArabicText(html){
  const masked=html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'');
  const set=new Set();
  for(const m of masked.matchAll(/>([^<>]+)</g)){
    const t=m[1].trim();
    if(t && /[\u0600-\u06FF]/.test(t)) set.add(t);
  }
  return [...set];
}

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
    if(cur.length && n+add>2600){out.push(cur);cur=[];n=0}
    cur.push(s); n+=add;
  }
  if(cur.length) out.push(cur);
  return out;
}

async function translateBatch(tl,arr){
  if(arr.length===1) return [await translateOne(tl,arr[0])];
  const got=await translateOne(tl,arr.join('\n'+SEP+'\n'));
  const parts=got.split(/\s*\|\|\|VIVITSEP9\|\|\|\s*/);
  if(parts.length===arr.length) return parts;
  const vals=[];
  for(const s of arr) vals.push(await translateOne(tl,s));
  return vals;
}

const OVERRIDES={
  en:{
    'ملايين الجنيهات':'Millions of EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'managed in media buying by our team.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding & Visual Identity','ميديا برودكشن':'Media Production',
    'بيرفورمانس ماركتينج':'Performance Marketing','تقرير أسبوعي':'Weekly Report',
    'إنفلونسر ماركتينج':'Influencer Marketing'
  },
  de:{
    'ملايين الجنيهات':'Millionen EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'von unserem Team im Media Buying verwaltet.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding & visuelle Identität','ميديا برودكشن':'Medienproduktion',
    'بيرفورمانس ماركتينج':'Performance Marketing','تقرير أسبوعي':'Wochenbericht',
    'إنفلونسر ماركتينج':'Influencer-Marketing'
  },
  fr:{
    'ملايين الجنيهات':'Des millions d’EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'gérés en media buying par notre équipe.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding & identité visuelle','ميديا برودكشن':'Production média',
    'بيرفورمانس ماركتينج':'Marketing à la performance','تقرير أسبوعي':'Rapport hebdomadaire',
    'إنفلونسر ماركتينج':'Marketing d’influence'
  },
  'zh-CN':{
    'ملايين الجنيهات':'数百万埃及镑（EGP）',
    'اتصرفت في الميديا باينج على إيدينا.':'由我们的团队负责媒体投放管理。',
    'ميديا باير':'媒体投放经理','أكاونت مانجر':'客户经理',
    'براندينج وهوية بصرية':'品牌与视觉识别','ميديا برودكشن':'媒体制作',
    'بيرفورمانس ماركتينج':'效果营销','تقرير أسبوعي':'周报',
    'إنفلونسر ماركتينج':'达人营销'
  },
  pl:{
    'ملايين الجنيهات':'Miliony EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'zarządzane przez nasz zespół w ramach media buyingu.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding i identyfikacja wizualna','ميديا برودكشن':'Produkcja medialna',
    'بيرفورمانس ماركتينج':'Performance Marketing','تقرير أسبوعي':'Raport tygodniowy',
    'إنفلونسر ماركتينج':'Influencer Marketing'
  },
  sv:{
    'ملايين الجنيهات':'Miljoner EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'hanterade av vårt team inom media buying.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Varumärke & visuell identitet','ميديا برودكشن':'Medieproduktion',
    'بيرفورمانس ماركتينج':'Performance Marketing','تقرير أسبوعي':'Veckorapport',
    'إنفلونسر ماركتينج':'Influencer Marketing'
  },
  es:{
    'ملايين الجنيهات':'Millones de EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'gestionados por nuestro equipo de media buying.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding e identidad visual','ميديا برودكشن':'Producción de medios',
    'بيرفورمانس ماركتينج':'Marketing de performance','تقرير أسبوعي':'Informe semanal',
    'إنفلونسر ماركتينج':'Marketing de influencers'
  },
  ru:{
    'ملايين الجنيهات':'Миллионы египетских фунтов (EGP)',
    'اتصرفت في الميديا باينج على إيدينا.':'под управлением нашей команды по медиабаингу.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Брендинг и визуальная айдентика','ميديا برودكشن':'Медиапродакшн',
    'بيرفورمانس ماركتينج':'Performance Marketing','تقرير أسبوعي':'Еженедельный отчёт',
    'إنفلونسر ماركتينج':'Инфлюенсер-маркетинг'
  },
  pt:{
    'ملايين الجنيهات':'Milhões de EGP',
    'اتصرفت في الميديا باينج على إيدينا.':'geridos pela nossa equipa de media buying.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding e identidade visual','ميديا برودكشن':'Produção de mídia',
    'بيرفورمانس ماركتينج':'Marketing de performance','تقرير أسبوعي':'Relatório semanal',
    'إنفلونسر ماركتينج':'Marketing de influência'
  }
};

function translateHtml(html,dict){
  const token=/((?:<script\b[\s\S]*?<\/script>)|(?:<style\b[\s\S]*?<\/style>))/gi;
  const parts=html.split(token);
  return parts.map(part=>{
    if(/^<(script|style)\b/i.test(part)) return part;
    return part.replace(/>([^<>]+)</g,(m,txt)=>{
      const t=txt.trim();
      if(!t || !dict[t]) return m;
      const lead=(txt.match(/^\s*/)||[''])[0],tail=(txt.match(/\s*$/)||[''])[0];
      return '>'+lead+dict[t]+tail+'<';
    });
  }).join('');
}

function addLanguagesToMenu(html){
  if(html.includes('data-lang="ru"')) return html;
  const insert='<button class="langitem" data-lang="ru" data-flag="🇷🇺" data-name="Русский"><span>🇷🇺</span><span>Русский</span><span class="lc">RU</span></button>'
    +'<button class="langitem" data-lang="pt" data-flag="🇵🇹" data-name="Português"><span>🇵🇹</span><span>Português</span><span class="lc">PT</span></button>';
  return html.replace(/(<\/div>\s*<\/div>\s*<div class="progress-wrap")/,insert+'$1');
}

function setLangUI(html,key){
  const m=LANGS[key];
  html=html.replace(/<html\s+lang="[^"]*"\s+dir="[^"]*">/i,'<html lang="'+m.code+'" dir="'+m.dir+'">');
  html=html.replace(/(<span class="flag" id="langflag">)[^<]*(<\/span>)/,'$1'+m.flag+'$2');
  html=html.replace(/(<span class="lname" id="langname">)[^<]*(<\/span>)/,'$1'+m.name+'$2');
  html=html.replace(/class="langitem active"/g,'class="langitem"');
  html=html.replace(new RegExp('class="langitem" data-lang="'+key.replace('-','\\-')+'"'),'class="langitem active" data-lang="'+key+'"');
  return html;
}

function addRuntime(html,key){
  const runtime='<script src="/local-i18n.js" defer></script>';
  const boot='<script>window.__VIVIT_LANG__='+JSON.stringify(key)+';<\/script>';
  return html.replace('</body>',boot+runtime+'</body>');
}

let base=removeOldI18n(src);
const ext=extractAssetBlock(base);
base=ext.html;
await writeAssets(ext.assets);
base=addLanguagesToMenu(base);

const sourceTexts=collectArabicText(base);
const dictionaries={};
for(const tl of TARGETS){
  const map={};
  const bs=batches(sourceTexts);
  for(let i=0;i<bs.length;i++){
    let vals;
    for(let attempt=0;;attempt++){
      try{ vals=await translateBatch(tl,bs[i]); break }
      catch(e){ if(attempt>=2) throw e; await new Promise(r=>setTimeout(r,500*(attempt+1))) }
    }
    bs[i].forEach((s,k)=>map[s]=vals[k]||s);
  }
  Object.assign(map,OVERRIDES[tl]||{});
  dictionaries[tl]=map;
}

for(const key of Object.keys(LANGS)){
  let page=base;
  if(key!=='ar') page=translateHtml(page,dictionaries[key]);
  page=setLangUI(page,key);
  page=addRuntime(page,key);
  const dir=key==='ar'?outDir:path.join(outDir,key==='zh-CN'?'zh':key);
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'index.html'),page,'utf8');
}
await fs.copyFile(path.join(ROOT,'local-i18n.js'),path.join(outDir,'local-i18n.js'));

console.log('Static language build complete: '+Object.keys(LANGS).length+' routes, '+sourceTexts.length+' source strings, '+ext.count+' external assets.');
