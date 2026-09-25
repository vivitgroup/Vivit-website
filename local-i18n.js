(function(){
  const LANGS={ar:'/',en:'/en/',de:'/de/',fr:'/fr/','zh-CN':'/zh/',pl:'/pl/',sv:'/sv/',es:'/es/',ru:'/ru/',pt:'/pt/'};
  const lang=window.__VIVIT_LANG__||'ar';
  const mobile=window.matchMedia&&window.matchMedia('(max-width:900px)').matches;

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
  function loadImagesIn(root){
    const imgs=[...root.querySelectorAll('img[data-a]')];
    imgs.forEach(loadImage);
  }

  function fitSlide(sl){
    if(!sl || lang==='ar') return;
    const els=[...sl.querySelectorAll('p,h1,h2,h3,h4,div,span')];
    els.forEach(el=>{
      const text=(el.textContent||'').trim();
      if(text.length<6 || el.children.length>2 || el.clientWidth<20 || el.clientHeight<10) return;
      let fs=parseFloat(getComputedStyle(el).fontSize);
      if(!fs || fs<11) return;
      const min=Math.max(9,fs*0.70);
      let n=0;
      while((el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2) && fs>min && n++<8){
        fs*=0.94;
        el.style.fontSize=fs+'px';
        el.style.lineHeight='1.15';
      }
    });
  }

  // Mobile windowing: only keep the current slide and its two neighbours in the DOM.
  // Every other wrapper remains as a same-height placeholder, preserving continuous 16:9 scrolling.
  function initVirtualSlides(){
    if(!mobile) return;
    const wrappers=[...document.querySelectorAll('.sw')];
    if(wrappers.length<10) return;

    const saved=wrappers.map((w,i)=>{
      const h=w.getBoundingClientRect().height || (w.clientWidth*1080/1920);
      w.dataset.vi=String(i);
      w.style.height=h+'px';
      return {html:w.innerHTML,height:h,live:true};
    });

    function scaleRestored(w){
      const sl=w.querySelector('.slide');
      if(!sl) return;
      const sc=w.clientWidth/1920;
      sl.style.left='0'; sl.style.top='0'; sl.style.translate='none';
      sl.style.transformOrigin='0 0'; sl.style.transform='scale('+sc+')';
      loadImagesIn(w);
      requestAnimationFrame(()=>fitSlide(sl));
    }
    function hydrate(i){
      const s=saved[i],w=wrappers[i];
      if(!s||s.live) return;
      w.innerHTML=s.html;
      s.live=true;
      scaleRestored(w);
    }
    function dehydrate(i){
      const s=saved[i],w=wrappers[i];
      if(!s||!s.live) return;
      const rect=w.getBoundingClientRect();
      if(Math.abs(rect.top)<innerHeight*2.2 || Math.abs(rect.bottom)<innerHeight*2.2) return;
      w.innerHTML='<div aria-hidden="true" style="width:100%;height:100%;background:transparent"></div>';
      s.live=false;
    }
    function currentIndex(){
      const mid=innerHeight*0.45;
      let best=0,dist=Infinity;
      wrappers.forEach((w,i)=>{
        const r=w.getBoundingClientRect();
        const d=Math.abs((r.top+r.bottom)/2-mid);
        if(d<dist){dist=d;best=i}
      });
      return best;
    }
    let ticking=false;
    function update(){
      ticking=false;
      const c=currentIndex();
      for(let i=Math.max(0,c-2);i<=Math.min(wrappers.length-1,c+2);i++) hydrate(i);
      wrappers.forEach((w,i)=>{if(Math.abs(i-c)>2) dehydrate(i)});
    }
    wrappers.forEach((w,i)=>{ if(i>2) dehydrate(i); else scaleRestored(w); });
    addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update)}},{passive:true});
    addEventListener('resize',()=>{
      wrappers.forEach((w,i)=>{
        const h=w.clientWidth*1080/1920; saved[i].height=h; w.style.height=h+'px';
        if(saved[i].live) scaleRestored(w);
      });
      update();
    },{passive:true});
    update();
  }

  // Desktop / initial mobile image loading
  const initial=[...document.querySelectorAll('img[data-a]')];
  initial.slice(0,mobile?2:12).forEach(loadImage);
  if(!mobile && 'IntersectionObserver' in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){loadImage(e.target);io.unobserve(e.target)}}),{rootMargin:'1000px 0px'});
    initial.slice(12).forEach(i=>io.observe(i));
  }

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
      e.preventDefault();e.stopPropagation();
      const dest=LANGS[x.dataset.lang]||'/';
      if(location.pathname!==dest){
        if(box) box.classList.remove('open');
        releasePageMemory();
        location.replace(dest);
      }else if(box) box.classList.remove('open');
    };
  });
  if(btn) btn.onclick=e=>{e.stopPropagation();box&&box.classList.toggle('open')};
  document.addEventListener('click',()=>box&&box.classList.remove('open'));
  addEventListener('pagehide',releasePageMemory,{capture:true});

  const q=new URLSearchParams(location.search).get('lang');
  if(q && LANGS[q]){
    const dest=LANGS[q];
    if(location.pathname!==dest){releasePageMemory();location.replace(dest)}
    else history.replaceState(null,'',dest);
    return;
  }

  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(()=>{initVirtualSlides(); if(!mobile) document.querySelectorAll('.slide').forEach(fitSlide)});
  }else initVirtualSlides();
})();