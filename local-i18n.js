(function(){
  const LANGS={ar:'/',en:'/en/',de:'/de/',fr:'/fr/','zh-CN':'/zh/',pl:'/pl/',sv:'/sv/',es:'/es/',ru:'/ru/',pt:'/pt/'};
  const lang=window.__VIVIT_LANG__||'ar';

  // iPhone / in-app browser memory protection:
  // keep off-screen slides out of the render tree while preserving their layout/scroll height.
  const style=document.createElement('style');
  style.textContent='@media (max-width: 900px){.sw{content-visibility:auto;contain:layout paint style;contain-intrinsic-size:auto 56.25vw}.slide{backface-visibility:hidden;-webkit-backface-visibility:hidden}}';
  document.head.appendChild(style);

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
  imgs.slice(0,2).forEach(loadImage);
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{
      for(const e of entries){
        if(e.isIntersecting){loadImage(e.target);io.unobserve(e.target)}
      }
    },{rootMargin:'500px 0px'});
    imgs.slice(2).forEach(i=>io.observe(i));
  }else imgs.slice(0,6).forEach(loadImage);

  function releasePageMemory(){
    try{
      document.querySelectorAll('img[data-a]').forEach(img=>{
        if(img.dataset.loaded==='1'){img.removeAttribute('src');img.dataset.loaded='0'}
      });
      document.querySelectorAll('video').forEach(v=>{try{v.pause();v.removeAttribute('src');v.load()}catch(e){}});
    }catch(e){}
  }

  const box=document.getElementById('langbox');
  const btn=document.getElementById('langbtn');
  document.querySelectorAll('.langitem').forEach(x=>{
    x.onclick=function(e){
      e.preventDefault();
      e.stopPropagation();
      const dest=LANGS[x.dataset.lang]||'/';
      if(location.pathname!==dest){
        if(box) box.classList.remove('open');
        releasePageMemory();
        // Replace avoids stacking full 46-slide pages in iOS/Facebook WebView history/BFCache.
        location.replace(dest);
      } else if(box) box.classList.remove('open');
    };
  });
  if(btn) btn.onclick=function(e){e.stopPropagation();box&&box.classList.toggle('open')};
  document.addEventListener('click',()=>box&&box.classList.remove('open'));

  // Release heavy decoded media if the page is being backgrounded/replaced.
  window.addEventListener('pagehide',releasePageMemory,{capture:true});

  // Backward compatibility for old shared ?lang= links.
  const q=new URLSearchParams(location.search).get('lang');
  if(q && LANGS[q]){
    const dest=LANGS[q];
    if(location.pathname!==dest){
      releasePageMemory();
      location.replace(dest);
    } else history.replaceState(null,'',dest);
  }
})();