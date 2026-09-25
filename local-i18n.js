(function(){
  const LANGS={ar:['🇪🇬','العربية'],en:['🇬🇧','English'],de:['🇩🇪','Deutsch'],fr:['🇫🇷','Français'],'zh-CN':['🇨🇳','中文'],pl:['🇵🇱','Polski'],sv:['🇸🇪','Svenska'],es:['🇪🇸','Español']};
  const p=new URLSearchParams(location.search);
  const lang=LANGS[p.get('lang')]?p.get('lang'):'ar';
  const isAr=lang==='ar';

  function loadImages(){
    const map=window.__VIVIT_ASSETS__||{};
    const imgs=[...document.querySelectorAll('img[data-a]')];
    const load=i=>{
      if(i.dataset.loaded==='1') return;
      const ext=map[i.dataset.a];
      if(!ext) return;
      i.dataset.loaded='1';
      i.decoding='async';
      i.src='/assets/'+i.dataset.a+'.'+ext;
    };
    imgs.slice(0,10).forEach(load);
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver(entries=>{
        entries.forEach(e=>{if(e.isIntersecting){load(e.target);io.unobserve(e.target)}});
      },{rootMargin:'180% 0px'});
      imgs.slice(10).forEach(i=>io.observe(i));
    }else imgs.forEach(load);
  }

  function translate(dict){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const n of nodes){
      const el=n.parentElement;
      if(!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(el.tagName)) continue;
      const raw=n.nodeValue||'';
      const t=raw.trim();
      if(!t || !dict[t]) continue;
      const lead=(raw.match(/^\s*/)||[''])[0],tail=(raw.match(/\s*$/)||[''])[0];
      n.nodeValue=lead+dict[t]+tail;
    }
  }

  function fitText(){
    if(isAr) return;
    const nodes=[...document.querySelectorAll('.slide p,.slide h1,.slide h2,.slide h3,.slide h4,.slide div,.slide span')];
    requestAnimationFrame(()=>{
      nodes.forEach(el=>{
        if(el.children.length>3 || !el.textContent.trim()) return;
        const cs=getComputedStyle(el);
        let size=parseFloat(cs.fontSize);
        if(!size || size<11 || el.clientWidth<18 || el.clientHeight<10) return;
        const min=Math.max(10,size*0.62);
        let guard=0;
        while((el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2) && size>min && guard++<12){
          size*=0.93;
          el.style.fontSize=size+'px';
          el.style.lineHeight='1.18';
        }
      });
      document.body.style.visibility='visible';
    });
  }

  function setupUI(){
    document.documentElement.lang=lang;
    document.documentElement.dir=isAr?'rtl':'ltr';
    document.body.dir=isAr?'rtl':'ltr';
    document.documentElement.classList.toggle('vivit-ltr',!isAr);
    document.querySelectorAll('.slide').forEach(s=>s.dir=isAr?'rtl':'ltr');

    const box=document.getElementById('langbox'),btn=document.getElementById('langbtn');
    const flag=document.getElementById('langflag'),name=document.getElementById('langname');
    if(flag) flag.textContent=LANGS[lang][0];
    if(name) name.textContent=LANGS[lang][1];
    document.querySelectorAll('.langitem').forEach(x=>{
      x.classList.toggle('active',x.dataset.lang===lang);
      x.onclick=function(e){
        e.stopPropagation();
        const l=x.dataset.lang;
        const u=new URL(location.href);
        if(l==='ar') u.searchParams.delete('lang'); else u.searchParams.set('lang',l);
        location.assign(u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);
      };
    });
    if(btn) btn.onclick=e=>{e.stopPropagation();box&&box.classList.toggle('open')};
    document.addEventListener('click',()=>box&&box.classList.remove('open'));
  }

  loadImages();
  setupUI();

  if(isAr){document.body.style.visibility='visible';return;}
  document.body.style.visibility='hidden';
  const s=document.createElement('script');
  s.src='/i18n/'+encodeURIComponent(lang)+'.js';
  s.onload=()=>{translate(window.__VIVIT_DICT__||{});fitText()};
  s.onerror=()=>{document.body.style.visibility='visible'};
  document.head.appendChild(s);
})();