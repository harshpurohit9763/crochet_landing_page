(function () {
  var nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Compare concepts');
  nav.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2147483647;display:flex;gap:4px;padding:5px;border-radius:99px;background:#111;font:600 15px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4)';
  ['a', 'b', 'c'].forEach(function (k) {
    var a = document.createElement('a');
    a.href = k + '.html';
    a.textContent = 'Concept ' + k.toUpperCase();
    var on = location.pathname.indexOf('/' + k + '.html') > -1;
    a.style.cssText = 'display:grid;place-items:center;padding:0 16px;height:40px;white-space:nowrap;border-radius:99px;text-decoration:none;color:' + (on ? '#111' : '#fff') + ';background:' + (on ? '#fff' : 'transparent');
    nav.appendChild(a);
  });
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(nav); });

  window.fingoYarn = function (o) {
    var NS = 'http://www.w3.org/2000/svg';
    var host = o.host, from = o.from;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:' + (o.z || 3);
    var line = document.createElementNS(NS, 'path');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', o.color);
    line.setAttribute('stroke-width', o.w || 5);
    line.setAttribute('stroke-linecap', 'round');
    var ball = document.createElementNS(NS, 'g');
    ball.innerHTML = '<circle r="' + (o.r || 15) + '" fill="' + o.color + '"/><path d="M-11-5Q0 4 12-4M-12 4Q0 12 11 6M-4-12Q6 0-2 13" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6"/>';
    svg.appendChild(line);
    svg.appendChild(ball);
    host.appendChild(svg);

    var p = { x: 0, y: 0 }, v = { x: 0, y: 0 }, m = null, ready = false;
    addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      var inside = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right;
      m = inside ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
    }, { passive: true });

    function frame() {
      var r = host.getBoundingClientRect(), f = from.getBoundingClientRect();
      var sx = f.left - r.left + f.width * (o.fx === undefined ? 1 : o.fx), sy = f.top - r.top + f.height * (o.fy === undefined ? 1 : o.fy);
      var rest = { x: r.width * o.rest[0], y: r.height * o.rest[1] };
      if (!ready) { p.x = rest.x; p.y = rest.y; ready = true; }
      var t = m || rest;
      v.x = (v.x + (t.x - p.x) * .035) * .86;
      v.y = (v.y + (t.y - p.y) * .035) * .86;
      p.x += v.x; p.y += v.y;
      var mx = (sx + p.x) / 2 - v.x * 5, my = Math.max(sy, p.y) + 70 - v.y * 5;
      line.setAttribute('d', 'M' + sx + ' ' + sy + 'Q' + mx + ' ' + my + ' ' + p.x + ' ' + p.y);
      ball.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') rotate(' + (p.x + p.y) + ')');
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
})();
