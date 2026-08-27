"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Maintainers → Dryos → applications, as a slowly orbiting 3D scene.
 *
 * Real perspective projection rather than a library: points live in 3D, get
 * rotated about Y, divided by depth, then depth-sorted before drawing. That is
 * a few dozen lines of maths against ~150 kB gzipped for three.js, which would
 * roughly double this page's payload to draw a graph of twenty nodes. It also
 * means every colour is read from the existing theme tokens, so light and dark
 * work without maintaining a second palette in JS.
 *
 * The narrative beat is the gate: most batches pass validation at the core and
 * continue out to applications; about one in nine fails, turns amber, and stops
 * dead. Flow alone is every data company's hero — the refusal is the product.
 */

const FOV = 760;
const ORBIT_SPEED = 0.00013;

const SPAWN_MS = 520;
const IN_MS = 1700;
const OUT_MS = 1500;
const REJECT_EVERY = 9;

interface P3 {
  x: number;
  y: number;
  z: number;
}

interface Node3 extends P3 {
  label: string;
  side: "in" | "out";
  r: number;
  fire: number; // ms timestamp of last activity, for the pulse
}

const MAINTAINERS = ["ERCOT", "", "", "", ""];
const APPS = ["AI agents", "RAG pipelines", "trading models", "dashboards", "data feeds"];

function buildNodes(): Node3[] {
  const nodes: Node3[] = [];
  const spread = 150;

  MAINTAINERS.forEach((label, i) => {
    const a = (i / (MAINTAINERS.length - 1) - 0.5) * Math.PI * 0.9;
    nodes.push({
      x: -195,
      y: (i / (MAINTAINERS.length - 1) - 0.5) * 268,
      z: Math.sin(a) * spread,
      label,
      side: "in",
      r: i === 0 ? 9 : 7,
      fire: -1e9,
    });
  });

  APPS.forEach((label, i) => {
    const a = (i / (APPS.length - 1) - 0.5) * Math.PI * 0.9;
    nodes.push({
      x: 190,
      y: (i / (APPS.length - 1) - 0.5) * 268,
      z: Math.sin(a) * spread,
      label,
      side: "out",
      r: 8,
      fire: -1e9,
    });
  });

  return nodes;
}

type Phase = "in" | "out" | "reject";

interface Packet {
  id: number;
  phase: Phase;
  from: number;
  to: number;
  start: number;
  live: boolean;
}

/** Quadratic bezier in 3D — the bow gives the curves depth as the scene turns. */
function bezier(a: P3, c: P3, b: P3, t: number): P3 {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  };
}

function control(a: P3, b: P3): P3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 + 120 };
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function GateScene({ apiUrl, slug }: { apiUrl: string | null; slug: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState(false);
  const liveQueue = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // A real collection fires a brighter batch than the ambient loop, so the hero
  // is a live indicator rather than pure decoration.
  useEffect(() => {
    if (!apiUrl) return;
    let seen: string | null = null;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`${apiUrl}/v1/datasets/${slug}/preview?hours=24`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const b = await r.json();
        const latest = b.intervals?.[b.intervals.length - 1]?.t ?? null;
        if (cancelled || !latest) return;
        if (seen && latest !== seen) liveQueue.current += 1;
        seen = latest;
      } catch {
        /* a dropped poll just means no live beat this cycle */
      }
    };
    poll();
    const id = setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl, slug]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;
    const ctx: CanvasRenderingContext2D = c2d;

    const nodes = buildNodes();
    const ins = nodes.map((n, i) => (n.side === "in" ? i : -1)).filter((i) => i >= 0);
    const outs = nodes.map((n, i) => (n.side === "out" ? i : -1)).filter((i) => i >= 0);
    const CORE: P3 = { x: 0, y: 0, z: 0 };

    let packets: Packet[] = [];
    let nextId = 0;
    let spawned = 0;
    let lastSpawn = 0;
    let coreFire = -1e9;
    let rejectFire = -1e9;
    let raf = 0;
    let running = false;
    let w = 0;
    let h = 0;

    // Tokens are read from the DOM so the scene follows the theme toggle rather
    // than carrying its own palette.
    let theme = readTheme();
    function readTheme() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n: string) => cs.getPropertyValue(n).trim();
      return {
        accent: v("--color-accent") || "#e8ff3d",
        warn: v("--color-warn") || "#fbbf24",
        line: v("--color-line") || "#26303d",
        lineStrong: v("--color-line-strong") || "#3d4b5c",
        ink: v("--color-ink") || "#eef2f7",
        muted: v("--color-muted") || "#9aa8ba",
        faint: v("--color-faint") || "#8998ab",
        surface: v("--color-surface") || "#10141b",
      };
    }
    const themeWatcher = new MutationObserver(() => {
      theme = readTheme();
      if (reduced) draw(performance.now());
    });
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const project = (p: P3, angle: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = p.x * cos - p.z * sin;
      const z = p.x * sin + p.z * cos;
      const s = FOV / (FOV + z + 190);
      return { sx: w * 0.45 + x * s, sy: h / 2 + p.y * s, s, z };
    };

    const rgba = (hex: string, a: number) => {
      const c = hex.replace("#", "");
      const n =
        c.length === 3
          ? c
              .split("")
              .map((d) => d + d)
              .join("")
          : c;
      const r = parseInt(n.slice(0, 2), 16);
      const g = parseInt(n.slice(2, 4), 16);
      const b = parseInt(n.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    };

    function draw(now: number) {
      const angle = reduced ? -0.32 : Math.sin(now * ORBIT_SPEED) * 0.28;
      ctx.clearRect(0, 0, w, h);

      // Edges first, far to near, so nearer curves overlay distant ones.
      const edges: { a: P3; b: P3; depth: number }[] = [];
      for (const i of ins) edges.push({ a: nodes[i], b: CORE, depth: nodes[i].z });
      for (const i of outs) edges.push({ a: CORE, b: nodes[i], depth: nodes[i].z });
      edges.sort((p, q) => q.depth - p.depth);

      for (const e of edges) {
        const c = control(e.a, e.b);
        ctx.beginPath();
        for (let k = 0; k <= 22; k++) {
          const pt = bezier(e.a, c, e.b, k / 22);
          const { sx, sy } = project(pt, angle);
          if (k) ctx.lineTo(sx, sy);
          else ctx.moveTo(sx, sy);
        }
        const mid = project(bezier(e.a, c, e.b, 0.5), angle);
        ctx.strokeStyle = rgba(theme.line, 0.55 + mid.s * 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Everything drawable, depth-sorted together so packets can pass behind
      // the core and in front of far nodes.
      type Item = { z: number; render: () => void };
      const items: Item[] = [];

      for (const n of nodes) {
        const { sx, sy, s, z } = project(n, angle);
        const heat = Math.max(0, 1 - (now - n.fire) / 600);
        items.push({
          z,
          render: () => {
            const r = n.r * s;
            if (heat > 0) {
              ctx.shadowColor = theme.accent;
              ctx.shadowBlur = 16 * heat;
            }
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle =
              heat > 0
                ? rgba(theme.accent, 0.55 + heat * 0.45)
                : rgba(theme.lineStrong, 0.45 + s * 0.5);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = rgba(theme.lineStrong, 0.5 + s * 0.4);
            ctx.lineWidth = 1;
            ctx.stroke();

            if (n.label) {
              ctx.font = `${Math.round(11 * s + 3)}px ui-monospace, SFMono-Regular, monospace`;
              ctx.textAlign = n.side === "in" ? "right" : "left";
              ctx.textBaseline = "middle";
              ctx.fillStyle = rgba(theme.muted, 0.55 + s * 0.45);
              ctx.fillText(n.label, sx + (n.side === "in" ? -r - 8 : r + 8), sy);
            }
          },
        });
      }

      // The core: two counter-rotating rings and a solid centre.
      {
        const { sx, sy, s, z } = project(CORE, angle);
        const heat = Math.max(0, 1 - (now - coreFire) / 700);
        const rejecting = Math.max(0, 1 - (now - rejectFire) / 900);
        items.push({
          z,
          render: () => {
            const R = 58 * s;
            for (let ring = 0; ring < 2; ring++) {
              const spin = now * (ring ? -0.00042 : 0.0006) + ring;
              ctx.beginPath();
              for (let k = 0; k <= 46; k++) {
                const a = (k / 46) * Math.PI * 2;
                const p = {
                  x: Math.cos(a + spin) * (ring ? 52 : 68),
                  y: Math.sin(a + spin) * (ring ? 52 : 68) * (ring ? 0.34 : 0.22),
                  z: Math.sin(a + spin) * (ring ? 52 : 68) * 0.9,
                };
                const q = project(p, angle);
                if (k) ctx.lineTo(q.sx, q.sy);
                else ctx.moveTo(q.sx, q.sy);
              }
              ctx.closePath();
              ctx.strokeStyle = rejecting
                ? rgba(theme.warn, 0.35 + rejecting * 0.5)
                : rgba(theme.accent, 0.18 + heat * 0.5);
              ctx.lineWidth = 1.2;
              ctx.stroke();
            }

            ctx.shadowColor = rejecting ? theme.warn : theme.accent;
            ctx.shadowBlur = 14 + heat * 26;
            ctx.beginPath();
            ctx.arc(sx, sy, R * 0.42, 0, Math.PI * 2);
            ctx.fillStyle = rgba(theme.surface, 0.96);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = rejecting
              ? rgba(theme.warn, 0.9)
              : rgba(theme.accent, 0.5 + heat * 0.5);
            ctx.lineWidth = 1.4;
            ctx.stroke();

            ctx.font = `600 ${Math.round(12 * s + 3)}px ui-monospace, SFMono-Regular, monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = theme.ink;
            ctx.fillText("DRYOS", sx, sy - 1);
            ctx.font = `${Math.round(9 * s + 2)}px ui-monospace, SFMono-Regular, monospace`;
            ctx.fillStyle = rejecting ? theme.warn : rgba(theme.faint, 0.9);
            ctx.fillText(rejecting ? "rejected" : "validate", sx, sy + 12 * s);
          },
        });
      }

      for (const p of packets) {
        const a = p.phase === "out" ? CORE : nodes[p.from];
        const b = p.phase === "out" ? nodes[p.to] : CORE;
        const c = control(a, b);
        const dur = p.phase === "in" ? IN_MS : p.phase === "out" ? OUT_MS : 520;
        const raw = Math.min(1, (now - p.start) / dur);
        const t = p.phase === "reject" ? 1 : ease(raw);
        const pos = bezier(a, c, b, t);
        const { sx, sy, s, z } = project(pos, angle);
        const fade = p.phase === "reject" ? Math.max(0, 1 - raw * 1.6) : 1;
        items.push({
          z,
          render: () => {
            const col = p.phase === "reject" ? theme.warn : theme.accent;
            ctx.shadowColor = col;
            ctx.shadowBlur = (p.live ? 20 : 10) * s * fade;
            ctx.beginPath();
            ctx.arc(sx, sy, (p.live ? 6 : 4.2) * s, 0, Math.PI * 2);
            ctx.fillStyle = rgba(col, fade);
            ctx.fill();
            ctx.shadowBlur = 0;
          },
        });
      }

      items.sort((p, q) => q.z - p.z);
      for (const it of items) it.render();
    }

    function step(now: number) {
      if (!running) return;

      if (now - lastSpawn > SPAWN_MS) {
        lastSpawn = now;
        const live = liveQueue.current > 0;
        if (live) liveQueue.current -= 1;
        const from = live ? ins[0] : ins[Math.floor(Math.random() * ins.length)];
        packets.push({
          id: nextId++,
          phase: "in",
          from,
          to: outs[Math.floor(Math.random() * outs.length)],
          start: now,
          live,
        });
        spawned += 1;
        nodes[from].fire = now;
      }

      for (const p of packets) {
        const dur = p.phase === "in" ? IN_MS : p.phase === "out" ? OUT_MS : 520;
        if (now - p.start < dur) continue;

        if (p.phase === "in") {
          coreFire = now;
          // The gate. A live batch always passes — it really did.
          if (!p.live && spawned % REJECT_EVERY === 0) {
            p.phase = "reject";
            rejectFire = now;
          } else {
            p.phase = "out";
          }
          p.start = now;
        } else {
          if (p.phase === "out") nodes[p.to].fire = now;
          packets = packets.filter((x) => x.id !== p.id);
        }
      }

      draw(now);
      raf = requestAnimationFrame(step);
    }

    const start = () => {
      if (raf || reduced) return;
      running = true;
      lastSpawn = performance.now();
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    if (reduced) {
      // Composed still: a few batches held mid-flight tell the same story.
      packets = [
        { id: 1, phase: "in", from: ins[0], to: outs[0], start: -IN_MS * 0.45, live: true },
        { id: 2, phase: "out", from: ins[2], to: outs[1], start: -OUT_MS * 0.5, live: false },
        { id: 3, phase: "in", from: ins[3], to: outs[2], start: -IN_MS * 0.7, live: false },
      ];
      draw(performance.now());
    } else {
      // Never burn frames on a hero nobody is looking at.
      const io = new IntersectionObserver(
        ([e]) => (e.isIntersecting ? start() : stop()),
        { threshold: 0.1 },
      );
      io.observe(canvas);
      const onVis = () =>
        document.visibilityState === "visible" ? start() : stop();
      document.addEventListener("visibilitychange", onVis);
      return () => {
        stop();
        io.disconnect();
        ro.disconnect();
        themeWatcher.disconnect();
        document.removeEventListener("visibilitychange", onVis);
      };
    }

    return () => {
      stop();
      ro.disconnect();
      themeWatcher.disconnect();
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-[400px] w-full"
      role="img"
      aria-label="Maintainers publish data batches into Dryos, which validates each one and delivers it to AI agents, RAG pipelines, trading models, dashboards and data feeds. Batches that fail validation stop at the centre."
    />
  );
}
