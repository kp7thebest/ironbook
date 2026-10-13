"""Generate Ironbook's colour schemes (v15) and check every constraint.

Each scheme is a pairing, not a hue swap: surfaces tinted in one colour, an accent in another, its own
ink on the accent, a signature colour (--mark: the wordmark bar) and a faint background treatment (--art).

  python3 .testharness/schemes.py --write src/styles.css   regenerate the block between the markers
  python3 .testharness/schemes.py --check src/styles.css   (run.sh) fail if a check fails or the CSS is stale

Checks per scheme and mode: text >= 7:1 on bg/panel/panel2; dim, accent-soft >= 4.5:1; accent ink >= 4.5:1;
accent >= 3:1 against bg and panel (selected tab, toggles); heatmap numbers >= 4.5:1 and lightness
monotonic. Chart pairs (weight vs reps, you vs them) were picked with the dataviz skill's
validate_palette.js — all pass CVD dE >= 8, normal-vision dE >= 15, >= 3:1 on the surface, no warnings.
"""
import json, math, sys

# ---------- colour maths (OKLab/OKLCH <-> sRGB) ----------
def srgb_to_lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin_to_srgb(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
def hex2rgb(h): h = h.lstrip("#"); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def rgb2hex(rgb): return "#" + "".join(f"{round(max(0, min(1, c)) * 255):02X}" for c in rgb)
def oklch_to_lin(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
def oklch(L, C, H):
    """Hex for an OKLCH colour; chroma is reduced until it fits in sRGB."""
    c = C
    while c >= 0:
        lin = oklch_to_lin(L, c, H)
        if all(-1e-4 <= x <= 1 + 1e-4 for x in lin):
            return rgb2hex([lin_to_srgb(max(0, min(1, x))) for x in lin])
        c -= 0.002
    return rgb2hex([lin_to_srgb(max(0, min(1, x))) for x in oklch_to_lin(L, 0, H)])
def okL(h):
    r, g, b = [srgb_to_lin(x) for x in hex2rgb(h)]
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787745 * b) ** (1 / 3)
    return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
def lum(h): r, g, b = [srgb_to_lin(x) for x in hex2rgb(h)]; return 0.2126 * r + 0.7152 * g + 0.0722 * b
def cr(a, b): la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
def rgba(h, a): r, g, b = [round(x * 255) for x in hex2rgb(h)]; return f"rgba({r},{g},{b},{a})"

# ---------- the schemes ----------
# surf = (hue, dark chroma, light chroma) for bg/panels/lines/text/dim.
# accent per mode: ("white", C, H)       -> L lowered until white ink reaches the target (4.6 dark, 5.0 light)
#                  ("ink", L, C, H)       -> a bright accent; its ink is the scheme's own background
#                  ("fixed", L, C, H, ink) -> a deep accent with a coloured ink (L, C, H)
# soft = accent-soft hue per mode (L fitted for 4.5:1 text); mark = wordmark bar (None = accent);
# vol = (hue, chroma) of the heatmap ramp per mode; art = background layers per mode (None = plain).
NOISE = ("url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E"
         "%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E"
         "%3CfeColorMatrix values='0 0 0 0 {v} 0 0 0 0 {v} 0 0 0 0 {v} 0 0 0 {a} 0'/%3E%3C/filter%3E"
         "%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")")
def glowat(where, size, hexc, a): return f"radial-gradient({size} at {where},{rgba(hexc, a)},transparent 70%)"

SCHEMES = [
    dict(id="rust", name="Rust", sub="rust on bare steel", surf=(238, 0.022, 0.014),
         dark=dict(accent=("ink", 0.70, 0.155, 47), soft=50, mark=None, vol=(47, 0.13),
                   art=lambda t: "linear-gradient(160deg,rgba(255,255,255,.045),transparent 40%)"),
         light=dict(accent=("white", 0.16, 42), soft=42, mark=None, vol=(42, 0.13),
                    art=lambda t: "linear-gradient(160deg,rgba(255,255,255,.75),transparent 40%)")),
    dict(id="turf", name="Turf", sub="sled-track green, line-paint yellow", surf=(152, 0.036, 0.024),
         dark=dict(accent=("ink", 0.90, 0.175, 106), soft=106, mark=None, vol=(152, 0.11),
                   art=lambda t: "repeating-linear-gradient(180deg,transparent 0 158px,rgba(255,255,255,.04) 158px 160px)"),
         light=dict(accent=("fixed", 0.40, 0.105, 152, (0.95, 0.13, 106)), soft=152, mark=(0.74, 0.16, 98), vol=(152, 0.11),
                    art=lambda t: "repeating-linear-gradient(180deg,transparent 0 158px,rgba(255,255,255,.8) 158px 160px)")),
    dict(id="pool", name="Pool", sub="deep end, lane-rope red", surf=(250, 0.045, 0.022),
         dark=dict(accent=("ink", 0.82, 0.13, 200), soft=200, mark=(0.70, 0.17, 27), vol=(215, 0.11),
                   art=lambda t: glowat("50% -12%", "130% 55%", t["--accent"], .16)),
         light=dict(accent=("white", 0.13, 222), soft=222, mark=(0.63, 0.19, 27), vol=(222, 0.11),
                    art=lambda t: glowat("50% -12%", "130% 55%", "#7FDDF0", .30))),
    dict(id="oxblood", name="Oxblood", sub="old leather, brass", surf=(20, 0.042, 0.02),
         dark=dict(accent=("ink", 0.83, 0.095, 80), soft=80, mark=None, vol=(80, 0.10),
                   art=lambda t: glowat("50% -10%", "120% 50%", t["--accent"], .10)),
         light=dict(accent=("fixed", 0.41, 0.135, 20, (0.95, 0.05, 82)), soft=20, mark=(0.70, 0.12, 78), vol=(20, 0.12),
                    art=lambda t: None)),
    dict(id="neon", name="Neon", sub="the gym sign at 2 a.m.", surf=(288, 0.06, 0.028),
         dark=dict(accent=("ink", 0.72, 0.21, 356), soft=356, mark=(0.82, 0.13, 205), vol=(356, 0.15),
                   art=lambda t: glowat("100% 0%", "90% 40%", t["--accent"], .22) + "," + glowat("0% 35%", "80% 35%", "#38D5F0", .09)),
         light=dict(accent=("white", 0.21, 356), soft=356, mark=(0.66, 0.13, 215), vol=(356, 0.15),
                    art=lambda t: glowat("100% 0%", "90% 40%", t["--accent"], .10))),
    dict(id="chalk", name="Chalk", sub="chalk on black iron", surf=(260, 0.004, 0.003),
         dark=dict(accent=("ink", 0.95, 0.004, 90), soft=260, mark=None, vol=(260, 0.0),
                   art=lambda t: NOISE.format(v=1, a=".05")),
         light=dict(accent=("fixed", 0.25, 0.006, 260, (1.0, 0.0, 0)), soft=260, mark=None, vol=(260, 0.0),
                    art=lambda t: NOISE.format(v=0, a=".05"))),
]

# Chart colours (weight line, reps bars, compare line) per scheme and mode, from the dataviz reference
# palette; every pair checked with validate_palette.js against that scheme's panel colour (pairs.txt).
PICK = {  # sid: ((light w, r, c), (dark w, r, c))
    "rust":    (("#eb6834", "#2a78d6", "#6250d6"), ("#d95926", "#3987e5", "#9085e9")),
    "turf":    (("#008300", "#6250d6", "#2a78d6"), ("#c98500", "#3987e5", "#d55181")),
    "pool":    (("#2a78d6", "#e34948", "#eb6834"), ("#3987e5", "#d95926", "#c98500")),
    "oxblood": (("#e34948", "#2a78d6", "#6250d6"), ("#c98500", "#3987e5", "#9085e9")),
    "neon":    (("#c2185b", "#2a78d6", "#6250d6"), ("#d55181", "#3987e5", "#c98500")),
    "chalk":   (("#2a78d6", "#eb6834", "#0f8a68"), ("#3987e5", "#d95926", "#199e70")),
}

def fitL(L, C, H, ok, step):
    for _ in range(400):
        if ok(oklch(L, C, H)): return oklch(L, C, H)
        L += step
    raise SystemExit(f"cannot fit L for C={C} H={H}")

def build(sc, mode):
    h, cd, cl = sc["surf"]; spec = sc[mode]; dark = mode == "dark"
    c = cd if dark else cl
    if dark:
        t = {"--bg": oklch(0.155, c, h), "--panel": oklch(0.205, c * 1.05, h), "--panel2": oklch(0.248, c * 1.1, h),
             "--line": oklch(0.335, c * 1.15, h), "--edge": oklch(0.275, c * 1.1, h), "--text": oklch(0.955, min(c, 0.012), h)}
    else:
        t = {"--bg": oklch(0.962, c, h), "--panel": oklch(0.995, c * 0.25, h), "--panel2": oklch(0.948, c * 1.15, h),
             "--line": oklch(0.875, c * 1.3, h), "--edge": oklch(0.918, c * 1.1, h), "--text": oklch(0.185, min(c, 0.02), h)}
    surfaces = [t["--bg"], t["--panel"], t["--panel2"]]
    dimC = min(max(c, 0.012), 0.04)
    t["--dim"] = (fitL(0.70, dimC, h, lambda x: all(cr(x, s) >= 4.6 for s in surfaces), 0.004) if dark
                  else fitL(0.52, dimC, h, lambda x: all(cr(x, s) >= 4.6 for s in surfaces), -0.004))
    a = spec["accent"]
    if a[0] == "white":
        target = 4.6 if dark else 5.0
        t["--accent"] = fitL(0.62 if dark else 0.52, a[1], a[2], lambda x: cr("#FFFFFF", x) >= target, -0.004)
        t["--accent-ink"] = "#FFFFFF"
    elif a[0] == "ink":
        t["--accent"] = oklch(a[1], a[2], a[3]); t["--accent-ink"] = t["--bg"]
    else:
        t["--accent"] = oklch(a[1], a[2], a[3]); t["--accent-ink"] = oklch(*a[4])
    sh = spec["soft"]; sC = min(0.13, max(a[-2] if a[0] != "fixed" else a[2], 0.0)) if a[0] != "white" else a[1]
    sC = a[2] if a[0] == "fixed" else (a[1] if a[0] == "white" else a[2])
    if sh != (a[2] if a[0] == "white" else a[3]): sC = min(max(c * 2, 0.06), 0.12) if c > 0.01 else 0.004
    sC = min(sC, 0.14)
    t["--accent-soft"] = (fitL(0.78, sC, sh, lambda x: cr(x, t["--panel"]) >= 4.6 and cr(x, t["--panel2"]) >= 4.6, 0.004) if dark
                          else fitL(0.50, sC, sh, lambda x: cr(x, t["--panel"]) >= 4.6 and cr(x, t["--panel2"]) >= 4.6, -0.004))
    t["--mark"] = oklch(*spec["mark"]) if spec["mark"] else t["--accent"]
    t["--glow"] = rgba(t["--accent"], (0.45 if sc["id"] == "neon" else 0.36) if dark else 0.26)
    t["--viz-grid"] = oklch(0.27, c, h) if dark else oklch(0.93, c, h)
    t["--viz-base"] = oklch(0.40, c, h) if dark else oklch(0.80, c, h)
    vh, vc = spec["vol"]
    if dark: steps = [oklch(L, vc * f, vh) for L, f in [(0.29, 0.6), (0.37, 0.8), (0.45, 0.9), (0.52, 1), (0.72, 0.9)]]
    else: steps = [oklch(L, vc * f, vh) for L, f in [(0.93, 0.35), (0.84, 0.6), (0.72, 0.85), (0.50, 1), (0.38, 1)]]
    darkink = oklch(0.17, min(c, 0.02), h)
    for i, s in enumerate(steps, 1):
        t[f"--vol-{i}"] = s
        if dark: t[f"--vol-ink-{i}"] = t["--text"] if cr(s, t["--text"]) >= cr(s, darkink) else darkink
        else: t[f"--vol-ink-{i}"] = "#FFFFFF" if cr(s, "#FFFFFF") >= cr(s, t["--text"]) else t["--text"]
    # PR up/down text on the scheme's panels
    up, down = ("#3ecf6e", "#ef8080") if dark else ("#1a7f37", "#c93636")
    t["--viz-up"] = up if min(cr(up, t["--panel"]), cr(up, t["--panel2"])) >= 4.5 else fitL(0.55 if not dark else 0.75, 0.15, 145,
                    lambda x: cr(x, t["--panel"]) >= 4.5 and cr(x, t["--panel2"]) >= 4.5, -0.004 if not dark else 0.004)
    t["--viz-down"] = down if min(cr(down, t["--panel"]), cr(down, t["--panel2"])) >= 4.5 else fitL(0.55 if not dark else 0.72, 0.16, 25,
                    lambda x: cr(x, t["--panel"]) >= 4.5 and cr(x, t["--panel2"]) >= 4.5, -0.004 if not dark else 0.004)
    w, r, cc = PICK[sc["id"]][1 if dark else 0]
    t.update({"--viz-w": w, "--viz-r": r, "--viz-c": cc, "--tag-bw": r})
    art = spec["art"](t)
    t["--art"] = art if art else "none"
    return t

css, report = [], {}
for sc in SCHEMES:
    sid = sc["id"]; checks = []; out = {}
    def need(label, a, b, n): checks.append((label, round(cr(a, b), 2), n, cr(a, b) >= n))
    for mode in ("light", "dark"):
        t = build(sc, mode); out[mode] = t
        for s in ("--bg", "--panel", "--panel2"): need(f"{mode} text{s}", t["--text"], t[s], 7)
        for s in ("--bg", "--panel", "--panel2"): need(f"{mode} dim{s}", t["--dim"], t[s], 4.5)
        for s in ("--panel", "--panel2"): need(f"{mode} accent-soft{s}", t["--accent-soft"], t[s], 4.5)
        need(f"{mode} accent-ink/accent", t["--accent-ink"], t["--accent"], 4.5)
        need(f"{mode} accent-ink/accent-soft (gradient button)", t["--accent-ink"], t["--accent-soft"], 3) if mode == "dark" and sc[mode]["accent"][0] == "ink" else None
        for s in ("--bg", "--panel", "--panel2"): need(f"{mode} accent{s} (selected pill)", t["--accent"], t[s], 3)
        need(f"{mode} mark/bg (wordmark bar, decorative)", t["--mark"], t["--bg"], 1.8)
        for s in ("--panel", "--panel2"):
            need(f"{mode} viz-up{s}", t["--viz-up"], t[s], 4.5); need(f"{mode} viz-down{s}", t["--viz-down"], t[s], 4.5)
        for k in ("--viz-w", "--viz-r", "--viz-c"): need(f"{mode} {k}/panel", t[k], t["--panel"], 3)
        for i in range(1, 6): need(f"{mode} vol-{i} number", t[f"--vol-ink-{i}"], t[f"--vol-{i}"], 4.5)
        Ls = [okL(t[f"--vol-{i}"]) for i in range(1, 6)]
        mono = all(Ls[i] > Ls[i + 1] for i in range(4)) if mode == "light" else all(Ls[i] < Ls[i + 1] for i in range(4))
        checks.append((f"{mode} vol ramp monotonic", [round(x, 3) for x in Ls], "monotonic", mono))
        body = ";".join(f"{k}:{v}" for k, v in t.items())
        css.append(f".wt-root.scheme-{sid}.theme-{mode},.wt-swatch.scheme-{sid}.theme-{mode}{{{body}}}")
    report[sid] = {"name": sc["name"], "light": out["light"], "dark": out["dark"], "checks": checks, "pass": all(c[3] for c in checks)}

if len(sys.argv) > 1 and sys.argv[1] == "--json":
    print(json.dumps({k: {"light": v["light"], "dark": v["dark"]} for k, v in report.items()})); sys.exit(0)

BEGIN = "/* ---- colour schemes: generated by .testharness/schemes.py — edit the script, not these lines ---- */"
OLD_BEGIN = "/* ---- v14 colour schemes: generated by .testharness/schemes.py — edit the script, not these lines ---- */"
END = "/* ---- end of generated colour schemes ---- */"
block = BEGIN + "\n" + "\n".join(css) + "\n" + END
mode, path = sys.argv[1], sys.argv[2]
cur = open(path).read()
mark = BEGIN if BEGIN in cur else OLD_BEGIN
if mark in cur:
    before, rest = cur.split(mark, 1); after = rest.split(END, 1)[1]
else:
    before, after = cur.rstrip("\n") + "\n\n", "\n"
new = before + block + after
ok = True
for sid, r in report.items():
    bad = [c for c in r["checks"] if not c[3]]
    ok = ok and not bad
    print(f"  {'✓' if not bad else '✗'} {sid:8s} light accent {r['light']['--accent']}, dark accent {r['dark']['--accent']} — {len(r['checks'])} contrast checks")
    for c in bad: print("      FAIL", c)
if mode == "--write":
    open(path, "w").write(new); print("  wrote", path)
elif mode == "--check":
    if new != cur:
        print("  ✗ the generated colour-scheme CSS in", path, "is stale — run: python3 .testharness/schemes.py --write", path); ok = False
    else:
        print("  ✓ styles.css matches the generator")
sys.exit(0 if ok else 1)
