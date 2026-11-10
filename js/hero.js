(function () {
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var F = window.FINGO;
  var $ = function (id) { return document.getElementById(id); };

  if (!reduced && window.Lenis) {
    var lenis = new Lenis({ lerp: .11, anchors: true, allowNestedScroll: true });
    F.lenis = lenis;
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  var hero = $('top'), pic = $('hero-pic'), big = $('hero-big'), name = $('hero-name'), tabs = $('hero-tabs'), ctlBox = $('hero-ctl');
  var shopAll = tabs.querySelector('.shop-all');
  var P = F.featured.map(function (f) {
    var p = F.byId[f.id];
    var img = new Image();
    img.src = p.img;
    img.alt = p.name;
    pic.appendChild(img);
    var ctl = F.mountControl(ctlBox, p);
    var tab = document.createElement('button');
    tab.className = 'tab';
    tab.setAttribute('aria-label', 'Show ' + p.name);
    tab.innerHTML = '<img alt="">';
    tab.firstChild.src = p.img;
    tabs.insertBefore(tab, shopAll);
    return { f: f, p: p, img: img, ctl: ctl, tab: tab };
  });

  var current = -1;
  function show(n) {
    if (n === current) return;
    current = n;
    hero.style.setProperty('--c', P[n].f.c);
    hero.style.setProperty('--t', P[n].f.t);
    big.textContent = P[n].f.line;
    name.textContent = P[n].p.name;
    P.forEach(function (x, i) {
      x.img.className = i === n ? 'on' : '';
      x.tab.className = i === n ? 'tab on' : 'tab';
      x.ctl.hidden = i !== n;
    });
  }

  var timer = null;
  function stopAuto() { clearInterval(timer); timer = null; }
  P.forEach(function (x, i) {
    function pick() { stopAuto(); show(i); }
    x.tab.addEventListener('mouseenter', pick);
    x.tab.addEventListener('focus', pick);
    x.tab.addEventListener('click', pick);
  });
  show(0);
  if (!reduced) {
    timer = setInterval(function () {
      if (scrollY < innerHeight * .6) show((current + 1) % P.length);
    }, 4500);
  }

  F.yarn({ host: hero, from: big, fx: 0, fy: 1, rest: [.5, .74], color: 'var(--t)', w: 5 });
  F.yarn({ host: $('door-body'), from: $('door-title'), fx: .94, fy: .86, rest: [.9, .34], color: '#F2A71B', w: 4 });

  var arches = [].slice.call(document.querySelectorAll('.door-arch'));
  addEventListener('pointermove', function (e) {
    var k = e.clientX / innerWidth - .5;
    arches.forEach(function (a) { a.style.transform = 'translateX(' + k * a.dataset.d + 'px)'; });
  }, { passive: true });

  var floating = $('basket-open');
  new IntersectionObserver(function (es) {
    floating.classList.toggle('tucked', es[0].isIntersecting);
  }, { threshold: .15 }).observe(hero);

  F.renderBasket();
})();
