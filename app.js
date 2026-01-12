(() => {
  'use strict';

  const AP_BASE = 'http://4.3.2.1';
  const MDNS_HOST = 'seazencity.local'; // WLED mDNS name from your setup
  const LS_KEY_HOST = 'seazencity_host';

  const $ = (id) => document.getElementById(id);

  const state = {
    lastUrl: '-',
    host: localStorage.getItem(LS_KEY_HOST) || '', // will become either mdns or ip
  };

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text);
  }

  function now() {
    return new Date().toISOString().replace('T',' ').replace('Z','');
  }

  function log(line) {
    const el = $('diag');
    const prev = el.textContent === '-' ? '' : el.textContent + '\n';
    el.textContent = prev + `[${now()}] ${line}`;
  }

  function setResult(label) {
    setText('result', label);
  }

  function setLast(url) {
    state.lastUrl = url;
    setText('lastUrl', url);
  }

  function showIpBlock(show) {
    $('ipBlock').style.display = show ? '' : 'none';
  }

  function normalizeHost(input) {
    const s = (input || '').trim();
    if (!s) return '';
    return s.replace(/^https?:\/\//i, '').replace(/\/+$/,'');
  }

  function isLikelyIPv4(s) {
    const m = String(s || '').match(/\b(\d{1,3}\.){3}\d{1,3}\b/);
    if (!m) return false;
    return m[0].split('.').every(x => {
      const n = Number(x);
      return Number.isFinite(n) && n >= 0 && n <= 255;
    });
  }

  function pickAnyIp(obj) {
    // Heuristic: scan values for IPv4 strings and prefer private ranges.
    // If nothing found - return ''.
    const ips = [];
    const walk = (v) => {
      if (!v) return;
      if (typeof v === 'string') {
        const m = v.match(/\b(\d{1,3}\.){3}\d{1,3}\b/);
        if (m && isLikelyIPv4(m[0])) ips.push(m[0]);
        return;
      }
      if (typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(walk); return; }
      for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(obj);

    const uniq = Array.from(new Set(ips));
    const score = (ip) => {
      if (ip.startsWith('10.')) return 4;
      if (ip.startsWith('192.168.')) return 3;
      if (ip.startsWith('172.')) return 2;
      if (ip === '4.3.2.1' || ip === '192.168.4.1') return 0; // AP IP, not STA
      return 1;
    };
    uniq.sort((a,b) => score(b)-score(a));
    return uniq[0] || '';
  }

  async function fetchJson(url, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 5000;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

    try {
      setLast(url);
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });

      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}

      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        text,
        json,
        headers: {
          'content-type': res.headers.get('content-type') || '',
          'content-length': res.headers.get('content-length') || '',
        },
      };
    } finally {
      clearTimeout(t);
    }
  }

  async function checkAp() {
    setResult('checking AP...');
    log(`AP check -> ${AP_BASE}/json/info`);
    try {
      const r = await fetchJson(`${AP_BASE}/json/info`, { timeoutMs: 4500 });
      setResult(`HTTP ${r.status}`);
      log(`AP ответ: status=${r.status} ok=${r.ok} ct=${r.headers['content-type']}`);
      if (r.ok) {
        setText('headline', 'Лампа в режиме настройки (AP)');
        setText('subline', 'Открой Wi‑Fi настройки лампы, введи сеть и пароль, нажми Save & Connect. Затем вернись в это приложение.');
        showIpBlock(false);
      } else {
        setText('headline', 'Лампа не отвечает в AP');
        setText('subline', 'Проверь, что телефон подключён к Wi‑Fi лампы (seazencity), затем нажми «Проверить доступность» снова.');
        showIpBlock(false);
      }
      return r;
    } catch (e) {
      setResult(`ERROR`);
      setText('headline', 'Лампа недоступна');
      setText('subline', 'Проверь, что телефон подключён к Wi‑Fi лампы (seazencity). Затем нажми «Проверить доступность».');
      log(`AP ошибка: ${String(e && e.message ? e.message : e)}`);
      showIpBlock(false);
      return null;
    }
  }

  async function tryMdns() {
    setResult('checking mDNS...');
    const url = `http://${MDNS_HOST}/json/info`;
    log(`mDNS check -> ${url}`);
    try {
      const r = await fetchJson(url, { timeoutMs: 4500 });
      setResult(`HTTP ${r.status}`);
      if (r.ok) {
        state.host = MDNS_HOST;
        localStorage.setItem(LS_KEY_HOST, state.host);
        setText('headline', 'Лампа найдена в Wi‑Fi');
        setText('subline', `Адрес: ${MDNS_HOST}. Можно управлять.`);
        showIpBlock(false);
        log('mDNS OK. Управление доступно.');
      } else {
        setText('headline', 'Лампа не найдена по имени');
        setText('subline', 'Если лампа уже подключилась к Wi‑Fi, можно попробовать получить её адрес из AP или ввести IP.');
        showIpBlock(true);
        log(`mDNS ответ: status=${r.status} ok=${r.ok}`);
      }
      return r;
    } catch (e) {
      setResult('ERROR');
      setText('headline', 'Не получилось найти лампу по имени');
      setText('subline', 'Это бывает, если mDNS не работает в сети. Тогда используем IP.');
      showIpBlock(true);
      log(`mDNS ошибка: ${String(e && e.message ? e.message : e)}`);
      return null;
    }
  }

  async function tryAutoIpFromAp() {
    $('ipHint').textContent = 'Пробую получить IP из лампы (в режиме AP)...';
    const r = await checkAp();
    if (!r || !r.ok || !r.json) {
      $('ipHint').textContent = 'AP недоступен или не вернул JSON.';
      return;
    }
    const ip = pickAnyIp(r.json);
    if (!ip) {
      $('ipHint').textContent = 'IP в ответе не найден. Введи IP вручную.';
      return;
    }
    $('ipInput').value = ip;
    $('ipHint').textContent = `Нашёл IP: ${ip}. Нажми «Продолжить по IP».`;
  }

  function currentHostBase() {
    const h = normalizeHost(state.host || $('ipInput').value || '');
    return h ? `http://${h}` : '';
  }

  async function wledGet(path) {
    const base = currentHostBase();
    if (!base) throw new Error('host_missing');
    const url = `${base}${path}`;
    log(`GET ${url}`);
    const r = await fetchJson(url, { timeoutMs: 4500 });
    log(`-> ${r.status} ok=${r.ok}`);
    return r;
  }

  async function wledPostState(body) {
    const base = currentHostBase();
    if (!base) throw new Error('host_missing');
    const url = `${base}/json/state`;
    log(`POST ${url} body=${JSON.stringify(body)}`);
    const r = await fetchJson(url, { method: 'POST', body, timeoutMs: 4500 });
    log(`-> ${r.status} ok=${r.ok} resp=${r.text.slice(0,120)}`);
    return r;
  }

  function setHostFromInput() {
    const ip = normalizeHost($('ipInput').value);
    if (!ip) {
      $('ipHint').textContent = 'Поле IP пустое.';
      return false;
    }
    state.host = ip;
    localStorage.setItem(LS_KEY_HOST, state.host);
    $('ipHint').textContent = `Использую: ${ip}`;
    return true;
  }

  function wireUi() {
    $('btnCheck').addEventListener('click', () => checkAp());

    // Link opens WLED page (top-level navigation) - no fetch.
    $('btnOpenWifi').addEventListener('click', () => {
      log('Открываю страницу Wi‑Fi настроек лампы (AP).');
    });

    $('btnFind').addEventListener('click', () => tryMdns());

    $('btnAutoIp').addEventListener('click', () => tryAutoIpFromAp());

    $('btnUseIp').addEventListener('click', async () => {
      if (!setHostFromInput()) return;
      setResult('checking IP...');
      try {
        const r = await wledGet('/json/info');
        setResult(`HTTP ${r.status}`);
        if (r.ok) {
          setText('headline', 'Лампа найдена по IP');
          setText('subline', `Адрес: ${state.host}. Можно управлять.`);
          showIpBlock(false);
        } else {
          $('ipHint').textContent = `Ответ ${r.status}.`;
        }
      } catch (e) {
        setResult('ERROR');
        $('ipHint').textContent = `Ошибка: ${String(e && e.message ? e.message : e)}`;
      }
    });

    $('btnOn').addEventListener('click', async () => {
      try { await wledPostState({ on: true }); } catch (e) { log(`CTRL ошибка: ${e}`); }
    });
    $('btnOff').addEventListener('click', async () => {
      try { await wledPostState({ on: false }); } catch (e) { log(`CTRL ошибка: ${e}`); }
    });
    $('btnToggle').addEventListener('click', async () => {
      try { await wledPostState({ on: 't' }); } catch (e) { log(`CTRL ошибка: ${e}`); }
    });
    $('btnBri').addEventListener('click', async () => {
      const v = Number($('bri').value);
      const bri = Number.isFinite(v) ? Math.max(0, Math.min(255, v)) : 128;
      try { await wledPostState({ bri }); } catch (e) { log(`CTRL ошибка: ${e}`); }
    });

    window.addEventListener('error', (ev) => {
      log(`JS error: ${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}`);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      log(`Promise rejection: ${String(ev.reason)}`);
    });
  }

  async function init() {
    setText('origin', location.origin);
    setText('proto', location.protocol);
    setText('sw', navigator.serviceWorker?.controller ? 'active' : 'not active');

    setText('headline', 'Загрузка...');
    setText('subline', 'Нажми «Проверить доступность» чтобы начать с AP.');

    // If we already have a host saved (mDNS or IP), show it and try a quick /json/info only on user request.
    if (state.host) {
      log(`Сохранён адрес: ${state.host}`);
      // show only hint; do not auto-fetch to avoid permission prompts without user gesture.
    }

    // Minimal automatic: try to detect AP quickly, but with short timeout and full error display.
    try {
      setResult('auto-check...');
      const r = await fetchJson(`${AP_BASE}/json/info`, { timeoutMs: 1200 });
      if (r.ok) {
        setResult(`HTTP ${r.status}`);
        setText('headline', 'Лампа в режиме настройки (AP)');
        setText('subline', 'Открой Wi‑Fi настройки лампы, введи сеть и пароль, нажми Save & Connect. Затем вернись в это приложение.');
        log('AP доступен (авто-проверка).');
      } else {
        setResult('idle');
      }
    } catch (_) {
      setResult('idle');
    }
  }

  wireUi();
  init();

  // Register service worker (cache only our own files)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      log('SW зарегистрирован.');
    }).catch((e) => {
      log(`SW ошибка: ${String(e && e.message ? e.message : e)}`);
    });
  }
})();
