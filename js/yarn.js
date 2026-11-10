(function () {
  var NS = 'http://www.w3.org/2000/svg';

  window.FINGO.yarn = function (o) {
    var host = o.host, from = o.from;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:3;color:' + o.color;
    var line = document.createElementNS(NS, 'path');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', o.w || 5);
    line.setAttribute('stroke-linecap', 'round');
    var ball = document.createElementNS(NS, 'g');
    ball.innerHTML = '<circle r="16" fill="currentColor"/><path d="M-12-5Q0 4 13-4M-13 4Q0 13 12 6M-4-13Q7 0-2 14" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.7"/>';
    svg.appendChild(line);
    svg.appendChild(ball);
    host.appendChild(svg);

    var p = { x: 0, y: 0 }, v = { x: 0, y: 0 }, m = null, ready = false;
    addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      var inside = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right;
      m = inside ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
    }, { passive: true });

    var wide = matchMedia('(min-width: 901px)');
    function frame() {
      svg.style.display = wide.matches ? '' : 'none';
      var r = host.getBoundingClientRect();
      if (wide.matches && r.bottom > -100 && r.top < innerHeight + 100) {
        var f = from.getBoundingClientRect();
        var sx = f.left - r.left + f.width * o.fx, sy = f.top - r.top + f.height * o.fy;
        var rest = { x: r.width * o.rest[0], y: r.height * o.rest[1] };
        if (!ready) { p.x = rest.x; p.y = rest.y; ready = true; }
        var t = m || rest;
        var steps = Math.max(1, Math.min(4, Math.round(gsap.ticker.deltaRatio(60))));
        for (var i = 0; i < steps; i++) {
          v.x = (v.x + (t.x - p.x) * .035) * .86;
          v.y = (v.y + (t.y - p.y) * .035) * .86;
          p.x += v.x; p.y += v.y;
        }
        var mx = (sx + p.x) / 2 - v.x * 5, my = Math.max(sy, p.y) + 70 - v.y * 5;
        line.setAttribute('d', 'M' + sx + ' ' + sy + 'Q' + mx + ' ' + my + ' ' + p.x + ' ' + p.y);
        ball.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') rotate(' + (p.x + p.y) + ')');
      }
    }
    gsap.ticker.add(frame);
  };
})();
