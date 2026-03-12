const el = (id) => document.getElementById(id);

const canvas = el("card");
const ctx = canvas.getContext("2d");

const FONT_SCALE = 1.15;

const state = {
  homeLogo: null,
  awayLogo: null,
  placeholderLogo: null,
  bg: null,
  bgMode: "preset",
};

const COLORS = {
  blue: "#013888",
  black: "#000000",
  white: "#FFFFFF",
  offwhite: "#F6F8FB",
};

function getSelectedFormat() {
  const select = el("format");
  const [w, h] = select.value.split("x").map(Number);
  const label = select.options[select.selectedIndex].text;
  return { w, h, label };
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function teamToLogoFilename(teamName) {
  return (teamName || "")
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/-/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+(u\d*|a)$/i, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "") + ".png";
}

function setCanvasSizeFromFormat() {
  const { w, h } = getSelectedFormat();
  canvas.width = w;
  canvas.height = h;
}

function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadFileImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

let csvMatches = [];

function fillMatchSelect(matches) {
  const sel = el("matchSelect");
  sel.innerHTML = "";

  if (!matches.length) {
    sel.disabled = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— Inga matcher hittades —";
    sel.appendChild(opt);
    return;
  }

  sel.disabled = false;

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Välj match —";
  sel.appendChild(opt0);

  matches.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${m.date} ${m.time} • ${m.home} vs ${m.away}`;
    sel.appendChild(opt);
  });
}


async function applyMatchToForm(m) {
  if (!m) return;

  el("homeTeam").value = m.home;
  el("awayTeam").value = m.away;

  if (m.date) el("date").value = m.date;   // YYYY-MM-DD
  if (m.time) el("time").value = m.time;   // HH:MM

  await autoLoadAwayLogo(); // <-- viktigt: ladda bortalogga direkt när awayTeam sätts via kod
  draw();                   // <-- rita efter att loggan laddats
}

el("loadCsvBtn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const file = el("csvFile")?.files?.[0];
  if (!file) return;

  const text = await file.text();
  csvMatches = parseMatchesFromYourCSV(text);
  fillMatchSelect(csvMatches);
});

el("matchSelect")?.addEventListener("change", async () => {
  const idx = parseInt(el("matchSelect").value, 10);
  if (Number.isNaN(idx)) return;
  await applyMatchToForm(csvMatches[idx]);
});

function parseMatchesFromYourCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];

  // Förväntat: semikolonseparerat med header:
  // MatchNr;Omg;Hemmalag;Bortalag;Datum/Tid;Resultat
  const header = lines[0].split(";").map(s => s.trim().toLowerCase());
  const iHome = header.indexOf("hemmalag");
  const iAway = header.indexOf("bortalag");
  const iDT = header.indexOf("datum/tid");

  if (iHome === -1 || iAway === -1 || iDT === -1) return [];

  const matches = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map(s => (s ?? "").trim());
    if (cols.length < header.length) continue;

    const home = cols[iHome];
    const away = cols[iAway];
    const dt = cols[iDT]; // "2026-04-24 19:00"

    if (!home || !away) continue;

    let date = "";
    let time = "";

    if (dt) {
      // delar på mellanslag: YYYY-MM-DD HH:MM
      const parts = dt.split(/\s+/);
      date = parts[0] || "";
      time = parts[1] || "";
    }

    matches.push({ home, away, date, time });
  }

  return matches;
}

/**
 * Valbara bakgrunder (assets/bg/...)
 */
const BACKGROUNDS = [
  { id: "bg1", label: "Blåvit", url: "assets/bg/blue_white.png" },
  { id: "bg2", label: "Tröja", url: "assets/bg/shirt.png" },
  { id: "bg3", label: "Gräs", url: "assets/bg/green_grass.png" },
  { id: "bg4", label: "Fotboll", url: "assets/bg/football.png" },
];

function ensureBackgroundSelectPopulated() {
  const sel = el("bgSelect");
  if (!sel) return;
  if (sel.options && sel.options.length > 0) return;

  for (const bg of BACKGROUNDS) {
    const opt = document.createElement("option");
    opt.value = bg.id;
    opt.textContent = bg.label;
    sel.appendChild(opt);
  }
  sel.value = "bg1";
}

async function applySelectedBackground() {
  const sel = el("bgSelect");
  if (!sel) return;

  const choice = sel.value;
  const bg = BACKGROUNDS.find((b) => b.id === choice);

  // fix: korrekt OR-logik
  if (!bg || !bg.url) {
    state.bg = null;
    state.bgMode = "preset";
    return;
  }

  try {
    state.bg = await loadImageFromURL(bg.url);
    state.bgMode = "preset";
  } catch (e) {
    console.warn("Kunde inte ladda vald bakgrund:", bg.url, e);
    state.bg = null;
    state.bgMode = "preset";
  }
}

async function handleFiles() {
  // Hemmalogga: default (laddas en gång)
  if (!state.homeLogo) {
    try {
      state.homeLogo = await loadImageFromURL("assets/logo/siffk.png");
    } catch (e) {
      console.warn("Kunde inte ladda assets/logo/siffk.png", e);
      state.homeLogo = null;
    }
  }

  // Placeholder för bortalag: default (laddas en gång)
  if (!state.placeholderLogo) {
    try {
      state.placeholderLogo = await loadImageFromURL("assets/logo/placeholder.png");
    } catch (e) {
      console.warn("Kunde inte ladda assets/logo/placeholder.png", e);
      state.placeholderLogo = null;
    }
  }

  // Bortalogga uppladdning
  const awayInput = el("awayLogo");
  const awayFile = awayInput?.files?.[0];
  // Only allow image types that support transparency
  const transparentTypes = ["image/png", "image/webp", "image/gif"];
  if (awayFile) {
    if (!transparentTypes.includes(awayFile.type)) {
      // Show error message
      alert("Endast PNG, WebP eller GIF-filer (med transparens) är tillåtna för bortalogga.");
      awayInput.value = "";
      state.awayLogo = null;
    } else {
      state.awayLogo = await loadFileImage(awayFile);
    }
  } else {
    state.awayLogo = null;
  }
}

let lastAwayKey = "";

async function autoLoadAwayLogo() {
  const awayTeam = ((el("awayTeam")?.value) || "").trim();
  const key = awayTeam.toLowerCase();

  // Kör bara när laget faktiskt ändrats
  if (key === lastAwayKey) return;
  lastAwayKey = key;

  // Om användaren manuellt laddat upp en bortalogga: låt den vinna
  const awayFile = el("awayLogo")?.files?.[0];
  if (awayFile) return;

  // Försök ladda logga baserat på lag-namn
  const file = teamToLogoFilename(awayTeam);
  const url = `assets/logo/${file}`;
  console.log("awayTeam:", awayTeam, "=>", file, "URL:", url);

  try {
    state.awayLogo = await loadImageFromURL(url);
  } catch (e) {
    console.warn("Misslyckades ladda:", url, e);
    state.awayLogo = null;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "2-digit", month: "short" });
}

function drawCover(img, x, y, w, h, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const ir = img.width / img.height;
  const rr = w / h;

  let dw, dh, dx, dy;

  if (ir > rr) {
    dh = h;
    dw = h * ir;
    dx = x - (dw - w) / 2;
    dy = y;
  } else {
    dw = w;
    dh = w / ir;
    dx = x;
    dy = y - (dh - h) / 2;
  }

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function fitText(text, maxWidth, startSize, minSize, fontTemplate) {
  let size = startSize;
  while (size >= minSize) {
    ctx.font = fontTemplate.replace("{size}", size);
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function centeredX(text, centerX) {
  const w = ctx.measureText(text).width;
  return Math.round(centerX - w / 2);
}

function fillTextWithOutline(text, x, y, fill = "#fff", outline = "#000", outlineWidth = 6) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = outline;
  ctx.lineWidth = outlineWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * HOME / VS / AWAY med symmetrisk spacing (VS lika långt från båda).
 */
function drawMatchupStackedCentered({ centerX, y, maxWidth, home, away, lineGap = 0.22 }) {
  const fontFamily = 'Teko, system-ui';

  const base = Math.round(Math.min(canvas.width, canvas.height) * 0.11 * FONT_SCALE);
  const minSize = 18;

  const homeTpl = `900 {size}px ${fontFamily}`;
  const awayTpl = `900 {size}px ${fontFamily}`;
  const vsTpl = `900 {size}px ${fontFamily}`;

  const homeSize = fitText(home, maxWidth, base, minSize, homeTpl);
  const awaySize = fitText(away, maxWidth, base, minSize, awayTpl);
  const mainSize = Math.min(homeSize, awaySize);

  const vsSize = Math.round(mainSize * 0.7);
  const lh = Math.round(mainSize * (1 + lineGap));

  // Outline (du kan sänka om du vill)
  const owHome = Math.max(2, Math.round(homeSize * 0.06));
  const owVs = Math.max(2, Math.round(vsSize * 0.06));
  const owAway = Math.max(2, Math.round(awaySize * 0.06));

  // HOME
  ctx.font = homeTpl.replace("{size}", homeSize);
  fillTextWithOutline(home, centeredX(home, centerX), y, "#FFFFFF", "#000000", owHome);

  // VS
  const vsY = y + lh;
  ctx.font = vsTpl.replace("{size}", vsSize);
  fillTextWithOutline("VS", centeredX("VS", centerX), vsY, "#FFFFFF", "#000000", owVs);

  // AWAY
  const awayY = vsY + lh;
  ctx.font = awayTpl.replace("{size}", awaySize);
  fillTextWithOutline(away, centeredX(away, centerX), awayY, "#FFFFFF", "#000000", owAway);

  return awayY;
}

function draw() {
  setCanvasSizeFromFormat();

  const W = canvas.width;
  const H = canvas.height;

  // fix: korrekt fallback med ||
  const homeTeam = ((el("homeTeam")?.value) || "").trim() || "Hemmalag";
  const awayTeam = ((el("awayTeam")?.value) || "").trim() || "Bortalag";

  const date = formatDate(el("date")?.value);
  const time = el("time")?.value || "";
  const venue = ((el("venue")?.value) || "").trim() || "";

  const cx = Math.round(W / 2);

  // ===== HELA YTAN =====
  ctx.clearRect(0, 0, W, H);

  // Bas
  ctx.fillStyle = COLORS.offwhite;
  ctx.fillRect(0, 0, W, H);

  // Bakgrund
  if (state.bg) {
    drawCover(state.bg, 0, 0, W, H);
  }

  // ===== BANNER TOPP =====
  const bannerH = Math.round(H * 0.16);
  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(0, 0, W, bannerH);

  const bannerText = "MATCHDAG";
  const bannerSize = Math.round(Math.min(W, H) * 0.13 * FONT_SCALE);

  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${bannerSize}px "Bebas Neue", system-ui`;

  // --- MATCHDAG: perfekt centrerad i bannern ---
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bannerText, cx, Math.round(bannerH / 2));
  ctx.restore();

  // ===== LOGGOR (låsta positioner) =====
  const contentTop = bannerH + Math.round(H * 0.06);
  const logoSize = Math.round(Math.min(W, H) * 0.25);
  const logosY = contentTop;

  const homeCenterX = Math.round(W * 0.30);
  const awayCenterX = Math.round(W * 0.70);

  const homeLogoX = Math.round(homeCenterX - logoSize / 2);
  const awayLogoX = Math.round(awayCenterX - logoSize / 2);

  if (state.homeLogo) {
    drawCover(state.homeLogo, homeLogoX, logosY, logoSize, logoSize, 1);
  }

  // fix: korrekt OR för placeholder
  const awayToDraw = state.awayLogo || state.placeholderLogo;
  if (awayToDraw) {
    drawCover(awayToDraw, awayLogoX, logosY, logoSize, logoSize, 1);
  }

  // ===== MATCHUP =====
  const titleY = contentTop + logoSize + Math.round(H * 0.1);
  const maxTitleWidth = Math.round(W * 0.82);

  const titleBottomY = drawMatchupStackedCentered({
    centerX: cx,
    y: titleY,
    maxWidth: maxTitleWidth,
    home: homeTeam.toUpperCase(),
    away: awayTeam.toUpperCase(),
  });

  // Underline
  ctx.save();
  ctx.strokeStyle = "rgba(1,56,136,1)";
  ctx.lineWidth = Math.max(6, Math.round(Math.min(W, H) * 0.005));
  const ulW = Math.round(maxTitleWidth * 0.9);
  const ulY = titleBottomY + Math.round(H * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx - ulW / 2, ulY);
  ctx.lineTo(cx + ulW / 2, ulY);
  ctx.stroke();
  ctx.restore();

  // ===== FOOTER (full bredd) =====
  const infoParts = [date, time, venue].filter(Boolean);
  const infoText = infoParts.join(" • ");

  const footerH = Math.round(H * 0.10);
  const footerY = H - footerH;

  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(0, footerY, W, footerH);

  const footerText = infoText || " ";
  const footerBaseSize = Math.round(Math.min(W, H) * 0.05 * FONT_SCALE);
  const footerMinSize = 14;
  const footerTpl = `900 {size}px "Bebas Neue", system-ui`;
  
  const footerSize = fitText(footerText, Math.round(W * 0.95), footerBaseSize, footerMinSize, footerTpl);

  ctx.fillStyle = COLORS.white;
  ctx.font = footerTpl.replace("{size}", footerSize);
  ctx.fillText(footerText, centeredX(footerText, cx), footerY + Math.round(footerH * 0.64));

  el("downloadBtn").disabled = false;
}

// ===== Events =====
el("renderBtn")?.addEventListener("click", async () => {
  try {
    await handleFiles();
    if (el("bgSelect")) await applySelectedBackground();
    draw();
  } catch (e) {
    console.error(e);
    draw();
  }
});

el("downloadBtn")?.addEventListener("click", () => {
  const { label, w, h } = getSelectedFormat();

  canvas.toBlob((blob) => {
    if (!blob) return;

    const filename = `matchkort_${slugify(label)}_${w}x${h}.png`;

    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

el("awayTeam")?.addEventListener("input", async () => {
  await autoLoadAwayLogo();
  draw();
});

el("format")?.addEventListener("change", () => draw());

el("bgSelect")?.addEventListener("change", async () => {
  await applySelectedBackground();
  draw();
});

// Init
(async () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (el("date")) el("date").value = `${yyyy}-${mm}-${dd}`;

  ensureBackgroundSelectPopulated();
  if (el("bgSelect")) await applySelectedBackground();

  // Viktigt: ladda logos (inkl placeholder) innan första draw
  await handleFiles();

  // Ladda och parsa CSV automatiskt
  try {
    const response = await fetch("assets/csv/matcher.csv");
    if (response.ok) {
      const text = await response.text();
      csvMatches = parseMatchesFromYourCSV(text);
      fillMatchSelect(csvMatches);
    }
  } catch (e) {
    console.warn("Kunde inte ladda matcher.csv:", e);
  }

  // Vänta in webfonts (om de laddas via Google Fonts), så mått blir rätt direkt
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) { }
  }

  requestAnimationFrame(() => draw());
})();
