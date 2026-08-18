/**
 * AuroraBackground — fundo animado "aurora" em WebGL (bem sutil).
 *
 * Porta vanilla (sem dependências) inspirada no efeito Aurora do reactbits.dev.
 * Renderiza faixas de luz fluindo no topo da tela, em tons de verde-água, com
 * ruído simplex animado. Roda num canvas fixo atrás de toda a interface.
 *
 * Degrada com elegância: se WebGL não estiver disponível, simplesmente não faz
 * nada (o gradiente CSS do body continua servindo de fundo).
 */

const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Fragment shader: ruído simplex 2D -> altura da aurora -> cores em rampa.
const FRAG = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uAmplitude;
uniform float uIntensity;

// --- Simplex noise 2D (Ashima Arts / Stefan Gustavson) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return mix(uColorA, uColorB, t * 2.0);
  return mix(uColorB, uColorC, (t - 0.5) * 2.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Duas camadas de ruído em velocidades diferentes = movimento orgânico.
  float n1 = snoise(vec2(uv.x * 2.2 + uTime * 0.06, uTime * 0.10));
  float n2 = snoise(vec2(uv.x * 4.0 - uTime * 0.04, uTime * 0.16 + 5.0));
  float noise = (n1 * 0.6 + n2 * 0.4);

  // Linha-base da aurora perto do topo, ondulando com o ruído.
  float base = 0.62 + noise * 0.12 * uAmplitude;
  float dist = uv.y - base;

  // Brilho concentrado ao redor da linha, esmaecendo para cima e para baixo.
  float glow = exp(-pow(dist * 6.0, 2.0)) * 0.9;
  glow += smoothstep(0.32, 1.0, uv.y) * 0.12; // leve véu no topo

  // Cor da rampa varia ao longo da largura + ruído.
  vec3 color = ramp(uv.x * 0.7 + noise * 0.25 + 0.15);

  float alpha = clamp(glow * uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export class AuroraBackground {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | null;
  program: WebGLProgram | null;
  uniforms: Record<string, WebGLUniformLocation | null>;
  private _raf: number | null;
  private _start: number;
  private _onResize: () => void;
  colorA: number[];
  colorB: number[];
  colorC: number[];
  amplitude: number;
  intensity: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.uniforms = {};
    this._raf = null;
    this._start = 0;
    this._onResize = () => this._resize();
    // Tons de violeta/índigo suaves — combinam com o acento e são discretos.
    this.colorA = [0.42, 0.36, 0.94];
    this.colorB = [0.55, 0.48, 1.0];
    this.colorC = [0.35, 0.74, 0.98];
    this.amplitude = 1.0;
    this.intensity = 0.7;
  }

  init(): boolean {
    const gl =
      (this.canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true }) ||
        this.canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      console.warn("[Aurora] WebGL indisponível — usando apenas o fundo CSS.");
      return false;
    }
    this.gl = gl;

    const program = this._buildProgram(VERT, FRAG);
    if (!program) return false;
    this.program = program;
    gl.useProgram(program);

    // Quad em tela cheia (dois triângulos).
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {
      uTime: gl.getUniformLocation(program, "uTime"),
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uColorA: gl.getUniformLocation(program, "uColorA"),
      uColorB: gl.getUniformLocation(program, "uColorB"),
      uColorC: gl.getUniformLocation(program, "uColorC"),
      uAmplitude: gl.getUniformLocation(program, "uAmplitude"),
      uIntensity: gl.getUniformLocation(program, "uIntensity"),
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this._resize();
    window.addEventListener("resize", this._onResize);
    this._start = performance.now();
    this._loop();
    return true;
  }

  private _buildProgram(vsrc: string, fsrc: string): WebGLProgram | null {
    const gl = this.gl!;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("[Aurora] shader:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[Aurora] link:", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  private _resize(): void {
    const gl = this.gl;
    if (!gl) return;
    // Meia resolução: barato e suave (é só um fundo desfocado).
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  private _loop(): void {
    const gl = this.gl!;
    const render = (now: number) => {
      const t = (now - this._start) / 1000;
      gl.uniform1f(this.uniforms.uTime, t);
      gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform3fv(this.uniforms.uColorA, this.colorA);
      gl.uniform3fv(this.uniforms.uColorB, this.colorB);
      gl.uniform3fv(this.uniforms.uColorC, this.colorC);
      gl.uniform1f(this.uniforms.uAmplitude, this.amplitude);
      gl.uniform1f(this.uniforms.uIntensity, this.intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this._raf = requestAnimationFrame(render);
    };
    this._raf = requestAnimationFrame(render);
  }

  dispose(): void {
    window.removeEventListener("resize", this._onResize);
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}
