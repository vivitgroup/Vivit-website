(function(){
  const LANGS={ar:'/',en:'/en/',de:'/de/',fr:'/fr/','zh-CN':'/zh/',pl:'/pl/',sv:'/sv/',es:'/es/',ru:'/ru/',pt:'/pt/'};
  const lang=window.__VIVIT_LANG__||'ar';

  function loadImage(img){
    if(img.dataset.loaded==='1') return;
    const map=window.__VIVIT_ASSETS__||{};
    const ext=map[img.dataset.a];
    if(!ext) return;
    img.dataset.loaded='1';
    img.decoding='async';
    img.loading='lazy';
    img.src='/assets/'+img.dataset.a+'.'+ext;
  }

  const imgs=[...document.querySelectorAll('img[data-a]')];
  imgs.slice(0,8).forEach(loadImage);
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{
      for(const e of entries){
        if(e.isIntersecting){loadImage(e.target);io.unobserve(e.target)}
      }
    },{rootMargin:'1200px 0px'});
    imgs.slice(8).forEach(i=>io.observe(i));
  }else imgs.forEach(loadImage);

  const box=document.getElementById('langbox');
  const btn=document.getElementById('langbtn');
  document.querySelectorAll('.langitem').forEach(x=>{
    x.onclick=function(e){
      e.stopPropagation();
      const dest=LANGS[x.dataset.lang]||'/';
      if(location.pathname!==dest) location.assign(dest);
      else box&&box.classList.remove('open');
    };
  });
  if(btn) btn.onclick=function(e){e.stopPropagation();box&&box.classList.toggle('open')};
  document.addEventListener('click',()=>box&&box.classList.remove('open'));

  // Backward compatibility for old shared ?lang= links.
  const q=new URLSearchParams(location.search).get('lang');
  if(q && LANGS[q]){
    history.replaceState(null,'',LANGS[q]);
  }
})();