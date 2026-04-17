(function(){
  var KEY = 'tcr_lang_pref';
  var path = window.location.pathname;
  var isEn = path.indexOf('/en/') === 0;
  var current = isEn ? 'en' : 'es';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('#tcr-lang-switcher .tcr-lang-btn'));

  function setActive(lang){
    buttons.forEach(function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });
  }

  function toEn(p){
    if (p.indexOf('/en/') === 0) return p;
    if (p === '/') return '/en/';
    return '/en' + (p.endsWith('/') ? p : p + '/');
  }

  function toEs(p){
    if (p.indexOf('/en/') !== 0) return p;
    var out = '/' + p.slice(4);
    return out === '//' ? '/' : out;
  }

  function target(lang){
    var q = window.location.search || '';
    var h = window.location.hash || '';
    var p = lang === 'en' ? toEn(path) : toEs(path);
    return p + q + h;
  }

  function go(lang){
    localStorage.setItem(KEY, lang);
    setActive(lang);
    var t = target(lang);
    var now = window.location.pathname + window.location.search + window.location.hash;
    if (t !== now) {
      window.location.href = t;
    }
  }

  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      go(btn.getAttribute('data-lang'));
    });
  });

  var pref = localStorage.getItem(KEY);
  setActive(current);

  if (pref && pref !== current) {
    window.location.replace(target(pref));
    return;
  }

  localStorage.setItem(KEY, current);
})();
