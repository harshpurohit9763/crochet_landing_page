(function () {
  var F = window.FINGO;
  var PAGE = 12;
  var TILT = ['-1.6deg', '1.2deg', '-.8deg', '1.8deg', '1deg', '-1.4deg', '1.5deg', '-1deg'];

  var plantsEl = document.getElementById('plants');
  var chips = document.getElementById('chips');
  var cards = {};
  var controls = {};

  function mountControl(row, p) {
    var box = document.createElement('div');
    box.className = 'ctl';
    box.innerHTML = '<button class="add">Add</button><div class="stepper" hidden><button class="step"></button><span class="step-n" aria-live="polite"></span><button class="step"></button></div>';
    var add = box.querySelector('.add');
    var stepper = box.querySelector('.stepper');
    var minus = stepper.children[0], n = stepper.children[1], plus = stepper.children[2];
    minus.textContent = '−';
    plus.textContent = '+';
    add.setAttribute('aria-label', 'Add ' + p.name + ' to basket');
    minus.setAttribute('aria-label', 'Remove one ' + p.name);
    plus.setAttribute('aria-label', 'Add one more ' + p.name);
    add.addEventListener('click', function () { F.basket.add(p.id); plus.focus(); });
    plus.addEventListener('click', function () { F.basket.add(p.id); });
    minus.addEventListener('click', function () {
      F.basket.remove(p.id);
      if (!F.basket.items[p.id]) add.focus();
    });
    row.appendChild(box);
    (controls[p.id] = controls[p.id] || []).push({ add: add, stepper: stepper, n: n });
    return box;
  }
  F.mountControl = mountControl;

  F.products.forEach(function (p, i) {
    var a = document.createElement('article');
    a.className = 'plant';
    a.style.setProperty('--r', TILT[i % TILT.length]);
    a.innerHTML = '<span class="plant-pic"><img loading="lazy"></span><div class="plant-row"><h3></h3></div>';
    var img = a.querySelector('img');
    img.src = p.img;
    img.alt = p.name;
    a.querySelector('h3').textContent = p.price ? p.name + ', Rs ' + p.price : p.name;
    mountControl(a.querySelector('.plant-row'), p);
    plantsEl.appendChild(a);
    cards[p.id] = a;
  });

  function label(items) {
    F.products.concat(F.festive).forEach(function (p) {
      var n = items[p.id] || 0;
      (controls[p.id] || []).forEach(function (c) {
        c.add.hidden = n > 0;
        c.stepper.hidden = n === 0;
        c.n.textContent = n;
      });
    });
  }

  var current = 'all', expanded = false;
  var more = document.createElement('button');
  more.className = 'chip';
  more.style.margin = '48px auto 0';
  plantsEl.parentNode.appendChild(more);

  function apply() {
    var shown = 0, total = 0;
    F.products.forEach(function (p) {
      var match = current === 'all' || p.cat === current;
      if (match) total++;
      var vis = match && (current !== 'all' || expanded || shown < PAGE);
      if (vis) shown++;
      cards[p.id].hidden = !vis;
    });
    more.style.display = current !== 'all' || shown >= total ? 'none' : 'block';
    more.textContent = 'Show all ' + total + ' pieces';
  }
  more.addEventListener('click', function () { expanded = true; apply(); });

  F.categories.forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'chip';
    b.textContent = c.label;
    b.setAttribute('aria-pressed', c.id === current);
    b.addEventListener('click', function () {
      current = c.id;
      [].forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', x === b); });
      apply();
    });
    chips.appendChild(b);
  });
  apply();

  var shelf = document.getElementById('shelf');
  F.festive.forEach(function (p) {
    var a = document.createElement('article');
    a.className = 'arch';
    a.innerHTML = '<figure><img loading="lazy" draggable="false"></figure><div class="arch-row"><h3></h3></div>';
    var img = a.querySelector('img');
    img.src = p.img;
    img.alt = p.name;
    if (p.sticker) { img.style.objectFit = 'contain'; img.style.padding = '12%'; }
    a.querySelector('h3').textContent = p.name;
    mountControl(a.querySelector('.arch-row'), p);
    shelf.appendChild(a);
  });
  var down = false, sx = 0, sl = 0;
  shelf.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.target.closest('.ctl')) return;
    down = true; sx = e.clientX; sl = shelf.scrollLeft;
    shelf.classList.add('dragging');
    shelf.setPointerCapture(e.pointerId);
  });
  shelf.addEventListener('pointermove', function (e) {
    if (down) shelf.scrollLeft = sl - (e.clientX - sx);
  });
  function stop() { down = false; shelf.classList.remove('dragging'); }
  shelf.addEventListener('pointerup', stop);
  shelf.addEventListener('pointercancel', stop);

  var pins = document.getElementById('pins');
  F.pins.forEach(function (p) {
    var f = document.createElement('figure');
    f.className = 'pin';
    f.style.setProperty('--r', p.r);
    f.style.setProperty('--z', p.z);
    f.style.gridColumn = p.col;
    f.style.gridRow = p.row;
    f.innerHTML = '<img loading="lazy" alt=""><figcaption></figcaption>';
    f.querySelector('img').src = p.img;
    f.querySelector('img').alt = p.cap;
    f.querySelector('figcaption').textContent = p.cap;
    pins.appendChild(f);
  });

  F.basket.onChange(label);
  F.renderBasket();
})();
