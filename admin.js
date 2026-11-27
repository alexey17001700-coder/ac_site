/* =========================================================================
   ЭкоКлимат · Панель администрирования (admin.js)
   Позволяет прямо на сайте:
     • менять любой текст (кликни по нему в режиме редактирования)
     • менять местами / скрывать целые блоки страницы (Герой, Каталог, Цены…)
     • добавлять, дублировать, удалять и переставлять модели кондиционеров
     • менять телефон, WhatsApp, почту, название фирмы
   Сохранение: localStorage (на этом устройстве) + файл JSON для постоянного сохранения.
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  function q(s, c) { return (c || document).querySelector(s); }
  function qa(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function txtOf(el) { return el ? clean(el.textContent) : ''; }
  function hsh(s) { var h = 5381, i = 0; for (; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- название фирмы: старое «КлиматПро» → новое «ЭкоКлимат» ---------------- */
  var LEGACY_COMPANY = /кл[иi]мат[\s\-_]*про/i;
  var BRAND = 'ЭкоКлимат';
  function brandTarget() {
    return (origCompany && !LEGACY_COMPANY.test(origCompany)) ? origCompany : BRAND;
  }
  function fixCompanyName(s) {
    if (typeof s !== 'string' || !s) return s;
    if (!LEGACY_COMPANY.test(s)) return s;
    return s.replace(/кл[иi]мат[\s\-_]*про/gi, function () { return brandTarget(); });
  }
  function replaceCompanyInDOM() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n;
    while ((n = w.nextNode())) {
      var p = n.parentNode;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(p.nodeName)) continue;
      if (n.nodeValue && LEGACY_COMPANY.test(n.nodeValue)) n.nodeValue = fixCompanyName(n.nodeValue);
    }
  }
  /* Жёстко ставим правильное имя в логотип (шапка + футер) — на случай старых правок в браузере */
  function forceBrandInLogo() {
    var name = brandTarget();
    var lg = q('.logo > span:last-child');
    if (lg) {
      for (var i = 0; i < lg.childNodes.length; i++) {
        var n = lg.childNodes[i];
        if (n.nodeType === 3 && clean(n.nodeValue)) {
          if (clean(n.nodeValue) !== name) n.nodeValue = name;
          break;
        }
      }
    }
    qa('.foot-logo .logo-name').forEach(function (el) {
      if (clean(el.textContent) !== name) el.textContent = name;
    });
  }

  /* ---------------- фото: чтение и сжатие ---------------- */
  var PHOTO_MAXW = 900;
  function readPhoto(file, cb) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { toast('Это не картинка'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var raw = String(fr.result);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          if (!w || !h) throw 0;
          if (w > PHOTO_MAXW) { h = Math.round(h * PHOTO_MAXW / w); w = PHOTO_MAXW; }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
          cx.drawImage(img, 0, 0, w, h);
          cb(cv.toDataURL('image/jpeg', 0.78));
        } catch (e) { cb(raw); }
      };
      img.onerror = function () { toast('Не удалось прочитать фото'); };
      img.src = raw;
    };
    fr.readAsDataURL(file);
  }
  function photoSizeWarn() {
    var total = 0;
    (D.cards || []).forEach(function (c) { if (c && c.photo) total += c.photo.length; });
    if (total > 3.2 * 1024 * 1024) toast('Фото занимают много места — лучше вставлять ссылки на картинки');
  }

  var K = { data: 'acsite_data_v1', base: 'acsite_base_v1', pass: 'acsite_pass_v1', sess: 'acsite_sess_v1', tok: 'acsite_tok_v1' };
  var DEFAULT_PASS = 'climatepro';
  var REMOTE_URL = 'content.json';

  var D = null;              /* данные сайта */
  var BASES = {};            /* исходные тексты (для безопасного применения правок) */
  var ITEMS = [];            /* редактируемые элементы */
  var editing = false;
  var origCompany = '';
  var origTitle = '';

  /* =========================== ДАННЫЕ =========================== */
  function emptyData() {
    return { v: 1, texts: {}, cards: null, blocks: { order: null, hidden: {} }, settings: {} };
  }
  function loadData() {
    var d = emptyData();
    try {
      var raw = localStorage.getItem(K.data);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          d.texts = o.texts || {};
          d.cards = (o.cards && o.cards.length) ? o.cards : null;
          d.blocks = o.blocks || d.blocks;
          d.settings = o.settings || {};
          d.catV = o.catV || 0;
          d.cardsEdited = !!o.cardsEdited;
        }
      }
    } catch (e) { }
    return d;
  }
  function saveData() { try { localStorage.setItem(K.data, JSON.stringify(D)); } catch (e) { } }
  function loadBases() { try { var r = localStorage.getItem(K.base); if (r) BASES = JSON.parse(r) || {}; } catch (e) { } }
  function saveBases() { try { localStorage.setItem(K.base, JSON.stringify(BASES)); } catch (e) { } }

  /* =========================== БЛОКИ СТРАНИЦЫ =========================== */
  var BLOCKS = [
    { s: 'hero', sel: '.hero' },
    { s: 'adv', sel: '.adv' },
    { s: 'catalog', sel: '#catalog' },
    { s: 'calc', sel: '#calc' },
    { s: 'services', sel: '#services' },
    { s: 'steps', sel: '.steps' },
    { s: 'prices', sel: '#prices' },
    { s: 'reviews', sel: '#reviews' },
    { s: 'faq', sel: '#faq' },
    { s: 'contact', sel: '#contact' },
    { s: 'footer', sel: 'footer', noReorder: true }
  ];
  function blockEls() {
    var m = {};
    BLOCKS.forEach(function (b) { var el = q(b.sel); if (el) m[b.s] = el; });
    return m;
  }
  function blockOrder() {
    if (D.blocks.order && D.blocks.order.length) return D.blocks.order.slice();
    return BLOCKS.filter(function (b) { return !b.noReorder; }).map(function (b) { return b.s; });
  }
  function applyBlocks() {
    var m = blockEls(), footer = q('footer'), seen = {};
    if (footer && footer.parentNode) {
      blockOrder().concat(BLOCKS.map(function (b) { return b.s; })).forEach(function (s) {
        if (seen[s] || !m[s] || s === 'footer') return;
        seen[s] = 1;
        footer.parentNode.insertBefore(m[s], footer);
      });
    }
    BLOCKS.forEach(function (b) {
      var el = m[b.s]; if (!el) return;
      el.classList.toggle('ac-hidden', !!(D.blocks.hidden && D.blocks.hidden[b.s]));
    });
  }
  function moveBlock(slug, dir) {
    var order = blockOrder(), i = order.indexOf(slug), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    order[i] = order[j]; order[j] = slug;
    D.blocks.order = order;
    applyBlocks(); markBlockControls(); saveData();
    toast('Блок перемещён');
  }
  function toggleBlock(slug) {
    D.blocks.hidden = D.blocks.hidden || {};
    D.blocks.hidden[slug] = !D.blocks.hidden[slug];
    applyBlocks(); saveData();
    toast(D.blocks.hidden[slug] ? 'Блок скрыт' : 'Блок показан');
  }

  /* =========================== КАТАЛОГ (модели) =========================== */
  var io = null;
  function observeReveal(list) {
    if (!list.length) return;
    if (!('IntersectionObserver' in window)) { list.forEach(function (e) { e.classList.add('in'); }); return; }
    if (!io) {
      io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    list.forEach(function (e) { io.observe(e); });
  }
  function parseCards() {
    return qa('.cards .card').map(function (c, i) {
      var p = c.querySelector('.card-price .p'), price = '', note = '';
      if (p) {
        var sm = p.querySelector('small');
        note = sm ? clean(sm.textContent) : '';
        var clone = p.cloneNode(true);
        var cs = clone.querySelector('small');
        if (cs) cs.parentNode.removeChild(cs);
        price = clean(clone.textContent);
      }
      var im = c.querySelector('.card-top .unit img');
      return {
        uid: c.getAttribute('data-uid') || ('c' + i),
        brand: txtOf(c.querySelector('.brand-badge')),
        title: txtOf(c.querySelector('.card-body h3')),
        specs: qa('.card-specs li', c).map(txtOf),
        price: price,
        note: note || 'с установкой',
        photo: im ? (im.getAttribute('src') || '') : '',
        hidden: c.getAttribute('data-hidden') === '1'
      };
    });
  }
  function cardHTML(c) {
    var ph = c.photo ? String(c.photo) : '';
    return '<div class="card reveal" data-uid="' + esc(c.uid) + '"' + (c.hidden ? ' data-hidden="1"' : '') + '>' +
      '<div class="card-top">' +
        '<span class="brand-badge">' + esc(c.brand) + '</span>' +
        '<span class="snow s1">❄</span><span class="snow s2">❄</span>' +
        '<div class="unit' + (ph ? ' has-photo' : '') + '">' +
          (ph ? '<img src="' + esc(ph) + '" alt="' + esc(c.title || 'Сплит-система') + '" loading="lazy">' : '') +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3>' + esc(c.title) + '</h3>' +
        '<ul class="card-specs">' + (c.specs || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
        '<div class="card-price">' +
          '<div class="p">' + esc(c.price) + '<small>' + esc(c.note || 'с установкой') + '</small></div>' +
          '<a href="#contact" class="btn btn-primary">Заказать</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  function renderCards() {
    var wrap = q('.cards'); if (!wrap || !D.cards) return;
    wrap.innerHTML = D.cards.map(cardHTML).join('');
    observeReveal(qa('.card.reveal', wrap));
    markCardControls();
  }
  function cardIndex(u) {
    for (var i = 0; i < D.cards.length; i++) if (D.cards[i].uid === u) return i;
    return -1;
  }

  /* =========================== ТЕКСТЫ =========================== */
  var ALLOWED = { B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, SPAN: 1, A: 1, BR: 1, SUP: 1, U: 1 };
  var EXCL = '.cards,.calc-box,.ac-card,.hero-visual,.logo,.logo-mark,.foot-logo,.nav,.brand-badge,.unit,.snow,.ic,.dot,' +
             '.rev-stars,.pill,.burger,.btn,.ac-tn,.ac-ctl,.ac-blk,script,style,input,select,textarea,button,svg,nav';
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest(EXCL)) return false;
    if (el.className && typeof el.className === 'string' && /^ac-/.test(el.className)) return false;
    if (clean(el.textContent).length < 2) return false;
    var k = el.children, i;
    for (i = 0; i < k.length; i++) if (!ALLOWED[k[i].tagName]) return false;
    return true;
  }
  var TEXT_ROOTS = {
    hero: ['.hero-grid > div:first-child'],
    adv: ['.adv-item'],
    calc: ['.calc-grid > div:first-child'],
    services: ['.svc'],
    steps: ['.step'],
    prices: ['.price-row'],
    reviews: ['.rev-text', '.rev-author'],
    faq: ['.faq-a'],
    contact: ['.contact-grid > div:first-child', '.form-card'],
    footer: ['.foot-grid', '.foot-bottom'],
    catalog: []
  };
  function prepareFaqTexts() {
    qa('.faq-q').forEach(function (btn) {
      if (btn.querySelector('.ac-tn')) return;
      for (var j = 0; j < btn.childNodes.length; j++) {
        var n = btn.childNodes[j];
        if (n.nodeType === 3 && clean(n.nodeValue)) {
          var sp = document.createElement('span');
          sp.className = 'ac-tn';
          btn.insertBefore(sp, n);
          sp.appendChild(n);
          break;
        }
      }
    });
  }
  function collectItems() {
    ITEMS = [];
    BLOCKS.forEach(function (b) {
      var root = q(b.sel); if (!root) return;
      var sels = (TEXT_ROOTS[b.s] || []).slice();
      if (!b.noReorder && b.s !== 'catalog') sels.push('.sec-head');
      var roots = [];
      sels.forEach(function (sn) { qa(sn, root).forEach(function (r) { if (roots.indexOf(r) < 0) roots.push(r); }); });
      var cands = [];
      roots.forEach(function (r) {
        if (isEditable(r)) cands.push(r);
        qa('*', r).forEach(function (x) { if (isEditable(x)) cands.push(x); });
      });
      var tops = cands.filter(function (x) {
        return !cands.some(function (y) { return y !== x && y.contains(x); });
      });
      tops.forEach(function (x, i) { ITEMS.push({ el: x, key: b.s + '|' + i }); });
    });
    qa('.faq-q').forEach(function (btn, i) {
      var sp = btn.querySelector('.ac-tn');
      if (sp) ITEMS.push({ el: sp, key: 'faq_q|' + i });
    });
  }
  function captureBases() {
    var added = false;
    ITEMS.forEach(function (it) { if (BASES[it.key] == null) { BASES[it.key] = it.el.innerHTML; added = true; } });
    if (added) saveBases();
  }
  function applyTexts() {
    ITEMS.forEach(function (it) {
      var rec = D.texts[it.key]; if (!rec) return;
      var base = BASES[it.key];
      if (base != null && clean(it.el.innerHTML) !== clean(base)) return; /* структура изменилась — не трогаем */
      it.el.innerHTML = rec.t;
    });
  }
  function saveTexts() {
    var changed = false;
    ITEMS.forEach(function (it) {
      var cur = it.el.innerHTML, base = BASES[it.key];
      if (base != null && clean(cur) === clean(base)) {
        if (D.texts[it.key]) { delete D.texts[it.key]; changed = true; }
        return;
      }
      var old = D.texts[it.key];
      if (!old || old.t !== cur) { D.texts[it.key] = { b: base != null ? base : '', t: cur }; changed = true; }
    });
    if (changed) saveData();
  }

  /* =========================== НАСТРОЙКИ =========================== */
  function capOriginals() {
    var lg = q('.logo > span:last-child');
    var t = '';
    if (lg) {
      for (var i = 0; i < lg.childNodes.length; i++) {
        if (lg.childNodes[i].nodeType === 3 && clean(lg.childNodes[i].nodeValue)) { t = clean(lg.childNodes[i].nodeValue); break; }
      }
    }
    origCompany = t || BRAND;
    if (LEGACY_COMPANY.test(origCompany)) origCompany = BRAND;
    origTitle = document.title;
  }
  function defaultsSettings() {
    var np = q('.nav-phone'), href = np ? (np.getAttribute('href') || '') : '';
    var digits = href.replace(/[^\d]/g, '');
    var mail = q('a[href^="mailto:"]');
    var nm = np ? np.textContent.replace(/звоните[\s\S]*$/i, '') : '';
    return {
      company: origCompany,
      title: origTitle,
      phone: digits || '79212636626',
      phoneText: clean(nm) || '+7 (921) 263-66-26',
      email: mail ? mail.getAttribute('href').replace('mailto:', '') : 'info@climatepro.ru',
      whatsapp: digits || '79212636626',
      ghRepo: 'alexey17001700-coder/ac_site',
      ghBranch: 'main'
    };
  }
  function settings() {
    if (!D.settings) D.settings = {};
    var d = defaultsSettings();
    for (var k in d) if (D.settings[k] == null || D.settings[k] === '') D.settings[k] = d[k];
    /* миграция: вычищаем старый тестовый номер из сохранённых настроек */
    var OLD = ['79991234567', '89991234567', '9991234567'];
    ['phone', 'whatsapp'].forEach(function (k) {
      var v = String(D.settings[k] || '').replace(/[^\d]/g, '');
      if (OLD.indexOf(v) >= 0) D.settings[k] = d[k];
    });
    if (String(D.settings.phoneText || '').replace(/[^\d]/g, '').indexOf('9991234567') >= 0) {
      D.settings.phoneText = d.phoneText;
    }
    /* защита: старое название фирмы не должно вернуться на страницу */
    if (LEGACY_COMPANY.test(String(D.settings.company || ''))) D.settings.company = origCompany || 'ЭкоКлимат';
    if (typeof D.settings.title === 'string') D.settings.title = fixCompanyName(D.settings.title);
    return D.settings;
  }
  function replaceAllTextNodes(from, to) {
    if (!from || !to || from === to) return;
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n;
    while ((n = w.nextNode())) {
      var p = n.parentNode;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(p.nodeName)) continue;
      if (n.nodeValue && n.nodeValue.indexOf(from) >= 0) n.nodeValue = n.nodeValue.split(from).join(to);
    }
  }
  function applySettings() {
    var s = settings();
    if (s.company && s.company !== origCompany) replaceAllTextNodes(origCompany, s.company);
    if (s.title) document.title = s.title;
    if (s.phone) {
      var tel = 'tel:' + s.phone.replace(/[^\d+]/g, '');
      qa('a[href^="tel:"]').forEach(function (a) { a.setAttribute('href', tel); });
      var np = q('.nav-phone');
      if (np) {
        for (var i = 0; i < np.childNodes.length; i++) {
          var nd = np.childNodes[i];
          if (nd.nodeType === 3 && clean(nd.nodeValue)) { nd.nodeValue = s.phoneText || s.phone; break; }
        }
      }
      qa('a[href^="tel:"]').forEach(function (a) {
        if (!a.classList.contains('nav-phone')) a.textContent = s.phoneText || s.phone;
      });
    }
    if (s.email) {
      qa('a[href^="mailto:"]').forEach(function (a) {
        a.setAttribute('href', 'mailto:' + s.email);
        a.textContent = s.email;
      });
    }
    window.ACSITE = { settings: { whatsapp: (s.whatsapp || '').replace(/[^\d]/g, '') } };
  }

  /* =========================== СТИЛИ =========================== */
  function injectCSS() {
    if (q('#acStyle')) return;
    var css = [
      '#acAdminBtn{position:fixed;right:16px;bottom:16px;z-index:9998;width:46px;height:46px;border-radius:50%;',
      'border:1px solid #cfe8fa;background:rgba(255,255,255,.92);color:#0a84ff;font-size:21px;line-height:1;',
      'box-shadow:0 10px 26px rgba(10,60,110,.22);backdrop-filter:blur(8px);cursor:pointer}',
      '#acAdminBtn:hover{transform:translateY(-2px)}',
      'body.ac-editing #acAdminBtn{bottom:78px}',
      '#acBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;gap:8px;align-items:center;',
      'background:rgba(6,42,69,.96);backdrop-filter:blur(10px);border-top:1px solid rgba(255,255,255,.16);',
      'padding:9px 12px;overflow-x:auto;font-size:13px;color:#fff}',
      '#acBar button{white-space:nowrap;padding:9px 14px;border-radius:11px;background:rgba(255,255,255,.1);',
      'border:1px solid rgba(255,255,255,.2);color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}',
      '#acBar button:hover{background:rgba(34,211,238,.3)}',
      '#acBar .ac-live{background:linear-gradient(135deg,#0a84ff,#22d3ee);border-color:transparent}',
      '#acBar .ac-hint{margin-left:auto;font-size:12px;color:#9dc2dd;white-space:nowrap;padding:0 8px}',
      'body.ac-editing{padding-bottom:66px}',
      'body.ac-editing .ac-ed{outline:1px dashed rgba(10,132,255,.6);outline-offset:2px;border-radius:4px;cursor:text;',
      'transition:outline-color .15s,background .15s}',
      'body.ac-editing .ac-ed:hover{outline:1.5px solid #0a84ff;background:rgba(10,132,255,.05)}',
      'body.ac-editing .ac-ed:focus{outline:2px solid #0a84ff;background:rgba(10,132,255,.07)}',
      'body.ac-editing a{pointer-events:none}',
      'body.ac-editing .hero,body.ac-editing .adv,body.ac-editing section,body.ac-editing footer{position:relative}',
      '.ac-ctl,.ac-blk{position:absolute;z-index:40;display:flex;gap:4px;background:rgba(6,42,69,.92);',
      'border-radius:10px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.28)}',
      '.ac-ctl{top:8px;right:8px}.ac-blk{top:10px;left:10px;left:auto;right:10px}',
      '.ac-ctl button,.ac-blk button{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.14);',
      'color:#fff;font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer;border:0;padding:0}',
      '.ac-ctl button:hover,.ac-blk button:hover{background:#0a84ff}',
      '.ac-ctl button.ac-danger:hover,.ac-blk button.ac-danger:hover{background:#ef4444}',
      '.ac-ctl button.ac-on,.ac-blk button.ac-on{background:#22d3ee;color:#062a45}',
      'body.ac-editing .card{position:relative}',
      'body.ac-editing .card[data-hidden="1"]{opacity:.5;outline:2px dashed #ef4444;outline-offset:-2px}',
      'body:not(.ac-editing) .card[data-hidden="1"]{display:none}',
      'body:not(.ac-editing) .ac-hidden{display:none!important}',
      '.ac-modal{position:fixed;inset:0;z-index:10001;background:rgba(6,42,69,.55);backdrop-filter:blur(6px);',
      'display:grid;place-items:center;padding:18px}',
      '.ac-modal .ac-box{background:#fff;border-radius:20px;padding:24px;width:100%;max-width:540px;max-height:88vh;',
      'overflow:auto;box-shadow:0 30px 70px rgba(0,0,0,.35)}',
      '.ac-modal h3{margin:0 0 6px;font-size:19px;color:#062a45}',
      '.ac-modal .ac-sub{margin:0 0 16px;font-size:13px;color:#5b7a94;line-height:1.55}',
      '.ac-f{margin-bottom:12px}',
      '.ac-f label{display:block;font-size:12.5px;font-weight:700;color:#0b3d63;margin-bottom:5px}',
      '.ac-f input,.ac-f textarea{width:100%;padding:11px 13px;border:1.5px solid #d7e8f5;border-radius:11px;',
      'font-size:14.5px;font-family:inherit;background:#fbfdff;outline:none;color:#0d2438}',
      '.ac-f input:focus,.ac-f textarea:focus{border-color:#0a84ff;box-shadow:0 0 0 4px rgba(10,132,255,.12);background:#fff}',
      '.ac-f textarea{min-height:92px;resize:vertical}',
      '.ac-f .ac-chk{display:flex;align-items:center;gap:9px;font-size:14px;color:#0b3d63;font-weight:600}',
      '.ac-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}',
      '.ac-row button{flex:1;min-width:130px;padding:12px 16px;border-radius:12px;font-weight:700;font-size:14px;',
      'cursor:pointer;border:0;font-family:inherit}',
      '.ac-b1{background:linear-gradient(135deg,#0a84ff,#22d3ee);color:#fff}',
      '.ac-b2{background:#eef7ff;color:#0b3d63;border:1.5px solid #d7e8f5!important}',
      '.ac-b3{background:#fee2e2;color:#b91c1c}',
      '.ac-toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);z-index:10002;background:rgba(6,42,69,.95);',
      'color:#fff;padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:600;box-shadow:0 12px 30px rgba(0,0,0,.3);',
      'transition:opacity .35s,transform .35s;max-width:88vw;text-align:center}',
      '.ac-toast.ac-out{opacity:0;transform:translateX(-50%) translateY(10px)}',
      /* --- адаптив панели администрирования --- */
      '@media(max-width:900px){#acBar .ac-hint{display:none}}',
      '@media(max-width:640px){',
      '#acBar{padding:8px 8px calc(8px + env(safe-area-inset-bottom));gap:6px}',
      '#acBar button{padding:10px 12px;font-size:12.5px;min-height:40px}',
      '#acBar .ac-hint{display:none}',
      '#acAdminBtn{right:12px;bottom:calc(12px + env(safe-area-inset-bottom));width:48px;height:48px}',
      'body.ac-editing #acAdminBtn{bottom:calc(70px + env(safe-area-inset-bottom))}',
      'body.ac-editing{padding-bottom:64px}',
      '.ac-modal{padding:0;align-items:flex-end}',
      '.ac-modal .ac-box{max-width:100%;border-radius:20px 20px 0 0;max-height:92vh;max-height:92dvh;',
      'padding:20px 16px calc(20px + env(safe-area-inset-bottom))}',
      '.ac-row button{min-width:100%}',
      '.ac-ctl button,.ac-blk button{width:32px;height:32px;font-size:14px}',
      '.ac-toast{bottom:calc(84px + env(safe-area-inset-bottom));font-size:13px;max-width:92vw}',
      '.ac-f input,.ac-f textarea{font-size:16px}',
      '}',
      '@media(max-width:420px){',
      '#acBar button{padding:9px 10px;font-size:12px}',
      '.ac-modal .ac-box h3{font-size:17px}',
      '.ac-ctl,.ac-blk{padding:3px;gap:3px}',
      '}',
      /* --- блок фото в карточке модели --- */
      '.ac-ctl{flex-wrap:wrap;max-width:calc(100% - 16px);justify-content:flex-end}',
      '.ac-photo{display:grid;gap:10px}',
      '.ac-photo-prev{height:150px;border-radius:14px;border:1.5px dashed #cfe0ee;background:#f7fbff;',
      'display:grid;place-items:center;overflow:hidden;transition:box-shadow .3s,border-color .3s}',
      '.ac-photo-prev img{width:100%;height:100%;object-fit:cover;display:block}',
      '.ac-photo-prev.ac-flash{border-color:#22c55e;box-shadow:0 0 0 5px rgba(34,197,94,.22)}',
      '.ac-photo-empty{font-size:12.5px;color:#7d9ab2;text-align:center;padding:0 16px;line-height:1.5}',
      '.ac-photo-btns{display:flex;gap:8px;flex-wrap:wrap}',
      '.ac-photo-file{flex:1;min-width:150px;display:flex;align-items:center;justify-content:center;gap:8px;',
      'padding:11px 14px;border-radius:12px;background:linear-gradient(135deg,#0a84ff,#22d3ee);color:#fff;',
      'font-size:13.5px;font-weight:700;cursor:pointer;text-align:center}',
      '.ac-photo-file input{display:none}',
      '.ac-photo-rm{padding:11px 14px;border-radius:12px;background:#fee2e2;color:#b91c1c;font-weight:700;',
      'font-size:13.5px;border:0;cursor:pointer;font-family:inherit}',
      '.ac-photo-hint{margin:0;font-size:12px;color:#7d9ab2;line-height:1.5}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'acStyle';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }
  function toast(msg) {
    var t = q('.ac-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ac-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('ac-out');
    clearTimeout(t.__tm);
    t.__tm = setTimeout(function () { t.classList.add('ac-out'); }, 1700);
  }

  /* =========================== УПРАВЛЕНИЕ =========================== */
  function enterEdit() {
    if (editing) return;
    editing = true;
    document.body.classList.add('ac-editing');
    ITEMS.forEach(function (it) {
      it.el.setAttribute('contenteditable', 'true');
      it.el.classList.add('ac-ed');
      it.el.setAttribute('data-k', it.key);
    });
    renderCards();
    buildBar();
    markBlockControls();
    toast('Режим редактирования включён');
  }
  function exitEdit() {
    if (!editing) return;
    saveTexts();
    editing = false;
    document.body.classList.remove('ac-editing');
    ITEMS.forEach(function (it) {
      it.el.removeAttribute('contenteditable');
      it.el.classList.remove('ac-ed');
      it.el.removeAttribute('data-k');
    });
    var bar = q('#acBar'); if (bar) bar.parentNode.removeChild(bar);
    qa('.ac-ctl,.ac-blk').forEach(function (c) { c.parentNode.removeChild(c); });
    renderCards();
    toast('Режим просмотра. Правки сохранены локально.');
  }
  function markCardControls() {
    if (!editing) return;
    qa('.cards .card').forEach(function (c) {
      if (c.querySelector('.ac-ctl')) return;
      var u = c.getAttribute('data-uid'), hid = c.getAttribute('data-hidden') === '1';
      var bar = document.createElement('div');
      bar.className = 'ac-ctl';
      bar.innerHTML =
        '<button type="button" data-a="up" title="Выше">▲</button>' +
        '<button type="button" data-a="down" title="Ниже">▼</button>' +
        '<button type="button" data-a="edit" title="Изменить модель">✎</button>' +
        '<button type="button" data-a="photo" title="Добавить фото сплит-системы">📷</button>' +
        '<button type="button" data-a="dup" title="Дублировать">⧉</button>' +
        '<button type="button" data-a="hide" class="' + (hid ? 'ac-on' : '') + '" title="Скрыть/показать">' + (hid ? '🚫' : '👁') + '</button>' +
        '<button type="button" data-a="del" class="ac-danger" title="Удалить">🗑</button>';
      bar.setAttribute('data-uid', u);
      c.appendChild(bar);
    });
  }
  function markBlockControls() {
    if (!editing) return;
    qa('.ac-blk').forEach(function (c) { c.parentNode.removeChild(c); });
    BLOCKS.forEach(function (b) {
      if (b.noReorder) return;
      var el = q(b.sel); if (!el) return;
      var hid = !!(D.blocks.hidden && D.blocks.hidden[b.s]);
      var bar = document.createElement('div');
      bar.className = 'ac-blk';
      bar.setAttribute('data-slug', b.s);
      bar.innerHTML =
        '<button type="button" data-a="bup" title="Блок выше">▲</button>' +
        '<button type="button" data-a="bdown" title="Блок ниже">▼</button>' +
        '<button type="button" data-a="bhide" class="' + (hid ? 'ac-on' : '') + '" title="Скрыть/показать блок">' + (hid ? '🚫' : '👁') + '</button>';
      el.appendChild(bar);
    });
  }

  /* --------- нижняя панель --------- */
  function buildBar() {
    if (q('#acBar')) return;
    var bar = document.createElement('div');
    bar.id = 'acBar';
    bar.innerHTML =
      '<button type="button" class="ac-live" data-a="view">👁 Просмотр</button>' +
      '<button type="button" data-a="save">💾 Сохранить</button>' +
      '<button type="button" data-a="pub">🚀 Опубликовать на сайте</button>' +
      '<button type="button" data-a="cards">➕ Добавить модель</button>' +
      '<button type="button" data-a="catreload">🔄 Каталог Haier/Green/Kentatsu</button>' +
      '<button type="button" data-a="set">⚙ Настройки</button>' +
      '<button type="button" data-a="exp">⬇ Скачать JSON</button>' +
      '<button type="button" data-a="imp">⬆ Загрузить JSON</button>' +
      '<button type="button" data-a="help">❓ Как это работает</button>' +
      '<button type="button" data-a="out">🚪 Выйти</button>' +
      '<span class="ac-hint">Кликни по тексту и пиши — сохраняется сразу</span>';
    document.body.appendChild(bar);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-a]') : null;
    if (!b) return;
    var a = b.getAttribute('data-a');

    if (a === 'view') { exitEdit(); return; }
    if (a === 'save') { saveTexts(); saveData(); toast('✓ Сохранено на этом устройстве'); return; }
    if (a === 'pub') { openPublish(); return; }
    if (a === 'cards') { openCard(null); return; }
    if (a === 'catreload') {
      if (!confirm('Вернуть каталог к 6 моделям Haier, Green и Kentatsu? Свои добавленные модели будут заменены (фото сохранятся).')) return;
      forceCatalog(true); D.cardsEdited = true; saveData(); renderCards(); markCardControls(); toast('✓ Каталог обновлён: Haier, Green, Kentatsu');
      return;
    }
    if (a === 'set') { openSettings(); return; }
    if (a === 'exp') { exportJSON(); return; }
    if (a === 'imp') { importJSON(); return; }
    if (a === 'help') { openHelp(); return; }
    if (a === 'out') { try { localStorage.removeItem(K.sess); } catch (er) { } exitEdit(); return; }

    /* карточки */
    var ctl = b.closest('.ac-ctl');
    if (ctl) {
      var u = ctl.getAttribute('data-uid'), i = cardIndex(u);
      if (i < 0) return;
      if (a === 'up' && i > 0) { var t1 = D.cards[i - 1]; D.cards[i - 1] = D.cards[i]; D.cards[i] = t1; }
      else if (a === 'down' && i < D.cards.length - 1) { var t2 = D.cards[i + 1]; D.cards[i + 1] = D.cards[i]; D.cards[i] = t2; }
      else if (a === 'edit') { openCard(u); return; }
      else if (a === 'photo') { openCard(u, true); return; }
      else if (a === 'dup') {
        var cp = JSON.parse(JSON.stringify(D.cards[i])); cp.uid = uid();
        D.cards.splice(i + 1, 0, cp);
      }
      else if (a === 'hide') { D.cards[i].hidden = !D.cards[i].hidden; }
      else if (a === 'del') {
        if (!confirm('Удалить модель «' + clean(D.cards[i].title) + '»?')) return;
        D.cards.splice(i, 1);
      }
      D.cardsEdited = true;
      saveData(); renderCards(); markCardControls();
      collapseFAQFix();
      return;
    }
    /* блоки */
    var blk = b.closest('.ac-blk');
    if (blk) {
      var slug = blk.getAttribute('data-slug');
      if (a === 'bup') moveBlock(slug, -1);
      else if (a === 'bdown') moveBlock(slug, 1);
      else if (a === 'bhide') toggleBlock(slug);
      if (a !== 'bhide') markBlockControls();
      return;
    }
  });
  function collapseFAQFix() { /* заглушка для сохранения раскладки */ }

  /* -- вопросы FAQ: текстом из модалки (внутри <button> браузер не даёт печатать) -- */
  document.addEventListener('click', function (e) {
    if (!editing) return;
    var b = e.target.closest ? e.target.closest('.faq-q') : null;
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var sp = b.querySelector('.ac-tn');
    var cur = sp ? sp.textContent : clean(b.textContent);
    var w = modal('Текст вопроса', 'Вопрос в разделе «Частые вопросы».',
      '<div class="ac-f"><label>Вопрос</label><input id="qText" value="' + esc(clean(cur)) + '"></div>',
      '<button type="button" class="ac-b1" data-x="ok">Сохранить</button>' +
      '<button type="button" class="ac-b2" data-x="no">Отмена</button>');
    var inp = q('#qText', w);
    if (inp) setTimeout(function () { inp.focus(); inp.select(); }, 60);
    w.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { var okb = q('button[data-x="ok"]', w); if (okb) okb.click(); } });
    w.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-x]'); if (!btn) return;
      if (btn.getAttribute('data-x') === 'no') { w.close(); return; }
      var v = val(w, 'qText');
      if (v) {
        if (sp) sp.textContent = v;
        else b.insertBefore(document.createTextNode(v), b.firstChild);
        saveTexts(); saveData(); toast('✓ Вопрос сохранён');
      }
      w.close();
    });
  }, true);

  /* -- редактирование текста: автосохранение -- */
  var saveTimer = null;
  document.addEventListener('input', function (e) {
    if (!editing) return;
    var t = e.target.closest ? e.target.closest('[data-k]') : null;
    if (!t) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTexts(); saveData(); }, 500);
  }, true);

  /* =========================== МОДАЛКИ =========================== */
  function modal(title, sub, bodyHTML, buttons) {
    var wrap = document.createElement('div');
    wrap.className = 'ac-modal';
    wrap.innerHTML = '<div class="ac-box"><h3>' + esc(title) + '</h3>' +
      (sub ? '<p class="ac-sub">' + sub + '</p>' : '') + bodyHTML +
      '<div class="ac-row">' + buttons + '</div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap && wrap.getAttribute('data-lock') !== '1') close(); });
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.close = close;
    return wrap;
  }
  function val(wrap, id) { var el = q('#' + id, wrap); return el ? el.value.trim() : ''; }

  function openLogin() {
    var w = modal('Администрирование сайта', 'Введите пароль. По умолчанию <b>' + DEFAULT_PASS + '</b> — смените его в «⚙ Настройки».',
      '<div class="ac-f"><label>Пароль</label><input type="password" id="acPass" autocomplete="current-password"></div>',
      '<button type="button" class="ac-b1" data-x="ok">Войти</button><button type="button" class="ac-b2" data-x="no">Отмена</button>');
    var inp = q('#acPass', w);
    if (inp) { setTimeout(function () { inp.focus(); }, 80); }
    w.addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
    function login() {
      var stored = null;
      try { stored = localStorage.getItem(K.pass); } catch (e) { }
      var need = stored || hsh(DEFAULT_PASS);
      if (hsh(val(w, 'acPass')) === need) {
        try { localStorage.setItem(K.sess, String(Date.now())); } catch (e) { }
        w.close(); enterEdit();
      } else { toast('Неверный пароль'); }
    }
    w.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-x]'); if (!b) return;
      if (b.getAttribute('data-x') === 'ok') login(); else w.close();
    });
  }
  function sessionOK() {
    try {
      var s = localStorage.getItem(K.sess);
      if (!s) return false;
      return (Date.now() - parseInt(s, 10)) < 30 * 24 * 3600 * 1000;
    } catch (e) { return false; }
  }

  function openCard(u, focusPhoto) {
    var adding = !u;
    var c;
    if (adding) {
      c = { uid: uid(), brand: 'Новый бренд', title: 'Новая модель', specs: ['До 25 м² · 09 BTU', 'Инвертор', 'Wi-Fi управление'], price: '49 900 ₽', note: 'с установкой', photo: '', hidden: false };
    } else {
      var i = cardIndex(u);
      if (i < 0) return;
      c = D.cards[i];
    }
    var html =
      '<div class="ac-f"><label>Бренд</label><input id="cBrand" value="' + esc(c.brand) + '"></div>' +
      '<div class="ac-f"><label>Название модели</label><input id="cTitle" value="' + esc(c.title) + '"></div>' +
      '<div class="ac-f"><label>Характеристики (каждая строка — отдельный пункт)</label><textarea id="cSpecs">' + esc((c.specs || []).join('\n')) + '</textarea></div>' +
      '<div class="ac-f"><label>Цена</label><input id="cPrice" value="' + esc(c.price) + '"></div>' +
      '<div class="ac-f"><label>Подпись под ценой</label><input id="cNote" value="' + esc(c.note) + '"></div>' +
      '<div class="ac-f"><label>📷 Фото сплит-системы</label>' +
        '<div class="ac-photo">' +
          '<div class="ac-photo-prev" id="cPrev"></div>' +
          '<div class="ac-photo-btns">' +
            '<label class="ac-photo-file">📁 Выбрать фото с телефона / компьютера<input type="file" id="cFile" accept="image/*"></label>' +
            '<button type="button" class="ac-photo-rm" data-x="rmphoto">🗑 Убрать фото</button>' +
          '</div>' +
          '<input type="text" id="cPhotoUrl" placeholder="…или вставьте ссылку на фото (https://…)" value="' + (/^data:/.test(c.photo || '') ? '' : esc(c.photo || '')) + '">' +
          '<p class="ac-photo-hint">Фото подгоняется автоматически (до 900 px, JPEG). Если фото много — лучше вставлять ссылку, так сайт грузится быстрее.</p>' +
        '</div>' +
      '</div>' +
      '<div class="ac-f"><label class="ac-chk"><input type="checkbox" id="cHide"' + (c.hidden ? ' checked' : '') + '> Скрыть эту модель с сайта</label></div>';
    var w = modal(adding ? 'Новая модель' : 'Модель: ' + clean(c.title),
      'Заполните поля и нажмите «Сохранить». Позиция модели меняется кнопками ▲▼ в каталоге.', html,
      (adding ? '' : '<button type="button" class="ac-b3" data-x="del">Удалить</button>') +
      '<button type="button" class="ac-b1" data-x="ok">Сохранить</button>' +
      '<button type="button" class="ac-b2" data-x="no">Отмена</button>');

    /* --- фото --- */
    var photoVal = c.photo || '';
    var prev = q('#cPrev', w);
    function updPrev() {
      if (!prev) return;
      prev.innerHTML = photoVal
        ? '<img src="' + esc(photoVal) + '" alt="Фото">'
        : '<span class="ac-photo-empty">Фото не выбрано — пока показывается нарисованный блок</span>';
    }
    updPrev();
    if (focusPhoto && prev) {
      setTimeout(function () {
        var box = prev.closest ? prev.closest('.ac-box') : null;
        if (box) box.scrollTop = Math.max(0, prev.offsetTop - 90);
        prev.classList.add('ac-flash');
        setTimeout(function () { prev.classList.remove('ac-flash'); }, 1200);
      }, 120);
    }
    var fileInp = q('#cFile', w);
    if (fileInp) fileInp.addEventListener('change', function () {
      var f = fileInp.files && fileInp.files[0];
      if (!f) return;
      readPhoto(f, function (data) {
        photoVal = data;
        var u = q('#cPhotoUrl', w); if (u) u.value = '';
        updPrev();
        toast('Фото готово — нажми «Сохранить»');
      });
    });

    w.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-x]'); if (!b) return;
      var x = b.getAttribute('data-x');
      if (x === 'no') { w.close(); return; }
      if (x === 'rmphoto') {
        photoVal = '';
        var uu = q('#cPhotoUrl', w); if (uu) uu.value = '';
        updPrev(); toast('Фото убрано');
        return;
      }
      if (x === 'del') {
        if (!confirm('Удалить модель?')) return;
        D.cards.splice(cardIndex(c.uid), 1);
        D.cardsEdited = true;
        saveData(); renderCards(); markCardControls(); w.close(); toast('Модель удалена');
        return;
      }
      c.brand = val(w, 'cBrand'); c.title = val(w, 'cTitle');
      c.specs = val(w, 'cSpecs').split('\n').map(function (s) { return s.replace(/^[-•\s]+/, '').trim(); }).filter(Boolean);
      c.price = val(w, 'cPrice'); c.note = val(w, 'cNote') || 'с установкой';
      c.photo = val(w, 'cPhotoUrl') || photoVal || '';
      c.hidden = q('#cHide', w).checked;
      if (adding) D.cards.push(c);
      D.cardsEdited = true;
      saveData(); renderCards(); markCardControls(); photoSizeWarn(); w.close(); toast('✓ Сохранено');
    });
  }

  function openSettings() {
    var s = settings();
    var html =
      '<div class="ac-f"><label>Название фирмы</label><input id="sCompany" value="' + esc(s.company) + '"></div>' +
      '<div class="ac-f"><label>Телефон (как показывать)</label><input id="sPhoneText" value="' + esc(s.phoneText) + '"></div>' +
      '<div class="ac-f"><label>Телефон цифрами (для звонков), например 79991234567</label><input id="sPhone" value="' + esc(s.phone) + '"></div>' +
      '<div class="ac-f"><label>WhatsApp цифрами (куда приходят заявки)</label><input id="sWa" value="' + esc(s.whatsapp) + '"></div>' +
      '<div class="ac-f"><label>E-mail</label><input id="sMail" value="' + esc(s.email) + '"></div>' +
      '<div class="ac-f"><label>Заголовок вкладки браузера</label><input id="sTitle" value="' + esc(s.title) + '"></div>' +
      '<div class="ac-f"><label>Новый пароль администратора (пусто — не менять)</label><input id="sPass" type="password" placeholder="оставьте пустым"></div>';
    var w = modal('Настройки сайта', 'Телефон, почта, WhatsApp и название меняются по всему сайту сразу.', html,
      '<button type="button" class="ac-b3" data-x="reset">Сбросить мои правки</button>' +
      '<button type="button" class="ac-b1" data-x="ok">Сохранить</button>' +
      '<button type="button" class="ac-b2" data-x="no">Отмена</button>');
    w.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-x]'); if (!b) return;
      var x = b.getAttribute('data-x');
      if (x === 'no') { w.close(); return; }
      if (x === 'reset') {
        if (!confirm('Убрать ВСЕ мои правки текста, каталога и порядка блоков? (пароль останется)')) return;
        try { localStorage.removeItem(K.data); localStorage.removeItem(K.base); } catch (er) { }
        location.reload(); return;
      }
      var keepRepo = D.settings.ghRepo, keepBranch = D.settings.ghBranch;
      D.settings = {
        company: val(w, 'sCompany'), phoneText: val(w, 'sPhoneText'),
        phone: val(w, 'sPhone').replace(/[^\d+]/g, ''),
        whatsapp: val(w, 'sWa').replace(/[^\d]/g, ''),
        email: val(w, 'sMail'), title: val(w, 'sTitle'),
        ghRepo: keepRepo, ghBranch: keepBranch
      };
      var p = val(w, 'sPass');
      if (p) { try { localStorage.setItem(K.pass, hsh(p)); } catch (er) { } }
      saveData();
      toast('Сохранено. Обнови страницу, чтобы увидеть новые контакты.');
      w.close();
    });
  }

  function openHelp() {
    modal('Как это работает',
      '',
      '<p class="ac-sub" style="margin:0 0 12px">' +
      '<b>1. Тексты.</b> Кликни по любому тексту и пиши прямо на месте. Сохраняется автоматически.<br>' +
      '<b>2. Модели кондиционеров.</b> В каталоге у каждой карточки кнопки: ▲▼ — поменять местами, ✎ — изменить, 📷 — добавить фото, ⧉ — дублировать, 👁 — скрыть, 🗑 — удалить. Кнопка «➕ Добавить модель» — новая карточка.<br>' +
      '<b>2а. Фото сплит-системы.</b> Нажми 📷 на карточке (или ✎ → блок «Фото»). Можно загрузить картинку с телефона/компьютера — она сама сожмётся до 900 px, либо вставить ссылку на фото из интернета. Без фото показывается нарисованный блок.<br>' +
      '<b>3. Блоки страницы.</b> У каждого раздела сверху справа ▲▼ — переместить блок по странице, 👁 — скрыть/показать.<br>' +
      '<b>4. Контакты.</b> «⚙ Настройки» — телефон, WhatsApp, почта, название. Обновляются везде.<br>' +
      '<b>5. Постоянное сохранение.</b> Правки живут в этом браузере. Чтобы сайт обновился у всех клиентов — нажми «🚀 Опубликовать на сайте» (один раз вводишь токен GitHub) или «⬇ Скачать JSON» и пришли файл Архитектору.<br>' +
      '<b>6. Пароль.</b> Меняется в «⚙ Настройки». По умолчанию — ' + DEFAULT_PASS + '.' +
      '</p>',
      '<button type="button" class="ac-b1" data-x="ok">Понятно</button>');
  }

  /* =========================== ПУБЛИКАЦИЯ НА САЙТ =========================== */
  function ghToken() { try { return localStorage.getItem(K.tok) || ''; } catch (e) { return ''; } }
  function setGhToken(t) { try { if (t) localStorage.setItem(K.tok, t); else localStorage.removeItem(K.tok); } catch (e) { } }
  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }

  function openPublish() {
    var s = settings();
    var has = !!ghToken();
    var html =
      '<div class="ac-f"><label>Репозиторий GitHub (владелец/имя)</label><input id="pRepo" value="' + esc(s.ghRepo || '') + '"></div>' +
      '<div class="ac-f"><label>Ветка</label><input id="pBranch" value="' + esc(s.ghBranch || 'main') + '"></div>' +
      '<div class="ac-f"><label>Токен GitHub (хранится только в этом браузере)</label><input id="pTok" type="password" placeholder="' + (has ? 'токен уже сохранён — оставь пустым' : 'ghp_… права Contents: Read and write') + '"></div>' +
      '<p class="ac-sub" style="margin:0">Публикация запишет файл <b>content.json</b> в репозиторий — правки увидят все посетители сайта. Токен уходит только на api.github.com и в репозиторий не попадает.</p>';
    var w = modal('Опубликовать правки на сайте', 'Сначала нажми «💾 Сохранить», потом публикуй.', html,
      '<button type="button" class="ac-b1" data-x="ok">🚀 Опубликовать</button>' +
      '<button type="button" class="ac-b2" data-x="no">Отмена</button>');
    w.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-x]'); if (!b) return;
      if (b.getAttribute('data-x') === 'no') { w.close(); return; }
      var repo = val(w, 'pRepo'), branch = val(w, 'pBranch') || 'main', tok = val(w, 'pTok');
      if (tok) setGhToken(tok);
      if (!ghToken()) { toast('Нужен токен GitHub'); return; }
      if (!repo) { toast('Укажи репозиторий'); return; }
      D.settings.ghRepo = repo; D.settings.ghBranch = branch; saveData();
      doPublish(repo, branch, ghToken(), b);
    });
  }

  function doPublish(repo, branch, token, btn) {
    var body = buildExport();
    var api = 'https://api.github.com/repos/' + repo + '/contents/content.json';
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Публикую…'; }
    function done(msg) {
      if (btn) { btn.disabled = false; btn.textContent = old; }
      toast(msg);
    }
    fetch(api + '?ref=' + encodeURIComponent(branch), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (cur) {
        var payload = { message: 'Обновление контента сайта (админка)', content: b64(body), branch: branch };
        if (cur && cur.sha) payload.sha = cur.sha;
        return fetch(api, {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then(function (r) {
        if (r && r.ok) done('✓ Опубликовано! Клиенты увидят через 1–2 минуты');
        else if (r && r.status === 401) done('Токен неверный или истёк');
        else if (r && r.status === 403) done('Нет прав: нужен Contents: Read and write');
        else if (r && r.status === 404) done('Репозиторий или ветка не найдены');
        else done('Не получилось опубликовать');
      })
      .catch(function () { done('Ошибка сети при публикации'); });
  }

  /* =========================== ЭКСПОРТ / ИМПОРТ =========================== */
  function buildExport() {
    saveTexts();
    var out = { v: 1, texts: D.texts, cards: D.cards, blocks: D.blocks, settings: settings() };
    return JSON.stringify(out, null, 2);
  }
  function exportJSON() {
    var blob = new Blob([buildExport()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 500);
    toast('Файл content.json скачан — пришли его Архитектору');
  }
  function importJSON() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var o = JSON.parse(String(r.result));
          if (!o || typeof o !== 'object') throw 0;
          D.texts = o.texts || {};
          D.cards = (o.cards && o.cards.length) ? o.cards : null;
          D.cardsEdited = !!(o.cards && o.cards.length);
          D.blocks = o.blocks || { order: null, hidden: {} };
          D.settings = o.settings || {};
          saveData(); saveBases();
          location.reload();
        } catch (e) { toast('Не получилось прочитать файл'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* =========================== ПОДКЛЮЧЕНИЕ ФАЙЛА С САЙТА =========================== */
  function fetchRemote() {
    if (location.protocol === 'file:') return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', REMOTE_URL + '?t=' + Date.now(), true);
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) return;
      var o;
      try { o = JSON.parse(xhr.responseText); } catch (e) { return; }
      if (!o || typeof o !== 'object') return;
      /* локальные правки важнее опубликованных */
      D.texts = mergeLeft(D.texts, o.texts || {});
      /* опубликованный каталог применяем, только если в этом браузере модели не правили */
      if (o.cards && o.cards.length && !D.cardsEdited) D.cards = o.cards;
      if (o.blocks) {
        if (!D.blocks.order && o.blocks.order) D.blocks.order = o.blocks.order;
        var h = {};
        for (var k in (o.blocks.hidden || {})) h[k] = o.blocks.hidden[k];
        for (var k2 in (D.blocks.hidden || {})) h[k2] = D.blocks.hidden[k2];
        D.blocks.hidden = h;
      }
      if (o.settings) for (var sk in o.settings) if (!D.settings[sk]) D.settings[sk] = o.settings[sk];
      applyBlocks();
      renderCards();
      ITEMS.forEach(function (it) {
        if (it.el.getAttribute('contenteditable') !== 'true') it.el.innerHTML = BASES[it.key] != null ? BASES[it.key] : it.el.innerHTML;
      });
      applyTexts();
      markBlockControls();
      if (editing) markCardControls();
      saveData();
      /* опубликованные данные могли содержать старое название фирмы — чистим */
      migrateCompany();
      applySettings();
      applyTexts();
    };
    try { xhr.send(); } catch (e) { }
  }
  function mergeLeft(local, remote) {
    var out = {};
    for (var k in remote) out[k] = remote[k];
    for (var k2 in local) out[k2] = local[k2];
    return out;
  }

  /* =========================== МИГРАЦИЯ ГАРАНТИИ =========================== */
  /* Было «гарантия 5 лет» — должно быть «от 3 лет». Чистим и в HTML, и в сохранённых правках. */
  function migrateGuarantee() {
    var PAIRS = [
      ['гарантия 5 лет', 'гарантия от 3 лет'],
      ['Гарантия 5 лет', 'Гарантия от 3 лет'],
      ['ГАРАНТИЯ 5 ЛЕТ', 'ГАРАНТИЯ ОТ 3 ЛЕТ'],
      ['гарантия 5-ть лет', 'гарантия от 3 лет'],
      ['гарантии 5 лет', 'гарантии от 3 лет'],
      ['гарантию 5 лет', 'гарантию от 3 лет'],
      ['гарантией 5 лет', 'гарантией от 3 лет'],
      ['5 лет гарантии', 'от 3 лет гарантии'],
      ['5 лет на', 'от 3 лет на'],
      ['5 лет', 'от 3 лет']
    ];
    function fix(str) {
      if (!str || str.indexOf('5 лет') < 0) return str;
      for (var i = 0; i < PAIRS.length; i++) {
        if (str.indexOf(PAIRS[i][0]) >= 0) str = str.split(PAIRS[i][0]).join(PAIRS[i][1]);
      }
      return str;
    }
    /* 1. сохранённые правки текста */
    if (D && D.texts) {
      for (var k in D.texts) {
        var rec = D.texts[k];
        if (!rec) continue;
        if (typeof rec.t === 'string') rec.t = fix(rec.t);
        if (typeof rec.b === 'string') rec.b = fix(rec.b);
      }
    }
    if (D && D.cards && D.cards.length) {
      D.cards.forEach(function (c) {
        if (!c) return;
        if (typeof c.title === 'string') c.title = fix(c.title);
        if (typeof c.note === 'string') c.note = fix(c.note);
        if (c.specs && c.specs.length) c.specs = c.specs.map(fix);
      });
    }
    /* 2. исходные тексты (базы) — иначе старые вернут «5 лет» обратно */
    if (typeof BASES === 'object' && BASES) {
      for (var bk in BASES) {
        if (typeof BASES[bk] === 'string') BASES[bk] = fix(BASES[bk]);
      }
      saveBases();
    }
    /* 3. тексты прямо в документе */
    ['гарантия 5 лет|гарантия от 3 лет', 'Гарантия 5 лет|Гарантия от 3 лет', '5 лет|от 3 лет'].forEach(function (p) {
      var a = p.split('|');
      replaceAllTextNodes(a[0], a[1]);
    });
    /* 4. заголовок вкладки */
    if (document.title && document.title.indexOf('5 лет') >= 0) document.title = fix(document.title);
    saveData();
  }

  /* =========================== МИГРАЦИЯ НАЗВАНИЯ ФИРМЫ =========================== */
  /* Раньше фирма называлась «КлиматПро», теперь — «ЭкоКлимат». Чистим старые
     сохранённые настройки и тексты, иначе старое имя возвращается на страницу. */
  function migrateCompany() {
    var NEW = brandTarget();
    function fix(s) { return fixCompanyName(s); }
    /* 1. сохранённое название фирмы и заголовок вкладки */
    if (D && D.settings) {
      if (LEGACY_COMPANY.test(String(D.settings.company || ''))) D.settings.company = NEW;
      if (typeof D.settings.title === 'string') D.settings.title = fix(D.settings.title);
    }
    /* 2. сохранённые правки текстов */
    if (D && D.texts) {
      for (var k in D.texts) {
        var rec = D.texts[k];
        if (!rec) continue;
        rec.t = fix(rec.t);
        rec.b = fix(rec.b);
      }
    }
    /* 2а. каталог: бренды, названия, характеристики */
    if (D && D.cards && D.cards.length) {
      D.cards.forEach(function (c) {
        if (!c) return;
        c.brand = fix(c.brand);
        c.title = fix(c.title);
        c.note = fix(c.note);
        if (c.specs && c.specs.length) c.specs = c.specs.map(fix);
      });
    }
    /* 3. исходные тексты (базы) — иначе старое имя вернётся обратно */
    if (typeof BASES === 'object' && BASES) {
      var changed = false;
      for (var bk in BASES) {
        if (typeof BASES[bk] !== 'string') continue;
        var nv = fix(BASES[bk]);
        if (nv !== BASES[bk]) { BASES[bk] = nv; changed = true; }
      }
      if (changed) saveBases();
    }
    /* 4. тексты прямо в документе + заголовок вкладки */
    replaceCompanyInDOM();
    forceBrandInLogo();
    if (document.title) document.title = fix(document.title);
    saveData();
  }

  /* =========================== МИГРАЦИЯ БРЕНДОВ =========================== */
  /* Раньше в каталоге были Ballu, Hisense, Electrolux, LG, Mitsubishi, Daikin.
     Теперь продаём Haier, Green и Kentatsu. Чистим старые названия в сохранённых
     правках браузера, иначе старые модели возвращаются на страницу. */
  function migrateBrands() {
    var MAP = [
      ['Ballu', 'Haier'], ['BSW-07', 'Lightera'],
      ['Hisense', 'Haier'], ['AS-09', 'Flexis'],
      ['Electrolux', 'Green'], ['EACS-12', 'Breeze'],
      ['LG', 'Green'], ['Dual Inverter', 'Energy'],
      ['Mitsubishi', 'Kentatsu'], ['MSZ', 'Nobu'],
      ['Daikin', 'Kentatsu'], ['FTXB', 'Titan']
    ];
    function fix(s) {
      if (typeof s !== 'string' || !s) return s;
      for (var i = 0; i < MAP.length; i++) {
        if (s.indexOf(MAP[i][0]) >= 0) s = s.split(MAP[i][0]).join(MAP[i][1]);
      }
      return s;
    }
    if (D && D.cards && D.cards.length) {
      D.cards.forEach(function (c) {
        if (!c) return;
        c.brand = fix(c.brand);
        c.title = fix(c.title);
        c.note = fix(c.note);
        if (c.specs && c.specs.length) c.specs = c.specs.map(fix);
      });
    }
    if (D && D.texts) {
      for (var k in D.texts) {
        var rec = D.texts[k];
        if (!rec) continue;
        if (typeof rec.t === 'string') rec.t = fix(rec.t);
        if (typeof rec.b === 'string') rec.b = fix(rec.b);
      }
    }
    if (typeof BASES === 'object' && BASES) {
      for (var bk in BASES) if (typeof BASES[bk] === 'string') BASES[bk] = fix(BASES[bk]);
      saveBases();
    }
    saveData();
  }

  /* =========================== КАТАЛОГ: НОВЫЕ БРЕНДЫ =========================== */
  /* Продаём только Haier, Green и Kentatsu. Если в браузере сохранился старый
     каталог (Ballu, Hisense, Electrolux, LG, Mitsubishi, Daikin) — заменяем его
     на новый список моделей. Фото, уже поставленные вручную, сохраняем. */
  var CATALOG_VERSION = 4;
  var NEW_CATALOG = [
    { brand: 'Haier', title: 'Haier Lightera — спальня', price: '34 900 ₽',
      specs: ['До 20 м² · 07 BTU', 'Инвертор, тихий режим 21 дБ', 'Класс энергоэффективности A++'] },
    { brand: 'Haier', title: 'Haier Flexis — гостиная', price: '44 900 ₽',
      specs: ['До 25 м² · 09 BTU', 'Инвертор, обогрев до −25 °C', 'Wi-Fi управление со смартфона'] },
    { brand: 'Green', title: 'Green Breeze — студия', price: '46 900 ₽',
      specs: ['До 35 м² · 12 BTU', 'Инвертор, самоочистка блока', 'Фильтр от пыли и аллергенов'] },
    { brand: 'Green', title: 'Green Energy — офис', price: '62 900 ₽',
      specs: ['До 50 м² · 18 BTU', 'Инвертор, экономия до 60%', 'Работа на обогрев зимой'] },
    { brand: 'Kentatsu', title: 'Kentatsu Nobu — премиум', price: '69 900 ₽',
      specs: ['До 25 м² · 09 BTU', 'Тишина 19 дБ, надёжный компрессор', 'Датчик присутствия человека'] },
    { brand: 'Kentatsu', title: 'Kentatsu Titan — флагман', price: '84 900 ₽',
      specs: ['До 35 м² · 12 BTU', 'Инвертор, работа до −25 °C', 'Фильтр с ионами серебра'] }
  ];
  var OLD_BRANDS = ['Ballu', 'Hisense', 'Electrolux', 'Mitsubishi', 'Daikin', 'LG', 'BSW-', 'AS-09', 'EACS', 'MSZ', 'FTXB'];
  function catalogLooksOld() {
    var list = (D && D.cards) || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var s = String(c.brand || '') + ' ' + String(c.title || '');
      for (var j = 0; j < OLD_BRANDS.length; j++) {
        if (s.indexOf(OLD_BRANDS[j]) >= 0) return true;
      }
    }
    return false;
  }
  function forceCatalog(force) {
    if (!D) return;
    if (!force && D.catV === CATALOG_VERSION && !catalogLooksOld()) return;
    var old = (D.cards || []).slice();
    D.cards = NEW_CATALOG.map(function (m, i) {
      var prev = old[i];
      return {
        uid: (prev && prev.uid) ? prev.uid : uid(),
        brand: m.brand, title: m.title, specs: m.specs.slice(),
        price: m.price, note: 'с установкой',
        photo: (prev && prev.photo) ? prev.photo : '',
        hidden: false
      };
    });
    D.catV = CATALOG_VERSION;
    saveData();
  }

  /* =========================== СТАРТ =========================== */
  function init() {
    D = loadData();
    loadBases();
    injectCSS();
    capOriginals();
    /* Каталог берём из index.html, пока модели не правили вручную в админке.
       Так новые модели видны всегда, даже если в браузере остался старый каталог. */
    if (!D.cards || !D.cardsEdited) { D.cards = parseCards(); D.cardsEdited = false; }
    if (!D.blocks.order) D.blocks.order = BLOCKS.filter(function (b) { return !b.noReorder; }).map(function (b) { return b.s; });

    migrateCompany();
    migrateBrands();
    applySettings();
    migrateGuarantee();
    applyBlocks();
    prepareFaqTexts();
    renderCards();
    collectItems();
    captureBases();
    applyTexts();

    var btn = document.createElement('button');
    btn.id = 'acAdminBtn'; btn.type = 'button';
    btn.title = 'Администрирование сайта';
    btn.setAttribute('aria-label', 'Администрирование сайта');
    btn.textContent = '⚙';
    btn.addEventListener('click', function () {
      if (editing) { exitEdit(); return; }
      if (sessionOK()) enterEdit(); else openLogin();
    });
    document.body.appendChild(btn);

    if (/[?#&]admin/.test(location.href)) {
      if (sessionOK()) enterEdit(); else openLogin();
    }

    /* внешний вызов: перепроверить и починить название фирмы (используется переключателем обложки) */
    window.ACSITE_FIX_BRAND = function () {
      try { migrateCompany(); applySettings(); } catch (e) { }
    };

    fetchRemote();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
