// Captures public/_shot/live.html at 1440x760@2x over the DevTools protocol:
//   node scripts/landing-shots/shoot.mjs <outdir>
// Real waits, not --virtual-time-budget: the map adds its GL layer on a timer
// after the data lands, and virtual time runs out before it fires. The click
// at (522,198) lands on a node and is what fires the wire in the "-picked"
// frames. Crops and JPEGs for public/landing/ were cut with sips afterwards.
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { writeFileSync } from "node:fs";

const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const W = 1440, H = 760;
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CH, [
  "--headless=new", "--remote-debugging-port=" + PORT, "--hide-scrollbars",
  `--window-size=${W},${H}`, "--user-data-dir=/tmp/dryos-shot-profile", "about:blank",
], { stdio: "ignore" });

let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(250);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 2 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("wrote", name);
}
async function open(url, wait) {
  await send("Page.navigate", { url });
  await sleep(wait);
}
async function click(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(150);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

await connect();
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

await open(`http://localhost:3000/_shot/live.html?theme=dark`, 12000);
await shot("screen-dark");
// A wire firing: click a node on the map, the chart and ticker retarget.
await click(522, 198);
await sleep(4000);
await shot("screen-dark-picked");
// Edit mode: the handles come out.
await send("Runtime.evaluate", { expression: `window.postMessage({__dryos:"mode",edit:true},"*")` });
await sleep(1200);
await shot("screen-dark-edit");

await open(`http://localhost:3000/_shot/live.html?theme=light`, 12000);
await shot("screen-light");
await click(522, 198);
await sleep(4000);
await shot("screen-light-picked");

ws.close(); chrome.kill();
