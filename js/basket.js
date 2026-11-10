(function () {
  var KEY = 'fingo-basket';
  var F = window.FINGO;
  var items = {};
  try { items = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { items = {}; }
  Object.keys(items).forEach(function (id) { if (!F.byId[id]) delete items[id]; });

  var $ = function (id) { return document.getElementById(id); };
  var drawer = $('drawer'), scrim = $('scrim'), list = $('basket-list'), empty = $('basket-empty');
  var send = $('basket-send'), note = $('basket-note'), openBtn = $('basket-open');
  var counts = document.querySelectorAll('.basket-count');
  var opener = openBtn;
  var listeners = [];

  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }
  function total() { return Object.keys(items).reduce(function (a, k) { return a + items[k]; }, 0); }

  function waLink(text) {
    var phone = String(F.config.whatsapp).replace(/\D/g, '');
    return 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(text);
  }

  function waHref() {
    var lines = Object.keys(items).map(function (id) { return '- ' + items[id] + ' x ' + F.byId[id].name; });
    var text = 'Hi Fingo! I would like to order:\n' + lines.join('\n');
    if (note.value.trim()) text += '\n\nNote: ' + note.value.trim();
    return waLink(text);
  }

  function render() {
    list.innerHTML = '';
    Object.keys(items).forEach(function (id) {
      var p = F.byId[id];
      var li = document.createElement('li');
      li.className = 'line';
      li.innerHTML = '<img alt=""><span class="line-name"></span><span class="qty"><button aria-label="One less">−</button><span></span><button aria-label="One more">+</button></span>';
      li.querySelector('img').src = p.img;
      li.querySelector('.line-name').textContent = p.name;
      var q = li.querySelector('.qty');
      q.children[1].textContent = items[id];
      q.children[0].addEventListener('click', function () { change(id, -1); });
      q.children[2].addEventListener('click', function () { change(id, 1); });
      list.appendChild(li);
    });
    var n = total();
    [].forEach.call(counts, function (c) { c.textContent = n; });
    empty.hidden = n > 0;
    send.setAttribute('aria-disabled', n === 0);
    send.href = n ? waHref() : '#';
    listeners.forEach(function (fn) { fn(items); });
  }

  function change(id, d) {
    items[id] = (items[id] || 0) + d;
    if (items[id] <= 0) delete items[id];
    save();
    render();
  }

  function add(id) {
    change(id, 1);
    openBtn.classList.remove('bump');
    void openBtn.offsetWidth;
    openBtn.classList.add('bump');
  }

  function open() {
    drawer.inert = false;
    drawer.classList.add('open');
    scrim.hidden = false;
    if (F.lenis) F.lenis.stop();
    $('basket-close').focus();
  }
  function close() {
    drawer.classList.remove('open');
    drawer.inert = true;
    scrim.hidden = true;
    if (F.lenis) F.lenis.start();
    opener.focus();
  }
  [].forEach.call(document.querySelectorAll('[data-basket-open]'), function (b) {
    b.addEventListener('click', function () { opener = b; open(); });
  });
  $('basket-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) close(); });
  note.addEventListener('input', function () { if (total()) send.href = waHref(); });
  send.addEventListener('click', function (e) {
    if (!total()) { e.preventDefault(); return; }
    send.href = waHref();
  });

  var footWa = $('foot-wa');
  footWa.href = waLink('Hi Fingo!');
  footWa.target = '_blank';
  footWa.rel = 'noopener';
  $('foot-ig').href = F.config.instagram;

  F.basket = { add: add, remove: function (id) { change(id, -1); }, items: items, onChange: function (fn) { listeners.push(fn); } };
  F.renderBasket = render;
})();
