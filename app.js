(() => {
  const $ = (id) => document.getElementById(id);

  const swStatus = $("swStatus");
  const cacheStatus = $("cacheStatus");
  const netMode = $("netMode");
  const logEl = $("log");
  const wledStatus = $("wledStatus");

  const btnForceUpdate = $("btnForceUpdate");
  const btnSimOffline = $("btnSimOffline");

  const wledHost = $("wledHost");
  const btnPing = $("btnPing");
  const btnOn = $("btnOn");
  const btnOff = $("btnOff");
  const bri = $("bri");
  const preset = $("preset");
  const btnPreset = $("btnPreset");

  const LS_HOST = "seazencity_wled_host";
  const LS_SIMOFF = "seazencity_sim_offline";

  function log(line) {
    const ts = new Date().toLocaleTimeString();
    logEl.textContent = `[${ts}] ${line}\n` + logEl.textContent;
  }

  function setPill(el, text, ok = null) {
    el.textContent = text;
    el.classList.remove("ok", "bad");
    if (ok === true) el.classList.add("ok");
    if (ok === false) el.classList.add("bad");
  }

  function isSimOffline() {
    return localStorage.getItem(LS_SIMOFF) === "1";
  }

  function updateModeUI() {
    const on = isSimOffline();
    btnSimOffline.textContent = `Simulate offline: ${on ? "ON" : "OFF"}`;
    setPill(netMode, `Mode: ${on ? "SIMULATED OFFLINE" : "NORMAL"}`, on ? false : true);
  }

  function normalizeHost(s) {
    s = (s || "").trim();
    if (!s) return "";
    // allow "192.168.x.x" or "wled.local"
    // If user already typed scheme, keep it.
    if (s.startsWith("http://") || s.startsWith("https://")) return s.replace(/\/+$/, "");
    return "http://" + s.replace(/\/+$/, "");
  }

  async function fetchWithTimeout(url, opts = {}, timeoutMs = 2500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = new Headers(opts.headers || {});
      // We use this query flag so SW can force-cache mode without cutting internet.
      // (SW checks ?__offline=1)
      const u = new URL(url);
      if (isSimOffline()) u.searchParams.set("__offline", "1");
      return await fetch(u.toString(), { ...opts, headers, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function wledPostState(obj) {
    const host = normalizeHost(wledHost.value);
    if (!host) {
      setPill(wledStatus, "WLED: host пустой", false);
      return;
    }

    // В simulated-offline мы намеренно "ломаем" WLED запросы, чтобы тест был честный.
    if (isSimOffline()) {
      setPill(wledStatus, "WLED: simulated-offline (запросы отключены)", false);
      log("Simulated-offline: WLED request blocked by app.");
      return;
    }

    const url = `${host}/json/state`;
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(obj),
      }, 3500);

      if (!res.ok) {
        setPill(wledStatus, `WLED: HTTP ${res.status}`, false);
        log(`WLED POST failed: HTTP ${res.status}`);
        return;
      }
      const data = await res.json().catch(() => null);
      setPill(wledStatus, "WLED: OK", true);
      log(`WLED POST OK -> ${JSON.stringify(obj)}`);
      if (data && data.state) log(`state.on=${data.state.on} bri=${data.state.bri} ps=${data.state.ps}`);
    } catch (e) {
      setPill(wledStatus, `WLED: error (${e.name || "?"})`, false);
      log(`WLED POST error: ${String(e)}`);
    }
  }

  async function wledPing() {
    const host = normalizeHost(wledHost.value);
    if (!host) {
      setPill(wledStatus, "WLED: host пустой", false);
      return;
    }
    if (isSimOffline()) {
      setPill(wledStatus, "WLED: simulated-offline (ping отключен)", false);
      log("Simulated-offline: WLED ping blocked by app.");
      return;
    }

    const url = `${host}/json/info`;
    try {
      const res = await fetchWithTimeout(url, { method: "GET" }, 2500);
      if (!res.ok) {
        setPill(wledStatus, `WLED: ping HTTP ${res.status}`, false);
        log(`Ping failed: HTTP ${res.status}`);
        return;
      }
      const info = await res.json().catch(() => null);
      setPill(wledStatus, "WLED: ping OK", true);
      if (info && info.name) log(`Device name: ${info.name}`);
      if (info && info.ver) log(`WLED ver: ${info.ver}`);
    } catch (e) {
      setPill(wledStatus, `WLED: ping error (${e.name || "?"})`, false);
      log(`Ping error: ${String(e)}`);
    }
  }

  async function updateCacheBadge() {
    if (!("caches" in window)) {
      setPill(cacheStatus, "Cache: unsupported", false);
      return;
    }
    try {
      const keys = await caches.keys();
      setPill(cacheStatus, `Cache: ${keys.length} caches`, true);
    } catch {
      setPill(cacheStatus, "Cache: error", false);
    }
  }

  // Service Worker
  async function setupSW() {
    if (!("serviceWorker" in navigator)) {
      setPill(swStatus, "Service Worker: unsupported", false);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      setPill(swStatus, "Service Worker: registered", true);

      // If SW updated, reload on controller change
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        log("SW controller changed -> reload recommended");
      });

      if (reg.waiting) log("SW waiting (new version). Press Force update.");
      await updateCacheBadge();
    } catch (e) {
      setPill(swStatus, "Service Worker: register error", false);
      log(`SW register error: ${String(e)}`);
    }
  }

  btnForceUpdate.addEventListener("click", async () => {
    log("Force update requested.");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          // Tell SW to activate immediately
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
          log("Sent SKIP_WAITING to waiting SW.");
        } else {
          log("No waiting SW detected.");
        }
      } else {
        log("No SW registration found.");
      }
      await updateCacheBadge();
    } catch (e) {
      log(`Force update error: ${String(e)}`);
    }
  });

  btnSimOffline.addEventListener("click", async () => {
    const now = isSimOffline();
    localStorage.setItem(LS_SIMOFF, now ? "0" : "1");
    updateModeUI();
    log(`Simulate offline -> ${!now ? "ON" : "OFF"}`);
  });

  btnPing.addEventListener("click", wledPing);
  btnOn.addEventListener("click", () => wledPostState({ on: true }));
  btnOff.addEventListener("click", () => wledPostState({ on: false }));
  btnPreset.addEventListener("click", () => {
    const id = parseInt((preset.value || "").trim(), 10);
    if (!Number.isFinite(id)) {
      log("Preset ID invalid");
      return;
    }
    wledPostState({ ps: id });
  });

  let briTimer = null;
  bri.addEventListener("input", () => {
    const v = parseInt(bri.value, 10);
    if (briTimer) clearTimeout(briTimer);
    briTimer = setTimeout(() => wledPostState({ bri: v }), 120);
  });

  // Init
  wledHost.value = localStorage.getItem(LS_HOST) || "192.168.4.1";
  wledHost.addEventListener("change", () => localStorage.setItem(LS_HOST, wledHost.value));

  updateModeUI();
  setupSW();
  updateCacheBadge();
  setPill(wledStatus, "WLED: idle", null);
  log("App loaded.");
})();