(function () {
  window.__solitudeAside = window.__solitudeAside || {};

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }

  function getWeekRange(d) {
    const date = startOfDay(d);
    const day = date.getDay();
    const diffToMonday = (day + 6) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }

  function getMonthRange(d) {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { start, end };
  }

  function getYearRange(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    const end = new Date(d.getFullYear() + 1, 0, 1);
    return { start, end };
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function fmtPct(x) {
    return (x * 100).toFixed(1) + '%';
  }

  function setBar(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = (clamp01(pct) * 100) + '%';
  }

  function setVal(id, pct, remainDays) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<span class="pct">' + fmtPct(pct) + '</span>' +
      '<span class="rem">还剩 ' + remainDays + ' 天</span>';
  }

  function initChuxi() {
    const card = document.getElementById('chuxi-card');
    if (!card) return;

    const target = (card.getAttribute('data-target') || '').trim();
    const parts = target.split('-');
    const tMonth = parseInt(parts[0], 10);
    const tDay = parseInt(parts[1], 10);

    const now = new Date();

    let next = new Date(now.getFullYear(), tMonth - 1, tDay);
    if (next < startOfDay(now)) next = new Date(now.getFullYear() + 1, tMonth - 1, tDay);

    const remain = Math.max(0, daysBetween(now, next));

    const daysEl = document.getElementById('chuxi-days');
    const dateEl = document.getElementById('chuxi-date');
    if (daysEl) daysEl.textContent = remain;
    if (dateEl) dateEl.textContent = next.getFullYear() + '-' + pad2(tMonth) + '-' + pad2(tDay);

    const year = getYearRange(now);
    const month = getMonthRange(now);
    const week = getWeekRange(now);

    const pctYear = clamp01(daysBetween(year.start, now) / Math.max(1, daysBetween(year.start, year.end)));
    const pctMonth = clamp01(daysBetween(month.start, now) / Math.max(1, daysBetween(month.start, month.end)));
    const pctWeek = clamp01(daysBetween(week.start, now) / Math.max(1, daysBetween(week.start, week.end)));

    setBar('chuxi-bar-year', pctYear);
    setBar('chuxi-bar-month', pctMonth);
    setBar('chuxi-bar-week', pctWeek);

    setVal('chuxi-year', pctYear, daysBetween(now, year.end));
    setVal('chuxi-month', pctMonth, daysBetween(now, month.end));
    setVal('chuxi-week', pctWeek, daysBetween(now, week.end));
  }

  function normalizeHistory(data) {
    const list = (data && (data.data || data.items || data.list)) || [];
    if (!Array.isArray(list)) return [];

    const items = [];
    for (const line of list) {
      if (typeof line !== 'string') continue;
      const m = line.match(/^(\d{4})年(\d{2})月(\d{2})日\s*(.*)$/);
      if (!m) continue;
      const year = m[1];
      const title = (m[4] || '').trim();
      if (!title) continue;
      items.push({ year, title });
    }
    return items;
  }

  async function fetchHistoryWithCache() {
    const CACHE_KEY = 'SolitudeHistory';
    const TTL = 1000 * 60 * 60 * 12;

    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.exp > Date.now() && Array.isArray(parsed.data)) {
          return parsed.data;
        }
      }
    } catch (e) {}

    try {
      const r = await fetch('https://v2.xxapi.cn/api/history');
      if (!r.ok) throw new Error('bad status');
      const j = await r.json();
      const items = normalizeHistory(j);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ exp: Date.now() + TTL, data: items }));
      } catch (e) {}
      return items;
    } catch (e) {
      try {
        const r2 = await fetch('/api/today.json');
        const j2 = await r2.json();
        if (Array.isArray(j2 && j2.items)) return j2.items;
      } catch (e2) {}
      return [];
    }
  }

  function initHistory() {
    const container = document.getElementById('history-container');
    const wrapper = document.getElementById('history_container_wrapper');
    if (!container || !wrapper) return;

    if (window.__solitudeAside.history && typeof window.__solitudeAside.history.stop === 'function') {
      window.__solitudeAside.history.stop();
    }

    let timer = null;
    let idx = 0;
    let itemHeight = 0;

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!itemHeight) return;
        idx += 1;
        wrapper.style.transform = 'translateY(' + (-idx * itemHeight) + 'px)';

        const total = wrapper.children.length;
        if (total <= 1) return;

        if (idx >= total - 1) {
          setTimeout(() => {
            wrapper.style.transition = 'none';
            idx = 0;
            wrapper.style.transform = 'translateY(0px)';
            wrapper.offsetHeight;
            wrapper.style.transition = 'transform .55s ease';
          }, 560);
        }
      }, 5000);
    };

    const mount = async () => {
      wrapper.style.transition = 'transform .55s ease';
      wrapper.style.transform = 'translateY(0px)';

      const data = await fetchHistoryWithCache();
      if (!data || !data.length) {
        wrapper.innerHTML = '<div class="history-slide"><span class="history-slide_time">--</span><span class="history-slide_link">暂无数据</span></div>';
        return;
      }

      const list = data.slice(0, 15);
      itemHeight = Math.max(1, container.getBoundingClientRect().height || container.clientHeight || 80);
      const slideHtml = (it) =>
        '<div class="history-slide">' +
        '<span class="history-slide_time">A.D.' + it.year + '</span>' +
        '<span class="history-slide_link" style="font-size:14px;font-weight:700;line-height:1.25;">' + it.title + '</span>' +
        '</div>';

      wrapper.innerHTML = list.map(slideHtml).join('') + slideHtml(list[0]);

      requestAnimationFrame(() => {
        Array.from(wrapper.children).forEach((el) => {
          el.style.height = itemHeight + 'px';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.gap = '10px';
        });
      });

      idx = 0;
      wrapper.style.transition = 'transform .55s ease';

      container.onmouseenter = stop;
      container.onmouseleave = start;

      start();
    };

    window.__solitudeAside.history = { stop };

    mount();
  }

  function boot() {
    initChuxi();
    initHistory();
  }

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('pjax:complete', boot);
})();
