class MusicPlayer {
    constructor() {
        this._onKeydown = this.handleKeydown.bind(this);
        this._coverObserver = null;
        this._lastLrcIndex = -1;
        this._lastListRect = null;
        this._coverUrlCache = new Map();
        this._coverFetchInFlight = new Set();
        this._coverDebugDone = new Set();
        this.init();
    }

    init() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
        this.getCustomPlayList();
        this.addEventListeners();
        this.waitForAplayerDom();
    }

    getCustomPlayList() {
        this.changeMusicBg(false);
    }

    addEventListeners() {
        document.addEventListener("keydown", this._onKeydown);
    }

    waitForAplayerDom() {
        let hasCover = false;
        let hasList = false;
        const timer = setInterval(() => {
            const aplayerList = document.querySelector('.aplayer-list');
            const cover = document.querySelector('#Music-page .aplayer-pic');

            if (aplayerList) {
                hasList = true;
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
        const aplayer = document.querySelector("#Music-page meting-js").aplayer;
        aplayer.on('loadeddata', () => this.changeMusicBg(true));
        aplayer.on('timeupdate', this.lrcUpdate.bind(this));
    }

    lrcUpdate() {
        const aplayerLrcContents = document.querySelector('.aplayer-lrc-contents');
        if (!aplayerLrcContents) return;
        const currentLrc = aplayerLrcContents.querySelector('p.aplayer-lrc-current');
        if (!currentLrc) return;

        const currentIndex = Array.from(aplayerLrcContents.children).indexOf(currentLrc);
        if (currentIndex === this._lastLrcIndex) return;
        this._lastLrcIndex = currentIndex;

        const wrap = document.querySelector('#Music-page .aplayer-lrc');
        if (!wrap) return;
        const cs = window.getComputedStyle ? window.getComputedStyle(wrap) : null;
        const padTop = cs ? (parseFloat(cs.paddingTop) || 0) : 0;
        // Translate is applied to `.aplayer-lrc-contents`, whose layout origin starts after wrap's padding.
        // To center the current line in the *visual* middle of the wrap, compensate padding-top here.
        const ratio = (window.matchMedia && window.matchMedia('(max-width: 798px)').matches) ? 0.5 : 0.36;
        const anchor = (wrap.clientHeight * ratio) - padTop;
        const y = anchor - (currentLrc.offsetTop + currentLrc.offsetHeight / 2);
        aplayerLrcContents.style.transform = `translateY(${y}px)`;
    }

    handleKeydown(event) {
        const aplayer = document.querySelector('meting-js').aplayer;
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
        try { if (this._coverObserver) this._coverObserver.disconnect(); } catch (e) {}
        this._coverObserver = null;
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