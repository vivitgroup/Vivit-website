(function(){
  const LANGS={ar:['🇪🇬','العربية'],en:['🇬🇧','English'],de:['🇩🇪','Deutsch'],fr:['🇫🇷','Français'],'zh-CN':['🇨🇳','中文'],pl:['🇵🇱','Polski'],sv:['🇸🇪','Svenska'],es:['🇪🇸','Español']};
  const p=new URLSearchParams(location.search);
  const lang=LANGS[p.get('lang')]?p.get('lang'):'ar';
  const maps=window.__VIVIT_I18N__||{};
  const dict=maps[lang]||{};
  const isAr=lang==='ar';

  document.documentElement.lang=lang==='zh-CN'?'zh-CN':lang;
  document.documentElement.dir=isAr?'rtl':'ltr';
  document.body.dir=isAr?'rtl':'ltr';
  document.querySelectorAll('.slide').forEach(s=>s.dir=isAr?'rtl':'ltr');

  if(!isAr){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const n of nodes){
      const p=n.parentElement;
      if(!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(p.tagName)) continue;
      const raw=n.nodeValue||'';
      const t=raw.trim();
      if(!t || !dict[t]) continue;
      const lead=(raw.match(/^\s*/)||[''])[0], tail=(raw.match(/\s*$/)||[''])[0];
      n.nodeValue=lead+dict[t]+tail;
    }
  }

  const box=document.getElementById('langbox');
  const btn=document.getElementById('langbtn');
  const flag=document.getElementById('langflag');
  const name=document.getElementById('langname');
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
  if(btn) btn.onclick=function(e){e.stopPropagation();box&&box.classList.toggle('open')};
  document.addEventListener('click',()=>box&&box.classList.remove('open'));
})();