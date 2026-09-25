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
  html=html
    .replace(/<script src="\/i18n-data\.js"><\/script>\s*/g,'')
    .replace(/<script src="\/local-i18n\.js"><\/script>\s*/g,'')
    .replace(/<script src="\/i18n\/[^"]+"><\/script>\s*/g,'')
    .replace(/<div id="google_translate_element"><\/div>/g,'');
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,function(tag){
    return /googleTranslateElementInit|googtrans|translate\.google\.com\/translate_a\/element\.js/i.test(tag)?'':tag;
  });
  return html;
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

const SEGMENT_OVERRIDES={
  en:{
    'العربية':'Arabic','لف الموبايل بالعرض عشان تشوف البروفايل أوضح ↻':'Rotate your phone for the best view ↻',
    'كل براند':'Every brand','عنده':'has a','حكاية.':'story.','إحنا اللي بنوصّلها':'We take it','للعالم.':'to the world.',
    'مين':'Who we are','بنعمل إيه':'What we do','ماركتينج':'Marketing','+ تك هاوس':'+ Tech House','فين':'Where','مصر والشرق الأوسط':'Egypt & the Middle East',
    'القاعدة':'The Rule','يعني إيه VIVIT أصلاً؟':'So, what does VIVIT mean?','ثواني.':'seconds.','ده تقريبًا كل اللي معاك…':'That’s almost all the time you get…',
    'قبل ما صباع العميل':'before your customer’s thumb','يكمّل سكرول.':'keeps scrolling.','لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'If you don’t stop them there, everything after it is wasted. So this profile follows one rule:',
    'كل صفحة لازم تكسب اللي بعدها.':'Every page has to earn the next one.','الاسم':'The Name','ورا الحروف دي… رؤية ورسالة وهدف.':'Behind the letters: a vision, a mission, and a goal.',
    'مش اسم…':'isn’t just a name…','ده وعد من':'It’s a promise in','حروف.':'letters.','اتولد من كلمتين:':'Built from two words:','و':'and','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…with the middle letters connecting them.',
    'رؤية':'Vision','بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'We see where the brand should be in five years — not just tomorrow.',
    'ابتكار':'Innovation','فكرة جديدة كل مرة — مش نسخة من السوق.':'A fresh idea every time — never a copy of the market.',
    'قيمة':'Value','كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Every EGP spent should come back with more value.',
    'أثر':'Impact','بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Measured in sales and reputation — not likes.',
    'ثقة':'Trust','عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Clients stay with us for years. That trust matters most.',
    'رؤيتنا':'Our Vision','طب إحنا مين بالظبط؟':'So, who exactly are we?','إحنا هنا':'Why we’re here','ليه؟':'','تلات جمل بنرجعلها كل ما نيجي ناخد قرار.':'Three statements guide every decision we make.',
    'نبقى أول اسم ييجي في بال أي براند طموح في مصر والشرق الأوسط… لحظة ما يقرر يكبر.':'To be the first name ambitious brands in Egypt and the Middle East think of when they decide to grow.',
    'مصر':'Egypt','الخليج':'Gulf','الشرق الأوسط':'Middle East','رسالتنا':'Our Mission',
    'نمسك البراند من أول فكرة لحد آخر خبر — استراتيجية ذكية، كونتنت يوقّف، وإعلانات بتبيع.':'We take the brand from first idea to final headline — smart strategy, scroll-stopping content, and ads that sell.',
    'فكرة':'Idea','تنفيذ':'Execution','نتيجة':'Result','هدفنا':'Our Goal',
    'كل براند يشتغل معانا يطلع بأرقام أحسن من اللي دخل بيها. ده المقياس الوحيد.':'Every brand that works with us should leave with better numbers. That’s the measure.',
    'مبيعات':'Sales','سمعة':'Reputation','ولاء':'Loyalty','مين إحنا':'Who We Are','الأرقام… في صفحة واحدة.':'The numbers — on one page.',
    'إحنا شركة':'We are an','الفكرة':'Think','استراتيجية، خطة تسويق، وخطة محتوى':'Strategy, marketing plan, and content plan',
    'الصنعة':'Make','هوية البراند، تصوير، إنتاج، وسوشيال ميديا':'Brand identity, photography, production, and social media',
    'الوصول':'Reach','إعلانات، ظهور في جوجل والـ':'Ads, Google and','، إنفلونسرز، و':', influencers, and','الأرض':'On Ground',
    'أكتيفيشن، بوثات، إيفنتات، وتغطية صحفية':'Activations, booths, events, and press coverage',
    'التك هاوس':'Tech House','مواقع، تطبيقات،':'Websites, apps,','، ومساعدين':', and assistants','في سطر':'At a Glance','والسوق اللي بنشتغل فيه؟':'And the market we operate in?',
    'الأرقام الأول…':'Numbers first…','عشان وقتك غالي.':'because your time matters.','عميل':'clients','في أكتر من':'across more than','مجال.':'sectors.',
    'ملايين':'Millions','جنيه ميديا اتدارت على إيدينا':'of EGP in media managed by our team','مشروع اتسلّم':'projects delivered','خدمة ماركتينج':'marketing services',
    'سنين في السوق':'years in market','سنين… متوسط بقاء العميل':'years — average client relationship','متابع على حسابنا إحنا':'followers on our own account',
    'السوق':'The Market'
  },
  fr:{
    'العربية':'Arabe','لف الموبايل بالعرض عشان تشوف البروفايل أوضح ↻':'Tournez votre téléphone pour une meilleure lecture ↻',
    'كل براند':'Chaque marque','عنده':'a une','حكاية.':'histoire.','إحنا اللي بنوصّلها':'Nous la portons','للعالم.':'au monde.',
    'مين':'Qui nous sommes','بنعمل إيه':'Ce que nous faisons','ماركتينج':'Marketing','+ تك هاوس':'+ Tech House','فين':'Où','مصر والشرق الأوسط':'Égypte & Moyen-Orient',
    'القاعدة':'La règle','يعني إيه VIVIT أصلاً؟':'Que signifie vraiment VIVIT ?','ثواني.':'secondes.','ده تقريبًا كل اللي معاك…':'C’est presque tout le temps dont vous disposez…',
    'قبل ما صباع العميل':'avant que le pouce du client','يكمّل سكرول.':'continue de défiler.','لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Si vous ne captez pas son attention là, la suite ne compte plus. Ce profil suit donc une règle simple :',
    'كل صفحة لازم تكسب اللي بعدها.':'Chaque page doit donner envie de voir la suivante.','الاسم':'Le nom','ورا الحروف دي… رؤية ورسالة وهدف.':'Derrière ces lettres : une vision, une mission et un objectif.',
    'مش اسم…':'n’est pas qu’un nom…','ده وعد من':'C’est une promesse en','حروف.':'lettres.','اتولد من كلمتين:':'Né de deux mots :','و':'et','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…avec les lettres centrales qui les relient.',
    'رؤية':'Vision','بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Nous voyons où la marque doit être dans cinq ans — pas seulement demain.',
    'ابتكار':'Innovation','فكرة جديدة كل مرة — مش نسخة من السوق.':'Une idée nouvelle à chaque fois — jamais une copie du marché.',
    'قيمة':'Valeur','كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Chaque EGP investi doit générer davantage de valeur.',
    'أثر':'Impact','بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Il se mesure en ventes et en réputation — pas en likes.',
    'ثقة':'Confiance','عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Nos clients restent avec nous pendant des années. Cette confiance est essentielle.',
    'رؤيتنا':'Notre vision','طب إحنا مين بالظبط؟':'Alors, qui sommes-nous exactement ?','إحنا هنا':'Pourquoi nous sommes là','ليه؟':'','تلات جمل بنرجعلها كل ما نيجي ناخد قرار.':'Trois phrases guident chacune de nos décisions.',
    'نبقى أول اسم ييجي في بال أي براند طموح في مصر والشرق الأوسط… لحظة ما يقرر يكبر.':'Être le premier nom auquel pense une marque ambitieuse en Égypte et au Moyen-Orient lorsqu’elle décide de grandir.',
    'مصر':'Égypte','الخليج':'Golfe','الشرق الأوسط':'Moyen-Orient','رسالتنا':'Notre mission',
    'نمسك البراند من أول فكرة لحد آخر خبر — استراتيجية ذكية، كونتنت يوقّف، وإعلانات بتبيع.':'Accompagner la marque de la première idée au dernier article — stratégie intelligente, contenu qui capte et publicité qui vend.',
    'فكرة':'Idée','تنفيذ':'Exécution','نتيجة':'Résultat','هدفنا':'Notre objectif',
    'كل براند يشتغل معانا يطلع بأرقام أحسن من اللي دخل بيها. ده المقياس الوحيد.':'Chaque marque qui travaille avec nous doit repartir avec de meilleurs chiffres. C’est notre mesure.',
    'مبيعات':'Ventes','سمعة':'Réputation','ولاء':'Fidélité','مين إحنا':'Qui sommes-nous','الأرقام… في صفحة واحدة.':'Les chiffres — sur une seule page.',
    'إحنا شركة':'Nous sommes une agence','الفكرة':'Réflexion','استراتيجية، خطة تسويق، وخطة محتوى':'Stratégie, plan marketing et plan de contenu',
    'الصنعة':'Création','هوية البراند، تصوير، إنتاج، وسوشيال ميديا':'Identité de marque, photo, production et réseaux sociaux',
    'الوصول':'Diffusion','إعلانات، ظهور في جوجل والـ':'Publicité, présence Google et','، إنفلونسرز، و':', influenceurs et','الأرض':'Terrain',
    'أكتيفيشن، بوثات، إيفنتات، وتغطية صحفية':'Activations, stands, événements et couverture presse',
    'التك هاوس':'Tech House','مواقع، تطبيقات،':'Sites web, applications,','، ومساعدين':', et assistants','في سطر':'En bref','والسوق اللي بنشتغل فيه؟':'Et le marché sur lequel nous opérons ?',
    'الأرقام الأول…':'Les chiffres d’abord…','عشان وقتك غالي.':'votre temps compte.','عميل':'clients','في أكتر من':'dans plus de','مجال.':'secteurs.',
    'ملايين':'Millions','جنيه ميديا اتدارت على إيدينا':'d’EGP de média gérés par notre équipe','مشروع اتسلّم':'projets livrés','خدمة ماركتينج':'services marketing',
    'سنين في السوق':'ans sur le marché','سنين… متوسط بقاء العميل':'ans — durée moyenne de collaboration','متابع على حسابنا إحنا':'abonnés sur notre propre compte',
    'السوق':'Le marché'
  },
  ru:{
    'كل براند':'У каждого бренда','عنده':'есть своя','حكاية.':'история.','إحنا اللي بنوصّلها':'Мы доносим её','للعالم.':'до мира.',
    'مين':'Кто мы','بنعمل إيه':'Что мы делаем','فين':'Где','مصر والشرق الأوسط':'Египет и Ближний Восток',
    'القاعدة':'Правило','يعني إيه VIVIT أصلاً؟':'Что на самом деле означает VIVIT?','ثواني.':'секунды.','ده تقريبًا كل اللي معاك…':'Примерно столько у вас есть…',
    'قبل ما صباع العميل':'прежде чем палец клиента','يكمّل سكرول.':'продолжит скроллить.','كل صفحة لازم تكسب اللي بعدها.':'Каждая страница должна заслужить следующую.',
    'الاسم':'Название','ورا الحروف دي… رؤية ورسالة وهدف.':'За этими буквами — видение, миссия и цель.',
    'رؤية':'Видение','ابتكار':'Инновация','قيمة':'Ценность','أثر':'Влияние','ثقة':'Доверие',
    'مين إحنا':'Кто мы','الأرقام… في صفحة واحدة.':'Цифры — на одной странице.','في سطر':'Коротко','السوق':'Рынок'
  },
  pt:{
    'كل براند':'Toda marca','عنده':'tem uma','حكاية.':'história.','إحنا اللي بنوصّلها':'Nós a levamos','للعالم.':'ao mundo.',
    'مين':'Quem somos','بنعمل إيه':'O que fazemos','فين':'Onde','مصر والشرق الأوسط':'Egito e Oriente Médio',
    'القاعدة':'A regra','يعني إيه VIVIT أصلاً؟':'O que VIVIT realmente significa?','ثواني.':'segundos.','ده تقريبًا كل اللي معاك…':'É praticamente todo o tempo que você tem…',
    'قبل ما صباع العميل':'antes que o dedo do cliente','يكمّل سكرول.':'continue rolando.','كل صفحة لازم تكسب اللي بعدها.':'Cada página precisa conquistar a próxima.',
    'الاسم':'O nome','ورا الحروف دي… رؤية ورسالة وهدف.':'Por trás das letras: visão, missão e objetivo.',
    'رؤية':'Visão','ابتكار':'Inovação','قيمة':'Valor','أثر':'Impacto','ثقة':'Confiança',
    'مين إحنا':'Quem somos','الأرقام… في صفحة واحدة.':'Os números — em uma página.','في سطر':'Em resumo','السوق':'O mercado'
  }
};

const REVIEWED_COPY={
  en:{
    'جنيه':'EGP','ليد':'lead','ليدز':'leads','عميل محتمل':'potential customer','عميل محتمل (ليد)':'potential customer (lead)',
    'جنيه متوسط تكلفة الليد':'EGP average cost per lead','جنيه تكلفة الليد':'EGP cost per lead','جنيه صرف':'EGP spend',
    'ملايين':'Millions','جنيه ميديا اتدارت على إيدينا':'of EGP in media managed by our team','عميل':'clients','في أكتر من':'across more than','مجال.':'sectors.',
    'مشروع اتسلّم':'projects delivered','خدمة ماركتينج':'marketing services','سنين في السوق':'years in the market','سنين… متوسط بقاء العميل':'years — average client relationship','متابع على حسابنا إحنا':'followers on our own account'
  },
  de:{
    'كل براند':'Jede Marke','عنده':'hat ihre','حكاية.':'Geschichte.','إحنا اللي بنوصّلها':'Wir bringen sie','للعالم.':'in die Welt.',
    'مين':'Wer wir sind','بنعمل إيه':'Was wir tun','ماركتينج':'Marketing','+ تك هاوس':'+ Tech House','فين':'Wo','مصر والشرق الأوسط':'Ägypten & Naher Osten',
    'القاعدة':'Die Regel','يعني إيه VIVIT أصلاً؟':'Was bedeutet VIVIT eigentlich?','ثواني.':'Sekunden.','ده تقريبًا كل اللي معاك…':'So viel Zeit haben Sie ungefähr…',
    'قبل ما صباع العميل':'bevor der Daumen des Kunden','يكمّل سكرول.':'weiterscrollt.','كل صفحة لازم تكسب اللي بعدها.':'Jede Seite muss die nächste verdienen.',
    'الاسم':'Der Name','ورا الحروف دي… رؤية ورسالة وهدف.':'Hinter den Buchstaben stehen Vision, Mission und Ziel.',
    'رؤية':'Vision','ابتكار':'Innovation','قيمة':'Wert','أثر':'Wirkung','ثقة':'Vertrauen',
    'إحنا شركة ماركتينج E2E.':'Wir sind eine E2E-Marketingagentur.','الأرقام الأول… عشان وقتك غالي.':'Zuerst die Zahlen. Ihre Zeit zählt.',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Kampagnen in Ägypten, Saudi-Arabien und den VAE — auf Arabisch und Englisch.',
    'عميل':'Kunden','في أكتر من':'in mehr als','مجال.':'Branchen.','ملايين':'Millionen','جنيه ميديا اتدارت على إيدينا':'EGP Media-Budget von unserem Team verwaltet',
    'مشروع اتسلّم':'Projekte geliefert','خدمة ماركتينج E2E':'E2E-Marketingservices','سنين في السوق':'Jahre am Markt','سنين… متوسط بقاء العميل':'Jahre — durchschnittliche Kundenbindung','متابع على حسابنا إحنا':'Follower auf unserem eigenen Account',
    'جنيه':'EGP','ليد':'Lead','ليدز':'Leads','جنيه متوسط تكلفة الليد':'EGP durchschnittliche Lead-Kosten','جنيه تكلفة الليد':'EGP Kosten pro Lead','جنيه صرف':'EGP Werbeausgaben'
  },
  fr:{
    'جنيه':'EGP','ليد':'lead','ليدز':'leads','عميل محتمل':'prospect','عميل محتمل (ليد)':'prospect (lead)',
    'جنيه متوسط تكلفة الليد':'EGP coût moyen par lead','جنيه تكلفة الليد':'EGP coût par lead','جنيه صرف':'EGP de dépenses',
    'ملايين':'Millions','جنيه ميديا اتدارت على إيدينا':'d’EGP de média gérés par notre équipe','عميل':'clients','في أكتر من':'dans plus de','مجال.':'secteurs.',
    'مشروع اتسلّم':'projets livrés','خدمة ماركتينج E2E':'services marketing E2E','سنين في السوق':'ans sur le marché','سنين… متوسط بقاء العميل':'ans — durée moyenne de collaboration','متابع على حسابنا إحنا':'abonnés sur notre propre compte'
  },
  'zh-CN':{
    'كل براند':'每个品牌','عنده':'都有自己的','حكاية.':'故事。','إحنا اللي بنوصّلها':'我们把它','للعالم.':'带向世界。',
    'مين':'我们是谁','بنعمل إيه':'我们做什么','ماركتينج':'营销','+ تك هاوس':'+ Tech House','فين':'服务区域','مصر والشرق الأوسط':'埃及和中东',
    'القاعدة':'规则','يعني إيه VIVIT أصلاً؟':'VIVIT 到底代表什么？','ثواني.':'秒。','ده تقريبًا كل اللي معاك…':'这几乎就是你拥有的全部时间……',
    'قبل ما صباع العميل':'在客户的手指','يكمّل سكرول.':'继续滑动之前。','كل صفحة لازم تكسب اللي بعدها.':'每一页都必须让人想继续看下一页。',
    'الاسم':'名字','ورا الحروف دي… رؤية ورسالة وهدف.':'这些字母背后，是愿景、使命和目标。','رؤية':'愿景','ابتكار':'创新','قيمة':'价值','أثر':'影响','ثقة':'信任',
    'إحنا شركة ماركتينج E2E.':'我们是一家端到端 E2E 营销公司。','الأرقام الأول… عشان وقتك غالي.':'先看数字，因为你的时间很宝贵。',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'我们在埃及、沙特阿拉伯和阿联酋开展阿拉伯语和英语营销活动。',
    'عميل':'客户','في أكتر من':'覆盖超过','مجال.':'个行业。','ملايين':'数百万','جنيه ميديا اتدارت على إيدينا':'EGP 媒体预算由我们的团队管理',
    'مشروع اتسلّم':'个已交付项目','خدمة ماركتينج E2E':'项 E2E 营销服务','سنين في السوق':'年市场经验','سنين… متوسط بقاء العميل':'年 — 平均客户合作周期','متابع على حسابنا إحنا':'我们自有账号的粉丝',
    'جنيه':'EGP','ليد':'潜在客户','ليدز':'潜在客户','جنيه متوسط تكلفة الليد':'EGP 平均获客成本','جنيه تكلفة الليد':'EGP 单个获客成本','جنيه صرف':'EGP 广告支出'
  },
  pl:{
    'كل براند':'Każda marka','عنده':'ma swoją','حكاية.':'historię.','إحنا اللي بنوصّلها':'My niesiemy ją','للعالم.':'w świat.',
    'مين':'Kim jesteśmy','بنعمل إيه':'Co robimy','ماركتينج':'Marketing','+ تك هاوس':'+ Tech House','فين':'Gdzie','مصر والشرق الأوسط':'Egipt i Bliski Wschód',
    'القاعدة':'Zasada','يعني إيه VIVIT أصلاً؟':'Co właściwie oznacza VIVIT?','ثواني.':'sekundy.','ده تقريبًا كل اللي معاك…':'Mniej więcej tyle masz czasu…',
    'قبل ما صباع العميل':'zanim kciuk klienta','يكمّل سكرول.':'przewinie dalej.','كل صفحة لازم تكسب اللي بعدها.':'Każda strona musi zapracować na następną.',
    'الاسم':'Nazwa','ورا الحروف دي… رؤية ورسالة وهدف.':'Za tymi literami stoją wizja, misja i cel.','رؤية':'Wizja','ابتكار':'Innowacja','قيمة':'Wartość','أثر':'Wpływ','ثقة':'Zaufanie',
    'إحنا شركة ماركتينج E2E.':'Jesteśmy agencją marketingową E2E.','الأرقام الأول… عشان وقتك غالي.':'Najpierw liczby. Twój czas ma znaczenie.',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Prowadzimy kampanie w Egipcie, Arabii Saudyjskiej i ZEA — po arabsku i angielsku.',
    'عميل':'klientów','في أكتر من':'w ponad','مجال.':'branżach.','ملايين':'Miliony','جنيه ميديا اتدارت على إيدينا':'EGP budżetu mediowego zarządzanego przez nasz zespół',
    'مشروع اتسلّم':'zrealizowanych projektów','خدمة ماركتينج E2E':'usług marketingowych E2E','سنين في السوق':'lat na rynku','سنين… متوسط بقاء العميل':'lata — średni czas współpracy z klientem','متابع على حسابنا إحنا':'obserwujących na naszym koncie',
    'جنيه':'EGP','ليد':'lead','ليدز':'leady','جنيه متوسط تكلفة الليد':'EGP średni koszt leada','جنيه تكلفة الليد':'EGP koszt leada','جنيه صرف':'EGP wydatków'
  },
  sv:{
    'كل براند':'Varje varumärke','عنده':'har sin','حكاية.':'historia.','إحنا اللي بنوصّلها':'Vi tar den','للعالم.':'ut i världen.',
    'مين':'Vilka vi är','بنعمل إيه':'Vad vi gör','ماركتينج':'Marknadsföring','+ تك هاوس':'+ Tech House','فين':'Var','مصر والشرق الأوسط':'Egypten och Mellanöstern',
    'القاعدة':'Regeln','يعني إيه VIVIT أصلاً؟':'Vad betyder VIVIT egentligen?','ثواني.':'sekunder.','ده تقريبًا كل اللي معاك…':'Ungefär så mycket tid har du…',
    'قبل ما صباع العميل':'innan kundens tumme','يكمّل سكرول.':'scrollar vidare.','كل صفحة لازم تكسب اللي بعدها.':'Varje sida måste förtjäna nästa.',
    'الاسم':'Namnet','ورا الحروف دي… رؤية ورسالة وهدف.':'Bakom bokstäverna finns vision, mission och mål.','رؤية':'Vision','ابتكار':'Innovation','قيمة':'Värde','أثر':'Effekt','ثقة':'Förtroende',
    'إحنا شركة ماركتينج E2E.':'Vi är en E2E-marknadsföringsbyrå.','الأرقام الأول… عشان وقتك غالي.':'Siffrorna först. Din tid är värdefull.',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Kampanjer i Egypten, Saudiarabien och Förenade Arabemiraten — på arabiska och engelska.',
    'عميل':'kunder','في أكتر من':'i fler än','مجال.':'branscher.','ملايين':'Miljoner','جنيه ميديا اتدارت على إيدينا':'EGP i mediebudget hanterad av vårt team',
    'مشروع اتسلّم':'levererade projekt','خدمة ماركتينج E2E':'E2E-marknadsföringstjänster','سنين في السوق':'år på marknaden','سنين… متوسط بقاء العميل':'år — genomsnittlig kundrelation','متابع على حسابنا إحنا':'följare på vårt eget konto',
    'جنيه':'EGP','ليد':'lead','ليدز':'leads','جنيه متوسط تكلفة الليد':'EGP genomsnittlig kostnad per lead','جنيه تكلفة الليد':'EGP kostnad per lead','جنيه صرف':'EGP annonsutgifter'
  },
  es:{
    'كل براند':'Cada marca','عنده':'tiene su','حكاية.':'historia.','إحنا اللي بنوصّلها':'Nosotros la llevamos','للعالم.':'al mundo.',
    'مين':'Quiénes somos','بنعمل إيه':'Qué hacemos','ماركتينج':'Marketing','+ تك هاوس':'+ Tech House','فين':'Dónde','مصر والشرق الأوسط':'Egipto y Oriente Medio',
    'القاعدة':'La regla','يعني إيه VIVIT أصلاً؟':'¿Qué significa realmente VIVIT?','ثواني.':'segundos.','ده تقريبًا كل اللي معاك…':'Eso es casi todo el tiempo que tienes…',
    'قبل ما صباع العميل':'antes de que el pulgar del cliente','يكمّل سكرول.':'siga desplazándose.','كل صفحة لازم تكسب اللي بعدها.':'Cada página debe ganarse la siguiente.',
    'الاسم':'El nombre','ورا الحروف دي… رؤية ورسالة وهدف.':'Detrás de estas letras hay visión, misión y objetivo.','رؤية':'Visión','ابتكار':'Innovación','قيمة':'Valor','أثر':'Impacto','ثقة':'Confianza',
    'إحنا شركة ماركتينج E2E.':'Somos una agencia de marketing E2E.','الأرقام الأول… عشان وقتك غالي.':'Primero los números. Tu tiempo importa.',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Campañas en Egipto, Arabia Saudí y Emiratos — en árabe e inglés.',
    'عميل':'clientes','في أكتر من':'en más de','مجال.':'sectores.','ملايين':'Millones','جنيه ميديا اتدارت على إيدينا':'EGP en medios gestionados por nuestro equipo',
    'مشروع اتسلّم':'proyectos entregados','خدمة ماركتينج E2E':'servicios de marketing E2E','سنين في السوق':'años en el mercado','سنين… متوسط بقاء العميل':'años — relación media con clientes','متابع على حسابنا إحنا':'seguidores en nuestra cuenta',
    'جنيه':'EGP','ليد':'lead','ليدز':'leads','جنيه متوسط تكلفة الليد':'EGP coste medio por lead','جنيه تكلفة الليد':'EGP coste por lead','جنيه صرف':'EGP de inversión'
  },
  ru:{
    'جنيه':'EGP','ليد':'лид','ليدز':'лиды','جنيه متوسط تكلفة الليد':'EGP средняя стоимость лида','جنيه تكلفة الليد':'EGP стоимость лида','جنيه صرف':'EGP рекламных расходов',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Кампании в Египте, Саудовской Аравии и ОАЭ — на арабском и английском.',
    'عميل':'клиентов','في أكتر من':'более чем в','مجال.':'отраслях.','ملايين':'Миллионы','جنيه ميديا اتدارت على إيدينا':'EGP медиабюджета под управлением нашей команды',
    'مشروع اتسلّم':'реализованных проектов','خدمة ماركتينج E2E':'E2E-маркетинговых услуг','سنين في السوق':'лет на рынке','سنين… متوسط بقاء العميل':'года — средний срок сотрудничества','متابع على حسابنا إحنا':'подписчиков в нашем аккаунте'
  },
  pt:{
    'جنيه':'EGP','ليد':'lead','ليدز':'leads','جنيه متوسط تكلفة الليد':'EGP custo médio por lead','جنيه تكلفة الليد':'EGP custo por lead','جنيه صرف':'EGP de investimento',
    'حملات شغالة في مصر والسعودية والإمارات — بالعربي والإنجليزي.':'Campanhas no Egito, Arábia Saudita e Emirados — em árabe e inglês.',
    'عميل':'clientes','في أكتر من':'em mais de','مجال.':'setores.','ملايين':'Milhões','جنيه ميديا اتدارت على إيدينا':'EGP em mídia gerida pela nossa equipa',
    'مشروع اتسلّم':'projetos entregues','خدمة ماركتينج E2E':'serviços de marketing E2E','سنين في السوق':'anos no mercado','سنين… متوسط بقاء العميل':'anos — duração média da relação com clientes','متابع على حسابنا إحنا':'seguidores na nossa conta'
  }
};

const FINAL_REVIEW={
  de:{
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Wenn Sie die Aufmerksamkeit dort nicht gewinnen, ist alles danach verloren. Deshalb folgt dieses Profil einer einfachen Regel:',
    'مش اسم…':'ist nicht nur ein Name…','ده وعد من':'Es ist ein Versprechen in','حروف.':'Buchstaben.','اتولد من كلمتين:':'Entstanden aus zwei Wörtern:','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…verbunden durch die Buchstaben in der Mitte.',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Wir denken daran, wo die Marke in fünf Jahren stehen soll — nicht nur morgen.',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'Jedes Mal eine neue Idee — keine Kopie des Marktes.',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Jeder investierte EGP soll mehr Wert zurückbringen.',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Gemessen an Umsatz und Reputation — nicht an Likes.',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Unsere Kunden bleiben jahrelang bei uns. Dieses Vertrauen zählt am meisten.'
  },
  'zh-CN':{
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'如果不能在这几秒抓住注意力，后面的内容就失去意义。因此，这份公司介绍遵循一个简单原则：',
    'مش اسم…':'不只是一个名字……','ده وعد من':'而是一份由','حروف.':'个字母组成的承诺。','اتولد من كلمتين:':'源自两个词：','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'……中间的字母把它们连接在一起。',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'我们关注品牌五年后的位置，而不只是明天。',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'每一次都是新想法，而不是市场的复制品。',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'每一笔 EGP 投入，都应该带来更高价值。',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'以销售和品牌声誉衡量，而不是点赞数。',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'客户与我们长期合作，这份信任最珍贵。',
    'ماركتينج':'营销','+ تك هاوس':'+ Tech House'
  },
  pl:{
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Jeśli nie zatrzymasz uwagi w tych kilku sekundach, wszystko później traci znaczenie. Dlatego ten profil opiera się na jednej zasadzie:',
    'مش اسم…':'to nie tylko nazwa…','ده وعد من':'To obietnica w','حروف.':'literach.','اتولد من كلمتين:':'Powstała z dwóch słów:','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…a środkowe litery łączą je ze sobą.',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Patrzymy, gdzie marka powinna być za pięć lat — nie tylko jutro.',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'Za każdym razem świeży pomysł — nigdy kopia rynku.',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Każdy wydany EGP powinien wrócić z większą wartością.',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Mierzymy sprzedażą i reputacją — nie lajkami.',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Klienci zostają z nami na lata. To zaufanie jest najcenniejsze.'
  },
  sv:{
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Om du inte fångar uppmärksamheten där spelar resten ingen roll. Därför bygger den här profilen på en enkel regel:',
    'مش اسم…':'är inte bara ett namn…','ده وعد من':'Det är ett löfte i','حروف.':'bokstäver.','اتولد من كلمتين:':'Skapat av två ord:','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…med bokstäverna i mitten som binder ihop dem.',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Vi ser var varumärket ska vara om fem år — inte bara i morgon.',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'En ny idé varje gång — aldrig en kopia av marknaden.',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Varje investerad EGP ska ge mer värde tillbaka.',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Mäts i försäljning och rykte — inte likes.',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Våra kunder stannar i flera år. Det förtroendet betyder mest.'
  },
  es:{
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Si no captas la atención ahí, todo lo que viene después pierde valor. Por eso este perfil sigue una regla sencilla:',
    'مش اسم…':'no es solo un nombre…','ده وعد من':'Es una promesa en','حروف.':'letras.','اتولد من كلمتين:':'Nació de dos palabras:','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…y las letras del centro las conectan.',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Vemos dónde debe estar la marca dentro de cinco años — no solo mañana.',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'Una idea nueva cada vez — nunca una copia del mercado.',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Cada EGP invertido debe devolver más valor.',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Se mide en ventas y reputación — no en likes.',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Nuestros clientes siguen con nosotros durante años. Esa confianza es lo más valioso.'
  },
  ru:{
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Если вы не захватили внимание в эти секунды, всё дальше теряет смысл. Поэтому этот профиль строится на одном простом правиле:',
    'مش اسم…':'не просто название…','ده وعد من':'Это обещание в','حروف.':'буквах.','اتولد من كلمتين:':'Оно родилось из двух слов:','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…а буквы в середине соединяют их.',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Мы думаем о том, где бренд должен быть через пять лет — не только завтра.',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'Каждый раз новая идея — не копия рынка.',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Каждый вложенный EGP должен возвращать больше ценности.',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Измеряется продажами и репутацией — не лайками.',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Клиенты остаются с нами годами. Это доверие важнее всего.'
  },
  pt:{
    'ماركتينج':'Marketing','+ تك هاوس':'+ Tech House',
    'لو ما مسكتوش فيهم، كل اللي بعد كده مالوش لازمة. عشان كده البروفايل ده معمول بنفس القاعدة:':'Se não captar a atenção nesses segundos, tudo o que vem depois perde valor. Por isso, este perfil segue uma regra simples:',
    'مش اسم…':'não é apenas um nome…','ده وعد من':'É uma promessa em','حروف.':'letras.','اتولد من كلمتين:':'Nasceu de duas palavras:','… والحرفين اللي في النص هما اللي بيوصّلوا بينهم.':'…e as letras do meio fazem a ligação entre elas.',
    'بنشوف البراند فين بعد 5 سنين… مش بكرة بس.':'Pensamos onde a marca deve estar daqui a cinco anos — não apenas amanhã.',
    'فكرة جديدة كل مرة — مش نسخة من السوق.':'Uma ideia nova de cada vez — nunca uma cópia do mercado.',
    'كل جنيه بيتصرف معانا… لازم يرجع بأكتر منه.':'Cada EGP investido deve devolver mais valor.',
    'بيتقاس بالمبيعات والسمعة… مش باللايكات.':'Mede-se em vendas e reputação — não em likes.',
    'عملاءنا بيكمّلوا معانا سنين. ودي أغلى حاجة.':'Os nossos clientes ficam connosco durante anos. Essa confiança vale mais.'
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
  Object.assign(map,GLOSSARY[tl]||{},OVERRIDES[tl]||{},SEGMENT_OVERRIDES[tl]||{},REVIEWED_COPY[tl]||{},FINAL_REVIEW[tl]||{});
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
