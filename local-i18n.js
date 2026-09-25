(function(){
  const LANGS={ar:'/',en:'/en/',de:'/de/',fr:'/fr/','zh-CN':'/zh/',pl:'/pl/',sv:'/sv/',es:'/es/',ru:'/ru/',pt:'/pt/'};
  const lang=window.__VIVIT_LANG__||'ar';
  const VERSION='20260925-2218';
  const mobile=window.matchMedia&&window.matchMedia('(max-width:900px)').matches;

  function assetUrl(img){
    const map=window.__VIVIT_ASSETS__||{};
    const ext=map[img.dataset.a];
    return ext?('/assets/'+img.dataset.a+'.'+ext):null;
  }
  function loadImage(img){
    if(img.dataset.loaded==='1') return;
    const u=assetUrl(img); if(!u) return;
    img.dataset.loaded='1';
    img.decoding='async';
    img.loading='lazy';
    img.src=u;
  }
  function unloadImage(img){
    if(img.dataset.loaded!=='1') return;
    img.removeAttribute('src');
    img.dataset.loaded='0';
  }

  function fitSlide(sl){
    if(!sl || lang==='ar') return;
    const els=[...sl.querySelectorAll('p,h1,h2,h3,h4,div,span')];
    els.forEach(el=>{
      const text=(el.textContent||'').trim();
      if(text.length<7 || el.children.length>2 || el.clientWidth<22 || el.clientHeight<10) return;
      let fs=parseFloat(getComputedStyle(el).fontSize);
      if(!fs || fs<11) return;
      const min=Math.max(9,fs*0.70);
      let n=0;
      while((el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2) && fs>min && n++<10){
        fs*=0.95;
        el.style.fontSize=fs+'px';
        el.style.lineHeight='1.14';
      }
    });
  }

  function initMobile(){
    if(!mobile) return false;

    // Preserve the original continuous 46-slide layout.
    document.documentElement.classList.remove('anim');
    document.querySelectorAll('.sw,.slide').forEach(el=>el.classList.add('seen'));
    document.querySelectorAll('.a').forEach(el=>{
      el.style.opacity='1';
      el.style.animation='none';
      if(!el.style.transform) el.style.transform='none';
    });

    // Load header logo immediately.
    document.querySelectorAll('.topbar img[data-a],.topbar [data-a]').forEach(loadImage);

    const wrappers=[...document.querySelectorAll('.sw')];
    function fit(){
      wrappers.forEach(w=>{
        const sl=w.firstElementChild;
        if(!sl) return;
        const sc=w.clientWidth/1920;
        w.style.height=(1080*sc)+'px';
        sl.style.left='0';sl.style.top='0';sl.style.translate='none';
        sl.style.transformOrigin='0 0';
        sl.style.transform='scale('+sc+')';
      });
    }
    fit();

    // Keep images decoded only near the viewport.
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver(entries=>{
        entries.forEach(en=>{
          const imgs=[...en.target.querySelectorAll('img[data-a]')];
          if(en.isIntersecting){
            imgs.forEach(loadImage);
            requestAnimationFrame(()=>fitSlide(en.target.firstElementChild));
          }else{
            const r=en.target.getBoundingClientRect();
            if(r.bottom < -innerHeight*2.5 || r.top > innerHeight*3.5) imgs.forEach(unloadImage);
          }
        });
      },{rootMargin:'120% 0px',threshold:0});
      wrappers.forEach(w=>io.observe(w));
    }else{
      wrappers.slice(0,5).forEach(w=>[...w.querySelectorAll('img[data-a]')].forEach(loadImage));
    }

    addEventListener('resize',fit,{passive:true});
    return true;
  }

  function initDesktop(){
    const imgs=[...document.querySelectorAll('img[data-a]')];
    imgs.slice(0,12).forEach(loadImage);
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver(es=>es.forEach(e=>{
        if(e.isIntersecting){loadImage(e.target);io.unobserve(e.target)}
      }),{rootMargin:'1000px 0px'});
      imgs.slice(12).forEach(i=>io.observe(i));
    }else imgs.forEach(loadImage);
    document.querySelectorAll('.slide').forEach(fitSlide);
  }

  function releasePageMemory(){
    document.querySelectorAll('img[data-a]').forEach(unloadImage);
    document.querySelectorAll('video').forEach(v=>{try{v.pause();v.removeAttribute('src');v.load()}catch(e){}});
  }

  const box=document.getElementById('langbox');
  const btn=document.getElementById('langbtn');
  document.querySelectorAll('.langitem').forEach(x=>{
    x.onclick=function(e){
      e.preventDefault();e.stopPropagation();
      const base=LANGS[x.dataset.lang]||'/';
      const dest=base+'?v='+VERSION;
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
    const dest=LANGS[q]+'?v='+VERSION;
    if(location.pathname!==dest){releasePageMemory();location.replace(dest)}
    else history.replaceState(null,'',dest);
    return;
  }

  if(!initMobile()) initDesktop();
})();