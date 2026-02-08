class MusicPlayer {
    constructor() {
        this._onKeydown = this.handleKeydown.bind(this);
        this._onResize = this.handleResize.bind(this);
        this._coverObserver = null;
        this._lastLrcIndex = -1;
        this._lastListRect = null;

        this._coverUrlCache = new Map();
        this._coverFetchInFlight = new Set();
        this._coverDebugDone = new Set();
        this._manualLrcScrollUntil = 0;
        this._lrcUserScrollBound = false;
        this._listStyleFixed = false;
        this._resizeRaf = 0;
        this._lrcTimeEnhanced = false;
        this._lrcTimeObserver = null;
        this._aplayerRef = null;
        this._lrcTimeHideTimer = 0;
        this._activeLrcTimeP = null;
        this.init();
    }

    init() {
        this.updateViewportVars(true);
        this.getCustomPlayList();
        this.addEventListeners();
        this.waitForAplayerDom();
    }

    getCustomPlayList() {
        this.changeMusicBg(false);
    }

    addEventListeners() {
        document.addEventListener("keydown", this._onKeydown);
        window.addEventListener('resize', this._onResize, { passive: true });
        try {
            if (window.visualViewport && window.visualViewport.addEventListener) {
                window.visualViewport.addEventListener('resize', this._onResize, { passive: true });
            }
        } catch (e) {}
    }

    handleResize() {
        this.updateViewportVars(false);
    }

    updateViewportVars(isInit) {
        try {
            if (this._resizeRaf) {
                try { cancelAnimationFrame(this._resizeRaf); } catch (e) {}
            }

            this._resizeRaf = requestAnimationFrame(() => {
                this._resizeRaf = 0;

                const h = Math.max(1, window.innerHeight || 1);
                document.documentElement.style.setProperty('--vh', `${h}px`);

                // Compute bottom safe area so panels never get covered by the controller.
                const controller = document.querySelector('#Music-page .aplayer-controller') || document.querySelector('.aplayer-controller');
                const body = document.querySelector('#Music-page .aplayer-body') || document.querySelector('.aplayer-body');
                const list = document.querySelector('#Music-page .aplayer .aplayer-list') || document.querySelector('.aplayer-list');
                const lrc = document.querySelector('#Music-page .aplayer-lrc') || document.querySelector('.aplayer-lrc');

                let safe = 128; // default fallback
                const gap = 16;

                if (controller) {
                    const c = controller.getBoundingClientRect();
                    const fromBottom = Math.max(0, h - c.top);
                    safe = Math.max(safe, Math.ceil(fromBottom + gap));

                    // If list/lrc overlaps controller, grow safe area accordingly.
                    const checkOverlap = (el) => {
                        if (!el) return;
                        const r = el.getBoundingClientRect();
                        const overlap = Math.max(0, r.bottom - c.top);
                        if (overlap > 0) safe = Math.max(safe, Math.ceil(overlap + gap));
                    };
                    checkOverlap(list);
                    checkOverlap(lrc);
                    checkOverlap(body);
                }

                document.body && document.body.style && document.body.style.setProperty('--music-controller-safe', `${safe}px`);

                // Update lyric container height variable for first/last line centering
                if (lrc) {
                    const lrcHeight = lrc.clientHeight || lrc.getBoundingClientRect().height || h * 0.6;
                    document.documentElement.style.setProperty('--lyric-wrap-height', `${lrcHeight}px`);
                }

                // Controller offsets should adapt to visible playlist and viewport size/zoom.
                try {
                    const isMobile = window.matchMedia && window.matchMedia('(max-width: 798px)').matches;
                    let controllerRight = 0;
                    if (!isMobile) {
                        // Reserve space for right playlist panel if present/visible.
                        if (list) {
                            const r = list.getBoundingClientRect();
                            const style = getComputedStyle(list);
                            const hidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || r.width < 10;
                            if (!hidden) controllerRight = Math.ceil(r.width + 24);
                        }
                    }
                    // Bottom gap scales with height: clamp between 12 and 38.
                    const bottomGap = isMobile ? 120 : Math.max(12, Math.min(38, Math.round(h * 0.04)));
                    document.body && document.body.style && document.body.style.setProperty('--music-controller-right', `${controllerRight}px`);
                    document.body && document.body.style && document.body.style.setProperty('--music-controller-bottom', `${bottomGap}px`);
                } catch (e) {}

                // Keep rounding fix applied after size changes.
                try { this.fixPlaylistPanelStyle(); } catch (e) {}

                // Re-center current lyric after layout changes, but avoid fighting user scroll.
                if (!isInit) {
                    try {
                        this._lastLrcIndex = -1;
                        this.lrcUpdate();
                    } catch (e) {}
                }
            });
        } catch (e) {}
    }

    waitForAplayerDom() {
        let hasCover = false;
        let hasList = false;
        const timer = setInterval(() => {
            const aplayerList = document.querySelector('.aplayer-list');
            const cover = document.querySelector('#Music-page .aplayer-pic');

            if (aplayerList) {
                hasList = true;
                this.fixPlaylistPanelStyle();
            }

            if (cover) {
                hasCover = true;
                this.bindCoverObserver(cover);
                this.upgradeCoverElement(cover);
            }

            if (hasCover && hasList) clearInterval(timer);
        }, 200);
        setTimeout(() => clearInterval(timer), 12000);
    }

    fixPlaylistPanelStyle() {
        try {
            const list = document.querySelector('#Music-page .aplayer .aplayer-list') || document.querySelector('.aplayer-list');
            if (!list) return;

            // Inline style to bypass theme CSS specificity (Windows/Chrome/Edge).
            list.style.borderRadius = '16px';
            list.style.overflow = 'hidden';
            list.style.clipPath = 'inset(0 round 16px)';

            // Ensure inner list doesn't visually break rounding.
            const ol = list.querySelector('ol');
            if (ol) {
                ol.style.margin = '0';
                ol.style.padding = '0';
                ol.style.background = 'transparent';
            }

            if (this._listStyleFixed) return;
            this._listStyleFixed = true;

            // Re-apply if APlayer toggles list state or rewrites DOM.
            try {
                const mo = new MutationObserver(() => {
                    try { this.fixPlaylistPanelStyle(); } catch (e) {}
                });
                mo.observe(list, { attributes: true, childList: true, subtree: true });
            } catch (e) {}
        } catch (e) {}
    }

    bindCoverObserver(coverEl) {
        try {
            if (this._coverObserver) return;
            this._coverObserver = new MutationObserver(() => {
                this.upgradeCoverElement(coverEl);
            });
            this._coverObserver.observe(coverEl, { attributes: true, attributeFilter: ['style'] });
        } catch (e) {}
    }

    upgradeCoverElement(coverEl) {
        try {
            if (!coverEl) return;
            if (coverEl.style && coverEl.style.backgroundImage) {
                const raw = this.extractValue(coverEl.style.backgroundImage);
                const hi = this.upgradeCoverUrl(raw);
                if (hi && hi !== raw) coverEl.style.backgroundImage = `url("${hi}")`;
                this.ensureHighResCover(coverEl, raw);
            }
            const img = coverEl.querySelector && coverEl.querySelector('img');
            if (img && img.src) {
                const hi2 = this.upgradeCoverUrl(img.src);
                if (hi2 && hi2 !== img.src) img.src = hi2;
            }
        } catch (e) {}
    }

    changeMusicBg(isChangeBg = true) {
        const musicBg = document.getElementById("Music-bg");
        const musicLoading = document.getElementsByClassName("Music-loading")[0];

        isChangeBg ? this.updateBackgroundImage(musicBg) : this.setLoadingScreen(musicLoading, musicBg);
    }

    updateBackgroundImage(element) {
        const musicCover = document.querySelector("#Music-page .aplayer-pic");
        if (!musicCover || !musicCover.style || !musicCover.style.backgroundImage) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const raw = this.extractValue(musicCover.style.backgroundImage);
        const hi = this.upgradeCoverUrl(raw);
        if (hi) musicCover.style.backgroundImage = `url("${hi}")`;
        this.ensureHighResCover(musicCover, raw);
        img.src = hi || raw;
        img.onload = () => {

            const palette = this.getPalette(img) || [];
            const c1 = palette[0] || [66, 90, 239];
            const c2 = palette[1] || [255, 200, 72];
            const c3 = palette[2] || c1;
            document.documentElement.style.setProperty('--music-c1', `${c1[0]} ${c1[1]} ${c1[2]}`);
            document.documentElement.style.setProperty('--music-c2', `${c2[0]} ${c2[1]} ${c2[2]}`);
            document.documentElement.style.setProperty('--music-c3', `${c3[0]} ${c3[1]} ${c3[2]}`);


            element.style.backgroundImage = `radial-gradient(1000px 700px at 20% 25%, rgba(${c1[0]},${c1[1]},${c1[2]},0.55), rgba(0,0,0,0) 60%),` +
                `radial-gradient(900px 600px at 80% 30%, rgba(${c2[0]},${c2[1]},${c2[2]},0.35), rgba(0,0,0,0) 55%),` +
                `radial-gradient(900px 700px at 55% 85%, rgba(${c3[0]},${c3[1]},${c3[2]},0.30), rgba(0,0,0,0) 60%),` +
                musicCover.style.backgroundImage;
            element.className = 'show';
        };
    }

    upgradeCoverUrl(url) {
        const u = (url || '').toString().trim();
        if (!u) return '';
        const targetParam = '2000y2000';
        const targetThumb = '2000y2000';
        if (/([?&]param=)\d+y\d+/.test(u)) {
            return u.replace(/([?&]param=)\d+y\d+/g, '$1' + targetParam);
        }
        // NetEase imageView style: thumbnail=300y300 or thumbnail=300x300
        if (/([?&]thumbnail=)\d+[xy]\d+/i.test(u)) {
            return u.replace(/([?&]thumbnail=)\d+[xy]\d+/gi, '$1' + targetThumb);
        }
        if (/(^|\/\/)([^/]*\.)?music\.126\.net\//i.test(u)) {
            const joiner = u.indexOf('?') === -1 ? '?' : '&';
            return u + joiner + 'param=' + targetParam;
        }
        return u;
    }

    buildMetingUrl(type, id) {
        const template = (window.meting_api || '').toString();
        if (!template) return '';
        const rand = Date.now();
        return template
            .replace(':server', 'netease')
            .replace(':type', type)
            .replace(':id', encodeURIComponent(id))
            .replace(':auth', '')
            .replace(':r', rand.toString());
    }

    buildNeteaseCoverUrlByPicId(picId) {
        try {
            const id = (picId || '').toString().trim();
            if (!/^\d{5,}$/.test(id)) return '';
            const enc = solitudeNeteaseEncryptId(id);
            if (!enc) return '';
            return `https://p3.music.126.net/${enc}/${id}.jpg?param=2000y2000`;
        } catch (e) {}
        return '';
    }

    getCurrentSongId() {
        try {
            const meting = document.querySelector('#Music-page meting-js');
            const aplayer = meting && meting.aplayer;
            const list = aplayer && aplayer.list && aplayer.list.audios;
            const index = aplayer && aplayer.list && aplayer.list.index;
            const audio = list && list[index];
            return audio && (audio.id || audio.songId || audio.sid);
        } catch (e) {}
        return null;
    }

    async ensureHighResCover(coverEl, rawUrl) {
        try {
            const raw = (rawUrl || '').toString();
            const isProxyPic = /meting\.qjqq\.cn\/\?server=netease&type=pic&id=/i.test(raw) ||
                /api\.injahow\.cn\/meting\/\?server=netease&type=pic&id=/i.test(raw);
            if (!isProxyPic) return;

            const idMatch = /[?&]id=([^&]+)/i.exec(raw);
            const picId = idMatch ? decodeURIComponent(idMatch[1]) : '';
            const songId = this.getCurrentSongId();
            const key = String(songId || picId);
            if (!key) return;

            const debug = !!window.__musicCoverDebug;
            if (debug && !this._coverDebugDone.has(key)) {
                this._coverDebugDone.add(key);
                try {
                    console.log('[music-cover] raw=', raw);
                    console.log('[music-cover] songId=', songId, 'picId=', picId, 'key=', key);
                } catch (e) {}
            }

            if (picId) {
                const direct = this.buildNeteaseCoverUrlByPicId(picId);
                if (direct) {
                    if (debug && !this._coverDebugDone.has(key + ':direct')) {
                        this._coverDebugDone.add(key + ':direct');
                        try { console.log('[music-cover] direct=', direct); } catch (e) {}
                    }
                    this._coverUrlCache.set(key, direct);
                    coverEl.style.backgroundImage = `url("${direct}")`;
                    return;
                }
            }

            if (this._coverUrlCache.has(key)) {
                const cached = this._coverUrlCache.get(key);
                if (cached) coverEl.style.backgroundImage = `url("${cached}")`;
                return;
            }
            if (this._coverFetchInFlight.has(key)) return;
            this._coverFetchInFlight.add(key);

            // Prefer resolving proxy pic endpoint redirect to final NetEase image URL.
            try {
                const resolved = await new Promise((resolve, reject) => {
                    const img = new Image();
                    const cleanup = () => {
                        try { img.onload = null; img.onerror = null; } catch (e) {}
                    };
                    img.onload = () => {
                        const u = img.currentSrc || img.src || '';
                        cleanup();
                        resolve(u);
                    };
                    img.onerror = () => {
                        cleanup();
                        reject(new Error('image load failed'));
                    };
                    const bust = (raw.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
                    img.src = raw + bust;
                });

                const finalUrl = resolved ? this.upgradeCoverUrl(resolved) : '';
                if (finalUrl && /music\.126\.net\//i.test(finalUrl)) {
                    this._coverUrlCache.set(key, finalUrl);
                    coverEl.style.backgroundImage = `url("${finalUrl}")`;
                    return;
                }
            } catch (e) {}

            if (!songId) return;
            const url = this.buildMetingUrl('song', songId);
            if (!url) return;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            const item = Array.isArray(data) ? data[0] : data;
            const pic = item && (item.pic || item.picUrl || item.cover);
            if (!pic) return;
            const upgraded = this.upgradeCoverUrl(pic);
            this._coverUrlCache.set(key, upgraded || pic);
            if (upgraded) coverEl.style.backgroundImage = `url("${upgraded}")`;
        } catch (e) {
        } finally {
            try {
                const idMatch = /[?&]id=([^&]+)/i.exec((rawUrl || '').toString());
                const picId = idMatch ? decodeURIComponent(idMatch[1]) : '';
                const songId = this.getCurrentSongId();
                const key = String(songId || picId);
                if (key) this._coverFetchInFlight.delete(key);
            } catch (e) {}
        }
    }

    extractValue(input) {
        const s = (input || '').toString();
        const match = /url\((['"]?)(.*?)\1\)/.exec(s);
        return match ? match[2] : '';
    }

    getPalette(img) {
        try {
            if (typeof ColorThief !== 'undefined') {
                const thief = new ColorThief();
                return thief.getPalette(img, 3);
            }
        } catch (e) {}
        return null;
    }

    setLoadingScreen(loadingElement, backgroundElement) {
        const timer = setInterval(() => {
            this.addEventListeners();
            const musicCover = document.querySelector("#Music-page .aplayer-pic");
            if (musicCover) {
                loadingElement.style.display = "none";
                clearInterval(timer);
                this.addEventListenerChangeMusicBg();
                backgroundElement.style.display = "block";
            }
        }, 100);
    }

    addEventListenerChangeMusicBg() {
        try {
            const meting = document.querySelector("#Music-page meting-js") || document.querySelector("meting-js");
            const aplayer = meting && meting.aplayer;
            if (!aplayer || !aplayer.on) return;
            aplayer.on('loadeddata', () => this.changeMusicBg(true));
            aplayer.on('timeupdate', () => {
                try { requestAnimationFrame(() => this.lrcUpdate()); } catch (e) { this.lrcUpdate(); }
            });
            this.bindLrcUserScroll();
            this.bindLrcTimeJump(aplayer);
        } catch (e) {}
    }

    bindLrcTimeJump(aplayer) {
        try {
            this._aplayerRef = aplayer || null;
            const wrap = document.querySelector('#Music-page .aplayer-lrc') || document.querySelector('.aplayer-lrc');
            const contents = document.querySelector('#Music-page .aplayer-lrc-contents') || document.querySelector('.aplayer-lrc-contents');
            if (!wrap || !contents) return;

            const enhance = () => {
                try { this.enhanceLrcTimeNodes(aplayer); } catch (e) {}
            };

            enhance();

            if (this._lrcTimeObserver) return;
            this._lrcTimeObserver = new MutationObserver(() => {
                try { enhance(); } catch (e) {}
            });
            this._lrcTimeObserver.observe(contents, { childList: true, subtree: true });
        } catch (e) {}
    }

    enhanceLrcTimeNodes(aplayer) {
        const debug = !!window.__musicLrcTimeDebug;

        const contents = document.querySelector('#Music-page .aplayer-lrc-contents') || document.querySelector('.aplayer-lrc-contents');
        if (!contents) return;

        const pNodes = Array.from(contents.querySelectorAll('p'));
        if (!pNodes.length) return;

        const parsed = this.getAplayerLrcParsed(aplayer);
        if (debug && !this._lrcTimeEnhanced) {
            try {
                console.log('[music-lrc-time] pNodes=', pNodes.length);
                console.log('[music-lrc-time] parsed=', parsed && parsed.length, 'aplayer.lrc keys=', aplayer && aplayer.lrc ? Object.keys(aplayer.lrc) : null);
                console.log('[music-lrc-time] parsed sample=', parsed && parsed[0]);
                console.log('[music-lrc-time] aplayer.lrc.parsed typeof=', aplayer && aplayer.lrc ? typeof aplayer.lrc.parsed : null);
                console.log('[music-lrc-time] aplayer.lrc.parsed raw=', aplayer && aplayer.lrc ? aplayer.lrc.parsed : null);
                console.log('[music-lrc-time] first p outerHTML=', pNodes[0] ? pNodes[0].outerHTML : null);
            } catch (e) {}
        }

        for (let i = 0; i < pNodes.length; i++) {
            const p = pNodes[i];
            if (!p || p.classList.contains('aplayer-lrc-contents')) continue;
            if (p.querySelector(':scope > .music-lrc-time')) continue;

            let t = null;
            if (parsed && parsed[i] && typeof parsed[i].time === 'number') t = parsed[i].time;

            const span = document.createElement('span');
            span.className = 'music-lrc-time';
            if (typeof t === 'number' && isFinite(t) && t >= 0) {
                span.textContent = this.formatTime(t);
                span.dataset.time = String(t);
                span.tabIndex = 0;
                span.setAttribute('role', 'button');
                span.setAttribute('aria-label', 'Jump to ' + span.textContent);
            } else {
                span.textContent = '';
                span.dataset.time = '';
            }

            span.addEventListener('click', (ev) => {
                try { ev.stopPropagation(); ev.preventDefault(); } catch (e) {}
                const sec = parseFloat(span.dataset.time || '');
                if (!(sec >= 0)) return;
                this._manualLrcScrollUntil = Date.now() + 1200;
                this.seekAplayer(aplayer, sec);
                if (debug) {
                    try { console.log('[music-lrc-time] seek', sec, '=>', span.textContent); } catch (e) {}
                }
            }, { passive: false });

            span.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Enter' && ev.key !== ' ') return;
                try { ev.preventDefault(); } catch (e) {}
                try { span.click(); } catch (e) {}
            });

            p.appendChild(span);
        }

        this._lrcTimeEnhanced = true;
    }

    getAplayerLrcParsed(aplayer) {
        try {
            const lrc = aplayer && aplayer.lrc;
            if (!lrc) return null;
            const rawCandidates = [
                lrc.parsed,
                lrc.lrc && lrc.lrc.parsed,
                lrc.lrc && lrc.lrc.lines,
                lrc.lines,
                lrc.current
            ];

            for (const c of rawCandidates) {
                // 1) Array candidates
                if (Array.isArray(c) && c.length) {
                    const out = this.normalizeParsedLrcArray(c);
                    if (out && out.length) return out;
                }
                // 2) Object candidates with lines
                if (c && typeof c === 'object' && !Array.isArray(c)) {
                    const maybeLines = c.lines || c.parsed || c.lrc;
                    if (Array.isArray(maybeLines) && maybeLines.length) {
                        const out2 = this.normalizeParsedLrcArray(maybeLines);
                        if (out2 && out2.length) return out2;
                    }
                }
                // 3) String candidate: raw LRC
                if (typeof c === 'string' && c.trim()) {
                    const out3 = this.parseLrcString(c);
                    if (out3 && out3.length) return out3;
                }
            }
        } catch (e) {}
        return null;
    }

    normalizeParsedLrcArray(arr) {
        try {
            const out = [];
            for (const x of arr) {
                if (!x) continue;
                // Common shapes: {time, text}, {t, txt}, [time, text]
                if (Array.isArray(x) && x.length >= 2) {
                    const t = Number(x[0]);
                    const text = (x[1] == null ? '' : String(x[1]));
                    if (isFinite(t)) out.push({ time: t, text });
                    continue;
                }
                if (typeof x === 'object') {
                    const tRaw = (x.time != null ? x.time : (x.t != null ? x.t : (x.start != null ? x.start : null)));
                    const t = Number(tRaw);
                    const text = (x.text != null ? x.text : (x.txt != null ? x.txt : (x.content != null ? x.content : '')));
                    if (isFinite(t)) {
                        out.push({ time: t, text: String(text || '') });
                        continue;
                    }
                }
            }
            // If time looks like ms, convert to seconds
            if (out.length) {
                const maxT = Math.max.apply(null, out.map((o) => o.time));
                if (isFinite(maxT) && maxT > 1000) {
                    return out.map((o) => ({ time: o.time / 1000, text: o.text }));
                }
            }
            return out.length ? out : null;
        } catch (e) {}
        return null;
    }

    parseLrcString(lrcText) {
        try {
            const lines = (lrcText || '').toString().split(/\r?\n/);
            const out = [];
            const timeRe = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
            for (const line of lines) {
                if (!line) continue;
                let match;
                let lastIndex = 0;
                const times = [];
                while ((match = timeRe.exec(line))) {
                    lastIndex = timeRe.lastIndex;
                    const mm = parseInt(match[1], 10);
                    const ss = parseInt(match[2], 10);
                    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
                    const t = (mm * 60) + ss + (ms / 1000);
                    if (isFinite(t)) times.push(t);
                }
                if (!times.length) continue;
                const text = line.slice(lastIndex).trim();
                for (const t of times) {
                    out.push({ time: t, text });
                }
            }
            out.sort((a, b) => a.time - b.time);
            return out.length ? out : null;
        } catch (e) {}
        return null;
    }

    seekAplayer(aplayer, sec) {
        try {
            if (aplayer && typeof aplayer.seek === 'function') {
                aplayer.seek(sec);
                return;
            }
        } catch (e) {}
        try {
            const audio = aplayer && aplayer.audio;
            if (audio && typeof audio.currentTime === 'number') {
                audio.currentTime = sec;
            }
        } catch (e) {}
    }

    formatTime(sec) {
        const s = Math.max(0, Math.floor(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    }

    triggerLrcTimePill() {
        try {
            const wrap = document.querySelector('#Music-page .aplayer-lrc') || document.querySelector('.aplayer-lrc');
            const contents = document.querySelector('#Music-page .aplayer-lrc-contents') || document.querySelector('.aplayer-lrc-contents');
            if (!wrap || !contents) return;

            // Ensure nodes exist before trying to activate one.
            if (this._aplayerRef) {
                try { this.enhanceLrcTimeNodes(this._aplayerRef); } catch (e) {}
            }

            const pNodes = Array.from(contents.querySelectorAll('p'));
            if (!pNodes.length) return;

            const wrapRect = wrap.getBoundingClientRect();
            const centerY = wrapRect.top + (wrapRect.height / 2);

            let best = null;
            let bestDist = Infinity;
            for (const p of pNodes) {
                if (!p) continue;
                const timeEl = p.querySelector(':scope > .music-lrc-time');
                if (!timeEl || !timeEl.dataset || !timeEl.dataset.time) continue;
                const r = p.getBoundingClientRect();
                const y = r.top + (r.height / 2);
                const dist = Math.abs(y - centerY);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = p;
                }
            }

            if (!best) return;

            if (this._activeLrcTimeP && this._activeLrcTimeP !== best) {
                try { this._activeLrcTimeP.classList.remove('music-lrc-time-active'); } catch (e) {}
            }
            this._activeLrcTimeP = best;
            try { best.classList.add('music-lrc-time-active'); } catch (e) {}

            if (this._lrcTimeHideTimer) {
                try { clearTimeout(this._lrcTimeHideTimer); } catch (e) {}
                this._lrcTimeHideTimer = 0;
            }

            this._lrcTimeHideTimer = setTimeout(() => {
                try {
                    if (this._activeLrcTimeP) this._activeLrcTimeP.classList.remove('music-lrc-time-active');
                } catch (e) {}
            }, 1200);
        } catch (e) {}
    }

    bindLrcUserScroll() {
        if (this._lrcUserScrollBound) return;
        const wrap = document.querySelector('#Music-page .aplayer-lrc') || document.querySelector('.aplayer-lrc');
        if (!wrap) return;

        const bump = () => {
            this._manualLrcScrollUntil = Date.now() + 1800;
            try { this.triggerLrcTimePill(); } catch (e) {}
        };

        try {
            wrap.addEventListener('wheel', bump, { passive: true });
            wrap.addEventListener('touchstart', bump, { passive: true });
            wrap.addEventListener('pointerdown', bump, { passive: true });
            wrap.addEventListener('scroll', bump, { passive: true });
        } catch (e) {
            try { wrap.onwheel = bump; } catch (e2) {}
        }

        this._lrcUserScrollBound = true;
    }

    lrcUpdate() {
        if (Date.now() < this._manualLrcScrollUntil) return;
        const aplayerLrcContents = document.querySelector('.aplayer-lrc-contents');
        if (!aplayerLrcContents) return;

        const currentLrc = aplayerLrcContents.querySelector('p.aplayer-lrc-current') || document.querySelector('.aplayer-lrc-current');
        if (!currentLrc) return;

        // Ensure time badges get injected when lyrics become available.
        try {
            if (!this._lrcTimeEnhanced && this._aplayerRef) {
                this.enhanceLrcTimeNodes(this._aplayerRef);
            }
        } catch (e) {}

        const currentIndex = Array.from(aplayerLrcContents.children).indexOf(currentLrc);
        if (currentIndex === this._lastLrcIndex) return;
        this._lastLrcIndex = currentIndex;

        const wrap = document.querySelector('#Music-page .aplayer-lrc') || document.querySelector('.aplayer-lrc');
        if (!wrap) return;

        try { aplayerLrcContents.style.transform = ''; } catch (e) {}

        const ratio = 0.5;
        const target = currentLrc.offsetTop - (wrap.clientHeight * ratio) + (currentLrc.offsetHeight / 2);
        const next = Math.max(0, Math.min(target, wrap.scrollHeight - wrap.clientHeight));
        wrap.scrollTop = next;
    }

    handleKeydown(event) {
        let aplayer;
        try {
            const meting = document.querySelector('#Music-page meting-js') || document.querySelector('meting-js');
            aplayer = meting && meting.aplayer;
        } catch (e) {}
        if (!aplayer) return;

        const actions = {
            "Space": () => aplayer.toggle(),
            "ArrowRight": () => aplayer.skipForward(),
            "ArrowLeft": () => aplayer.skipBack(),
            "ArrowUp": () => { if (aplayer.volume < 1) aplayer.volume(aplayer.volume + 0.1); },
            "ArrowDown": () => { if (aplayer.volume > 0) aplayer.volume(aplayer.volume - 0.1); }
        };

        if (actions[event.code]) {
            event.preventDefault();
            actions[event.code]();
        }
    }

    destroy() {
        document.removeEventListener("keydown", this._onKeydown);
        try { window.removeEventListener('resize', this._onResize); } catch (e) {}
        try {
            if (window.visualViewport && window.visualViewport.removeEventListener) {
                window.visualViewport.removeEventListener('resize', this._onResize);
            }
        } catch (e) {}
        if (this._lrcTimeObserver) {
            try { this._lrcTimeObserver.disconnect(); } catch (e) {}
            this._lrcTimeObserver = null;
        }
        if (this._lrcTimeHideTimer) {
            try { clearTimeout(this._lrcTimeHideTimer); } catch (e) {}
            this._lrcTimeHideTimer = 0;
        }
        if (this._coverObserver) {
            try { this._coverObserver.disconnect(); } catch (e) {}
            this._coverObserver = null;
        }
    }
}

function initializeMusicPlayer() {
    const exitingMusic = window.scoMusic;
    if (exitingMusic) exitingMusic.destroy();
    window.scoMusic = new MusicPlayer();
}

function solitudeNeteaseEncryptId(id) {
try {
const magic = '3go8&$8*3*3h0k(2)2';
const bytes = [];
for (let i = 0; i < id.length; i++) {
bytes.push((id.charCodeAt(i) & 0xff) ^ (magic.charCodeAt(i % magic.length) & 0xff));
}
const raw = String.fromCharCode.apply(null, bytes);
const hex = solitudeMd5(raw);
if (!hex) return '';
const bin = solitudeHexToBinStr(hex);
const b64 = btoa(bin).replace(/\//g, '_').replace(/\+/g, '-');
return b64;
} catch (e) {}
return '';
}

function solitudeHexToBinStr(hex) {
    const s = (hex || '').toString();
    let out = '';
    for (let i = 0; i < s.length; i += 2) {
        out += String.fromCharCode(parseInt(s.substr(i, 2), 16));
    }
    return out;
}

function solitudeMd5(s) {
    function add32(a, b) { return (a + b) & 0xffffffff; }
    function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    function md5cycle(x, k) {
        let a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);

        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);

        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);

        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);

        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }
    function md5blk(s) {
        const md5blks = [];
        for (let i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = (s.charCodeAt(i) & 0xff) + ((s.charCodeAt(i + 1) & 0xff) << 8) + ((s.charCodeAt(i + 2) & 0xff) << 16) + ((s.charCodeAt(i + 3) & 0xff) << 24);
        }
        return md5blks;
    }
    function md51(s) {
        const n = s.length;
        const state = [1732584193, -271733879, -1732584194, 271733878];
        let i;
        for (i = 64; i <= n; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        const tail = new Array(16).fill(0);
        for (i = 0; i < s.length; i++) tail[i >> 2] |= (s.charCodeAt(i) & 0xff) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }
    function rhex(n) {
        const hexChr = '0123456789abcdef';
        let s = '';
        for (let j = 0; j < 4; j++) s += hexChr.charAt((n >> (j * 8 + 4)) & 0x0f) + hexChr.charAt((n >> (j * 8)) & 0x0f);
        return s;
    }
    function hex(x) {
        for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]);
        return x.join('');
    }
    try {
        return hex(md51((s || '').toString()));
    } catch (e) {}
    return '';
}