// fernseher-karte v1.0.1
// Einzeln installierbares Modul (Home Assistant Marketplace / HACS, Kategorie Dashboard).
window.customCards = window.customCards || [];
window.customCardFeatures = window.customCardFeatures || [];
// Eigener Block: Namen bleiben lokal, auch wenn mehrere Karten zusammen geladen werden.
{
// ---------------------------------------------------------------------------
// Radio-Auswahl (Baustein fuer Karten, keine eigene Karte): Lieblingssender als Tasten und optional Suche
// in den Sendern von Radio Browser (HA-Integration), standardmaessig Oesterreich (laender: [AT, DE, ...]).
//   In einer Karte: <radio-wahl> einfuegen, dann el.hass = hass; el.einstellen(config, (sender) => starten, aktiverName)

const RADIO_CACHE = {};
const radioNorm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

class RadioWahl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        button { font: inherit; cursor: pointer; border: none; background: none; color: var(--primary-text-color); }
        .sender { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; margin-top: 14px; }
        .sender:empty { display: none; }
        .q { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 12px;
          background: var(--secondary-background-color, rgba(127,127,127,.12)); border: 2px solid transparent; font-size: 13px; line-height: 1.2; text-align: center; }
        .q ha-icon { --mdc-icon-size: 26px; color: var(--state-icon-color, #44739e); }
        .q.aktiv { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
        .q.aktiv ha-icon { color: var(--primary-color); }
        .suche { margin-top: 10px; display: none; }
        .suche.an { display: block; }
        .feld { display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--divider-color, #555);
          background: var(--card-background-color, #1c1c1c); }
        .feld ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
        .feld input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 9px 0; border: none; outline: none; background: none; color: var(--primary-text-color); }
        .liste { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; max-height: 300px; overflow-y: auto; }
        .liste:empty { display: none; }
        .t { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; text-align: left; font-size: 14px;
          background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
        .t:hover { background: color-mix(in srgb, var(--primary-color) 15%, transparent); }
        .t img, .t .ph { width: 28px; height: 28px; border-radius: 6px; object-fit: contain; flex: none; background: var(--secondary-background-color); }
        .t .ph { display: flex; align-items: center; justify-content: center; }
        .t .ph ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
        .t span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .info { font-size: 13px; color: var(--secondary-text-color); padding: 6px 8px; }
      </style>
      <div class="sender"></div>
      <div class="suche"><div class="feld"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" placeholder="Radiosender suchen …"></div><div class="liste"></div></div>`;
    const ein = this.shadowRoot.querySelector("input");
    ein.addEventListener("input", () => { clearTimeout(this._takt); this._takt = setTimeout(() => this._suche(ein.value), 250); });
    ein.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ein.value = ""; this._suche(""); } });
  }

  set hass(h) { this._hass = h; }

  einstellen(cfg, starte, aktiv) {
    this._starte = starte;
    const k = JSON.stringify([cfg.sender, cfg.suche, cfg.laender]);
    if (k !== this._k) {
      this._k = k; this._cfg = cfg;
      const box = this.shadowRoot.querySelector(".sender");
      box.innerHTML = "";
      for (const x of (cfg.sender || []).filter((s) => s && s.id)) {
        const b = document.createElement("button");
        b.className = "q"; b.dataset.n = x.name;
        b.innerHTML = `<ha-icon icon="${x.icon || "mdi:radio"}"></ha-icon><span></span>`;
        b.querySelector("span").textContent = x.name;
        b.addEventListener("click", () => this._starte && this._starte(x));
        box.appendChild(b);
      }
      this.shadowRoot.querySelector(".suche").classList.toggle("an", !!cfg.suche);
    }
    this.shadowRoot.querySelectorAll(".q").forEach((b) => b.classList.toggle("aktiv", !!aktiv && b.dataset.n === aktiv));
  }

  async _laden() {
    const alle = [];
    for (const l of (this._cfg.laender || ["AT"])) {
      if (!RADIO_CACHE[l]) RADIO_CACHE[l] = this._hass.callWS({ type: "media_source/browse_media", media_content_id: `media-source://radio_browser/country/${l}` })
        .then((r) => (r.children || []).filter((x) => x.can_play)).catch(() => { delete RADIO_CACHE[l]; return []; });
      alle.push(...(await RADIO_CACHE[l]));
    }
    return alle;
  }

  async _suche(text) {
    this._text = text;
    const liste = this.shadowRoot.querySelector(".liste");
    if (text.trim().length < 2) { liste.innerHTML = ""; return; }
    liste.innerHTML = `<div class="info">Suche …</div>`;
    const alle = await this._laden();
    if (this._text !== text) return;
    const woerter = radioNorm(text).split(/\s+/).filter(Boolean);
    const gesehen = new Set();
    const treffer = alle.filter((x) => {
      const n = radioNorm(x.title);
      if (!woerter.every((w) => n.includes(w)) || gesehen.has(n)) return false;
      gesehen.add(n); return true;
    }).slice(0, 12);
    liste.innerHTML = treffer.length ? "" : `<div class="info">Kein Sender gefunden.</div>`;
    for (const x of treffer) {
      const b = document.createElement("button");
      b.className = "t";
      const bild = /^https?:\/\//.test(x.thumbnail || "") ? x.thumbnail : "";
      b.innerHTML = (bild ? `<img loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"><ha-icon icon="mdi:radio"></ha-icon></div>`) + `<span></span>`;
      if (bild) { const img = b.querySelector("img"); img.src = bild; img.onerror = () => (img.style.visibility = "hidden"); }
      b.querySelector("span").textContent = x.title;
      b.addEventListener("click", () => {
        if (this._starte) this._starte({ name: x.title, id: x.media_content_id, typ: x.media_content_type });
        this.shadowRoot.querySelector("input").value = ""; this._suche("");
      });
      liste.appendChild(b);
    }
  }
}
if (!customElements.get("radio-wahl")) customElements.define("radio-wahl", RadioWahl);

// ---------------------------------------------------------------------------
// Fernseher-Karte: Google TV / Android TV in einer Karte (Ein/Aus, laufende App, Titel mit Cover,
// App-Tasten, aufklappbare Fernbedienung mit Steuerkreuz und Lautstaerke).
//
//   type: custom:fernseher-karte
//   entity: media_player.google_tv_sofa        # Android-TV-Remote (Ein/Aus, Apps starten)
//   remote: remote.google_tv_sofa              # optional, fuer Tasten und laufende App
//   cast: media_player.wohnraum                # optional, Chromecast fuer Titel/Cover/Play
//   name: Fernseher                            # optional
//   apps:                                      # optional, Tasten: app = Link (bevorzugt) oder Paketname,
//     - { name: Prime Video, app: "https://app.primevideo.com", paket: com.amazon.amazonvideo.livingroom, icon: mdi:filmstrip }
//                                              # paket: optional, um die laufende App zu markieren
//   fernbedienung: true                        # optional, Fernbedienung zum Aufklappen
//   lautstaerke: media_player.pioneer_av_receiver   # optional, Lautstaerke-Tasten steuern dieses Geraet direkt
//   tv: media_player.lg_webos_tv_uj675v        # optional, Bildschirm: Ein/Aus und Eingaenge laufen dann ueber ihn
//   wecken: media_player.google_tv_sofa        # optional, Geraet, das den Bildschirm per HDMI-CEC aufweckt;
//                                              # ohne tv: Geraet, das den nicht erreichbaren Stick einschaltet (z.B. Receiver)
//   einschalten: script.lg_tv_einschalten      # optional, Skript, das den Bildschirm direkt einschaltet (z.B. Wake-on-LAN), wird zuerst versucht
//   webos: media_player.lg_webos_tv_uj675v     # optional, Fernbedienungstasten an einen LG webOS (statt remote)
//   sender: [{ name: FM4, id: "media-source://radio_browser/..." }]   # optional, Radiosender (ueber cast)
//   suche: true                                # optional, Sendersuche (Radio Browser, laender: [AT])
//   receiver_quelle: Strm-box                  # optional, Eingang am Receiver (lautstaerke) fuer das Radio
//   eingaenge:                                 # optional, Eingangs-Tasten am Bildschirm
//     - { quelle: HDMI-4, name: Google TV, icon: mdi:google }
//     - { quelle: HDMI-1, name: Sat, geraet: media_player.vu_uno_4k }   # geraet: wird beim Umschalten mit eingeschaltet

const TYPE17 = "fernseher-karte";
const TV_APPS = {
  "com.amazon.amazonvideo.livingroom": "Prime Video", "com.google.android.youtube.tv": "YouTube", "com.netflix.ninja": "Netflix",
  "com.disney.disneyplus": "Disney+", "com.nousguide.android.orftvthek": "ORF ON", "com.spotify.tv.android": "Spotify",
  "com.google.android.apps.tv.launcherx": "Startseite", "com.google.android.tvlauncher": "Startseite",
};

class FernseherKarte extends HTMLElement {
  setConfig(c) {
    if (!c?.entity) throw new Error("entity (media_player.*) fehlt");
    this._config = { fernbedienung: true, apps: [], ...c };
    this._offen = false;
    this._render();
  }

  set hass(hass) { this._hass = hass; this._update(); }

  _s(id) { return id ? this._hass?.states[id] : null; }
  _dienst(d, s, daten) { return this._hass.callService(d, s, daten); }
  _taste(cmd) {
    const lv = this._config.lautstaerke;
    if (lv && cmd.startsWith("VOLUME_")) {
      const e = { entity_id: lv };
      if (cmd === "VOLUME_UP") return this._dienst("media_player", "volume_up", e);
      if (cmd === "VOLUME_DOWN") return this._dienst("media_player", "volume_down", e);
      return this._dienst("media_player", "volume_mute", { ...e, is_volume_muted: !this._s(lv)?.attributes.is_volume_muted });
    }
    if (this._config.webos) {
      const lg = { DPAD_UP: "UP", DPAD_DOWN: "DOWN", DPAD_LEFT: "LEFT", DPAD_RIGHT: "RIGHT", DPAD_CENTER: "ENTER", BACK: "BACK",
        HOME: "HOME", MENU: "MENU", VOLUME_UP: "VOLUMEUP", VOLUME_DOWN: "VOLUMEDOWN", VOLUME_MUTE: "MUTE" }[cmd];
      if (lg) return this._dienst("webostv", "button", { entity_id: this._config.webos, button: lg });
    }
    if (this._config.remote) this._dienst("remote", "send_command", { entity_id: this._config.remote, command: cmd });
  }

  // App starten: ueber die Fernbedienung (remote.turn_on mit activity) - schaltet bei Bedarf auch ein.
  // Links (https://..., netflix://) sind zuverlaessiger als Paketnamen.
  async _app(app) {
    if (this._config.remote) return this._dienst("remote", "turn_on", { entity_id: this._config.remote, activity: app });
    const e = { entity_id: this._config.entity };
    if (this._s(this._config.entity)?.state === "off") {
      await this._dienst("media_player", "turn_on", e);
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    const typ = /^[a-z][\w.]*$/i.test(app) && app.includes(".") && !app.includes("://") ? "app" : "url";
    await this._dienst("media_player", "play_media", { ...e, media: { media_content_type: typ, media_content_id: app } });
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 14px 16px; box-sizing: border-box; }
        .kopf { display: flex; align-items: center; gap: 12px; }
        .kopf .ic { --mdc-icon-size: 28px; color: var(--state-icon-color, #44739e); }
        .kopf.an .ic { color: var(--state-media_player-active-color, var(--amber-color, #ffc107)); }
        .titel { flex: 1; min-width: 0; }
        .name { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
        .status { font-size: 13px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        button { font: inherit; cursor: pointer; border: none; background: none; color: var(--primary-text-color); }
        .rund { width: 42px; height: 42px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
          background: var(--secondary-background-color, rgba(127,127,127,.15)); flex: none; }
        .rund ha-icon { --mdc-icon-size: 22px; }
        .rund.klein { width: 34px; height: 34px; }
        .rund.klein ha-icon { --mdc-icon-size: 18px; }
        .power.an { background: var(--success-color, #43a047); color: #fff; }
        .musik { display: none; align-items: center; gap: 12px; margin-top: 14px; }
        .musik.an { display: flex; }
        .cover { width: 56px; height: 56px; border-radius: 8px; background: var(--secondary-background-color) center/cover no-repeat; flex: none;
          display: flex; align-items: center; justify-content: center; }
        .cover ha-icon { --mdc-icon-size: 28px; color: var(--secondary-text-color); }
        .info { flex: 1; min-width: 0; }
        .t1 { font-size: 14px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .t2 { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tasten { display: flex; gap: 6px; }
        .apps { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; margin-top: 14px; }
        .apps:empty, .eing:empty { display: none; }
        .eing { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 8px; margin-top: 14px; }
        .eing button { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 6px; border-radius: 20px; font-size: 13px;
          background: var(--secondary-background-color, rgba(127,127,127,.12)); border: 2px solid transparent; }
        .eing ha-icon { --mdc-icon-size: 18px; color: var(--state-icon-color, #44739e); }
        .eing button.aktiv { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
        .a { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 12px;
          background: var(--secondary-background-color, rgba(127,127,127,.12)); border: 2px solid transparent; font-size: 13px; line-height: 1.2; text-align: center; }
        .a ha-icon { --mdc-icon-size: 28px; color: var(--state-icon-color, #44739e); }
        .a.aktiv { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
        .a.aktiv ha-icon { color: var(--primary-color); }
        .auf { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin-top: 12px; padding: 6px;
          font-size: 13px; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color, #444); }
        .auf ha-icon { --mdc-icon-size: 18px; transition: transform .2s; }
        .auf.offen ha-icon { transform: rotate(180deg); }
        .fb { display: none; margin-top: 8px; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
        .fb.offen { display: grid; }
        .kreuz { display: grid; grid-template-columns: repeat(3, 48px); grid-template-rows: repeat(3, 48px); gap: 4px; }
        .kreuz button { border-radius: 12px; background: var(--secondary-background-color, rgba(127,127,127,.15)); display: flex; align-items: center; justify-content: center; }
        .kreuz button.ok { border-radius: 50%; background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 500; }
        .kreuz ha-icon { --mdc-icon-size: 24px; }
        .spalte { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .spalte small { font-size: 11px; color: var(--secondary-text-color); }
      </style>
      <ha-card>
        <div class="kopf">
          <ha-icon class="ic" icon="mdi:television"></ha-icon>
          <div class="titel"><div class="name"></div><div class="status"></div></div>
          <button class="rund power" title="Ein / Aus"><ha-icon icon="mdi:power"></ha-icon></button>
        </div>
        <div class="musik">
          <div class="cover"><ha-icon icon="mdi:play-box-outline"></ha-icon></div>
          <div class="info"><div class="t1"></div><div class="t2"></div></div>
          <div class="tasten">
            <button class="rund klein zurueck" title="Zurück"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
            <button class="rund klein play" title="Wiedergabe / Pause"><ha-icon icon="mdi:play"></ha-icon></button>
            <button class="rund klein vor" title="Weiter"><ha-icon icon="mdi:skip-next"></ha-icon></button>
          </div>
        </div>
        <div class="eing"></div>
        <div class="apps"></div>
        <radio-wahl></radio-wahl>
        <button class="auf"><span>Fernbedienung</span><ha-icon icon="mdi:chevron-down"></ha-icon></button>
        <div class="fb">
          <div class="spalte">
            <button class="rund" data-k="BACK" title="Zurück"><ha-icon icon="mdi:arrow-u-left-top"></ha-icon></button>
            <button class="rund" data-k="HOME" title="Startseite"><ha-icon icon="mdi:home"></ha-icon></button>
            <button class="rund" data-k="MENU" title="Menü"><ha-icon icon="mdi:menu"></ha-icon></button>
          </div>
          <div class="kreuz">
            <span></span><button data-k="DPAD_UP"><ha-icon icon="mdi:chevron-up"></ha-icon></button><span></span>
            <button data-k="DPAD_LEFT"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button class="ok" data-k="DPAD_CENTER">OK</button>
            <button data-k="DPAD_RIGHT"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <span></span><button data-k="DPAD_DOWN"><ha-icon icon="mdi:chevron-down"></ha-icon></button><span></span>
          </div>
          <div class="spalte">
            <button class="rund" data-k="VOLUME_UP" title="Lauter"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
            <button class="rund" data-k="VOLUME_MUTE" title="Stumm"><ha-icon icon="mdi:volume-off"></ha-icon></button>
            <button class="rund" data-k="VOLUME_DOWN" title="Leiser"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
          </div>
        </div>
      </ha-card>`;
    const r = this.shadowRoot, e = () => ({ entity_id: this._config.entity });
    r.querySelector(".power").addEventListener("click", () => {
      if (this._config.tv) return this._tvAn() ? this._dienst("media_player", "turn_off", { entity_id: this._config.tv }) : this._tvEinschalten();
      const st = this._s(this._config.entity)?.state;
      // Geraet ohne Strom (z.B. Musik-Stick am Receiver): ueber das Weck-Geraet einschalten
      if (st === "unavailable" && this._config.wecken) return this._weckGeraet();
      this._dienst("media_player", st === "off" ? "turn_on" : "turn_off", e());
    });
    const c = () => ({ entity_id: this._config.cast });
    r.querySelector(".zurueck").addEventListener("click", () => this._dienst("media_player", "media_previous_track", c()));
    r.querySelector(".play").addEventListener("click", () => this._dienst("media_player", "media_play_pause", c()));
    r.querySelector(".vor").addEventListener("click", () => this._dienst("media_player", "media_next_track", c()));
    r.querySelector(".auf").addEventListener("click", () => {
      this._offen = !this._offen;
      r.querySelector(".auf").classList.toggle("offen", this._offen);
      r.querySelector(".fb").classList.toggle("offen", this._offen);
    });
    r.querySelectorAll(".fb [data-k]").forEach((b) => b.addEventListener("click", () => this._taste(b.dataset.k)));
    this._appsSchluessel = null;
    this._update();
  }

  // Bildschirm an: jeder Zustand ausser aus / nicht erreichbar (webOS meldet auch playing / paused / idle)
  _tvAn() { const t = this._s(this._config.tv); return !!t && !["off", "unavailable", "unknown", "standby"].includes(t.state); }

  // Bildschirm einschalten: zuerst direkt (falls Wake-on-LAN eingerichtet ist), sonst ueber den
  // Google TV per HDMI-CEC. Wartet, bis der Bildschirm erreichbar ist (max. ~15 s).
  async _tvEinschalten() {
    const tv = { entity_id: this._config.tv };
    // Skript (Wake-on-LAN) zuerst; dann bekommt der Bildschirm 8 s Zeit, bevor das CEC-Wecken folgt
    if (this._config.einschalten) this._dienst("script", "turn_on", { entity_id: this._config.einschalten }).catch(() => {});
    this._dienst("media_player", "turn_on", tv).catch(() => {});
    const weckenAb = this._config.einschalten ? 16 : 6;
    for (let i = 0; i < 30 && !this._tvAn(); i++) {
      if (i === weckenAb && (this._config.wecken || this._config.entity) !== this._config.tv)
        this._dienst("media_player", "turn_on", { entity_id: this._config.wecken || this._config.entity }).catch(() => {});
      await new Promise((ok) => setTimeout(ok, 500));
    }
    return this._tvAn();
  }

  async _eingang(q, geraet) {
    if (geraet && ["off", "standby"].includes(this._s(geraet)?.state)) this._dienst("media_player", "turn_on", { entity_id: geraet }).catch(() => {});
    if (!this._tvAn() && !(await this._tvEinschalten())) return;
    await this._dienst("media_player", "select_source", { entity_id: this._config.tv, source: q });
  }

  _appName(paket) { return (this._config.apps || []).find((a) => a.app === paket || a.paket === paket)?.name || TV_APPS[paket] || paket; }

  // Weck-Geraet (z.B. Receiver, der den Stick mit Strom versorgt) einschalten, Eingang waehlen
  // und warten, bis der Stick erreichbar ist (max. ~30 s)
  async _weckGeraet() {
    const c = this._config, warte = (ms) => new Promise((ok) => setTimeout(ok, ms));
    if (["off", "standby", "unavailable", "unknown"].includes(this._s(c.wecken)?.state)) {
      await this._dienst("media_player", "turn_on", { entity_id: c.wecken }).catch(() => {});
      await warte(1500);
    }
    if (c.receiver_quelle && c.wecken === c.lautstaerke && this._s(c.wecken)?.attributes.source !== c.receiver_quelle)
      this._dienst("media_player", "select_source", { entity_id: c.wecken, source: c.receiver_quelle }).catch(() => {});
    for (let i = 0; i < 60 && ["unavailable", "unknown"].includes(this._s(c.cast || c.entity)?.state); i++) await warte(500);
  }

  // Radiosender starten: Geraet und ggf. Receiver einschalten, Receiver-Eingang waehlen, dann ueber den Chromecast abspielen
  async _radio(x) {
    const c = this._config, warte = (ms) => new Promise((ok) => setTimeout(ok, ms));
    this._letzterSender = x.name;
    if (c.wecken && ["unavailable", "unknown"].includes(this._s(c.cast || c.entity)?.state)) await this._weckGeraet();
    const s = this._s(c.entity);
    if (s && ["off", "standby"].includes(s.state)) { await this._dienst("media_player", "turn_on", { entity_id: c.entity }).catch(() => {}); await warte(1500); }
    const rx = c.lautstaerke;
    if (rx && c.receiver_quelle) {
      if (["off", "standby"].includes(this._s(rx)?.state)) { await this._dienst("media_player", "turn_on", { entity_id: rx }).catch(() => {}); await warte(1500); }
      if (this._s(rx)?.attributes.source !== c.receiver_quelle) this._dienst("media_player", "select_source", { entity_id: rx, source: c.receiver_quelle }).catch(() => {});
    }
    await this._dienst("media_player", "play_media", { entity_id: c.cast || c.entity, media_content_id: x.id, media_content_type: x.typ || "audio/mpeg" });
  }
  _radioAktiv() {
    const cs = this._s(this._config.cast);
    if (!cs || !["playing", "buffering"].includes(cs.state)) return null;
    const t = radioNorm([cs.attributes.media_title, cs.attributes.media_artist].filter(Boolean).join(" "));
    const f = (this._config.sender || []).find((x) => t && t.includes(radioNorm(x.titel || x.name)));
    return f ? f.name : this._letzterSender || null;
  }

  _update() {
    const r = this.shadowRoot, c = this._config;
    if (!r || !c || !this._hass) return;
    const s = this._s(c.entity), rem = this._s(c.remote), cast = this._s(c.cast), tv = this._s(c.tv);
    const an = c.tv ? this._tvAn() : (!!s && !["off", "unavailable", "unknown", "standby"].includes(s.state))
      || (!!cast && ["playing", "paused", "buffering"].includes(cast.state));
    const eing = (c.eingaenge || []).filter((x) => x && x.quelle);
    const eAkt = an && tv ? eing.find((x) => x.quelle === tv.attributes.source) : null;
    const ca = cast?.attributes || {};
    const paket = rem?.attributes.current_activity;
    r.querySelector(".kopf").classList.toggle("an", an);
    r.querySelector(".name").textContent = c.name || s?.attributes.friendly_name || c.entity;
    const castInfo = cast && ["playing", "paused", "buffering"].includes(cast.state)
      ? [ca.app_name, cast.state === "paused" ? "pausiert" : null].filter(Boolean).join(" · ") : "";
    const gtvAktiv = !c.tv || !eing.length || (eAkt && eAkt.quelle === eing[0].quelle);
    r.querySelector(".status").textContent = !s ? "nicht gefunden" : !c.tv && s.state === "unavailable" ? "nicht erreichbar"
      : !an ? "Aus" : [eAkt ? eAkt.name : (tv && tv.attributes.source) || null,
        gtvAktiv ? castInfo || (paket ? this._appName(paket) : null) : null].filter(Boolean).join(" · ") || "An";

    // Eingangs-Tasten (Bildschirm)
    const eb = r.querySelector(".eing"), ek = JSON.stringify(eing);
    if (ek !== this._eingSchluessel) {
      this._eingSchluessel = ek;
      eb.innerHTML = "";
      for (const x of eing) {
        const b = document.createElement("button");
        b.dataset.q = x.quelle;
        b.innerHTML = `<ha-icon icon="${x.icon || "mdi:video-input-hdmi"}"></ha-icon><span></span>`;
        b.querySelector("span").textContent = x.name || x.quelle;
        b.addEventListener("click", () => this._eingang(x.quelle, x.geraet));
        eb.appendChild(b);
      }
    }
    eb.querySelectorAll("button").forEach((b) => b.classList.toggle("aktiv", !!eAkt && b.dataset.q === eAkt.quelle));
    r.querySelector(".power").classList.toggle("an", an);

    // Laufender Titel (Chromecast)
    const titel = cast && ["playing", "paused", "buffering"].includes(cast.state) && (ca.media_title || ca.media_artist);
    const musik = r.querySelector(".musik");
    musik.classList.toggle("an", !!titel);
    if (titel) {
      r.querySelector(".t1").textContent = ca.media_title || ca.app_name || "";
      r.querySelector(".t2").textContent = [ca.media_artist || ca.media_series_title, ca.media_album_name].filter(Boolean).join(" · ");
      const bild = ca.entity_picture, cv = r.querySelector(".cover");
      cv.style.backgroundImage = bild ? `url("${bild}")` : "";
      cv.querySelector("ha-icon").style.display = bild ? "none" : "";
      r.querySelector(".play ha-icon").setAttribute("icon", cast.state === "playing" ? "mdi:pause" : "mdi:play");
    }

    // App-Tasten
    const apps = (c.apps || []).filter((a) => a && a.app);
    const box = r.querySelector(".apps"), k = JSON.stringify(apps);
    if (k !== this._appsSchluessel) {
      this._appsSchluessel = k;
      box.innerHTML = "";
      for (const a of apps) {
        const b = document.createElement("button");
        b.className = "a"; b.dataset.app = a.paket || a.app;
        b.innerHTML = `<ha-icon icon="${a.icon || "mdi:application"}"></ha-icon><span></span>`;
        b.querySelector("span").textContent = a.name || this._appName(a.app);
        b.addEventListener("click", () => this._app(a.app));
        box.appendChild(b);
      }
    }
    box.querySelectorAll(".a").forEach((b) => b.classList.toggle("aktiv", an && b.dataset.app === paket));

    // Radiosender (optional): Tasten und Suche, Wiedergabe ueber den Chromecast
    const rw = r.querySelector("radio-wahl"), radio = (c.sender || []).length > 0 || !!c.suche;
    rw.style.display = radio ? "" : "none";
    if (radio && rw.einstellen) { rw.hass = this._hass; rw.einstellen(c, (x) => this._radio(x), this._radioAktiv()); }

    // Fernbedienung nur mit remote-Entitaet
    const fb = c.fernbedienung !== false && (!!c.remote || !!c.webos);
    r.querySelector(".auf").style.display = fb ? "" : "none";
    if (!fb) r.querySelector(".fb").classList.remove("offen");
  }

  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "media_player" } } },
        { name: "remote", selector: { entity: { domain: "remote" } } },
        { name: "cast", selector: { entity: { domain: "media_player" } } },
        { name: "name", selector: { text: {} } },
        { name: "fernbedienung", selector: { boolean: {} } },
        { name: "lautstaerke", selector: { entity: { domain: "media_player" } } },
        { name: "tv", selector: { entity: { domain: "media_player" } } },
        { name: "eingaenge", selector: { object: {} } },
        { name: "apps", selector: { object: {} } },
      ],
      computeLabel: (s) => ({ entity: "Gerät (Android-TV-Remote)", remote: "Fernbedienung (remote.*)", cast: "Chromecast (für Titel und Cover)",
        name: "Name", fernbedienung: "Fernbedienung zum Aufklappen",
        lautstaerke: "Lautstärke über (z. B. AV-Receiver)", tv: "Bildschirm (Ein/Aus und Eingänge)", eingaenge: "Eingangs-Tasten", apps: "App-Tasten" }[s.name] || s.name),
      computeHelper: (s) => (s.name === "apps"
        ? "Liste mit name, app (Paketname oder Link), icon – z. B. - {name: YouTube, app: com.google.android.youtube.tv, icon: mdi:youtube}" : undefined),
    };
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const rem = ids.find((id) => id.startsWith("remote.")) || "";
    const mp = ids.find((id) => id.startsWith("media_player.") && hass.states[id].attributes.device_class === "tv") || "";
    return { entity: mp, remote: rem, apps: [{ name: "YouTube", app: "com.google.android.youtube.tv", icon: "mdi:youtube" }] };
  }
}

if (!customElements.get(TYPE17)) customElements.define(TYPE17, FernseherKarte);
if (!window.customCards.some((c) => c.type === TYPE17)) {
  window.customCards.push({ type: TYPE17, name: "Fernseher-Karte", description: "Google TV / Android TV: Ein/Aus, laufende App, Titel, App-Tasten und Fernbedienung", preview: true });
}
}

console.info("%c fernseher-karte %c v1.0.0 ", "color:#fff;background:#03a9f4;font-weight:700", "color:#03a9f4");
