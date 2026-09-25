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
    .replace(/<script src="\/i18n\/[^"]+"><\/script>\s*/g,'')
    .replace(/<div id="google_translate_element"><\/div>/g,'')
    .replace(/<script[^>]*>[\s\S]*?googleTranslateElementInit[\s\S]*?<\/script>\s*/gi,'')
    .replace(/<script[^>]+src=["']https:\/\/translate\.google\.com\/[^"']+["'][^>]*><\/script>\s*/gi,'')
    .replace(/<script[^>]*>[\s\S]*?googtrans[\s\S]*?<\/script>\s*/gi,'');
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
    'ملايين':'Millions',
    'اتصرفت في الميديا باينج على إيدينا.':'gérés en media buying par notre équipe.',
    'ميديا باير':'Media Buyer','أكاونت مانجر':'Account Manager',
    'براندينج وهوية بصرية':'Branding & identité visuelle','ميديا برودكشن':'Production média',
    'بيرفورمانس ماركتينج':'Marketing à la performance','تقرير أسبوعي':'Rapport hebdomadaire',
    'إنفلونسر ماركتينج':'Marketing d’influence',
    'إحنا شركة ماركتينج E2E.':'Nous sommes une agence marketing E2E.',
    'يعني من أول فكرة… لحد آخر خبر في الجرايد. مش هتحتاج شركة تانية في النص.':'De la première idée à la dernière parution média. Un seul partenaire, de bout en bout.',
    'الأرقام الأول… عشان وقتك غالي.':'Les chiffres d’abord. Votre temps compte.',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Des campagnes en Égypte, en Arabie saoudite et aux Émirats — en arabe et en anglais.',
    'جنيه ميديا اتدارت على إيدينا':'d’EGP de média gérés par notre équipe',
    'عميل':'clients',
    'في أكتر من 12 مجال.':'dans plus de 12 secteurs.',
    'مشروع اتسلّم':'projets livrés',
    'خدمة ماركتينج E2E':'services marketing E2E',
    'سنين في السوق':'ans sur le marché',
    'سنين… متوسط بقاء العميل':'ans de collaboration moyenne',
    'متابع على حسابنا إحنا':'abonnés sur notre compte',
    '95 مليون أونلاين… مين هيوصلهم صح؟':'95 millions en ligne. Qui les atteindra vraiment ?',
    'الفرصة ضخمة — بس الزحمة أضخم. اللي بيكسب مش اللي بيصرف أكتر… اللي بيوصل صح.':'L’opportunité est immense. La concurrence aussi. Gagner, ce n’est pas dépenser plus — c’est toucher juste.',
    'مستخدم إنترنت في مصر':'internautes en Égypte',
    'يعني 81.9% من السكان.':'soit 81,9 % de la population.',
    'خط موبايل — الموبايل هو الشاشة الأولى.':'lignes mobiles — le mobile est le premier écran.',
    'جمهورك فين؟':'Où est votre audience ?',
    'مستخدمين في مصر':'utilisateurs en Égypte',
    'المصدر: DataReportal 2026 ووزارة الاتصالات — أرقام تقريبية.':'Source : DataReportal 2026 et ministère des Communications — chiffres approximatifs.'
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

const GLOSSARY={
  en:{
    'ماركتينج استراتيجي':'Strategic Marketing','ماركتينج بلان':'Marketing Plan','كونتنت استراتيجي':'Content Strategy','كونتنت بلان':'Content Plan',
    'فيديوجرافي':'Videography','سوشيال ميديا مانجمنت':'Social Media Management','PR وعلاقات عامة':'PR & Public Relations','أكتيفيشن':'Activation',
    'تصميم وتنفيذ بوثات':'Booth Design & Production','تنظيم إيفنتات':'Event Management','تغطية إعلامية وصحفية':'Press & Media Coverage',
    'مواقع ويب':'Websites','تطبيقات موبايل':'Mobile Apps','مساعد AI':'AI Assistant','أنظمة ERP':'ERP Systems','شات بوت':'Chatbot','حلول مخصوصة':'Custom Solutions',
    'استراتيجي':'Strategist','كونتنت رايتر':'Content Writer','ديزاينر':'Designer','فيديوجرافر':'Videographer'
  },
  de:{
    'ماركتينج استراتيجي':'Strategisches Marketing','ماركتينج بلان':'Marketingplan','كونتنت استراتيجي':'Content-Strategie','كونتنت بلان':'Content-Plan',
    'فيديوجرافي':'Videografie','سوشيال ميديا مانجمنت':'Social-Media-Management','PR وعلاقات عامة':'PR & Öffentlichkeitsarbeit','أكتيفيشن':'Aktivierung',
    'تصميم وتنفيذ بوثات':'Messestand-Design & Umsetzung','تنظيم إيفنتات':'Eventmanagement','تغطية إعلامية وصحفية':'Presse- & Medienberichterstattung',
    'مواقع ويب':'Websites','تطبيقات موبايل':'Mobile Apps','مساعد AI':'KI-Assistent','أنظمة ERP':'ERP-Systeme','شات بوت':'Chatbot','حلول مخصوصة':'Individuelle Lösungen',
    'استراتيجي':'Strategie','كونتنت رايتر':'Content Writer','ديزاينر':'Designer','فيديوجرافر':'Videograf'
  },
  fr:{
    'ماركتينج استراتيجي':'Marketing stratégique','ماركتينج بلان':'Plan marketing','كونتنت استراتيجي':'Stratégie de contenu','كونتنت بلان':'Plan de contenu',
    'فيديوجرافي':'Vidéographie','سوشيال ميديا مانجمنت':'Gestion des réseaux sociaux','PR وعلاقات عامة':'RP & relations publiques','أكتيفيشن':'Activation',
    'تصميم وتنفيذ بوثات':'Conception & production de stands','تنظيم إيفنتات':'Organisation d’événements','تغطية إعلامية وصحفية':'Couverture presse & média',
    'مواقع ويب':'Sites web','تطبيقات موبايل':'Applications mobiles','مساعد AI':'Assistant IA','أنظمة ERP':'Systèmes ERP','شات بوت':'Chatbot','حلول مخصوصة':'Solutions sur mesure',
    'استراتيجي':'Stratégiste','كونتنت رايتر':'Rédacteur de contenu','ديزاينر':'Designer','فيديوجرافر':'Vidéaste'
  },
  'zh-CN':{
    'ماركتينج استراتيجي':'战略营销','ماركتينج بلان':'营销计划','كونتنت استراتيجي':'内容策略','كونتنت بلان':'内容计划',
    'فيديوجرافي':'视频制作','سوشيال ميديا مانجمنت':'社交媒体管理','PR وعلاقات عامة':'公关与媒体关系','أكتيفيشن':'线下激活',
    'تصميم وتنفيذ بوثات':'展台设计与搭建','تنظيم إيفنتات':'活动策划与执行','تغطية إعلامية وصحفية':'新闻与媒体报道',
    'مواقع ويب':'网站','تطبيقات موبايل':'移动应用','مساعد AI':'AI 助手','أنظمة ERP':'ERP 系统','شات بوت':'聊天机器人','حلول مخصوصة':'定制解决方案',
    'استراتيجي':'策略师','كونتنت رايتر':'内容撰稿人','ديزاينر':'设计师','فيديوجرافر':'摄像师'
  },
  pl:{
    'ماركتينج استراتيجي':'Marketing strategiczny','ماركتينج بلان':'Plan marketingowy','كونتنت استراتيجي':'Strategia treści','كونتنت بلان':'Plan treści',
    'فيديوجرافي':'Wideografia','سوشيال ميديا مانجمنت':'Zarządzanie social media','PR وعلاقات عامة':'PR i relacje publiczne','أكتيفيشن':'Aktywacja',
    'تصميم وتنفيذ بوثات':'Projekt i realizacja stoisk','تنظيم إيفنتات':'Organizacja wydarzeń','تغطية إعلامية وصحفية':'Obsługa prasowa i medialna',
    'مواقع ويب':'Strony internetowe','تطبيقات موبايل':'Aplikacje mobilne','مساعد AI':'Asystent AI','أنظمة ERP':'Systemy ERP','شات بوت':'Chatbot','حلول مخصوصة':'Rozwiązania dedykowane',
    'استراتيجي':'Strateg','كونتنت رايتر':'Content Writer','ديزاينر':'Designer','فيديوجرافر':'Wideograf'
  },
  sv:{
    'ماركتينج استراتيجي':'Strategisk marknadsföring','ماركتينج بلان':'Marknadsplan','كونتنت استراتيجي':'Innehållsstrategi','كونتنت بلان':'Innehållsplan',
    'فيديوجرافي':'Videografi','سوشيال ميديا مانجمنت':'Hantering av sociala medier','PR وعلاقات عامة':'PR & public relations','أكتيفيشن':'Aktivering',
    'تصميم وتنفيذ بوثات':'Monterdesign & produktion','تنظيم إيفنتات':'Eventproduktion','تغطية إعلامية وصحفية':'Press- & mediebevakning',
    'مواقع ويب':'Webbplatser','تطبيقات موبايل':'Mobilappar','مساعد AI':'AI-assistent','أنظمة ERP':'ERP-system','شات بوت':'Chatbot','حلول مخصوصة':'Skräddarsydda lösningar',
    'استراتيجي':'Strateg','كونتنت رايتر':'Content Writer','ديزاينر':'Designer','فيديوجرافر':'Videograf'
  },
  es:{
    'ماركتينج استراتيجي':'Marketing estratégico','ماركتينج بلان':'Plan de marketing','كونتنت استراتيجي':'Estrategia de contenidos','كونتنت بلان':'Plan de contenidos',
    'فيديوجرافي':'Videografía','سوشيال ميديا مانجمنت':'Gestión de redes sociales','PR وعلاقات عامة':'PR y relaciones públicas','أكتيفيشن':'Activación',
    'تصميم وتنفيذ بوثات':'Diseño y producción de stands','تنظيم إيفنتات':'Organización de eventos','تغطية إعلامية وصحفية':'Cobertura de prensa y medios',
    'مواقع ويب':'Sitios web','تطبيقات موبايل':'Apps móviles','مساعد AI':'Asistente de IA','أنظمة ERP':'Sistemas ERP','شات بوت':'Chatbot','حلول مخصوصة':'Soluciones a medida',
    'استراتيجي':'Estratega','كونتنت رايتر':'Redactor de contenidos','ديزاينر':'Diseñador','فيديوجرافر':'Videógrafo'
  },
  ru:{
    'ماركتينج استراتيجي':'Стратегический маркетинг','ماركتينج بلان':'Маркетинговый план','كونتنت استراتيجي':'Контент-стратегия','كونتنت بلان':'Контент-план',
    'فيديوجرافي':'Видеопродакшн','سوشيال ميديا مانجمنت':'Ведение соцсетей','PR وعلاقات عامة':'PR и связи с общественностью','أكتيفيشن':'Активация',
    'تصميم وتنفيذ بوثات':'Дизайн и производство стендов','تنظيم إيفنتات':'Организация мероприятий','تغطية إعلامية وصحفية':'Пресса и медиаподдержка',
    'مواقع ويب':'Веб-сайты','تطبيقات موبايل':'Мобильные приложения','مساعد AI':'AI-ассистент','أنظمة ERP':'ERP-системы','شات بوت':'Чат-бот','حلول مخصوصة':'Индивидуальные решения',
    'استراتيجي':'Стратег','كونتنت رايتر':'Контент-райтер','ديزاينر':'Дизайнер','فيديوجرافر':'Видеограф'
  },
  pt:{
    'ماركتينج استراتيجي':'Marketing estratégico','ماركتينج بلان':'Plano de marketing','كونتنت استراتيجي':'Estratégia de conteúdo','كونتنت بلان':'Plano de conteúdo',
    'فيديوجرافي':'Videografia','سوشيال ميديا مانجمنت':'Gestão de redes sociais','PR وعلاقات عامة':'PR e relações públicas','أكتيفيشن':'Ativação',
    'تصميم وتنفيذ بوثات':'Design e produção de stands','تنظيم إيفنتات':'Organização de eventos','تغطية إعلامية وصحفية':'Cobertura de imprensa e mídia',
    'مواقع ويب':'Websites','تطبيقات موبايل':'Apps móveis','مساعد AI':'Assistente de IA','أنظمة ERP':'Sistemas ERP','شات بوت':'Chatbot','حلول مخصوصة':'Soluções personalizadas',
    'استراتيجي':'Estrategista','كونتنت رايتر':'Redator de conteúdo','ديزاينر':'Designer','فيديوجرافر':'Videógrafo'
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
  const marker='</button></div></div><span class="ct">';
  const pos=html.indexOf(marker);
  if(pos<0) throw new Error('Language menu closing marker not found');
  return html.slice(0,pos+'</button>'.length)+insert+html.slice(pos+'</button>'.length);
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
  Object.assign(map,GLOSSARY[tl]||{},OVERRIDES[tl]||{});
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
