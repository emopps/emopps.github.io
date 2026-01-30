(function () {
  window.__solitudeAside = window.__solitudeAside || {};

  function normalizeHistory(data) {
    var list = (data && (data.data || data.items || data.list)) || [];
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var line = list[i];
      if (typeof line !== 'string') continue;
      var m = line.match(/^(\d{4})年(\d{2})月(\d{2})日\s*(.*)$/);
      if (!m) continue;
      var year = m[1];
      var title = (m[4] || '').trim();
      if (!title) continue;
      out.push({ year: year, title: title });
    }
    return out;
  }

  async function fetchWithCache() {
    var key = 'SolitudeHistory';
    var ttl = 1000 * 60 * 60 * 12;

    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.exp > Date.now() && Array.isArray(parsed.data)) return parsed.data;
      }
    } catch (e) {}

    try {
      var r = await fetch('https://v2.xxapi.cn/api/history');
      if (!r.ok) throw new Error('bad status');
      var j = await r.json();
      if (j && typeof j === 'object' && typeof j.code !== 'undefined' && j.code !== 0 && j.code !== 200) {
        throw new Error(j.msg || 'api error');
      }
      var items = normalizeHistory(j);
      try {
        localStorage.setItem(key, JSON.stringify({ exp: Date.now() + ttl, data: items }));
      } catch (e2) {}
      return items;
    } catch (e3) {}

    try {
      var r2 = await fetch('/api/today.json');
      var j2 = await r2.json();
      if (Array.isArray(j2 && j2.items)) return j2.items;
    } catch (e4) {}
    return [];
  }

  function initHistory() {
    var container = document.getElementById('history-container');
    var wrapper = document.getElementById('history_container_wrapper');
    if (!container || !wrapper) return;

    if (window.__solitudeAside.history && typeof window.__solitudeAside.history.stop === 'function') {
      window.__solitudeAside.history.stop();
    }

    var timer = null;
    var idx = 0;
    var itemHeight = Math.max(1, container.getBoundingClientRect().height || container.clientHeight || 80);

    var stop = function () {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    var start = function () {
      if (timer) return;
      timer = setInterval(function () {
        if (!itemHeight) return;
        idx += 1;
        wrapper.style.transform = 'translateY(' + (-idx * itemHeight) + 'px)';
        var total = wrapper.children.length;
        if (total <= 1) return;
        if (idx >= total - 1) {
          setTimeout(function () {
            wrapper.style.transition = 'none';
            idx = 0;
            wrapper.style.transform = 'translateY(0px)';
            wrapper.offsetHeight;
            wrapper.style.transition = 'transform .55s ease';
          }, 560);
        }
      }, 5000);
    };

    var mount = async function () {
      wrapper.style.transition = 'transform .55s ease';
      wrapper.style.transform = 'translateY(0px)';

      var data = await fetchWithCache();
      if (!data || !data.length) {
        wrapper.innerHTML = '<div class="history-slide"><span class="history-slide_time">--</span><span class="history-slide_link">暂无数据</span></div>';
        return;
      }

      var list = data.slice(0, 15);
      var slideHtml = function (it) {
        return '<div class="history-slide">' +
          '<span class="history-slide_time">A.D.' + it.year + '</span>' +
          '<span class="history-slide_link">' + it.title + '</span>' +
          '</div>';
      };

      wrapper.innerHTML = list.map(slideHtml).join('') + slideHtml(list[0]);

      requestAnimationFrame(function () {
        Array.from(wrapper.children).forEach(function (el) {
          el.style.height = itemHeight + 'px';
        });
      });

      idx = 0;
      container.onmouseenter = stop;
      container.onmouseleave = start;
      start();
    };

    window.__solitudeAside.history = { stop: stop };
    mount();
  }

  function boot() {
    initHistory();
  }

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('pjax:complete', boot);
})();
