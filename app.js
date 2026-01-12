// Seazencity PWA controller for WLED (default UI)
// Принятая архитектура (AP -> WiFi Setup -> STA via mDNS -> fallback via AP reading STA IP)
//
// WiFi Setup URL: /settings/wifi (из sitemap WLED Web GUI) citeturn0search5

const CFG = {
  apOrigin: "http://4.3.2.1",
  apWifiSetupUrl: "http://4.3.2.1/settings/wifi",
  mdnsOrigin: "http://seazencity.local",
  infoPath: "/json/info",
  statePath: "/json/state",

  fetchTimeoutMs: 3500,
  mdnsTryTotalMs: 12000,
  mdnsTryIntervalMs: 1200,
  apPollTotalMs: 30000,
  apPollIntervalMs: 1200,
  shortFailMessageMs: 1700,
};

const LS = {
  baseOrigin: "seazencity_base_origin",
  lastOkAt: "seazencity_last_ok_at",
};

const UI = {
  title: document.getElementById("title"),
  text: document.getElementById("text"),
  meta: document.getElementById("meta"),
  actions: document.getElementById("actions"),
  control: document.getElementById("control"),
  btnToggle: document.getElementById("btnToggle"),
  btnRefresh: document.getElementById("btnRefresh"),
  ctlStatus: document.getElementById("ctlStatus"),
  debug: document.getElementById("debug"),
};

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function log(msg) {
  const line = `[${stamp()}] ${msg}`;
  const cur = UI.debug.textContent || "";
  UI.debug.textContent = line + "\n" + cur;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMetaChips(items) {
  if (!items || items.length === 0) {
    UI.meta.innerHTML = "";
    return;
  }
  const chips = items.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
  UI.meta.innerHTML = `<div class="chips">${chips}</div>`;
}

function setActions(actions) {
  UI.actions.innerHTML = "";
  for (const a of actions) {
    const el = a.href ? document.createElement("a") : document.createElement("button");
    el.className = "btn" + (a.primary ? " primary" : "");
    el.textContent = a.label;

    if (a.href) {
      el.href = a.href;
      el.rel = "noopener";
      el.target = "_self";
    } else {
      el.onclick = a.onClick;
      if (a.disabled) el.disabled = true;
    }

    UI.actions.appendChild(el);
  }
}

function setScreen({ title, text, chips = [], actions = [], showControl = false }) {
  UI.title.textContent = title;
  UI.text.textContent = text;
  setMetaChips(chips);
  setActions(actions);
  UI.control.style.display = showControl ? "block" : "none";
}

function saveBaseOrigin(origin) {
  localStorage.setItem(LS.baseOrigin, origin);
  localStorage.setItem(LS.lastOkAt, String(Date.now()));
}

function loadBaseOrigin() {
  return localStorage.getItem(LS.baseOrigin) || "";
}

function wifiSettingsIntent() {
  try {
    window.location.href = "intent:#Intent;action=android.settings.WIFI_SETTINGS;end";
  } catch {
    log("Не удалось открыть настройки Wi-Fi через intent.");
  }
}

function openSameTab(url) {
  window.location.href = url;
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = CFG.fetchTimeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function getJson(origin, path, timeoutMs = CFG.fetchTimeoutMs) {
  const url = origin + path;
  const res = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.json();
}

async function postJson(origin, path, bodyObj, timeoutMs = CFG.fetchTimeoutMs) {
  const url = origin + path;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    },
    timeoutMs
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.json();
}

async function tryReadState(origin) {
  return await getJson(origin, CFG.statePath, 3000);
}

async function tryToggle(origin, on) {
  return await postJson(origin, CFG.statePath, { on }, 3500);
}

async function tryMdnsUntilOk() {
  const start = Date.now();
  while (Date.now() - start < CFG.mdnsTryTotalMs) {
    try {
      log("Пробуем продолжить автоматически (mDNS)…");
      const info = await getJson(CFG.mdnsOrigin, CFG.infoPath, 3000);
      log(`mDNS OK. info.ip="${(info && info.ip) ? info.ip : ""}"`);
      saveBaseOrigin(CFG.mdnsOrigin);
      return true;
    } catch (e) {
      log(`mDNS нет: ${String(e.message || e)}`);
      await new Promise((r) => setTimeout(r, CFG.mdnsTryIntervalMs));
    }
  }
  return false;
}

async function readStaIpFromApPoll() {
  const start = Date.now();
  while (Date.now() - start < CFG.apPollTotalMs) {
    try {
      const info = await getJson(CFG.apOrigin, CFG.infoPath, 2500);
      const ip = (info && typeof info.ip === "string") ? info.ip.trim() : "";
      log(`AP /json/info ip="${ip}"`);
      if (ip) return ip;
    } catch (e) {
      log(`AP /json/info недоступен: ${String(e.message || e)}`);
    }
    await new Promise((r) => setTimeout(r, CFG.apPollIntervalMs));
  }
  return "";
}

async function screenStart() {
  setScreen({
    title: "Подключение лампы",
    text: "Чтобы начать, подключитесь к сети seazencity.",
    chips: ["Сеть: seazencity", "Пароль: не требуется"],
    actions: [
      { label: "Открыть настройки Wi-Fi", onClick: wifiSettingsIntent },
      { label: "Я подключился", primary: true, onClick: screenOpenWifiSetup },
    ],
  });
}

async function screenOpenWifiSetup() {
  setScreen({
    title: "Настройка подключения",
    text: "Откроем настройку подключения.",
    actions: [
      { label: "Продолжить", primary: true, onClick: () => openSameTab(CFG.apWifiSetupUrl) },
      { label: "Назад", onClick: screenReturnHome },
    ],
  });
}

async function screenReturnHome() {
  setScreen({
    title: "Подключаемся",
    text: "Переключитесь обратно на свою сеть Wi-Fi и вернитесь в приложение.",
    actions: [
      { label: "Открыть настройки Wi-Fi", onClick: wifiSettingsIntent },
      { label: "Я вернулся", primary: true, onClick: screenDiscover },
    ],
  });
}

async function screenDiscover() {
  setScreen({
    title: "Подключаемся",
    text: "Продолжаем автоматически.",
    actions: [],
  });

  const saved = loadBaseOrigin();
  if (saved) {
    try {
      log(`Пробуем сохранённый адрес: ${saved}`);
      const st = await tryReadState(saved);
      log(`Сохранённый адрес OK. on=${!!st.on}`);
      return screenControl(saved);
    } catch (e) {
      log(`Сохранённый адрес не отвечает: ${String(e.message || e)}`);
    }
  }

  const ok = await tryMdnsUntilOk();
  if (ok) return screenControl(CFG.mdnsOrigin);

  return screenNeedApFallback();
}

async function screenNeedApFallback() {
  setScreen({
    title: "Продолжим",
    text: "Подключитесь к сети seazencity и нажмите Продолжить.",
    chips: ["Сеть: seazencity", "Пароль: не требуется"],
    actions: [
      { label: "Открыть настройки Wi-Fi", onClick: wifiSettingsIntent },
      { label: "Продолжить", primary: true, onClick: screenReadIpFromAp },
    ],
  });
}

async function screenReadIpFromAp() {
  setScreen({
    title: "Подключаемся",
    text: "Продолжаем автоматически.",
    actions: [],
  });

  const ip = await readStaIpFromApPoll();

  if (!ip) {
    setScreen({
      title: "Подключаемся",
      text: "Проверьте сеть и пароль и попробуйте ещё раз.",
      actions: [],
    });
    log("STA IP не появился. Открываем WiFi Setup снова.");
    setTimeout(() => openSameTab(CFG.apWifiSetupUrl), CFG.shortFailMessageMs);
    return;
  }

  const ipOrigin = `http://${ip}`;
  log(`Получили STA IP из AP: ${ipOrigin}`);
  saveBaseOrigin(ipOrigin);

  setScreen({
    title: "Подключаемся",
    text: "Переключитесь обратно на свою сеть Wi-Fi и вернитесь в приложение.",
    actions: [
      { label: "Открыть настройки Wi-Fi", onClick: wifiSettingsIntent },
      { label: "Я вернулся", primary: true, onClick: () => screenControl(ipOrigin) },
    ],
  });
}

async function screenControl(origin) {
  setScreen({
    title: "Лампа готова",
    text: "Управление доступно.",
    actions: [],
    showControl: true,
  });

  UI.btnRefresh.onclick = async () => refreshControl(origin);
  UI.btnToggle.onclick = async () => toggleControl(origin);

  await refreshControl(origin);
}

async function refreshControl(origin) {
  UI.ctlStatus.textContent = "обновление…";
  try {
    const st = await tryReadState(origin);
    const on = !!st.on;
    UI.btnToggle.textContent = on ? "Выключить" : "Включить";
    UI.ctlStatus.textContent = on ? "включено" : "выключено";
    localStorage.setItem(LS.lastOkAt, String(Date.now()));
    log(`STATE OK (${origin}) on=${on}`);
  } catch (e) {
    UI.ctlStatus.textContent = "нет связи";
    log(`STATE fail (${origin}): ${String(e.message || e)}`);
    setTimeout(() => screenDiscover(), 600);
  }
}

async function toggleControl(origin) {
  UI.ctlStatus.textContent = "отправка…";
  try {
    const cur = await tryReadState(origin);
    const next = !cur.on;
    const st = await tryToggle(origin, next);
    const on = !!st.on;
    UI.btnToggle.textContent = on ? "Выключить" : "Включить";
    UI.ctlStatus.textContent = on ? "включено" : "выключено";
    localStorage.setItem(LS.lastOkAt, String(Date.now()));
    log(`TOGGLE OK (${origin}) on=${on}`);
  } catch (e) {
    UI.ctlStatus.textContent = "не удалось";
    log(`TOGGLE fail (${origin}): ${String(e.message || e)}`);
  }
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    log("Service Worker: OK");
  } catch (e) {
    log(`Service Worker: fail ${String(e.message || e)}`);
  }
}

window.addEventListener("load", async () => {
  UI.debug.textContent = "";
  await registerSW();
  await screenStart();
});
