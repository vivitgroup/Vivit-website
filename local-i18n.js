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
    img.loading='eager';
    img.src='/assets/'+img.dataset.a+'.'+ext;
  }
  function loadImagesIn(root){
    [...root.querySelectorAll('img[data-a]')].forEach(loadImage);
  }
  function fitSlide(sl){
    if(!sl || lang==='ar') return;
    const els=[...sl.querySelectorAll('p,h1,h2,h3,h4,div,span')];
    els.forEach(el=>{
      const text=(el.textContent||'').trim();
      if(text.length<7 || el.children.length>2 || el.clientWidth<22 || el.clientHeight<10) return;
      let fs=parseFloat(getComputedStyle(el).fontSize);
      if(!fs || fs<11) return;
      const min=Math.max(9,fs*0.66);
      let n=0;
      while((el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2) && fs>min && n++<12){
        fs*=0.94;
        el.style.fontSize=fs+'px';
        el.style.lineHeight='1.12';
      }
    });
  }

  function initSingleSlideMobile(){
    if(!mobile) return false;
    document.querySelectorAll('.topbar img[data-a], .topbar [data-a]').forEach(loadImage);
    const deck=document.querySelector('.deck');
    const wrappers=[...document.querySelectorAll('.deck>.sw')];
    if(!deck || wrappers.length!==46) return false;

    const slides=wrappers.map(w=>w.innerHTML);
    const ct=document.querySelector('.ct');
    const prog=document.querySelector('.prog i');
    const hint=document.querySelector('.hint');
    if(hint) hint.remove();

    // Remove the full 46-slide DOM completely.
    wrappers.forEach(w=>w.remove());

    const host=document.createElement('div');
    host.id='mobile-slide-host';
    host.style.cssText='width:100%;margin:0;padding:0;overflow:hidden;position:relative;background:#141312;touch-action:pan-y;';
    deck.appendChild(host);

    let index=0;
    function render(next,instant){
      index=Math.max(0,Math.min(slides.length-1,next));
      host.innerHTML='';
      const w=document.createElement('div');
      w.className='sw mobile-live-slide';
      w.innerHTML=slides[index];
      w.style.cssText='width:100%;aspect-ratio:16/9;height:auto;border-radius:0;box-shadow:none;background:#141312;overflow:hidden;position:relative;';
      host.appendChild(w);
      const sl=w.firstElementChild;
      if(sl){
        w.classList.add('seen');
        sl.classList.add('seen');
        sl.querySelectorAll('.a').forEach(el=>{
          el.style.opacity='1';
          el.style.animation='none';
          el.style.transform=el.style.transform||'none';
        });
        const sc=w.clientWidth/1920;
        w.style.height=(1080*sc)+'px';
        sl.style.left='0';sl.style.top='0';sl.style.translate='none';
        sl.style.transformOrigin='0 0';
        sl.style.transform='scale('+sc+')';
        loadImagesIn(w);
        requestAnimationFrame(()=>fitSlide(sl));
      }
      if(ct) ct.textContent=String(index+1).padStart(2,'0')+' / '+slides.length;
      if(prog) prog.style.width=((index+1)/slides.length*100)+'%';
      if(!instant) host.animate([{opacity:.82,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
      scrollTo(0,0);
    }

    let sx=0,sy=0,active=false;
    host.addEventListener('touchstart',e=>{
      const t=e.touches&&e.touches[0]; if(!t)return;
      sx=t.clientX;sy=t.clientY;active=true;
    },{passive:true});
    host.addEventListener('touchend',e=>{
      if(!active)return;active=false;
      const t=e.changedTouches&&e.changedTouches[0]; if(!t)return;
      const dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.max(Math.abs(dx),Math.abs(dy))<42)return;
      if(Math.abs(dy)>=Math.abs(dx)) render(index+(dy<0?1:-1));
      else render(index+(dx<0?1:-1));
    },{passive:true});

    document.addEventListener('keydown',e=>{
      if(['ArrowDown','ArrowLeft','PageDown',' '].includes(e.key)){e.preventDefault();render(index+1)}
      if(['ArrowUp','ArrowRight','PageUp'].includes(e.key)){e.preventDefault();render(index-1)}
    });

    // Tap left/right edges as an additional fallback.
    host.addEventListener('click',e=>{
      const x=e.clientX/innerWidth;
      if(x<0.18) render(index-1);
      else if(x>0.82) render(index+1);
    });

    addEventListener('resize',()=>render(index,true),{passive:true});
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
    deck.style.paddingBottom='0';
    document.documentElement.classList.remove('anim');
    render(0,true);
    return true;
  }

  function desktopLazyImages(){
    const imgs=[...document.querySelectorAll('img[data-a]')];
    imgs.slice(0,12).forEach(loadImage);
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){loadImage(e.target);io.unobserve(e.target)}}),{rootMargin:'1000px 0px'});
      imgs.slice(12).forEach(i=>io.observe(i));
    }else imgs.forEach(loadImage);
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

  const start=()=>{if(!initSingleSlideMobile()){desktopLazyImages();document.querySelectorAll('.slide').forEach(fitSlide)}};
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(start); else start();
})();