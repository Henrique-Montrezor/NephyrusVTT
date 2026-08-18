/**
 * DiceEngine — dados 3D com Three.js (View no MVC).
 *
 * Os dados caem e tombam com física simplificada e, ao pararem, exibem APENAS
 * o número do resultado — gravado na face que ficou voltada para a câmera.
 * Nenhum número aleatório aparece nas outras faces (ficam lisas). O resultado
 * é autoritativo do servidor.
 *
 * Three.js (import de pacote).
 */
import * as THREE from "three";

// Paleta violeta/índigo por tipo de dado (combina com o tema); d20 em destaque.
const DIE_COLORS: Record<number, number> = {
  4: 0x8b7bff,
  6: 0x6b5cf0,
  8: 0x7b6ef2,
  10: 0x5a7fe0,
  12: 0x8a6cf0,
  20: 0x6b5cf0,
  100: 0x5a7fe0,
};

const GRAVITY = -30; // unidades/s²
const FLOOR_Y = 0;
const MIN_ROLL_MS = 600; // tombamento mínimo antes de poder parar
const MAX_ROLL_MS = 1500; // limite para forçar a parada
const LEVEL_MS = 340; // nivelamento suave da face de cima
const HOLD_MS = 1800; // tempo exibindo o resultado
const FADE_MS = 450; // esmaecimento final

/** Entrada de rolagem: quantidade de faces + valor sorteado. */
interface DieInput {
  sides: number;
  value: number;
}

/** Face de um dado: centro e normal em espaço local. */
interface FaceData {
  center: THREE.Vector3;
  normal: THREE.Vector3;
}

/** Estado de um dado animado. */
interface Die {
  mesh: THREE.Mesh;
  shadow: THREE.Sprite;
  radius: number;
  restX: number;
  result: number;
  sides: number;
  faces: FaceData[];
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  phase: "roll" | "leveling" | "settled";
  born: number;
  settleAt: number;
  startQuat: THREE.Quaternion | null;
  restQuat: THREE.Quaternion | null;
  numberPlane: THREE.Mesh | null;
}

export class DiceEngine {
  mountEl: HTMLElement;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  private _dice: Die[] = [];
  private _shadowTex!: THREE.Texture;
  private _running = false;
  private _raf: number | null = null;
  private _lastT = 0;
  private _onResize: () => void;

  constructor(mountEl: HTMLElement) {
    this.mountEl = mountEl;
    this._onResize = () => this._resize();
  }

  async init(): Promise<void> {
    const width = this.mountEl.clientWidth || 800;
    const height = this.mountEl.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.pointerEvents = "none";
    this.mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Câmera afastada e inclinada — dados aparecem pequenos, como numa mesa.
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.camera.position.set(0, 8.5, 13.5);
    this.camera.lookAt(0, 0.1, 0);

    this.scene.add(new THREE.AmbientLight(0xeef0ff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(4, 12, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8b7bff, 0.6);
    rim.position.set(-8, 3, 6);
    this.scene.add(rim);

    this._shadowTex = _makeShadowTexture();

    window.addEventListener("resize", this._onResize);
  }

  private _resize(): void {
    if (!this.renderer) return;
    const width = this.mountEl.clientWidth || 800;
    const height = this.mountEl.clientHeight || 600;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Anima uma rolagem.
   */
  roll(dice: DieInput[]): void {
    if (!this.renderer || !dice?.length) return;
    this._clearDice();

    const n = Math.min(dice.length, 24);
    const spacing = 2.0;
    const startX = -((n - 1) * spacing) / 2;
    for (let i = 0; i < n; i += 1) {
      this._spawnDie(dice[i], startX + i * spacing);
    }
    this._start();
  }

  private _spawnDie(d: DieInput, x: number): void {
    const color = DIE_COLORS[d.sides] ?? 0x7b6ef2;
    const geo = _geometryFor(d.sides);
    geo.computeBoundingSphere();
    const radius = geo.boundingSphere!.radius;

    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.2,
      roughness: 0.4,
      emissive: new THREE.Color(color).multiplyScalar(0.08),
      flatShading: true,
    });
    mat.userData.baseOpacity = 1;
    const mesh = new THREE.Mesh(geo, mat);

    // Arestas suaves para dar definição às facetas.
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
    });
    edgeMat.userData.baseOpacity = 0.22;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));

    const restX = x + (Math.random() - 0.5) * 0.6;
    mesh.position.set(restX, 5.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

    const shadow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    shadow.scale.set(radius * 3, radius * 1.4, 1);
    shadow.position.set(restX, FLOOR_Y + 0.02, mesh.position.z);

    this.scene.add(mesh);
    this.scene.add(shadow);

    this._dice.push({
      mesh,
      shadow,
      radius,
      restX,
      result: Math.abs(d.value),
      sides: d.sides,
      faces: _faceData(geo), // { center, normal } em espaço local
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2),
      ang: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      ),
      phase: "roll",
      born: performance.now(),
      settleAt: 0,
      startQuat: null,
      restQuat: null,
      numberPlane: null,
    });
  }

  private _start(): void {
    if (this._running) return;
    this._running = true;
    this._lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.04, (t - this._lastT) / 1000);
      this._lastT = t;
      this._update(t, dt);
      this.renderer.render(this.scene, this.camera);
      if (this._dice.length) {
        this._raf = requestAnimationFrame(loop);
      } else {
        this._running = false;
        this._raf = null;
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  private _update(now: number, dt: number): void {
    for (const d of [...this._dice]) {
      const { mesh, shadow, radius } = d;
      const age = now - d.born;

      if (d.phase === "roll") {
        d.vel.y += GRAVITY * dt;
        mesh.position.addScaledVector(d.vel, dt);
        if (mesh.position.y <= FLOOR_Y + radius) {
          mesh.position.y = FLOOR_Y + radius;
          d.vel.y = -d.vel.y * 0.36;
          d.vel.x *= 0.7;
          d.vel.z *= 0.7;
          d.ang.multiplyScalar(0.68);
        }
        mesh.rotation.x += d.ang.x * dt;
        mesh.rotation.y += d.ang.y * dt;
        mesh.rotation.z += d.ang.z * dt;
        d.ang.multiplyScalar(1 - 0.5 * dt);

        const onFloor = mesh.position.y <= FLOOR_Y + radius + 0.05;
        const calm = onFloor && d.vel.length() < 0.6 && d.ang.length() < 1.4;
        if ((age > MIN_ROLL_MS && calm) || age > MAX_ROLL_MS) {
          this._beginLevel(d, now);
        }
      } else {
        // Nivela a face de cima em direção à câmera e assenta.
        const k = _easeOut(Math.min(1, (now - d.settleAt) / LEVEL_MS));
        mesh.quaternion.copy(d.startQuat!).slerp(d.restQuat!, k);
        mesh.position.y += (FLOOR_Y + radius - mesh.position.y) * Math.min(1, dt * 12);
        mesh.position.x += (d.restX - mesh.position.x) * Math.min(1, dt * 8);
        if (d.numberPlane) {
          const npMat = d.numberPlane.material as THREE.Material;
          const base = npMat.userData.baseOpacity as number;
          npMat.opacity = Math.min(base, npMat.opacity + dt * 6);
        }
      }

      // Sombra de contato.
      shadow.position.x = mesh.position.x;
      shadow.position.z = mesh.position.z;
      const h = Math.max(0, mesh.position.y - radius);
      shadow.material.opacity = Math.max(0, 0.45 - h * 0.09);
      const s = 1 + h * 0.14;
      shadow.scale.set(radius * 3 * s, radius * 1.4 * s, 1);

      // Exibe por um tempo e some.
      if (d.phase === "settled") {
        const shown = now - d.settleAt - LEVEL_MS;
        if (shown >= HOLD_MS) {
          const kf = Math.max(0, 1 - (shown - HOLD_MS) / FADE_MS);
          mesh.traverse((o) => {
            const mtl = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (mtl) {
              mtl.transparent = true;
              mtl.opacity = ((mtl.userData.baseOpacity as number) ?? 1) * kf;
            }
          });
          shadow.material.opacity *= kf;
          if (kf <= 0) this._remove(d);
        }
      } else if (d.phase === "leveling" && now - d.settleAt >= LEVEL_MS) {
        d.phase = "settled";
      }
    }
  }

  /** Escolhe a face voltada à câmera, grava o resultado nela e nivela o dado. */
  private _beginLevel(d: Die, now: number): void {
    d.phase = "leveling";
    d.settleAt = now;
    const { mesh, faces, result, sides, radius } = d;

    const camDir = this.camera.position.clone().sub(mesh.position).normalize();
    const wn = new THREE.Vector3();
    let best = 0;
    let bestDot = -Infinity;
    faces.forEach((f, i) => {
      wn.copy(f.normal).applyQuaternion(mesh.quaternion);
      const dot = wn.dot(camDir);
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    });

    const face = faces[best];

    // Cria o ÚNICO número (o resultado) sobre essa face.
    const size = radius * 1.15;
    const n = face.normal.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const worldFwd = new THREE.Vector3(0, 0, 1);
    const ref = Math.abs(n.dot(worldUp)) > 0.9 ? worldFwd : worldUp;
    const right = new THREE.Vector3().crossVectors(ref, n).normalize();
    const up = new THREE.Vector3().crossVectors(n, right).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, n);

    const mat = new THREE.MeshBasicMaterial({
      map: _makeNumberTexture(result, sides),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 0,
    });
    mat.userData.baseOpacity = 1;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    plane.position.copy(face.center).addScaledVector(n, 0.03);
    plane.quaternion.setFromRotationMatrix(basis);
    mesh.add(plane);
    d.numberPlane = plane;

    // Nivela a face escolhida em direção à câmera (giro pequeno = natural).
    const worldNormal = n.clone().applyQuaternion(mesh.quaternion).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(worldNormal, camDir);
    d.startQuat = mesh.quaternion.clone();
    d.restQuat = delta.multiply(mesh.quaternion.clone());
  }

  private _remove(entry: Die): void {
    const dispose = (o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
      if (mat) {
        mat.map?.dispose?.();
        mat.dispose?.();
      }
    };
    entry.mesh.traverse(dispose);
    this.scene.remove(entry.mesh);
    this.scene.remove(entry.shadow);
    entry.shadow.material.dispose();
    this._dice = this._dice.filter((d) => d !== entry);
  }

  private _clearDice(): void {
    for (const d of [...this._dice]) this._remove(d);
  }

  dispose(): void {
    window.removeEventListener("resize", this._onResize);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._clearDice();
    this._shadowTex?.dispose();
    this.renderer?.dispose();
  }
}

// --- Geometrias por número de faces (pequenas) ---

function _geometryFor(sides: number): THREE.BufferGeometry {
  switch (sides) {
    case 4:
      return new THREE.TetrahedronGeometry(0.85);
    case 6:
      return new THREE.BoxGeometry(1.05, 1.05, 1.05);
    case 8:
      return new THREE.OctahedronGeometry(0.9);
    case 10:
    case 100:
      return _pentagonalBipyramid(0.78, 0.98);
    case 12:
      return new THREE.DodecahedronGeometry(0.92);
    case 20:
      return new THREE.IcosahedronGeometry(0.98);
    default:
      return new THREE.IcosahedronGeometry(0.92);
  }
}

/** Bipirâmide pentagonal (10 faces triangulares) — aproxima o d10. */
function _pentagonalBipyramid(radius: number, halfHeight: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const top = [0, halfHeight, 0];
  const bottom = [0, -halfHeight, 0];
  const eq: number[][] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    eq.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  for (let i = 0; i < 5; i += 1) {
    const next = (i + 1) % 5;
    positions.push(...top, ...eq[i], ...eq[next]);
    positions.push(...bottom, ...eq[next], ...eq[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Agrupa triângulos por normal → { center, normal } de cada face. */
function _faceData(geo: THREE.BufferGeometry): FaceData[] {
  // BoxGeometry (d6) é indexada: os vértices só formam triângulos via índice.
  // Convertemos para não-indexada para ler os triângulos na ordem correta.
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute("position") as THREE.BufferAttribute;
  const groups = new Map<string, { normal: THREE.Vector3; sum: THREE.Vector3; count: number }>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    nrm.copy(ab).cross(ac).normalize();
    const key = `${nrm.x.toFixed(2)},${nrm.y.toFixed(2)},${nrm.z.toFixed(2)}`;
    const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    if (!groups.has(key)) {
      groups.set(key, { normal: nrm.clone(), sum: center.clone(), count: 1 });
    } else {
      const g = groups.get(key)!;
      g.sum.add(center);
      g.count += 1;
    }
  }
  if (src !== geo) src.dispose();
  return [...groups.values()].map((g) => ({
    normal: g.normal,
    center: g.sum.divideScalar(g.count),
  }));
}

/** Textura do número (glifo branco com contorno escuro, fundo transparente). */
function _makeNumberTexture(value: number, sides: number): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, s, s);
  const label = sides === 100 ? String(value).padStart(2, "0") : String(value);
  const fontSize = label.length > 2 ? 58 : label.length > 1 ? 72 : 88;
  ctx.font = `800 ${fontSize}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(12, 10, 40, 0.92)";
  ctx.strokeText(label, s / 2, s / 2 + 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, s / 2, s / 2 + 4);
  if (value === 6 || value === 9) {
    ctx.fillRect(s / 2 - 16, s / 2 + fontSize * 0.42, 32, 6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** Textura radial suave para a sombra de contato. */
function _makeShadowTexture(): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(20,18,50,0.5)");
  grad.addColorStop(0.6, "rgba(20,18,50,0.24)");
  grad.addColorStop(1, "rgba(20,18,50,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

function _easeOut(t: number): number {
  t = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - t, 3);
}
