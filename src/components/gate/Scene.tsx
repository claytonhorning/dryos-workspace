"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";

/**
 * Maintainers → Dryos → applications, in three.js.
 *
 * Bloom is doing most of the work: emissive spheres through a bloom pass is
 * what separates "premium hero" from "debug diagram", and it is the one thing
 * the hand-rolled canvas version could not fake.
 *
 * Theme colours arrive as props, read from the CSS custom properties by the
 * wrapper, so the scene matches light and dark without a second palette.
 */

const SPAWN_MS = 420;
const IN_MS = 1700;
const OUT_MS = 1500;
const REJECT_EVERY = 9;
const MAX_PACKETS = 26;

export interface Palette {
  accent: string;
  warn: string;
  dim: string;
}

function cluster(count: number, x: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (x < 0 ? 0.4 : 1.1);
    const t = i / (count - 1) - 0.5;
    return new THREE.Vector3(x, t * 3.0, Math.cos(a) * 0.85);
  });
}

/** Bowed toward the viewer so curves read as depth, not as flat spokes. */
function curveBetween(a: THREE.Vector3, b: THREE.Vector3) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.z += 1.15;
  mid.y *= 0.55;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function Node({
  position,
  accent,
  dim,
  size,
  fire,
}: {
  position: THREE.Vector3;
  accent: string;
  dim: string;
  size: number;
  fire: { current: number };
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const base = useMemo(() => new THREE.Color(dim), [dim]);
  const hot = useMemo(() => new THREE.Color(accent), [accent]);

  useFrame(({ clock }) => {
    if (!mat.current || !mesh.current) return;
    const heat = Math.max(0, 1 - (clock.elapsedTime * 1000 - fire.current) / 700);
    mat.current.emissive.copy(base).lerp(hot, heat);
    mat.current.emissiveIntensity = 0.9 + heat * 3.0;
    mesh.current.scale.setScalar(1 + heat * 0.45);
  });

  return (
    <mesh ref={mesh} position={position}>
      <sphereGeometry args={[size, 24, 24]} />
      <meshStandardMaterial
        ref={mat}
        color="#07090c"
        emissive={base}
        emissiveIntensity={0.9}
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}

function Core({
  accent,
  warn,
  pulse,
  reject,
}: {
  accent: string;
  warn: string;
  pulse: { current: number };
  reject: { current: number };
}) {
  const inner = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const accentC = useMemo(() => new THREE.Color(accent), [accent]);
  const warnC = useMemo(() => new THREE.Color(warn), [warn]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const ms = t * 1000;
    if (ringA.current) {
      ringA.current.rotation.z = t * 0.35;
      ringA.current.rotation.x = Math.PI / 2.6;
    }
    if (ringB.current) {
      ringB.current.rotation.z = -t * 0.24;
      ringB.current.rotation.x = Math.PI / 1.7;
    }
    if (inner.current) {
      inner.current.rotation.y = t * 0.45;
      inner.current.rotation.x = t * 0.2;
    }
    if (mat.current) {
      const p = Math.max(0, 1 - (ms - pulse.current) / 700);
      const r = Math.max(0, 1 - (ms - reject.current) / 900);
      mat.current.emissive.copy(accentC).lerp(warnC, r);
      mat.current.emissiveIntensity = 0.85 + p * 1.6 + r * 2.2;
    }
  });

  return (
    <group>
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial
          ref={mat}
          color="#07090c"
          emissive={accentC}
          emissiveIntensity={0.85}
          roughness={0.15}
          metalness={0.5}
          flatShading
        />
      </mesh>
      <mesh ref={ringA}>
        <torusGeometry args={[1.05, 0.014, 12, 96]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={1.15}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ringB}>
        <torusGeometry args={[1.34, 0.009, 12, 96]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={1.1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Link({ curve, color }: { curve: THREE.QuadraticBezierCurve3; color: string }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 44, 0.009, 6, false), [curve]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
    </mesh>
  );
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

function Flow({
  ins,
  outs,
  accent,
  warn,
  liveQueue,
  onCore,
  onReject,
  onNode,
}: {
  ins: THREE.Vector3[];
  outs: THREE.Vector3[];
  accent: string;
  warn: string;
  liveQueue: { current: number };
  onCore: (ms: number) => void;
  onReject: (ms: number) => void;
  onNode: (side: "in" | "out", i: number, ms: number) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const packets = useRef<Packet[]>([]);
  const nextId = useRef(0);
  const spawned = useRef(0);
  const lastSpawn = useRef(0);

  const origin = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const inCurves = useMemo(() => ins.map((p) => curveBetween(p, origin)), [ins, origin]);
  const outCurves = useMemo(() => outs.map((p) => curveBetween(origin, p)), [outs, origin]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const accentC = useMemo(() => new THREE.Color(accent), [accent]);
  const warnC = useMemo(() => new THREE.Color(warn), [warn]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    const mesh = meshRef.current;
    if (!mesh) return;

    if (now - lastSpawn.current > SPAWN_MS && packets.current.length < MAX_PACKETS) {
      lastSpawn.current = now;
      const live = liveQueue.current > 0;
      if (live) liveQueue.current -= 1;
      const from = live ? 0 : Math.floor(Math.random() * ins.length);
      packets.current.push({
        id: nextId.current++,
        phase: "in",
        from,
        to: Math.floor(Math.random() * outs.length),
        start: now,
        live,
      });
      spawned.current += 1;
      onNode("in", from, now);
    }

    for (const p of packets.current) {
      const dur = p.phase === "in" ? IN_MS : p.phase === "out" ? OUT_MS : 520;
      if (now - p.start < dur) continue;
      if (p.phase === "in") {
        onCore(now);
        // The gate: a batch that fails validation stops here rather than
        // reaching an application stale. A live batch always passes — it did.
        if (!p.live && spawned.current % REJECT_EVERY === 0) {
          p.phase = "reject";
          onReject(now);
        } else {
          p.phase = "out";
        }
        p.start = now;
      } else {
        if (p.phase === "out") onNode("out", p.to, now);
        packets.current = packets.current.filter((x) => x.id !== p.id);
      }
    }

    let i = 0;
    for (const p of packets.current) {
      if (i >= MAX_PACKETS) break;
      const curve = p.phase === "out" ? outCurves[p.to] : inCurves[p.from];
      const dur = p.phase === "in" ? IN_MS : p.phase === "out" ? OUT_MS : 520;
      const raw = Math.min(1, (now - p.start) / dur);
      const t = p.phase === "reject" ? 1 : ease(raw);
      const fade = p.phase === "reject" ? Math.max(0, 1 - raw * 1.6) : 1;

      dummy.position.copy(curve.getPoint(t));
      dummy.scale.setScalar((p.live ? 1.8 : 1) * (0.35 + fade * 0.65));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.phase === "reject" ? warnC : accentC);
      i++;
    }
    for (let k = i; k < MAX_PACKETS; k++) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      {inCurves.map((c, i) => (
        <Link key={`i${i}`} curve={c} color={accent} />
      ))}
      {outCurves.map((c, i) => (
        <Link key={`o${i}`} curve={c} color={accent} />
      ))}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, MAX_PACKETS]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.08, 14, 14]} />
        <meshStandardMaterial
          emissive="#ffffff"
          emissiveIntensity={3.6}
          color="#ffffff"
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

/** Slow lateral drift — enough to read as 3D without inducing seasickness. */
function Rig() {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.11) * 1.2;
    camera.position.y = 0.4 + Math.sin(t * 0.08) * 0.3;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function Scene({
  palette,
  liveQueue,
}: {
  palette: Palette;
  liveQueue: { current: number };
}) {
  const ins = useMemo(() => cluster(5, -3.5), []);
  const outs = useMemo(() => cluster(5, 3.5), []);

  const corePulse = useRef(-1e9);
  const coreReject = useRef(-1e9);
  const inFire = useRef<number[]>(ins.map(() => -1e9));
  const outFire = useRef<number[]>(outs.map(() => -1e9));
  const [ready, setReady] = useState(false);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, 8.4], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={() => setReady(true)}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.55} />
      <pointLight position={[0, 2, 4]} intensity={22} color={palette.accent} distance={20} />
      <pointLight position={[-5, -1, 3]} intensity={8} color={palette.accent} distance={16} />

      <Rig />

      {ins.map((p, i) => (
        <Node
          key={`in${i}`}
          position={p}
          accent={palette.accent}
          dim={palette.dim}
          size={i === 0 ? 0.2 : 0.145}
          fire={{
            get current() {
              return inFire.current[i];
            },
            set current(v: number) {
              inFire.current[i] = v;
            },
          }}
        />
      ))}
      {outs.map((p, i) => (
        <Node
          key={`out${i}`}
          position={p}
          accent={palette.accent}
          dim={palette.dim}
          size={0.165}
          fire={{
            get current() {
              return outFire.current[i];
            },
            set current(v: number) {
              outFire.current[i] = v;
            },
          }}
        />
      ))}

      <Core
        accent={palette.accent}
        warn={palette.warn}
        pulse={corePulse}
        reject={coreReject}
      />

      <Flow
        ins={ins}
        outs={outs}
        accent={palette.accent}
        warn={palette.warn}
        liveQueue={liveQueue}
        onCore={(ms) => (corePulse.current = ms)}
        onReject={(ms) => (coreReject.current = ms)}
        onNode={(side, i, ms) => {
          if (side === "in") inFire.current[i] = ms;
          else outFire.current[i] = ms;
        }}
      />

      {ready && (
        <EffectComposer>
          <Bloom
            intensity={0.95}
            luminanceThreshold={0.3}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}
