const UI_VERSION = "2026-01-12-a";
const $ = (id) => document.getElementById(id);

function setChip(id, text){ $(id).textContent = text; }
function sanitizeHost(v){
  if (!v) return "";
  v = v.trim();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(/\/$/,"");
  return v;
}
function urlFor(host, path){
  const h = sanitizeHost(host);
  return `http://${h}${path}`;
}
function nowIso(){ try { return new Date().toISOString(); } catch { return ""; } }

function classifyError(err){
  const msg = String(err?.message || err || "");
  const hints = [];
  hints.push("Запрос не выполнился на уровне fetch.");
  hints.push(`Ошибка: ${msg}`);
  hints.push("Проверка 1: открой http://HOST/ в обычном Chrome.");
  hints.push("Проверка 2: открой http://HOST/json/info в обычном Chrome.");
  hints.push("Если Chrome показал разовый запрос разрешения, разреши и повтори.");
  hints.push("Точные причины зависят от версии Chrome и Android.");
  return hints.join("\n");
}

async function fetchJson(url, opts = {}){
  const started = performance.now();
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: Object.assign({ "Accept": "application/json" }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    mode: "cors",
  });
  const ms = Math.round(performance.now() - started);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return {
    ok: res.ok,
    status: res.status,
    ms,
    headers: {
      "content-type": res.headers.get("content-type") || "",
      "content-length": res.headers.get("content-length") || "",
    },
    text,
    json,
  };
}

function setLastUrl(url){ setChip("chipLastUrl", `Last URL: ${url}`); }
function setDiag(human, raw){
  $("humanDiag").textContent = human || "-";
  $("rawDiag").textContent = raw || "-";
}
function setCacheOut(text){ $("cacheOut").textContent = text || "-"; }

function saveHost(host){ try { localStorage.setItem("wled_host", host); } catch {} }
function loadHost(){ try { return localStorage.getItem("wled_host") || ""; } catch { return ""; } }

let toggleState = false;

async function doGetInfo(){
  const host = sanitizeHost($("hostInput").value);
  if (!host) { setDiag("Введи host.", ""); return; }
  saveHost(host);

  const url = urlFor(host, "/json/info");
  setLastUrl(url);
  setDiag("Выполняю запрос...", "");
  try{
    const out = await fetchJson(url);
    setChip("chipResult", `RESULT: HTTP ${out.status} (${out.ms}ms)`);
    if (out.ok && out.json){
      setDiag("Ответ получен.", JSON.stringify(out, null, 2));
    } else {
      setDiag("Сервер ответил, но JSON не распарсился или статус не OK.", JSON.stringify(out, null, 2));
    }
  } catch(err){
    setChip("chipResult", "RESULT: error");
    setDiag(classifyError(err), JSON.stringify({ time: nowIso(), error: String(err), stack: err?.stack || "" }, null, 2));
  }
}

async function doToggle(){
  const host = sanitizeHost($("hostInput").value);
  if (!host) { setDiag("Введи host.", ""); return; }
  saveHost(host);

  toggleState = !toggleState;
  const url = urlFor(host, "/json/state");
  setLastUrl(url);
  setDiag("Отправляю POST /json/state ...", "");
  try{
    const out = await fetchJson(url, { method: "POST", body: { on: toggleState } });
    setChip("chipResult", `RESULT: HTTP ${out.status} (${out.ms}ms)`);
    if (out.ok){
      setDiag(`Ответ получен. Команда on=${toggleState} отправлена.`, JSON.stringify(out, null, 2));
    } else {
      setDiag("Сервер ответил, но статус не OK.", JSON.stringify(out, null, 2));
    }
  } catch(err){
    setChip("chipResult", "RESULT: error");
    setDiag(classifyError(err), JSON.stringify({ time: nowIso(), error: String(err), stack: err?.stack || "" }, null, 2));
  }
}

async function doCacheTest(){
  const url = "./cache-test.txt?ts=" + Date.now();
  try{
    const res = await fetch(url, { cache: "reload" });
    const text = await res.text();
    setCacheOut(`status=${res.status} ok=${res.ok}\n` + text);
  } catch(err){
    setCacheOut(JSON.stringify({ error: String(err), stack: err?.stack || "" }, null, 2));
  }
}

async function forceUpdateAndReload(){
  try{
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs){
      try { await r.update(); } catch {}
      try { await r.unregister(); } catch {}
    }
    if (window.caches){
      const keys = await caches.keys();
      for (const k of keys){
        if (k.startsWith("seazencity-")){
          try { await caches.delete(k); } catch {}
        }
      }
    }
  } catch {}
  location.reload();
}

function openUrl(url){ window.location.href = url; }

function openWifiSettings(){
  const intent = "intent:#Intent;action=android.settings.WIFI_SETTINGS;end";
  try { window.location.href = intent; } catch {}
}

function initMeta(){
  setChip("chipOrigin", "Origin: " + location.origin);
  setChip("chipProto", "Protocol: " + location.protocol);
  $("uiVer").textContent = UI_VERSION;
  setChip("chipSW", "SW: " + (("serviceWorker" in navigator) ? "supported" : "no"));
}

async function initSW(){
  if (!("serviceWorker" in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    const st = reg.active ? "active" : (reg.waiting ? "waiting" : (reg.installing ? "installing" : "registered"));
    setChip("chipSW", "SW: " + st);
  } catch {
    setChip("chipSW", "SW: error");
  }
}

function wire(){
  $("btnOpenWifi").addEventListener("click", () => openWifiSettings());
  $("btnOpenAp").addEventListener("click", () => openUrl("http://4.3.2.1/"));
  $("btnOpenApWifiSetup").addEventListener("click", () => openUrl("http://4.3.2.1/settings/wifi"));
  $("btnIConnected").addEventListener("click", () => {
    $("hostInput").value = "seazencity.local";
    saveHost("seazencity.local");
    setDiag("Ок. Теперь подключись обратно к своему Wi‑Fi и нажми GET /json/info.", "");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });

  $("btnTryMdns").addEventListener("click", () => { $("hostInput").value = "seazencity.local"; saveHost("seazencity.local"); });

  $("btnOpenHost").addEventListener("click", () => {
    const host = sanitizeHost($("hostInput").value || "seazencity.local");
    openUrl(`http://${host}/`);
  });

  $("btnGetInfo").addEventListener("click", doGetInfo);
  $("btnToggle").addEventListener("click", doToggle);
  $("btnCacheTest").addEventListener("click", doCacheTest);
  $("btnForceUpdate").addEventListener("click", forceUpdateAndReload);

  $("hostInput").value = loadHost() || "seazencity.local";
}

(function main(){
  initMeta();
  wire();
  initSW();
})();
