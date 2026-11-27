/* ============================================================
   ac_site/gallery.js
   Настоящие фото для блоков «Как выглядит сплит-система» (#look)
   и «Наши работы: закладные и монтажи» (#portfolio).
   Фото ставит сам Босс: кнопка 📷 на каждой карточке.
   Хранятся в браузере (localStorage) + экспорт/импорт JSON.
   ============================================================ */
(function () {
  var KEY = 'acsite_gallery_v1';   /* где лежат фото */
  var MAX = 1400;                  /* максимальная сторона, px */
  var Q   = 0.82;                  /* качество JPEG */

  /* ---------- хранилище ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function save(obj) {
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      alert('В браузере не хватило места для фото.\nНажмите «⬇ Скачать фото (JSON)» и пришлите файл — вставлю фото прямо в сайт.');
      return false;
    }
  }

  /* ---------- стили ---------- */
  function addStyle() {
    if (document.getElementById('ph-style')) return;
    var s = document.createElement('style');
    s.id = 'ph-style';
    s.textContent = [
      '.ph .ph-edit{position:absolute;top:10px;right:10px;z-index:6;display:flex;gap:6px}',
      '.ph .ph-edit button{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;',
      '  font-size:15px;line-height:1;background:rgba(255,255,255,.94);border:1px solid rgba(10,60,110,.18);',
      '  box-shadow:0 6px 16px rgba(10,60,110,.22);cursor:pointer;transition:transform .15s,background .15s}',
      '.ph .ph-edit button:hover{transform:translateY(-2px);background:#fff}',
      '.ph .ph-edit button.del{display:none}',
      '.ph.has-photo .ph-edit button.del{display:grid}',
      '.ph-tools{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:26px}',
      '.ph-btn{padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:800;color:#0a3d22;cursor:pointer;',
      '  background:linear-gradient(180deg,rgba(242,254,247,.94) 0%,rgba(196,238,213,.92) 18%,rgba(146,218,175,.92) 50%,rgba(108,200,145,.92) 52%,rgba(170,230,194,.94) 100%);',
      '  border:1.5px solid rgba(45,130,80,.9);box-shadow:0 8px 20px rgba(30,140,80,.22);transition:transform .15s}',
      '.ph-btn:hover{transform:translateY(-2px)}',
      '.ph-tip{text-align:center;font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.55}',
      'body.cover-gta .ph-tip{color:#ffd9ee}',
      'body.cover-gta .ph .ph-edit button{background:rgba(255,255,255,.92)}',
      'body.cover-gta .ph-btn{color:#04301a}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- применить сохранённые фото ---------- */
  function apply() {
    var data = load();
    var figs = document.querySelectorAll('.ph[data-photo]');
    for (var i = 0; i < figs.length; i++) {
      var fig = figs[i];
      var k = fig.getAttribute('data-photo');
      var img = fig.querySelector('img');
      if (data[k]) {
        if (img) { img.src = data[k]; }
        fig.classList.add('has-photo');
        fig.classList.remove('no-img');
      } else {
        fig.classList.remove('has-photo');
      }
    }
  }

  /* ---------- сжатие фото, чтобы сайт не тормозил ---------- */
  function compress(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var w = im.width, h = im.height;
        var sc = Math.min(1, MAX / Math.max(w, h));
        w = Math.max(1, Math.round(w * sc));
        h = Math.max(1, Math.round(h * sc));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        try { cb(c.toDataURL('image/jpeg', Q)); }
        catch (e) { cb(fr.result); }
      };
      im.onerror = function () { alert('Не удалось прочитать этот файл. Попробуйте другое фото.'); };
      im.src = fr.result;
    };
    fr.onerror = function () { alert('Не удалось открыть файл.'); };
    fr.readAsDataURL(file);
  }

  /* ---------- выбор фото для карточки ---------- */
  function pick(fig) {
    var k = fig.getAttribute('data-photo');
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      compress(f, function (url) {
        var d = load();
        d[k] = url;
        if (save(d)) apply();
      });
    };
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 60000);
  }

  /* ---------- кнопки 📷 / 🗑 на каждой карточке ---------- */
  function build() {
    addStyle();
    var figs = document.querySelectorAll('.ph[data-photo]');
    for (var i = 0; i < figs.length; i++) {
      (function (fig) {
        if (fig.querySelector('.ph-edit')) return;
        var box = document.createElement('div');
        box.className = 'ph-edit';

        var b1 = document.createElement('button');
        b1.type = 'button';
        b1.title = 'Поставить своё фото';
        b1.setAttribute('aria-label', 'Поставить своё фото');
        b1.textContent = '📷';
        b1.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation(); pick(fig);
        });

        var b2 = document.createElement('button');
        b2.type = 'button';
        b2.className = 'del';
        b2.title = 'Убрать фото';
        b2.setAttribute('aria-label', 'Убрать фото');
        b2.textContent = '🗑';
        b2.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var d = load();
          delete d[fig.getAttribute('data-photo')];
          save(d);
          var img = fig.querySelector('img');
          var orig = fig.getAttribute('data-src');
          if (img && orig) img.src = orig;
          fig.classList.remove('has-photo');
          apply();
        });

        box.appendChild(b1);
        box.appendChild(b2);
        fig.appendChild(box);
      })(figs[i]);
    }
    apply();
  }

  /* ---------- экспорт / импорт всех фото ---------- */
  function exportJSON() {
    var d = load();
    var n = 0, k;
    for (k in d) { if (d.hasOwnProperty(k)) n++; }
    if (!n) { alert('Пока не добавлено ни одного фото.'); return; }
    var blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'photos.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 2000);
  }

  function importJSON() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.style.display = 'none';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var o = JSON.parse(fr.result);
          if (o && typeof o === 'object' && save(o)) apply();
          else alert('Файл не подошёл.');
        } catch (e) { alert('Файл не подошёл.'); }
      };
      fr.readAsText(f);
    };
    document.body.appendChild(inp);
    inp.click();
  }

  /* ---------- запуск ---------- */
  function init() {
    build();
    var ex = document.querySelectorAll('[data-photo-export]');
    for (var i = 0; i < ex.length; i++) ex[i].addEventListener('click', exportJSON);
    var im = document.querySelectorAll('[data-photo-import]');
    for (var j = 0; j < im.length; j++) im[j].addEventListener('click', importJSON);
    var all = document.querySelectorAll('[data-photo-all]');
    for (var m = 0; m < all.length; m++) {
      all[m].addEventListener('click', function () {
        var first = document.querySelector('.ph[data-photo]:not(.has-photo)') || document.querySelector('.ph[data-photo]');
        if (first) pick(first);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* доступно из консоли */
  window.ACSITE_GALLERY = { apply: apply, load: load, save: save };
})();
