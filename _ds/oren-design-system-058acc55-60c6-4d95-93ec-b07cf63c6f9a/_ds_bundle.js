/* @ds-bundle: {"format":3,"namespace":"OrenDesignSystem_058acc","components":[{"name":"OrenLockup","sourcePath":"components/brand/OrenLockup.jsx"},{"name":"OrenSymbol","sourcePath":"components/brand/OrenSymbol.jsx"},{"name":"CardIt","sourcePath":"components/cards/CardIt.jsx"},{"name":"InvestTable","sourcePath":"components/data/InvestTable.jsx"},{"name":"PhaseBox","sourcePath":"components/data/PhaseBox.jsx"},{"name":"Stat","sourcePath":"components/data/Stat.jsx"},{"name":"StepList","sourcePath":"components/data/StepList.jsx"},{"name":"Callout","sourcePath":"components/typographic/Callout.jsx"},{"name":"Eyebrow","sourcePath":"components/typographic/Eyebrow.jsx"}],"sourceHashes":{"components/brand/OrenLockup.jsx":"ee7c13f68402","components/brand/OrenSymbol.jsx":"ba59392a18c8","components/cards/CardIt.jsx":"9b661ed883d5","components/data/InvestTable.jsx":"a3d3f119d46a","components/data/PhaseBox.jsx":"8c2cacdd5e2c","components/data/Stat.jsx":"34b168e1a639","components/data/StepList.jsx":"8decaadaa038","components/typographic/Callout.jsx":"7e8599e79d4d","components/typographic/Eyebrow.jsx":"43394adafff2","decks/oren_b2b/chrome-b2b.jsx":"8164bc3678bd","decks/oren_b2b/deckchrome-standalone.jsx":"be8ceff6c9eb","decks/oren_b2b/slides-01-05.jsx":"1c875575e12e","decks/oren_b2b/slides-06-10.jsx":"c0747c51c19a","decks/oren_b2b/slides-11-15.jsx":"10068d72e720","decks/oren_b2b_v1_backup/chrome-b2b.jsx":"8c0491f7546f","decks/oren_b2b_v1_backup/slides-01-05.jsx":"3d8865362c2d","decks/oren_b2b_v1_backup/slides-06-10.jsx":"bd555b8615c3","decks/oren_b2b_v1_backup/slides-11-15.jsx":"eeb790cead5d","decks/oren_platform/PlatformSlides.jsx":"97966ec5c264","ui_kits/deck/DeckChrome.jsx":"ad2f4348febe","ui_kits/deck/Slides.jsx":"6bd21e81e28b","ui_kits/leave_behind/LeaveBehind.jsx":"99feb8d65850"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.OrenDesignSystem_058acc = window.OrenDesignSystem_058acc || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/OrenLockup.jsx
try { (() => {
/**
 * Oren brand lockup — the OFFICIAL artwork: symbol + the "Oren" wordmark +
 * the italic pillar descriptor, baked as the brand supplied it.
 *
 *   pillar="corp"        → Oren            (gradient symbol, no descriptor)
 *   pillar="payments"    → Oren Payments   (verde luz)
 *   pillar="capital"     → Oren Capital    (verde-folha)
 *   pillar="governance"  → Oren Governance (jade)
 *
 * The wordmark is intentionally a pale tint — the lockup is designed for
 * deep-green / petal / colored backgrounds, where the cream wordmark and the
 * colored symbol + descriptor read cleanly. On white it reads as a quiet tint.
 *
 * The artwork resolves relative to where _ds_bundle.js loaded, so it works at
 * any page depth without a configured base path.
 */
const FILES = {
  corp: "oren-lockup.png",
  payments: "oren-payments-lockup.png",
  capital: "oren-capital-lockup.png",
  governance: "oren-governance-lockup.png"
};
const LABELS = {
  corp: "Oren",
  payments: "Oren Payments",
  capital: "Oren Capital",
  governance: "Oren Governance"
};
function dsBase() {
  try {
    const s = Array.from(document.querySelectorAll("script")).find(n => n.src && n.src.indexOf("_ds_bundle.js") !== -1);
    if (s) return s.src.replace(/_ds_bundle\.js.*$/, "");
  } catch (e) {}
  return "";
}
function OrenLockup({
  pillar = "corp",
  size = 56,
  className = "",
  style = {},
  alt
}) {
  const file = FILES[pillar] || FILES.corp;
  return /*#__PURE__*/React.createElement("img", {
    src: dsBase() + "assets/lockups/" + file,
    alt: alt || LABELS[pillar] || "Oren",
    className: className,
    draggable: false,
    style: {
      display: "block",
      height: size + "px",
      width: "auto",
      ...style
    }
  });
}
Object.assign(__ds_scope, { OrenLockup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/OrenLockup.jsx", error: String((e && e.message) || e) }); }

// components/brand/OrenSymbol.jsx
try { (() => {
/**
 * Oren institutional symbol — the radial 16-petal flower (§8), official organic
 * artwork. Recolorable via CSS mask: solid tones fill the silhouette; "gradient"
 * is the Oren-Corp master mark (jade → leaf green). The silhouette is embedded
 * (no external asset path), so the component is drop-in anywhere.
 *   on dark    → "light" (#affa57) watermark, "cream" (#e8f3e8) small accent
 *   on light   → "deep" (#092d29)
 *   pillars    → "payments" / "capital" / "governance"; corp → "gradient"
 */
const MASK = "data:image/png;base64,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";
const TONES = {
  deep: "var(--oren-deep, #092d29)",
  cream: "var(--oren-cream, #e8f3e8)",
  light: "var(--oren-light, #affa57)",
  payments: "var(--oren-payments, #affa57)",
  capital: "var(--oren-capital, #62cc6d)",
  governance: "var(--oren-governance, #1da688)",
  current: "currentColor"
};
const GRADIENT = "linear-gradient(168deg, #5fc56e 0%, #1f9c7e 52%, #0e6f63 100%)";
function OrenSymbol({
  size = 44,
  tone = "deep",
  watermark = false,
  className = "",
  style = {},
  title = "Oren"
}) {
  const isGradient = tone === "gradient";
  const paint = isGradient ? {
    backgroundImage: GRADIENT
  } : {
    backgroundColor: TONES[tone] || TONES.deep
  };
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    role: "img",
    "aria-label": title,
    style: {
      display: "inline-block",
      width: size,
      height: size,
      flex: "none",
      pointerEvents: "none",
      WebkitMaskImage: `url("${MASK}")`,
      maskImage: `url("${MASK}")`,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskSize: "contain",
      maskSize: "contain",
      ...paint,
      ...(watermark ? {
        opacity: 0.15
      } : {}),
      ...style
    }
  });
}
Object.assign(__ds_scope, { OrenSymbol });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/OrenSymbol.jsx", error: String((e && e.message) || e) }); }

// components/cards/CardIt.jsx
try { (() => {
/**
 * Card Itaville (§17) — the iconic Oren card. Dark mid-green rectangle with a
 * light-green UPPERCASE label, a white title, and muted body copy. Square corners.
 */
function CardIt({
  label,
  title,
  children,
  compact = false,
  className = "",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      background: "var(--oren-mid, #0e5351)",
      color: "var(--oren-cream, #e8f3e8)",
      padding: compact ? "5mm 5mm" : "7mm 6mm",
      minHeight: compact ? "50mm" : "78mm",
      position: "relative",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: compact ? "8.5pt" : "10pt",
      letterSpacing: "0.14em",
      color: "var(--oren-light, #affa57)",
      fontWeight: "var(--fw-medium, 500)",
      marginBottom: compact ? "3mm" : "5mm"
    }
  }, label) : null, title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: compact ? "12pt" : "14pt",
      lineHeight: 1.15,
      fontWeight: "var(--fw-medium, 500)",
      color: "#ffffff",
      margin: 0,
      marginBottom: compact ? "3mm" : "4mm",
      letterSpacing: "-0.012em"
    }
  }, title) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: compact ? "8.5pt" : "9.5pt",
      lineHeight: compact ? 1.4 : 1.5,
      color: "var(--card-body, #c8d8d2)"
    }
  }, children));
}
Object.assign(__ds_scope, { CardIt });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/CardIt.jsx", error: String((e && e.message) || e) }); }

// components/data/InvestTable.jsx
try { (() => {
/**
 * InvestTable (§20) — dual-column table showing two sides of an institutional
 * transaction. Two colored header cells; alternating soft rows beneath.
 */
function InvestTable({
  leftHead,
  rightHead,
  rows = [],
  className = "",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      borderTop: "0.8px solid var(--oren-mid, #0e5351)",
      margin: "4mm 0",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: headStyle(false)
  }, leftHead), /*#__PURE__*/React.createElement("div", {
    style: headStyle(true)
  }, rightHead), rows.map((r, i) => {
    const odd = i % 2 === 0;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, /*#__PURE__*/React.createElement("div", {
      style: rowStyle(odd)
    }, r[0]), /*#__PURE__*/React.createElement("div", {
      style: rowStyle(odd)
    }, r[1]));
  }));
}
function headStyle(deep) {
  return {
    padding: "2.5mm 4mm",
    fontSize: "8.5pt",
    letterSpacing: "0.06em",
    color: "#ffffff",
    fontWeight: "var(--fw-medium, 500)",
    background: deep ? "var(--oren-deep, #092d29)" : "var(--oren-mid, #0e5351)"
  };
}
function rowStyle(odd) {
  return {
    padding: "2.2mm 4mm",
    fontSize: "8.5pt",
    lineHeight: 1.4,
    color: "var(--text-secondary, #2a3733)",
    borderBottom: "0.5px solid var(--rule-faint, #e3e6e3)",
    background: odd ? "var(--surface-soft, #fafaf8)" : "transparent"
  };
}
Object.assign(__ds_scope, { InvestTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/InvestTable.jsx", error: String((e && e.message) || e) }); }

// components/data/PhaseBox.jsx
try { (() => {
/**
 * PhaseBox (§22) — a roadmap phase block. Inactive phases use a soft surface
 * with a mid-green left rule; the active phase inverts to deep-green with a
 * light-green rule.
 */
function PhaseBox({
  tag,
  title,
  children,
  active = false,
  className = "",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      padding: "3.5mm 4mm 4mm 4mm",
      background: active ? "var(--oren-deep, #092d29)" : "var(--surface-alt, #f3f6f3)",
      color: active ? "var(--oren-cream, #e8f3e8)" : "inherit",
      borderLeft: `var(--border-phase, 2.5px) solid ${active ? "var(--oren-light, #affa57)" : "var(--oren-mid, #0e5351)"}`,
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, tag ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "7.5pt",
      letterSpacing: "0.1em",
      color: active ? "var(--oren-light, #affa57)" : "var(--oren-mid, #0e5351)",
      fontWeight: "var(--fw-medium, 500)",
      marginBottom: "1mm",
      textTransform: "uppercase"
    }
  }, tag) : null, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "10.5pt",
      color: active ? "#ffffff" : "var(--oren-deep, #092d29)",
      fontWeight: "var(--fw-medium, 500)",
      marginBottom: "1.5mm",
      letterSpacing: "-0.005em"
    }
  }, title) : null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "9pt",
      color: active ? "var(--card-muted, #a8bcb4)" : "var(--text-muted, #4a564f)",
      lineHeight: 1.45,
      margin: 0
    }
  }, children));
}
Object.assign(__ds_scope, { PhaseBox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/PhaseBox.jsx", error: String((e && e.message) || e) }); }

// components/data/Stat.jsx
try { (() => {
/**
 * Stat (§18) — a big number with a label and a cited source, sitting under a
 * thin mid-green top rule. Numbers use tabular figures and negative tracking.
 */
function Stat({
  value,
  label,
  source,
  deck = false,
  className = "",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      borderTop: "var(--border-thin, 0.6px) solid var(--oren-mid, #0e5351)",
      paddingTop: deck ? "3mm" : "2.5mm",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: deck ? "var(--fs-stat-deck, 30pt)" : "var(--fs-stat, 22pt)",
      fontWeight: "var(--fw-regular, 400)",
      color: "var(--oren-deep, #092d29)",
      letterSpacing: "-0.022em",
      lineHeight: 1,
      marginBottom: deck ? "2mm" : "1.5mm",
      fontFeatureSettings: '"tnum"'
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: deck ? "9pt" : "8.5pt",
      color: "var(--text-muted, #4a564f)",
      lineHeight: 1.4
    }
  }, label), source ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: deck ? "7.5pt" : "7pt",
      color: "var(--text-light, #6b7672)",
      marginTop: deck ? "2mm" : "1.5mm",
      fontStyle: "italic",
      lineHeight: 1.35
    }
  }, source) : null);
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Stat.jsx", error: String((e && e.message) || e) }); }

// components/data/StepList.jsx
try { (() => {
/**
 * StepList (§23) — numbered points with a deep-green circular badge holding a
 * light-green number, a title column, and a description column.
 */
function StepList({
  steps = [],
  className = "",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "2.5mm",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "grid",
      gridTemplateColumns: "18mm 42mm 1fr",
      gap: "7mm",
      alignItems: "start",
      padding: "3.5mm 0",
      borderBottom: i === steps.length - 1 ? "none" : "0.5px solid var(--rule-faint, #e3e6e3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "11mm",
      height: "11mm",
      borderRadius: "50%",
      background: "var(--oren-deep, #092d29)",
      color: "var(--oren-light, #affa57)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10pt",
      fontWeight: "var(--fw-medium, 500)",
      fontFeatureSettings: '"tnum"'
    }
  }, s.n != null ? s.n : String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "11pt",
      fontWeight: "var(--fw-medium, 500)",
      color: "var(--oren-deep, #092d29)",
      paddingTop: "1mm",
      letterSpacing: "-0.005em"
    }
  }, s.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "9pt",
      color: "var(--text-muted, #4a564f)",
      lineHeight: 1.5,
      paddingTop: "1mm"
    }
  }, s.desc))));
}
Object.assign(__ds_scope, { StepList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StepList.jsx", error: String((e && e.message) || e) }); }

// components/typographic/Callout.jsx
try { (() => {
/**
 * Callout (§19) — institutional emphasis block with a mid-green left border.
 * Used for conclusions, anchor phrases, important observations.
 */
function Callout({
  title,
  children,
  className = "",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      borderLeft: "var(--border-callout, 1.5px) solid var(--oren-mid, #0e5351)",
      padding: "2mm 0 2mm 5mm",
      margin: "3mm 0 4mm 0",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "8pt",
      letterSpacing: "0.08em",
      fontWeight: "var(--fw-medium, 500)",
      color: "var(--oren-mid, #0e5351)",
      textTransform: "uppercase",
      marginBottom: "1.5mm"
    }
  }, title) : null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "10pt",
      lineHeight: 1.45,
      color: "var(--text-primary, #1a1a1a)"
    }
  }, children));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typographic/Callout.jsx", error: String((e && e.message) || e) }); }

// components/typographic/Eyebrow.jsx
try { (() => {
/**
 * Eyebrow label (§16) — small UPPERCASE kicker above a headline.
 * Weight 500, positive tracking. Pass text already uppercased (no text-transform).
 */
function Eyebrow({
  children,
  tone = "light",
  className = "",
  style = {}
}) {
  const color = tone === "dark" ? "var(--oren-light, #affa57)" // on dark surfaces
  : "var(--oren-mid, #0e5351)"; // on light surfaces
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: "var(--fs-eyebrow, 9pt)",
      letterSpacing: "var(--ls-eyebrow, 0.14em)",
      fontWeight: "var(--fw-medium, 500)",
      color,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/typographic/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b/chrome-b2b.jsx
try { (() => {
/* Oren B2B deck — chrome local.
   Reusa o Stage/SHeader/Watermark/SmallSymbol do kit de deck (window.OrenDeck),
   mas substitui o rodapé: este deck é da marca única Oren — a house-line com
   sub-marcas (Uaipay) não aparece. Rodapé: OREN · POWERED BY BRIDGE + confidencial. */

const {
  SHeader,
  Watermark,
  SmallSymbol
} = window.OrenDeck;
const HEADER_R = "Oren · Plataforma financeira global";

/* Slide local — igual ao do kit, mas aceita data-screen-label. */
function BSlide({
  dark,
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "slide" + (dark ? " dark" : ""),
    "data-screen-label": label
  }, children);
}
function BFooter({
  page,
  total,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "s-footer" + (dark ? " on-dark" : "")
  }, /*#__PURE__*/React.createElement("span", {
    className: "house-line"
  }, "OREN", /*#__PURE__*/React.createElement("span", null, "\xB7"), "POWERED\xA0BY\xA0STRIPE"), /*#__PURE__*/React.createElement("span", {
    className: "conf-line"
  }, "Confidencial \u2014 uso corporativo"), /*#__PURE__*/React.createElement("span", {
    className: "pagenum"
  }, String(page).padStart(2, "0"), " / ", String(total).padStart(2, "0")));
}

/* Região de corpo entre header e footer. */
function BBody({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "18mm",
      bottom: "21mm",
      left: "14mm",
      right: "14mm",
      ...style
    }
  }, children);
}

/* Bloco de prova/atrito: filete superior + rótulo UPPERCASE + corpo. */
function RuleBlock({
  label,
  tone = "mid",
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rule-block" + (tone === "muted" ? " muted" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "rb-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "rb-body"
  }, children));
}

/* Passo de fluxo compacto: badge circular + uma linha. */
function FlowStep({
  n,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flow-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flow-badge"
  }, n), /*#__PURE__*/React.createElement("div", {
    className: "flow-text"
  }, children));
}
Object.assign(window, {
  OB2B: {
    BSlide,
    BFooter,
    BBody,
    RuleBlock,
    FlowStep,
    HEADER_R,
    SHeader,
    Watermark,
    SmallSymbol
  }
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b/chrome-b2b.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b/deckchrome-standalone.jsx
try { (() => {
/* Oren Deck — chrome & stage.
   Faithful 16:9 deck per the manual (§10–§13): 297mm × 167mm slides,
   institutional header, house-line footer, dark covers, the radial watermark.
   Exposes a Stage that scales the fixed-size slide to fit any viewport and
   handles prev/next + keyboard navigation. */

const MM = 3.7795275591; // px per mm at 96dpi
const SLIDE_W = 297 * MM;
const SLIDE_H = 167 * MM;
const HOUSE = dark => /*#__PURE__*/React.createElement("span", {
  className: "house-line"
}, "OREN", /*#__PURE__*/React.createElement("span", null, "\xB7"), "BTS\xA0GLOBAL\xA0CORP", /*#__PURE__*/React.createElement("span", null, "\xB7"), "BATEIA\xA0CAPITAL", /*#__PURE__*/React.createElement("span", null, "\xB7"), "UAIPAY");
function SHeader({
  left,
  right,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "s-header" + (dark ? " on-dark" : "")
  }, /*#__PURE__*/React.createElement("span", null, left), /*#__PURE__*/React.createElement("span", null, right));
}
function SFooter({
  page,
  total,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "s-footer" + (dark ? " on-dark" : "")
  }, HOUSE(dark), /*#__PURE__*/React.createElement("span", {
    className: "pagenum"
  }, String(page).padStart(2, "0"), " / ", String(total).padStart(2, "0")));
}
function Watermark() {
  return /*#__PURE__*/React.createElement("img", {
    className: "bg-symbol",
    src: window.__resources.symLight,
    alt: "",
    style: {
      position: "absolute",
      top: "-40mm",
      right: "-40mm",
      width: "200mm",
      height: "200mm",
      opacity: 0.15,
      pointerEvents: "none"
    }
  });
}
function SmallSymbol({
  tone = "cream",
  top = "22mm",
  left = "14mm"
}) {
  return /*#__PURE__*/React.createElement("img", {
    src: tone === "light" ? window.__resources.symLight : window.__resources.symCream,
    alt: "Oren",
    style: {
      position: "absolute",
      top,
      left,
      width: "44px",
      height: "44px",
      zIndex: 5
    }
  });
}

/* Fixed-size slide frame. dark => deep-green cover/closing surface. */
function Slide({
  dark,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "slide" + (dark ? " dark" : "")
  }, children);
}

/* Stage: scales the slide to fit, renders the active slide, provides nav. */
function Stage({
  slides
}) {
  const [i, setI] = React.useState(() => {
    const n = parseInt(new URLSearchParams(location.search).get("s") || "0", 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(slides.length - 1, n));
  });
  const [scale, setScale] = React.useState(1);
  const fit = React.useCallback(() => {
    const pad = 0;
    const s = Math.min((window.innerWidth - pad) / SLIDE_W, (window.innerHeight - pad) / SLIDE_H);
    setScale(s);
  }, []);
  React.useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);
  const go = React.useCallback(n => setI(cur => Math.max(0, Math.min(slides.length - 1, n))), [slides.length]);
  React.useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("s", i);
    history.replaceState(null, "", url);
  }, [i]);
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(i + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);
  const total = slides.length;
  const Active = slides[i];
  return /*#__PURE__*/React.createElement("div", {
    className: "stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stage-canvas",
    style: {
      width: SLIDE_W,
      height: SLIDE_H,
      transform: `translate(-50%, -50%) scale(${scale})`
    }
  }, Active(i + 1, total)), /*#__PURE__*/React.createElement("div", {
    className: "deck-nav"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go(i - 1),
    disabled: i === 0,
    "aria-label": "Previous"
  }, "\u2039"), /*#__PURE__*/React.createElement("span", {
    className: "deck-count"
  }, String(i + 1).padStart(2, "0"), " / ", String(total).padStart(2, "0")), /*#__PURE__*/React.createElement("button", {
    onClick: () => go(i + 1),
    disabled: i === total - 1,
    "aria-label": "Next"
  }, "\u203A")));
}
Object.assign(window, {
  OrenDeck: {
    Stage,
    Slide,
    SHeader,
    SFooter,
    Watermark,
    SmallSymbol,
    HOUSE,
    MM
  }
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b/deckchrome-standalone.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b/slides-01-05.jsx
try { (() => {
/* Oren B2B — slides 01–05: capa, problema, tese, para quem é, arquitetura. */

const {
  BSlide,
  BFooter,
  BBody,
  RuleBlock,
  HEADER_R,
  SHeader,
  Watermark,
  SmallSymbol
} = window.OB2B;
const {
  Eyebrow,
  CardIt,
  Callout
} = window.OrenDesignSystem_058acc;
const B2B_SLIDES_A = [
// 01 — Capa
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  dark: true,
  label: "01 \xB7 Capa"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ Deck \xB7 Apresenta\xE7\xE3o Institucional ]",
  right: "v2.0 \xB7 Junho 2026"
}), /*#__PURE__*/React.createElement(Watermark, null), /*#__PURE__*/React.createElement(SmallSymbol, {
  tone: "cream",
  top: "22mm",
  left: "14mm"
}), /*#__PURE__*/React.createElement("div", {
  className: "cover-title"
}, /*#__PURE__*/React.createElement("div", {
  className: "cover-eyebrow"
}, "PLATAFORMA FINANCEIRA GLOBAL \xB7 PARA EMPRESAS E FAMILY OFFICES"), /*#__PURE__*/React.createElement("h1", {
  className: "headline-xxl",
  style: {
    color: "var(--oren-cream)"
  }
}, "Oren"), /*#__PURE__*/React.createElement("p", {
  className: "cover-sub"
}, "A infraestrutura que move o capital da sua empresa entre Brasil, EUA e o mundo.")), /*#__PURE__*/React.createElement("div", {
  className: "cover-meta"
}, /*#__PURE__*/React.createElement("div", {
  className: "l"
}, /*#__PURE__*/React.createElement("div", {
  className: "name"
}, "Oren"), /*#__PURE__*/React.createElement("div", null, "Operado pela Oren \xB7 Powered by Stripe")), /*#__PURE__*/React.createElement("div", {
  className: "r"
}, /*#__PURE__*/React.createElement("div", {
  className: "doc-id"
}, "DECK \xB7 ORN-B2B-01 \xB7 v2.0"), /*#__PURE__*/React.createElement("div", null, "Junho 2026 \xB7 Confidencial \u2014 uso corporativo")))),
// 02 — O problema
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "02 \xB7 O problema"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 02 \xB7 O problema ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "O PROBLEMA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Operar dinheiro entre pa\xEDses", /*#__PURE__*/React.createElement("br", null), "ainda \xE9 caro, lento e opaco."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Sua empresa perde dias e margem em cada movimento internacional."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8mm 10mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "COMPLIANCE MOROSO"
}, "Abrir conta leva semanas; cada remessa espera aprova\xE7\xE3o manual e novos pedidos de documento."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "BUROCR\xC1TICO"
}, "Bancos avessos a risco, contas travadas e fric\xE7\xE3o para quem opera cross-border."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "LENTO"
}, "Transfer\xEAncias internacionais levam ", /*#__PURE__*/React.createElement("strong", null, "2\u20135 dias"), " e passam por intermedi\xE1rios que ningu\xE9m controla."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "OPACO"
}, "C\xE2mbio com spread escondido e letra mi\xFAda \u2014 voc\xEA n\xE3o sabe o custo real."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "EXPOSTO"
}, "Capital preso \xE0 volatilidade do real \u2014 e vulner\xE1vel a bloqueios e confiscos arbitr\xE1rios."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "MANUAL"
}, "Receber de clientes l\xE1 fora e pagar fornecedores em moeda local: reconcilia\xE7\xE3o na planilha."))), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 03 — A tese (dark)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  dark: true,
  label: "03 \xB7 A tese"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ 03 \xB7 A tese ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "dark",
  style: {
    marginBottom: "6mm"
  }
}, "A TESE"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-xl",
  style: {
    maxWidth: "235mm",
    marginBottom: "10mm"
  }
}, "Uma \xFAnica conta.", /*#__PURE__*/React.createElement("br", null), "Os trilhos do mundo inteiro."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-line"
}, "Sua empresa fala portugu\xEAs. Sua conta fala ", /*#__PURE__*/React.createElement("strong", null, "d\xF3lar, libra, euro, peso e real"), "."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-line"
}, "Voc\xEA paga e recebe. A Oren roteia por stablecoin, escrow e rails locais."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-line"
}, "Voc\xEA n\xE3o v\xEA blockchain, c\xE2mbio nem intermedi\xE1rios \u2014 v\xEA saldo, extrato e liquida\xE7\xE3o."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-close"
}, "A Stripe entrega a infraestrutura. A Oren entrega a experi\xEAncia.")), /*#__PURE__*/React.createElement(BFooter, {
  dark: true,
  page: p,
  total: t
})),
// 04 — Para quem é
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "04 \xB7 Para quem \xE9"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 04 \xB7 Para quem \xE9 ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "PARA QUEM \xC9"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Feito para quem opera entre fronteiras."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "5mm",
    marginTop: "7mm"
  }
}, /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "GRANDES REMESSAS",
  title: "Empres\xE1rios com remessas de alto valor",
  style: {
    minHeight: "41mm"
  }
}, "Envie e receba grandes volumes com c\xE2mbio mid-market e aprova\xE7\xE3o em minutos \u2014 n\xE3o semanas."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "PROTE\xC7\xC3O DE CAPITAL",
  title: "Quem precisa blindar patrim\xF4nio",
  style: {
    minHeight: "41mm"
  }
}, "Capital em d\xF3lar com cust\xF3dia institucional, fora do alcance de confiscos arbitr\xE1rios \u2014 sem abrir conta banc\xE1ria tradicional no exterior."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "COM\xC9RCIO EXTERIOR",
  title: "Empresas cross-border",
  style: {
    minHeight: "41mm"
  }
}, "Importadores, exportadores e servi\xE7os: pague fornecedores e receba de clientes em moeda local."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "RECEITA INTERNACIONAL",
  title: "E-commerce e SaaS",
  style: {
    minHeight: "41mm"
  }
}, "Receba de m\xFAltiplos pagadores no exterior e concilie automaticamente."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "RECEB\xCDVEIS NOS EUA",
  title: "Incorporadoras",
  style: {
    minHeight: "41mm"
  }
}, "Neg\xF3cios com receb\xEDveis americanos: capital em d\xF3lar com liquidez imediata."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "PATRIM\xD4NIO GLOBAL",
  title: "Family offices",
  style: {
    minHeight: "41mm"
  }
}, "Fam\xEDlias com patrim\xF4nio nos dois pa\xEDses: tesouraria multi-moeda, com privacidade e compliance."))), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 05 — Arquitetura
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "05 \xB7 Arquitetura"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 05 \xB7 Como funciona ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "COMO FUNCIONA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Como a Oren conecta a sua empresa ao mundo."), /*#__PURE__*/React.createElement("div", {
  className: "stack"
}, /*#__PURE__*/React.createElement("div", {
  className: "stack-row you"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Sua empresa"), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "App e plataforma Oren \u2014 identidade, extrato, suporte e concilia\xE7\xE3o.")), /*#__PURE__*/React.createElement("div", {
  className: "stack-row oren"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Oren ", /*#__PURE__*/React.createElement("em", null, "ORQUESTRA\xC7\xC3O & EXPERI\xCANCIA")), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "Roteamento entre trilhos, KYC/KYB e webhooks de cada movimento.")), /*#__PURE__*/React.createElement("div", {
  className: "stack-row bridge"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Stripe"), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "Infraestrutura de pagamentos licenciada \u2014 money transmitter nos EUA, NMLS #2450917.")), /*#__PURE__*/React.createElement("div", {
  className: "stack-row custody"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Cust\xF3dia institucional"), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "BlackRock & Fidelity \u2014 reservas 1:1 em caixa e T\xEDtulos do Tesouro dos EUA.")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chips"
}, /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "PIX"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "BRASIL")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "ACH / Wire"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "ESTADOS UNIDOS")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "Faster Payments"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "REINO UNIDO")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "SEPA"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "ZONA EURO")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "SPEI"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "M\xC9XICO")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "USDC"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "ON-CHAIN \xB7 SOLANA")))), /*#__PURE__*/React.createElement("p", {
  className: "stack-legend"
}, "A Oren opera a experi\xEAncia. A Stripe opera os trilhos. A cust\xF3dia fica com BlackRock e Fidelity. Os rails locais entregam o dinheiro.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
}))];
window.B2B_SLIDES_A = B2B_SLIDES_A;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b/slides-01-05.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b/slides-06-10.jsx
try { (() => {
/* Oren B2B — slides 06–10: panorâmica, PIX dois sentidos, regras por trilho,
   multi-rail internacional, tesouraria USDC. */

const {
  BSlide,
  BFooter,
  BBody,
  RuleBlock,
  FlowStep,
  HEADER_R,
  SHeader
} = window.OB2B;
const {
  Eyebrow,
  Callout,
  Stat
} = window.OrenDesignSystem_058acc;
const PANO = [["Tesouraria em dólar (USDC)", "Dólar digital · custódia institucional"], ["Pagamento via PIX", "Brasil"], ["Recebimento via PIX", "Brasil · PJ: de terceiros"], ["Onramp ACH / Wire", "Estados Unidos"], ["GBP · Faster Payments", "Reino Unido"], ["EUR · SEPA", "Zona Euro"], ["MXN · SPEI", "México"], ["Virtual Accounts", "Recebíveis recorrentes · conciliação"]];
const B2B_SLIDES_B = [
// 06 — Visão panorâmica
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "06 \xB7 Vis\xE3o panor\xE2mica"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 06 \xB7 Vis\xE3o panor\xE2mica ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "VIS\xC3O PANOR\xC2MICA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "O que a sua conta Oren faz."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Oito capacidades em produ\xE7\xE3o \u2014 uma conta, v\xE1rios trilhos."), /*#__PURE__*/React.createElement("div", {
  className: "pano-grid"
}, PANO.map(([title, region], i) => /*#__PURE__*/React.createElement("div", {
  className: "pano-item",
  key: i
}, /*#__PURE__*/React.createElement("div", {
  className: "pn"
}, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
  className: "pt"
}, title), /*#__PURE__*/React.createElement("div", {
  className: "pr"
}, region)))), /*#__PURE__*/React.createElement("p", {
  className: "table-note",
  style: {
    marginTop: "7mm"
  }
}, "Detalhe nas pr\xF3ximas p\xE1ginas.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 07 — PIX nos dois sentidos (escrow)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "07 \xB7 PIX com escrow"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 07 \xB7 Casos \xB7 Brasil ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "CASOS \xB7 BRASIL"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "PIX nos dois sentidos \u2014 com escrow e privacidade."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "flow-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "fc-label"
}, "PAGAR NO BRASIL \xB7 SA\xCDDA"), /*#__PURE__*/React.createElement(FlowStep, {
  n: "01"
}, /*#__PURE__*/React.createElement("strong", null, "USDC"), " sai da sua conta Oren."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "02"
}, "Convers\xE3o e roteamento via ", /*#__PURE__*/React.createElement("strong", null, "Stripe"), "."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "03"
}, "PIX sai de ", /*#__PURE__*/React.createElement("strong", null, "conta escrow"), " do parceiro brasileiro."), /*#__PURE__*/React.createElement("p", {
  className: "flow-note"
}, "O pagador original \u2014 sua empresa \u2014 n\xE3o aparece no extrato PIX do benefici\xE1rio.")), /*#__PURE__*/React.createElement("div", {
  className: "flow-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "fc-label"
}, "RECEBER NO BRASIL \xB7 ENTRADA"), /*#__PURE__*/React.createElement(FlowStep, {
  n: "01"
}, "Pagador faz PIX para a ", /*#__PURE__*/React.createElement("strong", null, "conta escrow"), " Oren."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "02"
}, /*#__PURE__*/React.createElement("strong", null, "Stripe"), " converte BRL em USDC."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "03"
}, "Saldo aparece na sua ", /*#__PURE__*/React.createElement("strong", null, "conta Oren"), "."), /*#__PURE__*/React.createElement("p", {
  className: "flow-note"
}, "O CPF/CNPJ do pagador n\xE3o circula em sistemas estrangeiros."))), /*#__PURE__*/React.createElement(Callout, {
  title: "CONTA ESCROW",
  style: {
    marginTop: "6mm"
  }
}, "Em cada ponta, a conta de escrow do parceiro local \xE9 a contraparte vis\xEDvel \u2014 protegendo pagador e benefici\xE1rio.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 08 — Recebimento de terceiros (regras por trilho)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "08 \xB7 Regras por trilho"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 08 \xB7 Regras por trilho ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "REGRAS POR TRILHO"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "250mm"
  }
}, "Quando voc\xEA pode receber de terceiros \u2014 e quando n\xE3o."), /*#__PURE__*/React.createElement("table", {
  className: "otable",
  style: {
    marginTop: "8mm"
  }
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
  style: {
    width: "44mm"
  }
}, "TRILHO"), /*#__PURE__*/React.createElement("th", {
  style: {
    width: "34mm"
  }
}, "REGI\xC3O"), /*#__PURE__*/React.createElement("th", {
  style: {
    width: "62mm"
  }
}, "RECEBE DE TERCEIROS?"), /*#__PURE__*/React.createElement("th", null, "OBSERVA\xC7\xC3O B2B"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "PIX \xB7 PF (CPF)"), /*#__PURE__*/React.createElement("td", null, "Brasil"), /*#__PURE__*/React.createElement("td", {
  className: "t-no"
}, "N\xE3o \u2014 apenas same-name"), /*#__PURE__*/React.createElement("td", null, "Pessoa f\xEDsica: titular do destino = remetente.")), /*#__PURE__*/React.createElement("tr", {
  className: "hl"
}, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "PIX \xB7 PJ (on/offshore)"), /*#__PURE__*/React.createElement("td", null, "Brasil"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Abre B2B, pagamento a fornecedores e splits.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "ACH / Wire"), /*#__PURE__*/React.createElement("td", null, "Estados Unidos"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Recebe de pagadores diversos.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "Faster Payments"), /*#__PURE__*/React.createElement("td", null, "Reino Unido"), /*#__PURE__*/React.createElement("td", {
  className: "t-no"
}, "Restrito \u2014 CoP"), /*#__PURE__*/React.createElement("td", null, "Verifica o nome do benefici\xE1rio; na pr\xE1tica, same-name.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "SEPA"), /*#__PURE__*/React.createElement("td", null, "Zona Euro"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Sem correspond\xEAncia de nome no envio padr\xE3o.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "SPEI"), /*#__PURE__*/React.createElement("td", null, "M\xE9xico"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Permite recebimento de terceiros.")))), /*#__PURE__*/React.createElement("p", {
  className: "table-note"
}, "Onde a regra \xE9 same-name, a Oren ", /*#__PURE__*/React.createElement("strong", null, "roteia"), ". Onde abre espa\xE7o para terceiros, a Oren ", /*#__PURE__*/React.createElement("strong", null, "habilita o caso de uso"), " \u2014 cobran\xE7a, B2B, splits.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 09 — Multi-rail internacional
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "09 \xB7 Multi-rail internacional"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 09 \xB7 Casos \xB7 Internacional ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "CASOS \xB7 INTERNACIONAL"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "Quatro continentes, quatro trilhos, uma conta."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Pague e receba em moeda local nos principais mercados \u2014 sem a fric\xE7\xE3o da remessa tradicional."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "7mm",
    marginTop: "12mm"
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "rail-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "rl-region"
}, "ESTADOS UNIDOS"), /*#__PURE__*/React.createElement("div", {
  className: "rl-ccy"
}, "USD"), /*#__PURE__*/React.createElement("div", {
  className: "rl-rail"
}, "ACH & Wire"), /*#__PURE__*/React.createElement("div", {
  className: "rl-desc"
}, "Funde e movimente d\xF3lar via banco americano \u2014 ACH para a rotina, Wire para valores altos ou urg\xEAncia.")), /*#__PURE__*/React.createElement("div", {
  className: "rail-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "rl-region"
}, "REINO UNIDO"), /*#__PURE__*/React.createElement("div", {
  className: "rl-ccy"
}, "GBP"), /*#__PURE__*/React.createElement("div", {
  className: "rl-rail"
}, "Faster Payments"), /*#__PURE__*/React.createElement("div", {
  className: "rl-desc"
}, "Libra em tempo real \u2014 liquida\xE7\xE3o em segundos."), /*#__PURE__*/React.createElement("div", {
  className: "rl-src"
}, "Disponibilidade geral desde mar/2026.")), /*#__PURE__*/React.createElement("div", {
  className: "rail-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "rl-region"
}, "ZONA EURO"), /*#__PURE__*/React.createElement("div", {
  className: "rl-ccy"
}, "EUR"), /*#__PURE__*/React.createElement("div", {
  className: "rl-rail"
}, "SEPA"), /*#__PURE__*/React.createElement("div", {
  className: "rl-desc"
}, "Euro com custo previs\xEDvel e liquida\xE7\xE3o em horas.")), /*#__PURE__*/React.createElement("div", {
  className: "rail-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "rl-region"
}, "M\xC9XICO"), /*#__PURE__*/React.createElement("div", {
  className: "rl-ccy"
}, "MXN"), /*#__PURE__*/React.createElement("div", {
  className: "rl-rail"
}, "SPEI"), /*#__PURE__*/React.createElement("div", {
  className: "rl-desc"
}, "Peso em tempo real, sem a fric\xE7\xE3o da remessa tradicional.")))), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 10 — Tesouraria em dólar digital
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "10 \xB7 Tesouraria USDC"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 10 \xB7 Tesouraria ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "TESOURARIA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Um cofre em d\xF3lar para a sua empresa."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr",
    gap: "16mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gap: "5mm",
    alignContent: "start"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  label: "SALDO EM USDC"
}, "D\xF3lar digital 1:1, com reservas em caixa e T\xEDtulos do Tesouro dos EUA sob gest\xE3o de ", /*#__PURE__*/React.createElement("strong", null, "BlackRock e Fidelity"), "."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "CUST\xD3DIA E SEGREGA\xC7\xC3O"
}, "Recursos ", /*#__PURE__*/React.createElement("strong", null, "segregados por cliente"), "; conta com account e routing number pr\xF3prios; USD em banco FDIC-insured."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "PRONTO PARA QUALQUER RAIL"
}, "O saldo converte para PIX, ACH/Wire, Faster Payments, SEPA ou SPEI a qualquer momento.")), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gap: "7mm",
    alignContent: "start"
  }
}, /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "1:1",
  label: "Lastro integral em caixa + Treasuries.",
  source: "Reservas sob gest\xE3o de BlackRock e Fidelity."
}), /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "24/7",
  label: "Liquida\xE7\xE3o cont\xEDnua, inclusive feriados.",
  source: "Rede Solana \u2014 confirma\xE7\xE3o em segundos, custo m\xEDnimo."
}))), /*#__PURE__*/React.createElement(Callout, {
  style: {
    marginTop: "7mm"
  }
}, "Voc\xEA n\xE3o opera blockchain. Voc\xEA opera d\xF3lar digital.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
}))];
window.B2B_SLIDES_B = B2B_SLIDES_B;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b/slides-06-10.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b/slides-11-15.jsx
try { (() => {
/* Oren B2B — slides 11–14: privacidade, credibilidade, comparativo, jornada + CTA. */

const {
  BSlide,
  BFooter,
  BBody,
  RuleBlock,
  FlowStep,
  HEADER_R,
  SHeader,
  SmallSymbol
} = window.OB2B;
const {
  Eyebrow,
  Callout,
  PhaseBox
} = window.OrenDesignSystem_058acc;
const JOURNEY = [["Cadastro", "Sua empresa cria a conta Oren."], ["KYC / KYB", "Verificação da empresa e dos sócios via parceiro regulado."], ["Conta ativada", "Identificadores próprios e conta em dólar."], ["Funding", "Via PIX (BR), ACH/Wire (EUA) ou outro rail."], ["Operação", "Envie, receba, converta — multi-rail, mesma conta."], ["Conciliação", "Webhooks notificam cada movimento; extrato sempre atualizado."]];
const B2B_SLIDES_C = [
// 11 — Privacidade por design
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "11 \xB7 Privacidade por design"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 11 \xB7 Privacidade & compliance ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "PRIVACIDADE & COMPLIANCE"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Privacidade leg\xEDtima, em tr\xEAs camadas."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "5mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "CAMADA 01",
  title: "Privacidade do pagador"
}, "Quem envia n\xE3o tem o nome exposto em sistemas estrangeiros. O CPF/CNPJ fica restrito ao parceiro brasileiro; o SSN/EIN, ao parceiro americano."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "CAMADA 02",
  title: "Privacidade do benefici\xE1rio"
}, "Quem recebe n\xE3o revela nome nem conta ao pagador original \u2014 a conta escrow \xE9 a contraparte vis\xEDvel."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "CAMADA 03",
  title: "N\xE3o-rastreabilidade entre contrapartes"
}, "Pagador e benefici\xE1rio n\xE3o compartilham infraestrutura banc\xE1ria. O elo \xE9 a Oren + Stripe \u2014 reguladas, com KYC pleno, operando como ponte.")), /*#__PURE__*/React.createElement(Callout, {
  title: "COMPLIANCE PLENO",
  style: {
    marginTop: "8mm"
  }
}, "Privacidade entre contrapartes \u2014 n\xE3o anonimato. Toda opera\xE7\xE3o segue KYC, AML e reporting regulat\xF3rio integral nas jurisdi\xE7\xF5es aplic\xE1veis.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 12 — Credibilidade & compliance
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "12 \xB7 Credibilidade"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 12 \xB7 Por que confiar ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "POR QUE CONFIAR"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "Infraestrutura licenciada, lastro institucional."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "O dinheiro da sua empresa corre sobre os mesmos trilhos e ativos das maiores institui\xE7\xF5es do mundo."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6mm",
    marginTop: "11mm"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  label: "STRIPE"
}, "Infraestrutura de pagamentos licenciada nos EUA \u2014 money transmitter ", /*#__PURE__*/React.createElement("strong", null, "NMLS #2450917"), "; presente em 100+ pa\xEDses."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "LASTRO 1:1"
}, "Caixa + T\xEDtulos do Tesouro dos EUA sob gest\xE3o de ", /*#__PURE__*/React.createElement("strong", null, "BlackRock e Fidelity"), "."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "CUST\xD3DIA SEGURA"
}, "Recursos segregados por cliente; contas USD em banco ", /*#__PURE__*/React.createElement("strong", null, "FDIC-insured"), "."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "COMPLIANCE INTEGRADO"
}, /*#__PURE__*/React.createElement("strong", null, "KYC, KYB, AML e OFAC"), " em todos os clientes."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "RASTREABILIDADE"
}, "Liquida\xE7\xE3o audit\xE1vel on-chain, disponibilidade 24/7.")), /*#__PURE__*/React.createElement("p", {
  className: "table-note",
  style: {
    marginTop: "9mm"
  }
}, "Licen\xE7a verific\xE1vel em NMLS Consumer Access (#2450917).")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 13 — Por que Oren (comparativo)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "13 \xB7 Comparativo"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 13 \xB7 Comparativo ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "COMPARATIVO"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "250mm"
  }
}, "Por que Oren \u2014 e n\xE3o o banco de sempre."), /*#__PURE__*/React.createElement("table", {
  className: "cmp",
  style: {
    marginTop: "7mm"
  }
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
  style: {
    width: "76mm",
    paddingLeft: 0
  }
}, "CRIT\xC9RIO"), /*#__PURE__*/React.createElement("th", {
  className: "c-oren",
  style: {
    width: "98mm"
  }
}, "OREN"), /*#__PURE__*/React.createElement("th", null, "BANCO / SWIFT"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Abertura de conta"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Dias \u2014 onboarding digital"), /*#__PURE__*/React.createElement("td", null, "Semanas a meses")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Aprova\xE7\xE3o de remessas"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Minutos \u2014 compliance integrado"), /*#__PURE__*/React.createElement("td", null, "Manual, caso a caso")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Velocidade de liquida\xE7\xE3o"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Minutos, 24/7"), /*#__PURE__*/React.createElement("td", null, "2\u20135 dias")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "C\xE2mbio"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Mid-market, transparente"), /*#__PURE__*/React.createElement("td", null, "Spread alto")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Custo all-in"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "~2%, sem letra mi\xFAda*"), /*#__PURE__*/React.createElement("td", null, "Alto + tarifas")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "D\xF3lar digital / tesouraria"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim \u2014 USDC, cust\xF3dia institucional"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
  className: "dash"
}, "\u2014"))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Multi-rail em uma conta"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim \u2014 PIX, ACH, FPS, SEPA, SPEI"), /*#__PURE__*/React.createElement("td", null, "Fragmentado")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Recebimento de terceiros (PJ)"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim"), /*#__PURE__*/React.createElement("td", null, "Depende")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Escrow + concilia\xE7\xE3o"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
  className: "dash"
}, "\u2014"))))), /*#__PURE__*/React.createElement("p", {
  className: "table-note"
}, "*Valor de refer\xEAncia \u2014 condi\xE7\xF5es sob proposta. Pre\xE7o \xE9 desempate: o valor \xE9 ", /*#__PURE__*/React.createElement("strong", null, "acesso, experi\xEAncia e seguran\xE7a"), ".")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 14 — Jornada + próximos passos
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "14 \xB7 Jornada e pr\xF3ximos passos"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 14 \xB7 Como come\xE7ar ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement("div", {
  style: {
    position: "absolute",
    top: "18mm",
    left: "14mm",
    right: "14mm"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "COMO COME\xC7AR"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "Da abertura da conta \xE0 primeira opera\xE7\xE3o."), /*#__PURE__*/React.createElement("div", {
  className: "journey"
}, JOURNEY.map(([title, desc], i) => /*#__PURE__*/React.createElement("div", {
  className: "j-step",
  key: i
}, /*#__PURE__*/React.createElement("div", {
  className: "flow-badge"
}, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
  className: "jt"
}, title), /*#__PURE__*/React.createElement("div", {
  className: "jd"
}, desc))))), /*#__PURE__*/React.createElement("div", {
  className: "cta-band"
}, /*#__PURE__*/React.createElement(SmallSymbol, {
  tone: "cream",
  top: "14mm",
  left: "252mm"
}), /*#__PURE__*/React.createElement("p", {
  className: "cta-title"
}, "Vamos abrir a conta da sua empresa."), /*#__PURE__*/React.createElement("p", {
  className: "cta-sub"
}, "Uma conta. Os trilhos do mundo inteiro. ", /*#__PURE__*/React.createElement("strong", null, "Oren."))), /*#__PURE__*/React.createElement(BFooter, {
  dark: true,
  page: p,
  total: t
}))];
window.B2B_SLIDES_C = B2B_SLIDES_C;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b/slides-11-15.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b_v1_backup/chrome-b2b.jsx
try { (() => {
/* Oren B2B deck — chrome local.
   Reusa o Stage/SHeader/Watermark/SmallSymbol do kit de deck (window.OrenDeck),
   mas substitui o rodapé: este deck é da marca única Oren — a house-line com
   sub-marcas (Uaipay) não aparece. Rodapé: OREN · POWERED BY BRIDGE + confidencial. */

const {
  SHeader,
  Watermark,
  SmallSymbol
} = window.OrenDeck;
const HEADER_R = "Oren · Plataforma financeira global";

/* Slide local — igual ao do kit, mas aceita data-screen-label. */
function BSlide({
  dark,
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "slide" + (dark ? " dark" : ""),
    "data-screen-label": label
  }, children);
}
function BFooter({
  page,
  total,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "s-footer" + (dark ? " on-dark" : "")
  }, /*#__PURE__*/React.createElement("span", {
    className: "house-line"
  }, "OREN", /*#__PURE__*/React.createElement("span", null, "\xB7"), "POWERED\xA0BY\xA0BRIDGE"), /*#__PURE__*/React.createElement("span", {
    className: "conf-line"
  }, "Confidencial \u2014 uso corporativo"), /*#__PURE__*/React.createElement("span", {
    className: "pagenum"
  }, String(page).padStart(2, "0"), " / ", String(total).padStart(2, "0")));
}

/* Região de corpo entre header e footer. */
function BBody({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "18mm",
      bottom: "21mm",
      left: "14mm",
      right: "14mm",
      ...style
    }
  }, children);
}

/* Bloco de prova/atrito: filete superior + rótulo UPPERCASE + corpo. */
function RuleBlock({
  label,
  tone = "mid",
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rule-block" + (tone === "muted" ? " muted" : "")
  }, /*#__PURE__*/React.createElement("div", {
    className: "rb-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "rb-body"
  }, children));
}

/* Passo de fluxo compacto: badge circular + uma linha. */
function FlowStep({
  n,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flow-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flow-badge"
  }, n), /*#__PURE__*/React.createElement("div", {
    className: "flow-text"
  }, children));
}
Object.assign(window, {
  OB2B: {
    BSlide,
    BFooter,
    BBody,
    RuleBlock,
    FlowStep,
    HEADER_R,
    SHeader,
    Watermark,
    SmallSymbol
  }
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b_v1_backup/chrome-b2b.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b_v1_backup/slides-01-05.jsx
try { (() => {
/* Oren B2B — slides 01–05: capa, problema, tese, arquitetura, para quem é. */

const {
  BSlide,
  BFooter,
  BBody,
  RuleBlock,
  HEADER_R,
  SHeader,
  Watermark,
  SmallSymbol
} = window.OB2B;
const {
  Eyebrow,
  CardIt,
  Callout
} = window.OrenDesignSystem_058acc;
const B2B_SLIDES_A = [
// 01 — Capa
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  dark: true,
  label: "01 \xB7 Capa"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ Deck \xB7 Apresenta\xE7\xE3o Institucional ]",
  right: "v1.0 \xB7 Junho 2026"
}), /*#__PURE__*/React.createElement(Watermark, null), /*#__PURE__*/React.createElement(SmallSymbol, {
  tone: "cream",
  top: "22mm",
  left: "14mm"
}), /*#__PURE__*/React.createElement("div", {
  className: "cover-title"
}, /*#__PURE__*/React.createElement("div", {
  className: "cover-eyebrow"
}, "PLATAFORMA FINANCEIRA GLOBAL \xB7 PARA EMPRESAS E FAMILY OFFICES"), /*#__PURE__*/React.createElement("h1", {
  className: "headline-xxl",
  style: {
    color: "var(--oren-cream)"
  }
}, "Oren"), /*#__PURE__*/React.createElement("p", {
  className: "cover-sub"
}, "A infraestrutura que move o capital da sua empresa entre Brasil, EUA e o mundo.")), /*#__PURE__*/React.createElement("div", {
  className: "cover-meta"
}, /*#__PURE__*/React.createElement("div", {
  className: "l"
}, /*#__PURE__*/React.createElement("div", {
  className: "name"
}, "Oren"), /*#__PURE__*/React.createElement("div", null, "Operado pela Oren \xB7 Powered by Bridge")), /*#__PURE__*/React.createElement("div", {
  className: "r"
}, /*#__PURE__*/React.createElement("div", {
  className: "doc-id"
}, "DECK \xB7 ORN-B2B-01 \xB7 v1.0"), /*#__PURE__*/React.createElement("div", null, "Junho 2026 \xB7 Confidencial \u2014 uso corporativo")))),
// 02 — O problema
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "02 \xB7 O problema"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 02 \xB7 O problema ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "O PROBLEMA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Operar dinheiro entre pa\xEDses", /*#__PURE__*/React.createElement("br", null), "ainda \xE9 caro, lento e opaco."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Sua empresa perde dias e margem em cada movimento internacional."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6mm",
    marginTop: "10mm"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "LENTO"
}, "Transfer\xEAncias internacionais levam ", /*#__PURE__*/React.createElement("strong", null, "2\u20135 dias"), " e passam por intermedi\xE1rios que ningu\xE9m controla."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "OPACO"
}, "C\xE2mbio com spread escondido e letra mi\xFAda \u2014 voc\xEA n\xE3o sabe o custo real."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "BUROCR\xC1TICO"
}, "Bancos avessos a risco, contas travadas e fric\xE7\xE3o para quem opera cross-border."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "EXPOSTO"
}, "Capital preso \xE0 volatilidade do real, sem um lugar l\xEDquido para guardar em d\xF3lar."), /*#__PURE__*/React.createElement(RuleBlock, {
  tone: "muted",
  label: "MANUAL"
}, "Receber de clientes l\xE1 fora e pagar fornecedores em moeda local: reconcilia\xE7\xE3o na planilha."))), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 03 — A tese (dark)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  dark: true,
  label: "03 \xB7 A tese"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ 03 \xB7 A tese ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "dark",
  style: {
    marginBottom: "6mm"
  }
}, "A TESE"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-xl",
  style: {
    maxWidth: "235mm",
    marginBottom: "10mm"
  }
}, "Uma \xFAnica conta.", /*#__PURE__*/React.createElement("br", null), "Os trilhos do mundo inteiro."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-line"
}, "Sua empresa fala portugu\xEAs. Sua conta fala ", /*#__PURE__*/React.createElement("strong", null, "d\xF3lar, libra, euro, peso e real"), "."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-line"
}, "Voc\xEA paga e recebe. A Oren roteia por stablecoin, escrow e rails locais."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-line"
}, "Voc\xEA n\xE3o v\xEA blockchain, c\xE2mbio nem intermedi\xE1rios \u2014 v\xEA saldo, extrato e liquida\xE7\xE3o."), /*#__PURE__*/React.createElement("p", {
  className: "thesis-close"
}, "A Bridge entrega a infraestrutura. A Oren entrega a experi\xEAncia.")), /*#__PURE__*/React.createElement(BFooter, {
  dark: true,
  page: p,
  total: t
})),
// 04 — Arquitetura
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "04 \xB7 Arquitetura"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 04 \xB7 Como funciona ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "COMO FUNCIONA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Como a Oren conecta a sua empresa ao mundo."), /*#__PURE__*/React.createElement("div", {
  className: "stack"
}, /*#__PURE__*/React.createElement("div", {
  className: "stack-row you"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Sua empresa"), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "App e plataforma Oren \u2014 identidade, extrato, suporte e concilia\xE7\xE3o.")), /*#__PURE__*/React.createElement("div", {
  className: "stack-row oren"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Oren ", /*#__PURE__*/React.createElement("em", null, "ORQUESTRA\xC7\xC3O & EXPERI\xCANCIA")), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "Roteamento entre trilhos, KYC/KYB e webhooks de cada movimento.")), /*#__PURE__*/React.createElement("div", {
  className: "stack-row bridge"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Bridge"), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "Infraestrutura BaaS licenciada \u2014 money transmitter nos EUA, NMLS #2450917.")), /*#__PURE__*/React.createElement("div", {
  className: "stack-row custody"
}, /*#__PURE__*/React.createElement("div", {
  className: "sr-name"
}, "Cust\xF3dia institucional"), /*#__PURE__*/React.createElement("div", {
  className: "sr-desc"
}, "BlackRock & Fidelity \u2014 reservas 1:1 em caixa e T\xEDtulos do Tesouro dos EUA.")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chips"
}, /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "PIX"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "BRASIL")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "ACH / Wire"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "ESTADOS UNIDOS")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "Faster Payments"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "REINO UNIDO")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "SEPA"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "ZONA EURO")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "SPEI"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "M\xC9XICO")), /*#__PURE__*/React.createElement("div", {
  className: "rail-chip"
}, /*#__PURE__*/React.createElement("div", {
  className: "rc-name"
}, "USDC"), /*#__PURE__*/React.createElement("div", {
  className: "rc-region"
}, "ON-CHAIN \xB7 SOLANA")))), /*#__PURE__*/React.createElement("p", {
  className: "stack-legend"
}, "A Oren opera a experi\xEAncia. A Bridge opera os trilhos. A cust\xF3dia fica com BlackRock e Fidelity. Os rails locais entregam o dinheiro.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 05 — Para quem é
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "05 \xB7 Para quem \xE9"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 05 \xB7 Para quem \xE9 ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "PARA QUEM \xC9"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Feito para quem opera entre fronteiras."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "5mm",
    marginTop: "8mm"
  }
}, /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "COM\xC9RCIO EXTERIOR",
  title: "Empresas cross-border"
}, "Importadores, exportadores e servi\xE7os: pague fornecedores e receba de clientes em moeda local."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "RECEITA INTERNACIONAL",
  title: "E-commerce e SaaS"
}, "Receba de m\xFAltiplos pagadores no exterior e concilie automaticamente."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "RECEB\xCDVEIS NOS EUA",
  title: "Incorporadoras"
}, "Neg\xF3cios com receb\xEDveis americanos: capital em d\xF3lar com liquidez imediata."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "PATRIM\xD4NIO GLOBAL",
  title: "Family offices"
}, "Fam\xEDlias com patrim\xF4nio nos dois pa\xEDses: tesouraria em d\xF3lar, multi-moeda, com privacidade e compliance.")), /*#__PURE__*/React.createElement(Callout, {
  style: {
    marginTop: "8mm"
  }
}, "E para quem precisa proteger capital em d\xF3lar sem abrir conta banc\xE1ria tradicional no exterior.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
}))];
window.B2B_SLIDES_A = B2B_SLIDES_A;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b_v1_backup/slides-01-05.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b_v1_backup/slides-06-10.jsx
try { (() => {
/* Oren B2B — slides 06–10: panorâmica, PIX dois sentidos, regras por trilho,
   multi-rail internacional, tesouraria USDC. */

const {
  BSlide,
  BFooter,
  BBody,
  RuleBlock,
  FlowStep,
  HEADER_R,
  SHeader
} = window.OB2B;
const {
  Eyebrow,
  Callout,
  Stat
} = window.OrenDesignSystem_058acc;
const PANO = [["Tesouraria em dólar (USDC)", "Dólar digital · custódia institucional"], ["Pagamento via PIX", "Brasil"], ["Recebimento via PIX", "Brasil · PJ: de terceiros"], ["Onramp ACH / Wire", "Estados Unidos"], ["GBP · Faster Payments", "Reino Unido"], ["EUR · SEPA", "Zona Euro"], ["MXN · SPEI", "México"], ["Virtual Accounts", "Recebíveis recorrentes · conciliação"]];
const B2B_SLIDES_B = [
// 06 — Visão panorâmica
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "06 \xB7 Vis\xE3o panor\xE2mica"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 06 \xB7 Vis\xE3o panor\xE2mica ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "VIS\xC3O PANOR\xC2MICA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "O que a sua conta Oren faz."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Oito capacidades em produ\xE7\xE3o \u2014 uma conta, v\xE1rios trilhos."), /*#__PURE__*/React.createElement("div", {
  className: "pano-grid"
}, PANO.map(([title, region], i) => /*#__PURE__*/React.createElement("div", {
  className: "pano-item",
  key: i
}, /*#__PURE__*/React.createElement("div", {
  className: "pn"
}, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
  className: "pt"
}, title), /*#__PURE__*/React.createElement("div", {
  className: "pr"
}, region)))), /*#__PURE__*/React.createElement("p", {
  className: "table-note",
  style: {
    marginTop: "7mm"
  }
}, "Detalhe nas pr\xF3ximas p\xE1ginas.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 07 — PIX nos dois sentidos (escrow)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "07 \xB7 PIX com escrow"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 07 \xB7 Casos \xB7 Brasil ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "CASOS \xB7 BRASIL"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "PIX nos dois sentidos \u2014 com escrow e privacidade."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "flow-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "fc-label"
}, "PAGAR NO BRASIL \xB7 SA\xCDDA"), /*#__PURE__*/React.createElement(FlowStep, {
  n: "01"
}, /*#__PURE__*/React.createElement("strong", null, "USDC"), " sai da sua conta Oren."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "02"
}, "Convers\xE3o e roteamento via ", /*#__PURE__*/React.createElement("strong", null, "Bridge"), "."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "03"
}, "PIX sai de ", /*#__PURE__*/React.createElement("strong", null, "conta escrow"), " do parceiro brasileiro."), /*#__PURE__*/React.createElement("p", {
  className: "flow-note"
}, "O pagador original \u2014 sua empresa \u2014 n\xE3o aparece no extrato PIX do benefici\xE1rio.")), /*#__PURE__*/React.createElement("div", {
  className: "flow-col"
}, /*#__PURE__*/React.createElement("div", {
  className: "fc-label"
}, "RECEBER NO BRASIL \xB7 ENTRADA"), /*#__PURE__*/React.createElement(FlowStep, {
  n: "01"
}, "Pagador faz PIX para a ", /*#__PURE__*/React.createElement("strong", null, "conta escrow"), " Oren."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "02"
}, /*#__PURE__*/React.createElement("strong", null, "Bridge"), " converte BRL em USDC."), /*#__PURE__*/React.createElement(FlowStep, {
  n: "03"
}, "Saldo aparece na sua ", /*#__PURE__*/React.createElement("strong", null, "conta Oren"), "."), /*#__PURE__*/React.createElement("p", {
  className: "flow-note"
}, "O CPF/CNPJ do pagador n\xE3o circula em sistemas estrangeiros."))), /*#__PURE__*/React.createElement(Callout, {
  title: "CONTA ESCROW",
  style: {
    marginTop: "6mm"
  }
}, "Em cada ponta, a conta de escrow do parceiro local \xE9 a contraparte vis\xEDvel \u2014 protegendo pagador e benefici\xE1rio.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 08 — Recebimento de terceiros (regras por trilho)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "08 \xB7 Regras por trilho"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 08 \xB7 Regras por trilho ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "REGRAS POR TRILHO"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "250mm"
  }
}, "Quando voc\xEA pode receber de terceiros \u2014 e quando n\xE3o."), /*#__PURE__*/React.createElement("table", {
  className: "otable",
  style: {
    marginTop: "8mm"
  }
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
  style: {
    width: "44mm"
  }
}, "TRILHO"), /*#__PURE__*/React.createElement("th", {
  style: {
    width: "34mm"
  }
}, "REGI\xC3O"), /*#__PURE__*/React.createElement("th", {
  style: {
    width: "62mm"
  }
}, "RECEBE DE TERCEIROS?"), /*#__PURE__*/React.createElement("th", null, "OBSERVA\xC7\xC3O B2B"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "PIX \xB7 PF (CPF)"), /*#__PURE__*/React.createElement("td", null, "Brasil"), /*#__PURE__*/React.createElement("td", {
  className: "t-no"
}, "N\xE3o \u2014 apenas same-name"), /*#__PURE__*/React.createElement("td", null, "Pessoa f\xEDsica: titular do destino = remetente.")), /*#__PURE__*/React.createElement("tr", {
  className: "hl"
}, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "PIX \xB7 PJ (on/offshore)"), /*#__PURE__*/React.createElement("td", null, "Brasil"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Abre B2B, pagamento a fornecedores e splits.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "ACH / Wire"), /*#__PURE__*/React.createElement("td", null, "Estados Unidos"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Recebe de pagadores diversos.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "Faster Payments"), /*#__PURE__*/React.createElement("td", null, "Reino Unido"), /*#__PURE__*/React.createElement("td", {
  className: "t-no"
}, "Restrito \u2014 CoP"), /*#__PURE__*/React.createElement("td", null, "Verifica o nome do benefici\xE1rio; na pr\xE1tica, same-name.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "SEPA"), /*#__PURE__*/React.createElement("td", null, "Zona Euro"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Sem correspond\xEAncia de nome no envio padr\xE3o.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "t-rail"
}, "SPEI"), /*#__PURE__*/React.createElement("td", null, "M\xE9xico"), /*#__PURE__*/React.createElement("td", {
  className: "t-yes"
}, "Sim \u2014 non-same-name"), /*#__PURE__*/React.createElement("td", null, "Permite recebimento de terceiros.")))), /*#__PURE__*/React.createElement("p", {
  className: "table-note"
}, "Onde a regra \xE9 same-name, a Oren ", /*#__PURE__*/React.createElement("strong", null, "roteia"), ". Onde abre espa\xE7o para terceiros, a Oren ", /*#__PURE__*/React.createElement("strong", null, "habilita o caso de uso"), " \u2014 cobran\xE7a, B2B, splits.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 09 — Multi-rail internacional
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "09 \xB7 Multi-rail internacional"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 09 \xB7 Casos \xB7 Internacional ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "CASOS \xB7 INTERNACIONAL"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "Quatro continentes, quatro trilhos, uma conta."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Pague e receba em moeda local nos principais mercados \u2014 sem a fric\xE7\xE3o da remessa tradicional."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "7mm",
    marginTop: "10mm"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  label: "ESTADOS UNIDOS"
}, /*#__PURE__*/React.createElement("strong", null, "ACH & Wire."), " Funde e movimente USD via banco americano \u2014 ACH para a rotina, Wire para valores altos ou urg\xEAncia."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "REINO UNIDO"
}, /*#__PURE__*/React.createElement("strong", null, "Faster Payments."), " GBP em tempo real \u2014 liquida\xE7\xE3o em segundos. ", /*#__PURE__*/React.createElement("em", {
  style: {
    color: "var(--text-light)"
  }
}, "Disponibilidade geral desde mar/2026.")), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "ZONA EURO"
}, /*#__PURE__*/React.createElement("strong", null, "SEPA."), " Euro com custo previs\xEDvel e liquida\xE7\xE3o em horas."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "M\xC9XICO"
}, /*#__PURE__*/React.createElement("strong", null, "SPEI."), " Pesos em tempo real, sem a fric\xE7\xE3o da remessa tradicional."))), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 10 — Tesouraria em dólar digital
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "10 \xB7 Tesouraria USDC"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 10 \xB7 Tesouraria ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "TESOURARIA"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Um cofre em d\xF3lar para a sua empresa."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr",
    gap: "16mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gap: "5mm",
    alignContent: "start"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  label: "SALDO EM USDC"
}, "D\xF3lar digital 1:1, com reservas em caixa e T\xEDtulos do Tesouro dos EUA sob gest\xE3o de ", /*#__PURE__*/React.createElement("strong", null, "BlackRock e Fidelity"), "."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "CUST\xD3DIA E SEGREGA\xC7\xC3O"
}, "Recursos ", /*#__PURE__*/React.createElement("strong", null, "segregados por cliente"), "; conta com account e routing number pr\xF3prios; USD em banco FDIC-insured."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "PRONTO PARA QUALQUER RAIL"
}, "O saldo converte para PIX, ACH/Wire, Faster Payments, SEPA ou SPEI a qualquer momento.")), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gap: "7mm",
    alignContent: "start"
  }
}, /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "1:1",
  label: "Lastro integral em caixa + Treasuries.",
  source: "Reservas sob gest\xE3o de BlackRock e Fidelity."
}), /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "24/7",
  label: "Liquida\xE7\xE3o cont\xEDnua, inclusive feriados.",
  source: "Rede Solana \u2014 confirma\xE7\xE3o em segundos, custo m\xEDnimo."
}))), /*#__PURE__*/React.createElement(Callout, {
  style: {
    marginTop: "7mm"
  }
}, "Voc\xEA n\xE3o opera blockchain. Voc\xEA opera d\xF3lar digital.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
}))];
window.B2B_SLIDES_B = B2B_SLIDES_B;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b_v1_backup/slides-06-10.jsx", error: String((e && e.message) || e) }); }

// decks/oren_b2b_v1_backup/slides-11-15.jsx
try { (() => {
/* Oren B2B — slides 11–15: virtual accounts, privacidade, credibilidade,
   comparativo, jornada + CTA. */

const {
  BSlide,
  BFooter,
  BBody,
  RuleBlock,
  FlowStep,
  HEADER_R,
  SHeader,
  SmallSymbol
} = window.OB2B;
const {
  Eyebrow,
  Callout,
  PhaseBox
} = window.OrenDesignSystem_058acc;
const JOURNEY = [["Cadastro", "Sua empresa cria a conta Oren."], ["KYC / KYB", "Verificação da empresa e dos sócios via parceiro regulado."], ["Conta ativada", "Identificadores próprios e conta em dólar."], ["Funding", "Via PIX (BR), ACH/Wire (EUA) ou outro rail."], ["Operação", "Envie, receba, converta — multi-rail, mesma conta."], ["Conciliação", "Webhooks notificam cada movimento; extrato sempre atualizado."]];
const B2B_SLIDES_C = [
// 11 — Virtual Accounts
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "11 \xB7 Virtual Accounts"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 11 \xB7 Receb\xEDveis recorrentes ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "RECEB\xCDVEIS RECORRENTES"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "250mm"
  }
}, "Cada pagador entra com o pr\xF3prio endere\xE7o.", /*#__PURE__*/React.createElement("br", null), "Voc\xEA concilia sem planilha."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr",
    gap: "16mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gap: "5mm",
    alignContent: "start"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  label: "IDENTIFICADOR \xDANICO"
}, "Cada cliente ou cobran\xE7a recebe um identificador pr\xF3prio \u2014 memo est\xE1tico ou conta virtual."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "CONCILIA\xC7\xC3O AUTOM\xC1TICA"
}, "Pagamentos recebidos s\xE3o reconciliados sem interven\xE7\xE3o manual \u2014 ideal para ", /*#__PURE__*/React.createElement("strong", null, "PJ que cobra clientes regulares"), ", assinaturas ou m\xFAltiplos pagadores."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "WEBHOOKS"
}, "Cada movimento gera notifica\xE7\xE3o \u2014 o extrato fica sempre atualizado.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("table", {
  className: "va"
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "PAGADOR"), /*#__PURE__*/React.createElement("th", null, "IDENTIFICADOR"), /*#__PURE__*/React.createElement("th", null, "STATUS"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Cliente A"), /*#__PURE__*/React.createElement("td", {
  className: "va-id"
}, "VA-0193"), /*#__PURE__*/React.createElement("td", {
  className: "va-ok"
}, "Conciliado")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Cliente B"), /*#__PURE__*/React.createElement("td", {
  className: "va-id"
}, "VA-0247"), /*#__PURE__*/React.createElement("td", {
  className: "va-ok"
}, "Conciliado")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Cliente C"), /*#__PURE__*/React.createElement("td", {
  className: "va-id"
}, "VA-0312"), /*#__PURE__*/React.createElement("td", null, "Aguardando")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "Cliente D"), /*#__PURE__*/React.createElement("td", {
  className: "va-id"
}, "VA-0358"), /*#__PURE__*/React.createElement("td", {
  className: "va-ok"
}, "Conciliado")))), /*#__PURE__*/React.createElement("p", {
  className: "table-note",
  style: {
    marginTop: "3.5mm"
  }
}, "Exemplo ilustrativo de extrato conciliado.")))), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 12 — Privacidade por design
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "12 \xB7 Privacidade por design"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 12 \xB7 Privacidade & compliance ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "PRIVACIDADE & COMPLIANCE"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Privacidade leg\xEDtima, em tr\xEAs camadas."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "5mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "CAMADA 01",
  title: "Privacidade do pagador"
}, "Quem envia n\xE3o tem o nome exposto em sistemas estrangeiros. O CPF/CNPJ fica restrito ao parceiro brasileiro; o SSN/EIN, ao parceiro americano."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "CAMADA 02",
  title: "Privacidade do benefici\xE1rio"
}, "Quem recebe n\xE3o revela nome nem conta ao pagador original \u2014 a conta escrow \xE9 a contraparte vis\xEDvel."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "CAMADA 03",
  title: "N\xE3o-rastreabilidade entre contrapartes"
}, "Pagador e benefici\xE1rio n\xE3o compartilham infraestrutura banc\xE1ria. O elo \xE9 a Oren + Bridge \u2014 reguladas, com KYC pleno, operando como ponte.")), /*#__PURE__*/React.createElement(Callout, {
  title: "COMPLIANCE PLENO",
  style: {
    marginTop: "8mm"
  }
}, "Privacidade entre contrapartes \u2014 n\xE3o anonimato. Toda opera\xE7\xE3o segue KYC, AML e reporting regulat\xF3rio integral nas jurisdi\xE7\xF5es aplic\xE1veis.")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 13 — Credibilidade & compliance
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "13 \xB7 Credibilidade"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 13 \xB7 Por que confiar ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "POR QUE CONFIAR"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "Infraestrutura licenciada, lastro institucional."), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "O dinheiro da sua empresa corre sobre os mesmos trilhos e ativos das maiores institui\xE7\xF5es do mundo."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6mm",
    marginTop: "10mm"
  }
}, /*#__PURE__*/React.createElement(RuleBlock, {
  label: "BRIDGE"
}, "Money transmitter licenciado nos EUA \u2014 ", /*#__PURE__*/React.createElement("strong", null, "NMLS #2450917"), ". Adquirida pela Stripe (2025); presente em 100+ pa\xEDses."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "LASTRO 1:1"
}, "Caixa + T\xEDtulos do Tesouro dos EUA sob gest\xE3o de ", /*#__PURE__*/React.createElement("strong", null, "BlackRock e Fidelity"), "."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "CUST\xD3DIA SEGURA"
}, "Recursos segregados por cliente; contas USD em banco ", /*#__PURE__*/React.createElement("strong", null, "FDIC-insured"), "."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "COMPLIANCE INTEGRADO"
}, /*#__PURE__*/React.createElement("strong", null, "KYC, KYB, AML e OFAC"), " em todos os clientes."), /*#__PURE__*/React.createElement(RuleBlock, {
  label: "RASTREABILIDADE"
}, "Liquida\xE7\xE3o audit\xE1vel on-chain, disponibilidade 24/7.")), /*#__PURE__*/React.createElement("p", {
  className: "table-note",
  style: {
    marginTop: "8mm"
  }
}, "Licen\xE7a verific\xE1vel em NMLS Consumer Access (#2450917).")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 14 — Por que Oren (comparativo)
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "14 \xB7 Comparativo"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 14 \xB7 Comparativo ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(BBody, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "COMPARATIVO"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "250mm"
  }
}, "Por que Oren \u2014 e n\xE3o o banco ou a corretora de sempre."), /*#__PURE__*/React.createElement("table", {
  className: "cmp",
  style: {
    marginTop: "7mm"
  }
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
  style: {
    width: "62mm",
    paddingLeft: 0
  }
}, "CRIT\xC9RIO"), /*#__PURE__*/React.createElement("th", {
  className: "c-oren",
  style: {
    width: "72mm"
  }
}, "OREN"), /*#__PURE__*/React.createElement("th", null, "BANCO / SWIFT"), /*#__PURE__*/React.createElement("th", null, "WISE / CORRETORA"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Velocidade"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Minutos, 24/7"), /*#__PURE__*/React.createElement("td", null, "2\u20135 dias"), /*#__PURE__*/React.createElement("td", null, "1\u20132 dias")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "C\xE2mbio"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Mid-market, transparente"), /*#__PURE__*/React.createElement("td", null, "Spread alto"), /*#__PURE__*/React.createElement("td", null, "Bom, por\xE9m limitado")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Custo all-in"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "~2%, sem letra mi\xFAda*"), /*#__PURE__*/React.createElement("td", null, "Alto + tarifas"), /*#__PURE__*/React.createElement("td", null, "Baixo em alguns pares")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "D\xF3lar digital / tesouraria"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim \u2014 USDC, cust\xF3dia institucional"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
  className: "dash"
}, "\u2014")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
  className: "dash"
}, "\u2014"))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Multi-rail em uma conta"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim \u2014 PIX, ACH, FPS, SEPA, SPEI"), /*#__PURE__*/React.createElement("td", null, "Fragmentado"), /*#__PURE__*/React.createElement("td", null, "Parcial")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Recebimento de terceiros (PJ)"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim"), /*#__PURE__*/React.createElement("td", null, "Depende"), /*#__PURE__*/React.createElement("td", null, "Limitado")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
  className: "c-crit"
}, "Escrow + concilia\xE7\xE3o"), /*#__PURE__*/React.createElement("td", {
  className: "c-oren"
}, "Sim"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
  className: "dash"
}, "\u2014")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
  className: "dash"
}, "\u2014"))))), /*#__PURE__*/React.createElement("p", {
  className: "table-note"
}, "*Valor de refer\xEAncia \u2014 condi\xE7\xF5es sob proposta. Pre\xE7o \xE9 desempate: o valor \xE9 ", /*#__PURE__*/React.createElement("strong", null, "acesso, experi\xEAncia e seguran\xE7a"), ".")), /*#__PURE__*/React.createElement(BFooter, {
  page: p,
  total: t
})),
// 15 — Jornada + próximos passos
(p, t) => /*#__PURE__*/React.createElement(BSlide, {
  label: "15 \xB7 Jornada e pr\xF3ximos passos"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 15 \xB7 Como come\xE7ar ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement("div", {
  style: {
    position: "absolute",
    top: "18mm",
    left: "14mm",
    right: "14mm"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "COMO COME\xC7AR"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "Da abertura da conta \xE0 primeira opera\xE7\xE3o."), /*#__PURE__*/React.createElement("div", {
  className: "journey"
}, JOURNEY.map(([title, desc], i) => /*#__PURE__*/React.createElement("div", {
  className: "j-step",
  key: i
}, /*#__PURE__*/React.createElement("div", {
  className: "flow-badge"
}, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
  className: "jt"
}, title), /*#__PURE__*/React.createElement("div", {
  className: "jd"
}, desc))))), /*#__PURE__*/React.createElement("div", {
  className: "cta-band"
}, /*#__PURE__*/React.createElement(SmallSymbol, {
  tone: "cream",
  top: "14mm",
  left: "252mm"
}), /*#__PURE__*/React.createElement("p", {
  className: "cta-title"
}, "Vamos abrir a conta da sua empresa."), /*#__PURE__*/React.createElement("p", {
  className: "cta-sub"
}, "Uma conta. Os trilhos do mundo inteiro. ", /*#__PURE__*/React.createElement("strong", null, "Oren."))), /*#__PURE__*/React.createElement(BFooter, {
  dark: true,
  page: p,
  total: t
}))];
window.B2B_SLIDES_C = B2B_SLIDES_C;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_b2b_v1_backup/slides-11-15.jsx", error: String((e && e.message) || e) }); }

// decks/oren_platform/PlatformSlides.jsx
try { (() => {
/* Oren — Platform deck (DECK · ARCH-01 · v1.0).
   Sample branded-house presentation showcasing the new architecture:
   Oren Corp + Oren Payments / Capital / Governance. Reuses the deck chrome
   (window.OrenDeck) and design-system components, with pillar colors, the
   organic symbol, the wordmark lockups, and the petal background. */

const {
  SHeader,
  SFooter
} = window.OrenDeck;
const DS = window.OrenDesignSystem_058acc;
const {
  OrenSymbol,
  OrenLockup
} = DS;
const R = "Oren Corp";
const DECK_SLIDES = [
// 00 — Cover
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide dark petals"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ Brand Architecture ]",
  right: "v1.0 \xB7 2026"
}), /*#__PURE__*/React.createElement("div", {
  className: "cover-title"
}, /*#__PURE__*/React.createElement(OrenLockup, {
  pillar: "corp",
  size: 52,
  style: {
    marginBottom: "9mm"
  }
}), /*#__PURE__*/React.createElement("div", {
  className: "cover-eyebrow"
}, "OREN CORP \xB7 A GLOBAL PLATFORM"), /*#__PURE__*/React.createElement("h1", {
  className: "headline-xxl",
  style: {
    maxWidth: "240mm"
  }
}, "Building the future", /*#__PURE__*/React.createElement("br", null), "of global finance."), /*#__PURE__*/React.createElement("p", {
  className: "cover-sub"
}, "One global platform for payments, capital, and governance \u2014 for a world without borders.")), /*#__PURE__*/React.createElement("div", {
  className: "cover-meta"
}, /*#__PURE__*/React.createElement("div", {
  className: "name"
}, "GRUPO OREN"), /*#__PURE__*/React.createElement("div", {
  className: "r"
}, /*#__PURE__*/React.createElement("div", {
  className: "doc-id"
}, "DECK \xB7 ARCH-01 \xB7 v1.0"), /*#__PURE__*/React.createElement("div", null, "Brand architecture")))),
// 01 — Strategic vision
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 01 \xB7 Strategic Vision ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    marginBottom: "5mm"
  }
}, "STRATEGIC VISION"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "235mm"
  }
}, "One global brand for multiple businesses."), /*#__PURE__*/React.createElement("div", {
  className: "vlist"
}, [["01", "Strengthen brand recognition"], ["02", "Enable international expansion"], ["03", "Create commercial clarity"], ["04", "Build institutional trust"], ["05", "Allow long-term scalability"]].map(([n, txt]) => /*#__PURE__*/React.createElement("div", {
  className: "vrow",
  key: n
}, /*#__PURE__*/React.createElement("span", {
  className: "n"
}, n), /*#__PURE__*/React.createElement("span", {
  className: "t"
}, txt))))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 02 — Why Oren
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide dark texture"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ 02 \xB7 The Name ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    marginBottom: "5mm"
  }
}, "WHY OREN"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    color: "var(--oren-cream)",
    maxWidth: "230mm"
  }
}, "A name built to transcend markets and generations."), /*#__PURE__*/React.createElement("div", {
  className: "attrs"
}, ["Easy to pronounce across languages", "Sophisticated and institutional", "Independent of geography or product", "Scalable to new businesses", "Ready for future generations"].map((a, i) => /*#__PURE__*/React.createElement("div", {
  className: "attr",
  key: i
}, a)))), /*#__PURE__*/React.createElement(SFooter, {
  dark: true,
  page: p,
  total: t
})),
// 03 — Brand architecture (centerpiece)
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide dark"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ 03 \xB7 Brand Architecture ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    marginBottom: "4mm"
  }
}, "A BRANDED HOUSE"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    color: "var(--oren-cream)",
    maxWidth: "235mm"
  }
}, "One master brand strengthening every business."), /*#__PURE__*/React.createElement("div", {
  className: "arch-corp"
}, /*#__PURE__*/React.createElement(OrenSymbol, {
  size: 44,
  tone: "gradient"
}), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  className: "ttl"
}, "Oren Corp"), /*#__PURE__*/React.createElement("div", {
  className: "role"
}, "Institutional holding \xB7 primary issuer"))), /*#__PURE__*/React.createElement("div", {
  className: "arch-grid"
}, /*#__PURE__*/React.createElement("div", {
  className: "pcard pay"
}, /*#__PURE__*/React.createElement(OrenSymbol, {
  size: 32,
  tone: "payments"
}), /*#__PURE__*/React.createElement("div", {
  className: "pname"
}, "Oren ", /*#__PURE__*/React.createElement("em", null, "Payments")), /*#__PURE__*/React.createElement("div", {
  className: "pdesc"
}, "International payments, FX, settlement, banking infrastructure, B2B.")), /*#__PURE__*/React.createElement("div", {
  className: "pcard cap"
}, /*#__PURE__*/React.createElement(OrenSymbol, {
  size: 32,
  tone: "capital"
}), /*#__PURE__*/React.createElement("div", {
  className: "pname"
}, "Oren ", /*#__PURE__*/React.createElement("em", null, "Capital")), /*#__PURE__*/React.createElement("div", {
  className: "pdesc"
}, "Global investments, wealth management, family office, private markets.")), /*#__PURE__*/React.createElement("div", {
  className: "pcard gov"
}, /*#__PURE__*/React.createElement(OrenSymbol, {
  size: 32,
  tone: "governance"
}), /*#__PURE__*/React.createElement("div", {
  className: "pname"
}, "Oren ", /*#__PURE__*/React.createElement("em", null, "Governance")), /*#__PURE__*/React.createElement("div", {
  className: "pdesc"
}, "International structures, holdings, trusts, compliance, succession.")))), /*#__PURE__*/React.createElement(SFooter, {
  dark: true,
  page: p,
  total: t
})),
// 04 — Oren Payments
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 04 \xB7 Oren Payments ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "pillar-hero"
}, /*#__PURE__*/React.createElement("div", {
  className: "txt"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow pay"
}, "OREN PAYMENTS"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    marginTop: "5mm",
    maxWidth: "160mm"
  }
}, "Infrastructure for global payments."), /*#__PURE__*/React.createElement("ul", {
  className: "scope",
  style: {
    "--dot": "var(--oren-payments)"
  }
}, /*#__PURE__*/React.createElement("li", null, "International payments"), /*#__PURE__*/React.createElement("li", null, "FX and currency"), /*#__PURE__*/React.createElement("li", null, "Financial settlement"), /*#__PURE__*/React.createElement("li", null, "Banking infrastructure"), /*#__PURE__*/React.createElement("li", null, "B2B solutions"))), /*#__PURE__*/React.createElement("div", {
  className: "pillar-panel"
}, /*#__PURE__*/React.createElement(OrenLockup, {
  pillar: "payments",
  size: 66
})))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 05 — Oren Capital
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 05 \xB7 Oren Capital ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "pillar-hero"
}, /*#__PURE__*/React.createElement("div", {
  className: "txt"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow cap"
}, "OREN CAPITAL"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    marginTop: "5mm",
    maxWidth: "165mm"
  }
}, "Strategy for investment, wealth, and growth."), /*#__PURE__*/React.createElement("ul", {
  className: "scope",
  style: {
    "--dot": "var(--oren-capital)"
  }
}, /*#__PURE__*/React.createElement("li", null, "Global investments"), /*#__PURE__*/React.createElement("li", null, "Wealth management"), /*#__PURE__*/React.createElement("li", null, "Family office"), /*#__PURE__*/React.createElement("li", null, "Private markets"), /*#__PURE__*/React.createElement("li", null, "Capital structuring"))), /*#__PURE__*/React.createElement("div", {
  className: "pillar-panel"
}, /*#__PURE__*/React.createElement(OrenLockup, {
  pillar: "capital",
  size: 66
})))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 06 — Oren Governance
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 06 \xB7 Oren Governance ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "pillar-hero"
}, /*#__PURE__*/React.createElement("div", {
  className: "txt"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow gov"
}, "OREN GOVERNANCE"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    marginTop: "5mm",
    maxWidth: "168mm"
  }
}, "Structures for governance and succession."), /*#__PURE__*/React.createElement("ul", {
  className: "scope",
  style: {
    "--dot": "var(--oren-governance)"
  }
}, /*#__PURE__*/React.createElement("li", null, "International structures, holdings, trusts"), /*#__PURE__*/React.createElement("li", null, "Foundations"), /*#__PURE__*/React.createElement("li", null, "Compliance"), /*#__PURE__*/React.createElement("li", null, "Succession planning"), /*#__PURE__*/React.createElement("li", null, "Asset protection"))), /*#__PURE__*/React.createElement("div", {
  className: "pillar-panel"
}, /*#__PURE__*/React.createElement(OrenLockup, {
  pillar: "governance",
  size: 66
})))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 07 — Ecosystem
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide"
}, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 07 \xB7 The Ecosystem ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    marginBottom: "4mm"
  }
}, "AN INTEGRATED ECOSYSTEM"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "235mm"
  }
}, "Three pillars, one platform."), /*#__PURE__*/React.createElement("div", {
  className: "eco"
}, /*#__PURE__*/React.createElement("div", {
  className: "eco-row"
}, /*#__PURE__*/React.createElement("span", {
  className: "eb"
}, "Oren ", /*#__PURE__*/React.createElement("em", {
  style: {
    color: "#7aa800"
  }
}, "Payments")), /*#__PURE__*/React.createElement("span", {
  className: "ds"
}, "Moves resources.")), /*#__PURE__*/React.createElement("div", {
  className: "eco-row"
}, /*#__PURE__*/React.createElement("span", {
  className: "eb"
}, "Oren ", /*#__PURE__*/React.createElement("em", {
  style: {
    color: "var(--oren-capital)"
  }
}, "Capital")), /*#__PURE__*/React.createElement("span", {
  className: "ds"
}, "Grows wealth.")), /*#__PURE__*/React.createElement("div", {
  className: "eco-row"
}, /*#__PURE__*/React.createElement("span", {
  className: "eb"
}, "Oren ", /*#__PURE__*/React.createElement("em", {
  style: {
    color: "var(--oren-governance)"
  }
}, "Governance")), /*#__PURE__*/React.createElement("span", {
  className: "ds"
}, "Protects and structures.")))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 08 — Long-term vision
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide dark"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ 08 \xB7 Long-term Vision ]",
  right: R
}), /*#__PURE__*/React.createElement("div", {
  className: "body"
}, /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    marginBottom: "4mm"
  }
}, "BUILT FOR THE NEXT 20 YEARS"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    color: "var(--oren-cream)",
    maxWidth: "235mm"
  }
}, "Designed to grow under one brand."), /*#__PURE__*/React.createElement("div", {
  className: "future"
}, /*#__PURE__*/React.createElement("div", {
  className: "col"
}, /*#__PURE__*/React.createElement("div", {
  className: "lab"
}, "TODAY"), /*#__PURE__*/React.createElement("div", {
  className: "now-item"
}, "Oren Payments"), /*#__PURE__*/React.createElement("div", {
  className: "now-item"
}, "Oren Capital"), /*#__PURE__*/React.createElement("div", {
  className: "now-item"
}, "Oren Governance")), /*#__PURE__*/React.createElement("div", {
  className: "arrow"
}, "\u2192"), /*#__PURE__*/React.createElement("div", {
  className: "col",
  style: {
    display: "flex",
    flexDirection: "column"
  }
}, /*#__PURE__*/React.createElement("div", {
  className: "lab"
}, "TOMORROW"), /*#__PURE__*/React.createElement("div", {
  className: "soon"
}, ["Oren Ventures", "Oren Digital", "Oren AI", "Oren Bank", "Oren Energy"].map(c => /*#__PURE__*/React.createElement("span", {
  className: "chip",
  key: c
}, c)))))), /*#__PURE__*/React.createElement(SFooter, {
  dark: true,
  page: p,
  total: t
})),
// 09 — Closing
(p, t) => /*#__PURE__*/React.createElement("section", {
  className: "slide dark petals"
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ Grupo Oren ]",
  right: "Building the future of global finance"
}), /*#__PURE__*/React.createElement("div", {
  className: "body",
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(OrenLockup, {
  pillar: "corp",
  size: 54,
  style: {
    marginBottom: "10mm",
    alignSelf: "flex-start",
    flexShrink: 0
  }
}), /*#__PURE__*/React.createElement("div", {
  className: "eyebrow",
  style: {
    marginBottom: "6mm"
  }
}, "GRUPO OREN"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-xl",
  style: {
    color: "var(--oren-cream)",
    maxWidth: "220mm"
  }
}, "More than companies.", /*#__PURE__*/React.createElement("br", null), "A global platform."), /*#__PURE__*/React.createElement("p", {
  className: "closing-sub"
}, "Connecting people, capital, and structures for a world without borders.")), /*#__PURE__*/React.createElement(SFooter, {
  dark: true,
  page: p,
  total: t
}))];
window.DECK_SLIDES = DECK_SLIDES;
})(); } catch (e) { __ds_ns.__errors.push({ path: "decks/oren_platform/PlatformSlides.jsx", error: String((e && e.message) || e) }); }

// ui_kits/deck/DeckChrome.jsx
try { (() => {
/* Oren Deck — chrome & stage.
   Faithful 16:9 deck per the manual (§10–§13): 297mm × 167mm slides,
   institutional header, house-line footer, dark covers, the radial watermark.
   Exposes a Stage that scales the fixed-size slide to fit any viewport and
   handles prev/next + keyboard navigation. */

const MM = 3.7795275591; // px per mm at 96dpi
const SLIDE_W = 297 * MM;
const SLIDE_H = 167 * MM;
const HOUSE = dark => /*#__PURE__*/React.createElement("span", {
  className: "house-line"
}, "OREN\xA0PAYMENTS", /*#__PURE__*/React.createElement("span", null, "\xB7"), "OREN\xA0CAPITAL", /*#__PURE__*/React.createElement("span", null, "\xB7"), "OREN\xA0GOVERNANCE");
function SHeader({
  left,
  right,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "s-header" + (dark ? " on-dark" : "")
  }, /*#__PURE__*/React.createElement("span", null, left), /*#__PURE__*/React.createElement("span", null, right));
}
function SFooter({
  page,
  total,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "s-footer" + (dark ? " on-dark" : "")
  }, HOUSE(dark), /*#__PURE__*/React.createElement("span", {
    className: "pagenum"
  }, String(page).padStart(2, "0"), " / ", String(total).padStart(2, "0")));
}
function Watermark() {
  return /*#__PURE__*/React.createElement("img", {
    className: "bg-symbol",
    src: "../../assets/oren-symbol-light.svg",
    alt: "",
    style: {
      position: "absolute",
      top: "-40mm",
      right: "-40mm",
      width: "200mm",
      height: "200mm",
      opacity: 0.15,
      pointerEvents: "none"
    }
  });
}
function SmallSymbol({
  tone = "cream",
  top = "22mm",
  left = "14mm"
}) {
  return /*#__PURE__*/React.createElement("img", {
    src: `../../assets/oren-symbol-${tone}.svg`,
    alt: "Oren",
    style: {
      position: "absolute",
      top,
      left,
      width: "44px",
      height: "44px",
      zIndex: 5
    }
  });
}

/* Fixed-size slide frame. dark => deep-green cover/closing surface. */
function Slide({
  dark,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "slide" + (dark ? " dark" : "")
  }, children);
}

/* Stage: scales the slide to fit, renders the active slide, provides nav. */
function Stage({
  slides
}) {
  const [i, setI] = React.useState(() => {
    const n = parseInt(new URLSearchParams(location.search).get("s") || "0", 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(slides.length - 1, n));
  });
  const [scale, setScale] = React.useState(1);
  const fit = React.useCallback(() => {
    const pad = 0;
    const w = window.innerWidth,
      h = window.innerHeight;
    const s = Math.min((w - pad) / SLIDE_W, (h - pad) / SLIDE_H);
    // Guard against a 0×0 mount (iframe not laid out yet): retry shortly
    // instead of painting the slide at scale 0/1 unfitted. setTimeout fires
    // even in non-painting preview iframes where rAF can be throttled.
    if (!isFinite(s) || s <= 0) {
      setTimeout(fit, 50);
      return;
    }
    setScale(s);
  }, []);
  React.useEffect(() => {
    fit();
    // Deferred re-fits cover iframes that report 0×0 on first mount and only
    // settle their layout a few frames later (no resize event is fired).
    const timers = [0, 60, 160, 320, 600].map(d => setTimeout(fit, d));
    window.addEventListener("resize", fit);
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => fit());
      ro.observe(document.documentElement);
    }
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", fit);
      if (ro) ro.disconnect();
    };
  }, [fit]);
  const go = React.useCallback(n => setI(cur => Math.max(0, Math.min(slides.length - 1, n))), [slides.length]);
  React.useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("s", i);
    history.replaceState(null, "", url);
  }, [i]);
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(i + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);
  const total = slides.length;
  const Active = slides[i];
  return /*#__PURE__*/React.createElement("div", {
    className: "stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stage-canvas",
    style: {
      width: SLIDE_W,
      height: SLIDE_H,
      transform: `translate(-50%, -50%) scale(${scale})`
    }
  }, Active(i + 1, total)), /*#__PURE__*/React.createElement("div", {
    className: "deck-nav"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go(i - 1),
    disabled: i === 0,
    "aria-label": "Previous"
  }, "\u2039"), /*#__PURE__*/React.createElement("span", {
    className: "deck-count"
  }, String(i + 1).padStart(2, "0"), " / ", String(total).padStart(2, "0")), /*#__PURE__*/React.createElement("button", {
    onClick: () => go(i + 1),
    disabled: i === total - 1,
    "aria-label": "Next"
  }, "\u203A")));
}
Object.assign(window, {
  OrenDeck: {
    Stage,
    Slide,
    SHeader,
    SFooter,
    Watermark,
    SmallSymbol,
    HOUSE,
    MM
  }
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/deck/DeckChrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/deck/Slides.jsx
try { (() => {
/* Oren Deck — sample slides for the Wyoming Business Council deck (DECK · WBC-02 · v3.0).
   Composes design-system primitives (CardIt, Stat, StepList, PhaseBox, InvestTable, Eyebrow)
   inside the deck chrome. Content & anchor phrases follow the manual (§24). */

const {
  Slide,
  SHeader,
  SFooter,
  Watermark,
  SmallSymbol
} = window.OrenDeck;
const DS = window.OrenDesignSystem_058acc;
const {
  Eyebrow,
  CardIt,
  Stat,
  StepList,
  PhaseBox,
  InvestTable
} = DS;
const HEADER_R = "Oren Corp";

/* Body region between header and footer. */
function Body({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: "18mm",
      bottom: "21mm",
      left: "14mm",
      right: "14mm",
      ...style
    }
  }, children);
}
const DECK_SLIDES = [
// 01 — Cover
(p, t) => /*#__PURE__*/React.createElement(Slide, {
  dark: true
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ Deck \xB7 WBC + Blockchain Committee ]",
  right: "v3.0 \xB7 May 2026"
}), /*#__PURE__*/React.createElement(Watermark, null), /*#__PURE__*/React.createElement(SmallSymbol, {
  tone: "cream",
  top: "22mm",
  left: "14mm"
}), /*#__PURE__*/React.createElement("div", {
  className: "cover-title"
}, /*#__PURE__*/React.createElement("div", {
  className: "cover-eyebrow"
}, "WYOMING BUSINESS COUNCIL \xB7 BLOCKCHAIN COMMITTEE"), /*#__PURE__*/React.createElement("h1", {
  className: "headline-xxl",
  style: {
    color: "var(--oren-cream)",
    maxWidth: "245mm"
  }
}, "Building the Bridge", /*#__PURE__*/React.createElement("br", null), "Between Brazil and Wyoming"), /*#__PURE__*/React.createElement("p", {
  className: "cover-sub"
}, "An institutional partnership proposal.")), /*#__PURE__*/React.createElement("div", {
  className: "cover-meta"
}, /*#__PURE__*/React.createElement("div", {
  className: "l"
}, /*#__PURE__*/React.createElement("div", {
  className: "name"
}, "Oren"), /*#__PURE__*/React.createElement("div", null, "Oren Corp \xB7 Wyoming-incorporated")), /*#__PURE__*/React.createElement("div", {
  className: "r"
}, /*#__PURE__*/React.createElement("div", {
  className: "doc-id"
}, "DECK \xB7 WBC-02 \xB7 v3.0"), /*#__PURE__*/React.createElement("div", null, "Prepared for the Wyoming Business Council"), /*#__PURE__*/React.createElement("div", null, "Cheyenne, Wyoming \xB7 May 2026")))),
// 02 — Who we are
(p, t) => /*#__PURE__*/React.createElement(Slide, null, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 02 \xB7 The Platform ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(Body, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "THE PLATFORM"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "Brazilian roots, 30+ years.", /*#__PURE__*/React.createElement("br", null), "One global platform under Oren Corp."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: "5mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "PAYMENTS",
  title: "Oren Payments"
}, "International payments, FX, settlement, and banking infrastructure for B2B flows."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "CAPITAL",
  title: "Oren Capital"
}, "Global investments, wealth management, family office, and private markets."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "GOVERNANCE",
  title: "Oren Governance"
}, "International structures, holdings, trusts, compliance, and succession."))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 03 — The market
(p, t) => /*#__PURE__*/React.createElement(Slide, null, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 03 \xB7 The Market ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(Body, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "THE MARKET"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "245mm"
  }
}, "The Brazilian cross-border market", /*#__PURE__*/React.createElement("br", null), "is already large \u2014 and recalibrating now."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: "8mm",
    marginTop: "12mm"
  }
}, /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "USD 654.5B",
  label: "Brazilian-held assets abroad.",
  source: "Banco Central do Brasil \u2014 CBE Census, data-base 2024."
}), /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "~809,000",
  label: "Brazilian-controlled companies abroad.",
  source: "Receita Federal via ICIJ; Forbes Brasil, Jul/2025."
}), /*#__PURE__*/React.createElement(Stat, {
  deck: true,
  value: "USD 2M/day",
  label: "Remittances from the Valadares diaspora alone.",
  source: "~40,000 Brazilians from the region in the US (municipal estimates)."
}))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 04 — Why Wyoming can be first
(p, t) => /*#__PURE__*/React.createElement(Slide, null, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 04 \xB7 The Opening ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(Body, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "WHY NOW"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm",
    marginBottom: "6mm"
  }
}, "Wyoming can set the reference standard."), /*#__PURE__*/React.createElement(StepList, {
  steps: [{
    n: "01",
    title: "Operating market",
    desc: "FDIC-insured banks in Florida already conduct cross-border, real estate-collateralized lending. No US state has published explicit regulatory guidance."
  }, {
    n: "02",
    title: "Wyoming can be first",
    desc: "Administrative guidance under W.S. §13-1-603 — no new legislation required. Significantly simpler than what Wyoming already did with SPDI."
  }, {
    n: "03",
    title: "A closing window",
    desc: "Capital-flow decisions made in 2026 and 2027 will determine which US jurisdiction becomes the reference standard for this segment."
  }]
})), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 05 — The partnership (invest table)
(p, t) => /*#__PURE__*/React.createElement(Slide, null, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 05 \xB7 The Partnership ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(Body, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "WHAT EACH SIDE BRINGS"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm"
  }
}, "We are not asking Wyoming to invest money."), /*#__PURE__*/React.createElement(InvestTable, {
  leftHead: "Oren Corp invests",
  rightHead: "Wyoming invests",
  rows: [["Operational infrastructure, compliance, technology", "Institutional time and strategic guidance"], ["30+ years of network in the Brazilian wealth market", "Wyoming brand — credibility and regulatory excellence"], ["Trade missions led by Oren's institutional network", "Official recognition providing institutional legitimacy"]]
})), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 06 — Roadmap (phases)
(p, t) => /*#__PURE__*/React.createElement(Slide, null, /*#__PURE__*/React.createElement(SHeader, {
  left: "[ 06 \xB7 Roadmap ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement(Body, null, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "light",
  style: {
    marginBottom: "4mm"
  }
}, "HOW IT UNFOLDS"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-l",
  style: {
    maxWidth: "240mm",
    marginBottom: "2mm"
  }
}, "A phased, low-commitment path."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: "5mm",
    marginTop: "9mm"
  }
}, /*#__PURE__*/React.createElement(PhaseBox, {
  active: true,
  tag: "Phase 1 \xB7 Recognition",
  title: "Letter of Recognition"
}, "The Wyoming Business Council issues a Letter of Recognition formalizing Oren as its institutional partner \u2014 its own authority, no new legislation."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "Phase 2 \xB7 Structure",
  title: "Memorandum of Understanding"
}, "A structured MoU defining scope, reporting, trade missions, and performance metrics."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "Phase 3 \xB7 Scale",
  title: "Expanded Program"
}, "As results materialize, the partnership evolves \u2014 broader visibility and additional markets."))), /*#__PURE__*/React.createElement(SFooter, {
  page: p,
  total: t
})),
// 07 — Next step (dark closing)
(p, t) => /*#__PURE__*/React.createElement(Slide, {
  dark: true
}, /*#__PURE__*/React.createElement(SHeader, {
  dark: true,
  left: "[ 07 \xB7 Next Step ]",
  right: HEADER_R
}), /*#__PURE__*/React.createElement("img", {
  src: "../../assets/oren-symbol-light.svg",
  alt: "",
  style: {
    position: "absolute",
    bottom: "-30mm",
    left: "-30mm",
    width: "150mm",
    height: "150mm",
    opacity: 0.15,
    pointerEvents: "none"
  }
}), /*#__PURE__*/React.createElement(Body, {
  style: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Eyebrow, {
  tone: "dark",
  style: {
    marginBottom: "6mm"
  }
}, "NEXT STEP"), /*#__PURE__*/React.createElement("h2", {
  className: "headline-xl",
  style: {
    color: "var(--oren-cream)",
    maxWidth: "230mm"
  }
}, "We are not asking for a decision in this room."), /*#__PURE__*/React.createElement("p", {
  className: "closing-sub"
}, "Wyoming has the framework. Oren has the market and the commitment. The partnership is the bridge.")), /*#__PURE__*/React.createElement(SFooter, {
  dark: true,
  page: p,
  total: t
}))];
window.DECK_SLIDES = DECK_SLIDES;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/deck/Slides.jsx", error: String((e && e.message) || e) }); }

// ui_kits/leave_behind/LeaveBehind.jsx
try { (() => {
/* Oren Leave-Behind — A4 document kit (manual §9, §14–§22).
   Multi-page institutional leave-behind. Composes design-system primitives
   (CardIt, Callout, Stat, InvestTable, PhaseBox) inside the A4 sheet chrome. */

const DS = window.OrenDesignSystem_058acc;
const {
  CardIt,
  Callout,
  Stat,
  InvestTable,
  PhaseBox
} = DS;
const HEADER_TAG = "[ Initiative Brief A · Wyoming Business Council ]";
function HouseLine() {
  return /*#__PURE__*/React.createElement("span", {
    className: "house-line"
  }, "OREN\xA0PAYMENTS", /*#__PURE__*/React.createElement("span", null, "\xB7"), "OREN\xA0CAPITAL", /*#__PURE__*/React.createElement("span", null, "\xB7"), "OREN\xA0GOVERNANCE");
}
function SheetHeader({
  right
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "sheet-header"
  }, /*#__PURE__*/React.createElement("span", null, HEADER_TAG), /*#__PURE__*/React.createElement("span", null, right));
}
function SheetFooter({
  page,
  total
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "sheet-footer"
  }, /*#__PURE__*/React.createElement(HouseLine, null), /*#__PURE__*/React.createElement("span", {
    className: "pagenum"
  }, String(page).padStart(2, "0"), " / ", String(total).padStart(2, "0")));
}
function Sheet({
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "sheet"
  }, children);
}
function SectionHead({
  num,
  children
}) {
  return /*#__PURE__*/React.createElement("h2", {
    className: "section"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, num), children);
}
const TOTAL = 5;
const LB_PAGES = [
/*#__PURE__*/
// 01 — Cover
React.createElement(Sheet, null, /*#__PURE__*/React.createElement(SheetHeader, {
  right: "v3.0 \xB7 May 2026"
}), /*#__PURE__*/React.createElement("img", {
  className: "cover-symbol",
  src: "../../assets/oren-symbol-deep.svg",
  alt: "Oren"
}), /*#__PURE__*/React.createElement("div", {
  className: "cover-block"
}, /*#__PURE__*/React.createElement("div", {
  className: "cover-eyebrow"
}, "WYOMING BUSINESS COUNCIL"), /*#__PURE__*/React.createElement("h1", {
  className: "brief-title"
}, "Building the Bridge", /*#__PURE__*/React.createElement("br", null), "Between Brazil and Wyoming"), /*#__PURE__*/React.createElement("p", {
  className: "brief-subtitle"
}, "An institutional partnership proposal \u2014 mutual gains, structured commitment.")), /*#__PURE__*/React.createElement("div", {
  className: "cover-meta"
}, /*#__PURE__*/React.createElement("div", {
  className: "issuer-block"
}, /*#__PURE__*/React.createElement("div", {
  className: "name"
}, "Oren"), /*#__PURE__*/React.createElement("div", {
  className: "via"
}, "Oren Corp \xB7 Wyoming-incorporated")), /*#__PURE__*/React.createElement("div", {
  className: "date-block"
}, /*#__PURE__*/React.createElement("div", {
  className: "doc-id"
}, "DOC \xB7 LB-WBC-A"), /*#__PURE__*/React.createElement("div", null, "Prepared for the Wyoming Business Council"), /*#__PURE__*/React.createElement("div", null, "Cheyenne, Wyoming \xB7 May 2026")))),
/*#__PURE__*/
// 02 — Who we are
React.createElement(Sheet, null, /*#__PURE__*/React.createElement(SheetHeader, {
  right: "Oren Corp"
}), /*#__PURE__*/React.createElement("div", {
  className: "sheet-body"
}, /*#__PURE__*/React.createElement(SectionHead, {
  num: "01"
}, "Who We Are"), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "Oren is a privately-held Brazilian conglomerate with more than 30 years of operational history, now organized as one global platform \u2014 Oren Corp \u2014 with Wyoming-incorporated entities under one institutional roof."), /*#__PURE__*/React.createElement("p", null, "The platform is built on three pillars covering the cross-border architecture Brazilian families and advisors are rebuilding today \u2014 from payments and settlement to investment and patrimony, to international governance and succession. The structure is operational, not opportunistic."), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "5mm",
    marginTop: "5mm"
  }
}, /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "PAYMENTS",
  title: "Oren Payments"
}, "International payments, FX, settlement, and banking infrastructure for B2B flows."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "CAPITAL",
  title: "Oren Capital"
}, "Global investments, wealth management, family office, and private markets."), /*#__PURE__*/React.createElement(CardIt, {
  compact: true,
  label: "GOVERNANCE",
  title: "Oren Governance"
}, "International structures, holdings, trusts, compliance, and succession. Inherits the BTS Global legacy."))), /*#__PURE__*/React.createElement(SheetFooter, {
  page: 2,
  total: TOTAL
})),
/*#__PURE__*/
// 03 — The market
React.createElement(Sheet, null, /*#__PURE__*/React.createElement(SheetHeader, {
  right: "Oren Corp"
}), /*#__PURE__*/React.createElement("div", {
  className: "sheet-body"
}, /*#__PURE__*/React.createElement(SectionHead, {
  num: "02"
}, "The Market"), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "The Brazilian cross-border market is already large, and capital-flow decisions are being recalibrated now \u2014 not in some distant future."), /*#__PURE__*/React.createElement("div", {
  className: "stat-row"
}, /*#__PURE__*/React.createElement(Stat, {
  value: "USD 654.5B",
  label: "Brazilian-held assets abroad.",
  source: "Banco Central do Brasil \u2014 CBE Census, data-base 2024."
}), /*#__PURE__*/React.createElement(Stat, {
  value: "~809,000",
  label: "Brazilian-controlled companies abroad.",
  source: "Receita Federal via ICIJ; Forbes Brasil, Jul/2025."
}), /*#__PURE__*/React.createElement(Stat, {
  value: "USD 2M/day",
  label: "Remittances from the Valadares diaspora alone.",
  source: "~40,000 Brazilians from the region in the US (municipal estimates)."
})), /*#__PURE__*/React.createElement(Callout, {
  title: "Window of opportunity"
}, "Brazilian advisors, law firms, and family offices are recalibrating their cross-border architecture ", /*#__PURE__*/React.createElement("em", null, "now"), ". Decisions made in 2026 and 2027 will determine which US jurisdiction becomes the reference standard for this segment.")), /*#__PURE__*/React.createElement(SheetFooter, {
  page: 3,
  total: TOTAL
})),
/*#__PURE__*/
// 04 — The partnership
React.createElement(Sheet, null, /*#__PURE__*/React.createElement(SheetHeader, {
  right: "Oren Corp"
}), /*#__PURE__*/React.createElement("div", {
  className: "sheet-body"
}, /*#__PURE__*/React.createElement(SectionHead, {
  num: "03"
}, "The Partnership"), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "We are not asking Wyoming to invest money \u2014 we fund the operations. What each side brings is complementary, and the arrangement is structured in phases."), /*#__PURE__*/React.createElement(InvestTable, {
  leftHead: "Oren Corp invests",
  rightHead: "Wyoming invests",
  rows: [["Operational infrastructure, compliance, technology", "Institutional time and strategic guidance"], ["30+ years of network in the Brazilian wealth market", "Wyoming brand — credibility and regulatory excellence"], ["Trade missions led by Oren's institutional network", "Official recognition providing institutional legitimacy"]]
}), /*#__PURE__*/React.createElement("div", {
  style: {
    marginTop: "5mm"
  }
}, /*#__PURE__*/React.createElement(PhaseBox, {
  active: true,
  tag: "Phase 1 \xB7 Recognition",
  title: "Letter of Recognition"
}, "The Wyoming Business Council issues a Letter of Recognition formalizing Oren as its institutional partner \u2014 its own authority, no new legislation required."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "Phase 2 \xB7 Structure",
  title: "Memorandum of Understanding"
}, "Based on Phase 1 results, a structured MoU defining scope, reporting, trade missions, and performance metrics."), /*#__PURE__*/React.createElement(PhaseBox, {
  tag: "Phase 3 \xB7 Scale",
  title: "Expanded Program"
}, "As results materialize, the partnership can evolve \u2014 broader visibility and additional markets."))), /*#__PURE__*/React.createElement(SheetFooter, {
  page: 4,
  total: TOTAL
})),
/*#__PURE__*/
// 05 — Next step
React.createElement(Sheet, null, /*#__PURE__*/React.createElement(SheetHeader, {
  right: "Oren Corp"
}), /*#__PURE__*/React.createElement("div", {
  className: "sheet-body"
}, /*#__PURE__*/React.createElement(SectionHead, {
  num: "04"
}, "Next Step"), /*#__PURE__*/React.createElement("p", {
  className: "lede"
}, "We are not asking for a decision in this room."), /*#__PURE__*/React.createElement("p", null, "What we would welcome is institutional openness to discuss a Letter of Recognition \u2014 a low-commitment first step that formalizes the relationship without binding Wyoming to anything beyond its own authority."), /*#__PURE__*/React.createElement(Callout, {
  title: "The bridge"
}, "Wyoming has the framework. Oren has the market and the commitment. The partnership is the bridge."), /*#__PURE__*/React.createElement("p", {
  style: {
    marginTop: "4mm"
  }
}, "It is the difference between being a private company that chose Wyoming and being Wyoming's recognized institutional partner for the Brazilian market.")), /*#__PURE__*/React.createElement(SheetFooter, {
  page: 5,
  total: TOTAL
}))];
window.LB_PAGES = LB_PAGES;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/leave_behind/LeaveBehind.jsx", error: String((e && e.message) || e) }); }

__ds_ns.OrenLockup = __ds_scope.OrenLockup;

__ds_ns.OrenSymbol = __ds_scope.OrenSymbol;

__ds_ns.CardIt = __ds_scope.CardIt;

__ds_ns.InvestTable = __ds_scope.InvestTable;

__ds_ns.PhaseBox = __ds_scope.PhaseBox;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.StepList = __ds_scope.StepList;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

})();
