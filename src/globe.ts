/*! Glimmer | Developed by jvz | MIT License */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COLORS, seedRandom, type PointData, type View } from './data';
import { curlGLSL, easingGLSL } from './motion';

const RAD = Math.PI / 180;
const RADIUS = 1.6;
const clamp = THREE.MathUtils.clamp;
const approach = (value: number, target: number, delta: number) =>
  value + clamp(target - value, -delta, delta);

export interface Projection {
  i: number;
  x: number;
  y: number;
  front: boolean;
}

interface Callbacks {
  select: (index: number) => void;
  hover: (point: Projection | null) => void;
  frame: (selected: Projection | null, labels: Projection[], zoom: number) => void;
  move: () => void;
}

function geo(lat: number, lng: number, radius = RADIUS) {
  return new THREE.Vector3(
    radius * Math.cos(lat * RAD) * Math.cos(lng * RAD),
    radius * Math.sin(lat * RAD),
    -radius * Math.cos(lat * RAD) * Math.sin(lng * RAD),
  );
}

const vertex = `
attribute vec3 aNebula;
attribute vec3 aBlossom;
attribute vec3 aColor;
attribute float aSeed;
attribute float aSize;
attribute float aVisible;
attribute float aDensity;
uniform float uView;
uniform float uBlossom;
uniform float uTime;
uniform float uRatio;
uniform float uSelected;
uniform float uOpacity;
uniform float uBrightness;
uniform float uIntro;
${curlGLSL}
${easingGLSL}
attribute float aIndex;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float e = easeCubic(clamp((uView - aSeed * .4) / .6, 0., 1.));
  vec3 p = mix(mix(position, aBlossom, uBlossom), aNebula, e);
  float mid = sin(e * 3.14159265);
  if (mid > .002) p += curl(p * .35 + vec3(uTime * .08, 0., aSeed * 2.)) * mid * (.5 + aSeed * 1.6);
  float intro = easeCubic(clamp((uIntro - aSeed * .5) / .5, 0., 1.));
  if (intro < .999) {
    vec3 scatter = normalize(position + vec3(aSeed - .5, fract(aSeed * 13.1) - .5, fract(aSeed * 7.7) - .5) * 2.) * (6. + aSeed * 6.);
    p = mix(scatter, p, intro);
  }
  vec4 world = modelMatrix * vec4(p, 1.);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  float facing = smoothstep(-.128, .448, world.z);
  float selected = 1. - step(.1, abs(aIndex - uSelected));
  float sparkle = .8 + .2 * sin(uTime * (.3 + aSeed) + aSeed * 200.);
  gl_PointSize = clamp((aSize * mix(1., 2.1, e) + selected * 3.5) * uRatio * 4.5 / -mv.z, 1.2, 24.) * aVisible;
  vColor = mix(mix(vec3(.95, .9, .82), aColor, mix(.45, 1., e)), vec3(1., .64, .4), selected * .8);
  vAlpha = mix(.08 + facing * .85, .9, e) * (.16 + clamp((aSize - 1.45) / 3.05, 0., 1.) * .7) * mix(aDensity, 1., max(e, uBlossom)) * sparkle * aVisible * intro * mix(1., 1.4, e) * uOpacity * uBrightness;
}
`;
const fragment = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - .5) * 2.;
  if (r > 1.) discard;
  float glow = pow(1. - r, 2.6);
  gl_FragColor = vec4(vColor * (1. + glow * .7), glow * vAlpha);
}
`;

const surfaceVertex = `
  uniform float uRatio;
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.);
    vec3 normal = normalize(mat3(modelMatrix) * normalize(position));
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    float front = smoothstep(-.08, .25, normal.z);
    float rim = pow(1. - abs(normal.z), 3.);
    float light = pow(max(0., dot(normal, normalize(vec3(-.7, .55, .4)))), 8.);
    gl_PointSize = clamp(uRatio * (5. + light * 6.) / -mv.z, .9, 3.);
    vAlpha = uOpacity * front * (.14 + rim * .26 + light * .65);
    vColor = mix(vec3(.15, .31, .29), vec3(.86, .87, .78), light);
  }
`;

export class Globe {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.02, 100);
  readonly world = new THREE.Group();
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly land: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly surface: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  exhibition = true;
  private exhibitionMix = 1;
  readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly visible: Float32Array;
  readonly positions: Float32Array;
  readonly nebula: Float32Array;
  readonly blossoms: Float32Array;
  readonly groupCenters: THREE.Vector3[] = [];
  readonly groupSpreads: number[];
  view: View = 'earth';
  selected = -1;
  pinned = false;
  autoRotate = false;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  distance = 6.2;
  targetDistance = 6.2;
  targetX = 0.35;
  targetY = -170 * RAD;
  visibleCount: number;
  private rotX = 0.35;
  private rotY = -170 * RAD;
  private velocityX = 0;
  private velocityY = 0;
  private morph = 0;
  private intro = 0.8;
  private blossom = 0;
  private bloomEnabled = true;
  private currentOverviewDistance = 6.2;
  private sized = false;
  private frameId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private lastLabels = 0;
  private lastAction = performance.now();
  private manualUntil = 0;
  private pointer = new THREE.Vector2(9999, 9999);
  private pointers = new Map<number, THREE.Vector2>();
  private previousPinch = 0;
  private dragDistance = 0;
  private pointerStart = 0;
  private hadPinch = false;
  private lastBlossom = '';
  private temp = new THREE.Vector3();
  private transform = new THREE.Matrix4();
  private abort = new AbortController();
  private pendingHover: Projection | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly data: PointData,
    landDots: number[],
    private callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor('#101f1d');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.scene.add(this.world);
    this.visibleCount = data.lat.length;
    this.visible = new Float32Array(data.lat.length).fill(1);
    this.positions = new Float32Array(data.lat.length * 3);
    this.nebula = new Float32Array(this.positions.length);
    this.blossoms = new Float32Array(this.positions.length);
    const random = seedRandom(7);
    const colors = new Float32Array(this.positions.length);
    const sizes = new Float32Array(data.lat.length);
    const seeds = sizes.slice();
    const indices = sizes.slice();
    const density = new Float32Array(data.lat.length);
    const cells = new Map<string, number>();
    const cell = (i: number) =>
      `${Math.floor(data.lat[i] / 50)},${Math.floor(data.lng[i] / 50)}`;
    for (let i = 0; i < data.lat.length; i++) {
      cells.set(cell(i), (cells.get(cell(i)) || 0) + 1);
    }
    const groupCounts = data.groups.map((_, g) => data.group.filter(v => v === g).length);
    const largest = Math.max(...groupCounts);
    this.groupSpreads = groupCounts.map(count => 0.35 + 0.95 * Math.sqrt(count / largest));
    for (let g = 0; g < data.groups.length; g++) {
      const a = g / data.groups.length * Math.PI * 2 + 0.3;
      const radius = 3 + g % 2 * 0.9;
      this.groupCenters.push(new THREE.Vector3(
        Math.cos(a) * radius,
        Math.sin(g * 1.9) * 0.7,
        Math.sin(a) * radius,
      ));
    }
    const gaussian = () =>
      Math.sqrt(-2 * Math.log(Math.max(0.0001, random()))) * Math.cos(random() * Math.PI * 2);
    for (let i = 0; i < data.lat.length; i++) {
      geo(data.lat[i] / 100, data.lng[i] / 100, RADIUS * 1.004).toArray(this.positions, i * 3);
      const g = data.group[i];
      const center = this.groupCenters[g];
      const spread = this.groupSpreads[g];
      // Country offsets form small lobes inside each flattened cloud.
      const country = data.country[i];
      const vertical = 1 - (country + 0.5) / data.countries.length * 2;
      const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const angle = country * Math.PI * (3 - Math.sqrt(5)) * 3.1;
      const offset = spread * 0.62;
      this.nebula.set([
        center.x + Math.cos(angle) * horizontal * offset + gaussian() * spread * 0.30,
        center.y + vertical * offset * 0.45 + gaussian() * spread * 0.16,
        center.z + Math.sin(angle) * horizontal * offset + gaussian() * spread * 0.30,
      ], i * 3);
      new THREE.Color(COLORS[g]).toArray(colors, i * 3);
      seeds[i] = random();
      sizes[i] = 1.45 + clamp(data.pop[i] / 9, 0, 1) * 3.05;
      indices[i] = i;
      density[i] = 1 / (1 + Math.sqrt((cells.get(cell(i)) || 1) - 1) * 0.6);
    }
    this.blossoms.set(this.positions);
    const geometry = new THREE.BufferGeometry();
    for (const [key, value, itemSize] of [
      ['aDensity', density, 1],
      ['position', this.positions, 3],
      ['aNebula', this.nebula, 3],
      ['aBlossom', this.blossoms, 3],
      ['aColor', colors, 3],
      ['aSize', sizes, 1],
      ['aSeed', seeds, 1],
      ['aVisible', this.visible, 1],
      ['aIndex', indices, 1],
    ] as const) {
      geometry.setAttribute(key, new THREE.BufferAttribute(value, itemSize));
    }
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uIntro: { value: 0.8 },
        uView: { value: 0 },
        uBlossom: { value: 0 },
        uTime: { value: 0 },
        uRatio: { value: this.renderer.getPixelRatio() },
        uSelected: { value: -1 },
        uOpacity: { value: 1 },
        uBrightness: { value: 1 },
      },
    }));
    this.points.frustumCulled = false;
    this.world.add(this.points);

    const landPosition = new Float32Array(landDots.length / 2 * 3);
    for (let i = 0; i < landDots.length / 2; i++) {
      geo(landDots[i * 2] / 100, landDots[i * 2 + 1] / 100, RADIUS * 0.997)
        .toArray(landPosition, i * 3);
    }
    this.land = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(landPosition, 3),
      ),
      new THREE.ShaderMaterial({
        vertexShader: `uniform float uRatio; varying float vAlpha;
        void main(){ vec4 w = modelMatrix * vec4(position,1.); vec4 mv = viewMatrix*w;
        gl_Position=projectionMatrix*mv; gl_PointSize=clamp(uRatio*9.6/-mv.z,1.,3.);
        vAlpha=.08+smoothstep(-.4,1.3,w.z)*.52; }`,
        fragmentShader: `uniform float uOpacity; varying float vAlpha;
        void main(){float r=length(gl_PointCoord-.5)*2.; if(r>1.)discard;
        gl_FragColor=vec4(.18,.24,.22,pow(1.-r,1.1)*vAlpha*uOpacity);}`,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uRatio: { value: this.renderer.getPixelRatio() },
          uOpacity: { value: 1 },
        },
      }),
    );
    this.land.frustumCulled = false;
    this.world.add(this.land);

    const surfacePositions: number[] = [];
    for (let lat = -89; lat < 90; lat += 0.8) {
      const step = 0.8 / Math.max(0.03, Math.cos(lat * RAD));
      for (let lng = -180; lng < 180; lng += step) {
        surfacePositions.push(...geo(lat, lng, RADIUS * 0.994).toArray());
      }
    }
    this.surface = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(surfacePositions, 3),
      ),
      new THREE.ShaderMaterial({
        vertexShader: surfaceVertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uOpacity: { value: 1 },
          uRatio: { value: this.renderer.getPixelRatio() },
        },
      }),
    );
    this.world.add(this.surface);

    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec2 uPointer;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec2 p=vUv+uPointer*.008; float fog=exp(-length((p-vec2(.38,.4))*vec2(2.,1.3))*3.);
        vec3 color=vec3(.004,.0098,.009)+vec3(.003,.0072,.005)*fog;
        color += (hash(vUv*vec2(1740.,1200.)+fract(uTime*.01))-.5)*.0018;
        color*=.78+pow(1.-length(vUv-.5),2.)*.28; gl_FragColor=vec4(color,1.);}`,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
      },
    }));
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = -10;
    this.scene.add(this.backdrop);
    const starPositions = new Float32Array(1100 * 3);
    const starColors = new Float32Array(1100 * 3);
    for (let i = 0; i < 1100; i++) {
      starPositions.set([
        (random() - 0.5) * 32,
        (random() - 0.5) * 24,
        -5 - random() * 12,
      ], i * 3);
      new THREE.Color(i % 4 ? '#58756f' : '#bb8a59')
        .multiplyScalar(0.35 + random() * 0.5)
        .toArray(starColors, i * 3);
    }
    this.scene.add(new THREE.Points(
      new THREE.BufferGeometry()
        .setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
        .setAttribute('color', new THREE.BufferAttribute(starColors, 3)),
      new THREE.PointsMaterial({
        size: 0.017,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ));

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 0.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    this.bind();
    this.frameId = requestAnimationFrame(this.animate);
  }

  private bind() {
    const signal = this.abort.signal;
    this.canvas.addEventListener('pointerdown', this.down, { signal });
    this.canvas.addEventListener('pointermove', this.move, { signal });
    this.canvas.addEventListener('pointerup', this.up, { signal });
    this.canvas.addEventListener('pointercancel', this.up, { signal });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.set(9999, 9999);
      this.callbacks.hover(null);
    }, { signal });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom(Math.exp(clamp(e.deltaY, -200, 200) * 0.0015));
    }, { passive: false, signal });
    window.addEventListener('resize', this.resize, { signal });
    document.addEventListener('visibilitychange', () => {
      this.lastTime = 0;
    }, { signal });
    this.canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      cancelAnimationFrame(this.frameId);
      this.canvas.dispatchEvent(new CustomEvent('render-lost', { bubbles: true }));
    }, { signal });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload(), { signal });
  }

  private action() {
    this.lastAction = performance.now();
    this.manualUntil = this.lastAction + 1400;
    this.callbacks.move();
  }

  private down = (e: PointerEvent) => {
    if (this.exhibition) return;
    this.canvas.focus({ preventScroll: true });
    this.pointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
    this.canvas.setPointerCapture(e.pointerId);
    this.dragDistance = 0;
    this.pointerStart = performance.now();
    this.hadPinch = this.pointers.size > 1;
    if (this.pointers.size === 2) this.previousPinch = this.pinchDistance();
    this.velocityX = this.velocityY = 0;
    this.canvas.classList.add('dragging');
    this.action();
  };

  private pinchDistance() {
    const p = [...this.pointers.values()];
    return p[0].distanceTo(p[1]);
  }

  private move = (e: PointerEvent) => {
    if (this.exhibition) return;
    this.pointer.set(e.clientX, e.clientY);
    this.backdrop.material.uniforms.uPointer.value.set(
      e.clientX / innerWidth * 2 - 1,
      e.clientY / innerHeight * 2 - 1,
    );
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.set(e.clientX, e.clientY);
    if (this.pointers.size >= 2) {
      const d = this.pinchDistance();
      if (this.previousPinch > 0 && d > 0) this.zoom(this.previousPinch / d);
      this.previousPinch = d;
      this.hadPinch = true;
      return;
    }
    this.dragDistance += Math.abs(dx) + Math.abs(dy);
    const scale = this.view === 'nebula' ? 0.0014 : 0.0021 * (this.distance - 1.5) / 4.6;
    this.velocityX = dy * scale;
    this.velocityY = dx * scale;
    this.targetX = clamp(this.targetX + this.velocityX, -1.45, 1.45);
    this.targetY += this.velocityY;
    this.action();
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size) return;
    this.canvas.classList.remove('dragging');
    if (
      (this.morph === 0 || this.morph === 1) &&
      this.intro === 1 &&
      e.type === 'pointerup' &&
      !this.hadPinch &&
      this.dragDistance < 6 &&
      performance.now() - this.pointerStart < 500
    ) {
      const hit = this.pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 45 : 28);
      if (hit) this.select(hit.i);
    }
    this.lastAction = performance.now();
  };

  zoom(factor: number) {
    if (this.exhibition) return;
    this.targetDistance = clamp(
      this.targetDistance * factor,
      this.view === 'earth' ? 1.93 : 6,
      this.view === 'earth' ? 10.5 * this.aspectScale() : 28,
    );
    this.action();
  }

  setExhibition(on: boolean) {
    this.exhibition = on;
    this.pinned = true;
    this.canvas.tabIndex = on ? -1 : 0;
    this.canvas.setAttribute('aria-label', on ? '缓慢自转的展示地球' : '交互星图，可拖动旋转、滚轮缩放');
    this.canvas.dataset.mode = on ? 'observe' : 'explore';
    if (on) {
      this.setView('earth');
      this.targetX = 0.2;
      this.points.material.uniforms.uSelected.value = -1;
    } else this.points.material.uniforms.uSelected.value = this.selected;
  }

  setView(view: View) {
    const changed = view !== this.view;
    this.view = view;
    this.targetDistance = this.overviewDistance(view);
    this.currentOverviewDistance = this.targetDistance;
    this.targetX = view === 'earth' ? 0.35 : 0.42;
    if (!changed) this.targetY = -170 * RAD;
    this.velocityX = this.velocityY = 0;
    this.lastBlossom = '';
    this.action();
    this.canvas.dataset.view = view;
  }

  select(index: number, fly = true) {
    if (index < 0 || index >= this.visible.length || !this.visible[index]) return;
    this.selected = index;
    this.points.material.uniforms.uSelected.value = index;
    if (fly) {
      if (this.view === 'earth') this.flyTo(this.data.lat[index] / 100, this.data.lng[index] / 100);
      else {
        const p = new THREE.Vector3().fromArray(this.nebula, index * 3);
        this.orient(p);
      }
    }
    this.manualUntil = performance.now() + 2400;
    this.callbacks.select(index);
    this.canvas.dataset.selected = String(index);
  }

  private orient(p: THREE.Vector3) {
    let target = Math.atan2(-p.x, p.z);
    while (target - this.targetY > Math.PI) target -= Math.PI * 2;
    while (target - this.targetY < -Math.PI) target += Math.PI * 2;
    this.targetY = target;
    this.targetX = clamp(Math.atan2(p.y, Math.hypot(p.x, p.z)), -1.45, 1.45);
    this.velocityX = this.velocityY = 0;
  }

  flyTo(lat: number, lng: number) {
    this.orient(geo(lat, lng));
    this.action();
  }

  random() {
    const pool: number[] = [];
    for (let i = 0; i < this.visible.length; i++) {
      if (this.visible[i] && i !== this.selected) pool.push(i);
    }
    if (pool.length) this.select(pool[Math.floor(Math.random() * pool.length)]);
  }

  filter(groups: Set<number>, country: number, saved: Set<number> | null = null) {
    this.visibleCount = 0;
    for (let i = 0; i < this.visible.length; i++) {
      this.visible[i] = +(
        groups.has(this.data.group[i]) &&
        (country < 0 || this.data.country[i] === country) &&
        (!saved || saved.has(i))
      );
      this.visibleCount += this.visible[i];
    }
    this.points.geometry.getAttribute('aVisible').needsUpdate = true;
    this.canvas.dataset.visible = String(this.visibleCount);
    this.lastBlossom = '';
    this.action();
  }

  setBrightness(value: number) {
    this.points.material.uniforms.uBrightness.value = value;
  }

  setLand(on: boolean) {
    this.land.visible = on;
  }

  setBloom(on: boolean) {
    this.bloomEnabled = on;
    this.bloom.enabled = on;
  }

  setEco(on: boolean) {
    this.renderer.setPixelRatio(on ? 1 : Math.min(devicePixelRatio, 1.65));
    this.bloom.enabled = !on && this.bloomEnabled;
    this.resize();
  }

  private aspectScale() {
    return clamp(0.95 / (innerWidth / innerHeight), 1, 2);
  }

  private overviewDistance(view: View) {
    return view === 'earth'
      ? 6.2 * this.aspectScale()
      : clamp(3.6 / (Math.tan(19 * RAD) * (innerWidth / innerHeight)), 8.8, 23);
  }

  private resize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    for (const material of [this.points.material, this.land.material, this.surface.material]) {
      material.uniforms.uRatio.value = this.renderer.getPixelRatio();
    }
    const overview = this.overviewDistance(this.view);
    const ratio = overview / this.currentOverviewDistance;
    if (!this.sized) this.distance = this.targetDistance = overview;
    else {
      this.distance *= ratio;
      this.targetDistance *= ratio;
    }
    this.currentOverviewDistance = overview;
    this.sized = true;
  };

  private pointPosition(index: number, out: THREE.Vector3) {
    // Picking and labels resume once the shader reaches a stable endpoint.
    const i = index * 3;
    const mix = THREE.MathUtils.lerp;
    out.set(
      mix(mix(this.positions[i], this.blossoms[i], this.blossom), this.nebula[i], this.morph),
      mix(mix(this.positions[i + 1], this.blossoms[i + 1], this.blossom), this.nebula[i + 1], this.morph),
      mix(mix(this.positions[i + 2], this.blossoms[i + 2], this.blossom), this.nebula[i + 2], this.morph),
    );
    return out;
  }

  private project(index: number): Projection {
    this.pointPosition(index, this.temp);
    this.temp.applyMatrix4(this.world.matrixWorld);
    const front = this.morph > 0.7 || this.temp.z > 0.1;
    this.temp.project(this.camera);
    return {
      i: index,
      x: (this.temp.x * 0.5 + 0.5) * innerWidth,
      y: (-this.temp.y * 0.5 + 0.5) * innerHeight,
      front: front && this.temp.z < 1,
    };
  }

  private pick(x: number, y: number, max = 40): Projection | null {
    this.world.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.transform
      .multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
      .multiply(this.world.matrixWorld);
    const m = this.transform.elements;
    const w = this.world.matrixWorld.elements;
    let best = max * max;
    let index = -1;
    for (let i = 0; i < this.visible.length; i++) {
      if (!this.visible[i]) continue;
      const { x: px, y: py, z: pz } = this.pointPosition(i, this.temp);
      if (this.morph < 0.5 && w[2] * px + w[6] * py + w[10] * pz < 0.1) continue;
      const pw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      if (pw <= 0) continue;
      const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / pw * 0.5 + 0.5) * innerWidth;
      const sy = (-(m[1] * px + m[5] * py + m[9] * pz + m[13]) / pw * 0.5 + 0.5) * innerHeight;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return index < 0 ? null : { ...this.project(index), i: index };
  }

  private updateBlossom() {
    if (this.targetDistance > 3.65 || this.view !== 'earth') {
      this.lastBlossom = '';
      return;
    }
    const center = geo(this.targetX / RAD, -this.targetY / RAD - 90);
    const key = `${Math.round(this.targetX * 50)},${Math.round(this.targetY * 50)}`;
    if (key === this.lastBlossom) return;
    this.lastBlossom = key;
    this.blossoms.set(this.positions);
    this.points.geometry.getAttribute('aBlossom').needsUpdate = true;
    const pool: number[] = [];
    for (let i = 0; i < this.visible.length; i++) {
      if (
        this.visible[i] &&
        this.temp.fromArray(this.positions, i * 3).distanceToSquared(center) < 0.002
      ) {
        pool.push(i);
      }
    }
    if (pool.length < 4) return;
    const normal = center.clone().normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), normal)
      .normalize();
    const up = new THREE.Vector3().crossVectors(normal, right);
    const golden = Math.PI * (3 - Math.sqrt(5));
    pool.slice(0, 500).forEach((i, n) => {
      const radius = 0.006 * Math.sqrt(n + 0.6);
      const angle = n * golden;
      this.temp.copy(center)
        .multiplyScalar(1.008)
        .addScaledVector(right, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius)
        .toArray(this.blossoms, i * 3);
    });
    this.points.geometry.getAttribute('aBlossom').needsUpdate = true;
  }

  private animate = (now: number) => {
    this.frameId = requestAnimationFrame(this.animate);
    if (document.hidden) {
      this.lastTime = 0;
      return;
    }
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 0.016;
    this.lastTime = now;
    this.elapsed += this.reducedMotion ? 0 : dt;
    const damping = 1 - Math.exp(-dt * (this.reducedMotion ? 28 : 7));
    if (!this.pointers.size && !this.reducedMotion) {
      this.targetX = clamp(this.targetX + this.velocityX * dt * 32, -1.45, 1.45);
      this.targetY += this.velocityY * dt * 32;
      const friction = Math.exp(-dt * 5.5);
      this.velocityX *= friction;
      this.velocityY *= friction;
    }
    if (
      !this.pointers.size &&
      !this.reducedMotion &&
      (this.exhibition || (this.autoRotate && now - this.lastAction > 1800))
    ) {
      this.targetY += dt * (this.exhibition ? 0.025 : 0.035);
    }
    this.rotX += (this.targetX - this.rotX) * damping;
    this.rotY += (this.targetY - this.rotY) * damping;
    this.distance +=
      (this.targetDistance - this.distance) * (1 - Math.exp(-dt * (this.reducedMotion ? 28 : 6)));
    const goal = this.view === 'nebula' ? 1 : 0;
    this.morph = this.reducedMotion ? goal : approach(this.morph, goal, dt * 0.45);
    this.intro = this.reducedMotion
      ? (this.exhibition ? 0.8 : 1)
      : approach(this.intro, this.exhibition ? 0.8 : 1, dt * 0.35);
    this.blossom +=
      ((this.targetDistance < 3.65 && this.view === 'earth' ? 1 : 0) - this.blossom) * damping;
    this.world.rotation.set(this.rotX, this.rotY, 0, 'XYZ');
    this.camera.position.set(0, 0, this.distance);
    this.camera.lookAt(0, 0, 0);
    this.exhibitionMix += ((this.exhibition ? 1 : 0) - this.exhibitionMix) * damping;
    const mobile = innerWidth < 760;
    this.camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * (mobile ? 0 : 0.17) * this.exhibitionMix,
      innerHeight * (
        (mobile ? 0.12 : 0.015) * this.exhibitionMix +
        (mobile ? 0 : 0.03) * this.morph * (1 - this.exhibitionMix)
      ),
      innerWidth,
      innerHeight,
    );
    this.surface.visible = this.morph < 0.4;
    this.surface.material.uniforms.uOpacity.value = Math.max(0, 1 - this.morph * 2.5);
    const u = this.points.material.uniforms;
    u.uIntro.value = this.intro;
    u.uView.value = this.morph;
    u.uBlossom.value = this.blossom;
    u.uTime.value = this.elapsed;
    this.land.material.uniforms.uOpacity.value = Math.max(0, 1 - this.morph * 2.5);
    this.backdrop.material.uniforms.uTime.value = this.elapsed;
    this.composer.render();
    if (now - this.lastLabels > 110) {
      this.lastLabels = now;
      this.updateBlossom();
      const selected =
        (this.morph === 0 || this.morph === 1) &&
        this.intro === 1 &&
        this.selected >= 0 &&
        this.visible[this.selected]
          ? this.project(this.selected)
          : null;
      const labels: Projection[] = [];
      if (this.morph > 0.98) {
        this.groupCenters.forEach((p, i) => {
          if (!this.data.group.some((g, j) => g === i && this.visible[j])) return;
          this.temp.copy(p).applyMatrix4(this.world.matrixWorld);
          const depth = this.distance - this.temp.z;
          const spread = this.groupSpreads[i];
          const lift = Math.max(
            26,
            spread * 0.65 * innerHeight / (2 * Math.tan(19 * RAD) * depth),
          );
          this.temp.project(this.camera);
          if (this.temp.z < 1) {
            labels.push({
              i,
              x: (this.temp.x * 0.5 + 0.5) * innerWidth,
              y: (-this.temp.y * 0.5 + 0.5) * innerHeight - lift,
              front: true,
            });
          }
        });
      }
      this.callbacks.frame(selected, labels, this.targetDistance);
      if (
        !this.exhibition &&
        !this.pointers.size &&
        (this.morph === 0 || this.morph === 1) &&
        this.intro === 1
      ) {
        const hit = this.pick(this.pointer.x, this.pointer.y, 15);
        if (hit?.i !== this.pendingHover?.i) {
          this.pendingHover = hit;
          this.callbacks.hover(hit);
        }
        if (
          !this.pinned &&
          !this.autoRotate &&
          now > this.manualUntil &&
          now - this.lastAction > 900 &&
          !(selected?.front && Math.hypot(selected.x - innerWidth / 2, selected.y - innerHeight / 2) < 19)
        ) {
          const center = this.pick(innerWidth / 2, innerHeight / 2, 19);
          if (center && center.i !== this.selected) {
            this.select(center.i, false);
            this.manualUntil = now + 1800;
          }
        }
      }
      this.canvas.dataset.morph = this.morph.toFixed(3);
      this.canvas.dataset.intro = this.intro.toFixed(3);
      this.canvas.dataset.distance = this.distance.toFixed(3);
      this.canvas.dataset.rotation = `${this.rotX.toFixed(3)},${this.rotY.toFixed(3)}`;
    }
  };

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    this.scene.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach(m => m.dispose());
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
