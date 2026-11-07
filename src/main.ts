/*! Glimmer | Developed by jvz | MIT License */
import './style.css';
import { Globe, type Projection } from './globe';
import {
  CITIES,
  COLORS,
  coordinates,
  nearestCity,
  type PointData,
  type View,
} from './data';
import { readStore, store } from './storage';

type Scene = 'observe' | View;
type Preferences = {
  rotate: boolean;
  bloom: boolean;
  eco: boolean;
  reduced: boolean;
  brightness: number;
};

const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
const paths: Record<string, string> = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  rotate: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  home: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  compass: '<circle cx="12" cy="12" r="8"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  share: '<path d="M7 10H5v11h14V10h-2M12 16V2m-4 4 4-4 4 4"/>',
};
const icon = (name: string) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
const mark =
  '<svg class="mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="13" stroke="currentColor"/><ellipse cx="20" cy="20" rx="6" ry="13" stroke="currentColor" transform="rotate(35 20 20)"/><path d="M7 20h26" stroke="currentColor" transform="rotate(-20 20 20)"/><circle cx="31" cy="12" r="3" fill="#dfaa81"/></svg>';
const prefs: Preferences = {
  rotate: true,
  bloom: true,
  eco: false,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  brightness: 1.15,
  ...readStore<Partial<Preferences>>('preferences', {}),
};
let saved = new Set<number>(readStore<number[]>('saved', []));
let data: PointData;
let globe: Globe;
let scene: Scene = 'observe';
let panel = '';
let quiet = false;
let toastTimer: ReturnType<typeof setTimeout>;
let returnFocus: HTMLElement | null = null;
let groups = new Set<number>();
let country = -1;
const format = (n: number) => n.toLocaleString('en-US');

$('#app').innerHTML = `
  <canvas id="globe" tabindex="-1" aria-label="缓慢自转的展示地球" data-view="earth" data-mode="observe"></canvas>
  <div class="vignette" aria-hidden="true"></div>
  <div class="interface">
    <header class="masthead">
      <button id="brand-home" class="brand" aria-label="微光，回到静观">${mark}<span>微光<small>GLIMMER</small></span></button>
      <nav class="scene-nav" aria-label="场景"><button data-scene="observe" aria-pressed="true"><span>01</span> 静观</button><button data-scene="earth" aria-pressed="false"><span>02</span> 地球</button><button data-scene="nebula" aria-pressed="false"><span>03</span> 星云</button></nav>
      <div class="header-tools"><span class="edition mono">A PLACE TO SLOW DOWN</span><button id="settings" class="icon-button" aria-label="画面设置" title="画面设置">${icon('settings')}</button><button id="quiet" class="icon-button" aria-label="进入纯净模式" title="纯净模式 · Esc 返回">${icon('expand')}</button></div>
    </header>
    <section class="intro" aria-label="静观地球">
      <p class="eyebrow"><span></span> 给自己一点，漫无目的的时间</p>
      <h1>世界很大，<br>此刻<span class="serif">很慢。</span></h1>
      <p class="intro-copy">让思绪随星球转动。<br>从一束微光，去往任何地方。</p>
      <div class="intro-actions"><button id="enter-earth" class="primary">开始漫游 ${icon('arrow')}</button><button id="enter-nebula" class="text-button">去看星云 <span>↗</span></button></div>
      <p class="intro-note mono">NO DESTINATION. JUST WANDER.</p>
    </section>
    <div class="scene-caption"><span class="caption-line"></span><p class="mono">THE EARTH, IN A DIFFERENT LIGHT.<small>一颗星球，无数种相遇。</small></p></div>
    <section class="explorer" aria-label="探索工具" hidden>
      <div class="explorer-top"><button id="search" class="search-trigger">${icon('search')}<span>寻找一座城市</span><kbd>/</kbd></button><button id="saved" class="icon-button" aria-label="收藏地点" title="收藏地点">${icon('bookmark')}<span id="saved-count" class="badge">0</span></button></div>
      <aside class="local-clock"><p class="mono" id="time-place">此刻，世界的另一边</p><div id="time">--:--</div><small class="mono" id="date"></small></aside>
      <section class="place-card"><p class="eyebrow"><span></span><b id="selection-status">在世界上，停留片刻</b></p><h2 id="place-name">随光漫游</h2><p id="place-country"></p><p class="mono coordinates" id="coordinates"></p><div class="place-actions"><button id="random" class="pill">${icon('compass')} 随机落点</button><button id="save-place" class="icon-button" aria-label="收藏当前地点" aria-pressed="false" title="收藏地点 · F">${icon('bookmark')}</button><button id="share" class="icon-button" aria-label="分享当前地点" title="分享地点">${icon('share')}</button></div></section>
      <aside class="navigation" aria-label="星图控制"><button id="zoom-in" class="icon-button" aria-label="放大">${icon('plus')}</button><button id="zoom-out" class="icon-button" aria-label="缩小">${icon('minus')}</button><span></span><button id="home" class="icon-button" aria-label="重置视角" title="重置视角 · H">${icon('home')}</button><button id="rotate" class="icon-button" aria-label="自动旋转" aria-pressed="true" title="自动旋转 · 空格">${icon('rotate')}</button></aside>
      <div id="group-labels" aria-hidden="true"></div>
      <div id="selected-marker" class="selected-marker" aria-hidden="true"><i></i><span id="marker-name"></span></div>
      <div id="hover-tip" class="hover-tip" hidden></div>
      <div class="explorer-bottom"><button id="filter" class="pill">${icon('settings')}<span>地理分区</span></button><div id="chips" class="chips" aria-label="地理分区"></div><p class="gesture-note mono">拖动旋转 · 滚轮缩放</p></div>
      <div id="empty-state" class="empty-state" hidden><h2>这片区域暂时没有光点</h2><button id="reset-empty" class="pill">展开整个世界</button></div>
    </section>
    <footer class="page-footer"><p class="mono"><i></i><span id="stats">正在点亮世界</span></p><p class="footer-thought">我们仰望同一片星空。</p><span class="mono" id="scene-number">01 — 03</span></footer>
  </div>
  <button id="leave-quiet" class="quiet-exit" hidden>返回界面 <kbd>Esc</kbd></button>
  <dialog id="panel" class="panel"><div id="panel-content"></div></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="loading" class="loading">${mark}<p class="mono">正在点亮世界…</p></div>
`;

function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
}

function titleOf(i: number) {
  return nearestCity(data, i);
}

function updateSelection(i: number) {
  $('#place-name').textContent = titleOf(i);
  $('#place-country').textContent = `${data.countries[data.country[i]][2]} / ${data.countries[data.country[i]][1]}`;
  $('#coordinates').textContent = coordinates(data, i);
  $('#marker-name').textContent = titleOf(i);
  $('#save-place').setAttribute('aria-pressed', String(saved.has(i)));
  $('#selection-status').textContent =
    scene === 'nebula'
      ? `${data.groups[data.group[i]]} · 一束来自远方的光`
      : '在世界上，停留片刻';
  updateClock();
}

function updateClock() {
  if (!globe || globe.selected < 0) return;
  const timeZone = data.timezones[data.tz[globe.selected]] || 'UTC';
  try {
    const now = new Date();
    $('#time').textContent = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    $('#date').textContent = new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(now);
    $('#time-place').textContent = `${titleOf(globe.selected)} · 当地时间`;
  } catch {
    $('#time').textContent = '--:--';
  }
}

function frame(selected: Projection | null, labels: Projection[]) {
  const marker = $('#selected-marker');
  marker.hidden = scene === 'observe' || !selected?.front;
  if (selected) marker.style.transform = `translate(${selected.x}px,${selected.y}px)`;
  const placed: Projection[] = [];
  const mobile = innerWidth < 760;
  const labelWidth = mobile ? 135 : 175;
  const minY = mobile ? Math.min(300, innerHeight * 0.4) : 130;
  const maxY = Math.max(minY + 64, innerHeight - (mobile ? 275 : 120));
  for (const label of [...labels].sort((a, b) => a.y - b.y)) {
    const p = {
      ...label,
      x: Math.max(
        labelWidth / 2 + 8,
        Math.min(innerWidth - labelWidth / 2 - 8, label.x),
      ),
      y: Math.max(minY, Math.min(maxY, label.y)),
    };
    const baseY = p.y;
    for (let step = 0; step < Math.ceil(innerHeight / 32) * 2; step++) {
      const y = baseY + Math.ceil(step / 2) * 32 * (step % 2 ? 1 : -1);
      if (
        y < minY ||
        y > maxY ||
        placed.some(
          other => Math.abs(other.x - p.x) < labelWidth && Math.abs(other.y - y) < 31,
        )
      ) {
        continue;
      }
      p.y = y;
      break;
    }
    placed.push(p);
  }
  $('#group-labels').innerHTML =
    scene === 'nebula'
      ? placed
          .map(p => `<span class="group-label" style="transform:translate(${p.x}px,${p.y}px);--group-color:${COLORS[p.i]}">${escape(data.groups[p.i])}<small class="mono">${escape(data.groupsEn[p.i].toUpperCase())}</small></span>`)
          .join('')
      : '';
}

function hover(p: Projection | null) {
  const tip = $('#hover-tip');
  tip.hidden = !p || scene === 'observe' || p.i === globe.selected;
  if (!p) return;
  tip.textContent = titleOf(p.i);
  tip.style.left = `${Math.min(innerWidth - 180, Math.max(12, p.x + 16))}px`;
  tip.style.top = `${Math.max(80, p.y - 30)}px`;
}

function setScene(next: Scene) {
  scene = next;
  document.body.dataset.scene = next;
  document.querySelectorAll<HTMLButtonElement>('.scene-nav [data-scene]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.scene === next)),
  );
  $('.intro').hidden = next !== 'observe';
  $('.scene-caption').hidden = next !== 'observe';
  $('.explorer').hidden = next === 'observe';
  $('#scene-number').textContent = `${next === 'observe' ? '01' : next === 'earth' ? '02' : '03'} — 03`;
  if (next === 'observe') resetFilter();
  globe.setExhibition(next === 'observe');
  if (next !== 'observe') {
    globe.setView(next);
    globe.autoRotate = prefs.rotate;
    if (globe.selected < 0) globe.select(nearestPoint(31.23, 121.47), false);
    updateSelection(globe.selected);
  }
  $('#hover-tip').hidden = true;
}

function applyFilter() {
  globe.filter(groups, country);
  $('#stats').textContent = `${format(globe.visibleCount)} 束微光 / ${data.countries.length} 个国家与地区`;
  $('#empty-state').hidden = globe.visibleCount > 0;
  if (globe.selected >= 0 && !globe.visible[globe.selected] && globe.visibleCount) {
    globe.random();
  }
  $('#filter').classList.toggle('active', country >= 0 || groups.size !== data.groups.length);
}

function resetFilter() {
  country = -1;
  groups = new Set(data.groups.map((_, i) => i));
  applyFilter();
  renderChips();
}

function renderChips() {
  $('#chips').innerHTML =
    `<button data-group="all" aria-pressed="${groups.size === data.groups.length}">全部</button>` +
    data.groups
      .map((name, i) => `<button data-group="${i}" aria-pressed="${groups.has(i)}"><i style="background:${COLORS[i]}"></i>${name}</button>`)
      .join('');
  $('#chips').querySelectorAll<HTMLButtonElement>('button').forEach(b =>
    b.onclick = () => {
      const i = b.dataset.group!;
      if (i === 'all') groups = new Set(data.groups.map((_, j) => j));
      else if (groups.size === data.groups.length) groups = new Set([+i]);
      else if (groups.has(+i)) {
        groups.delete(+i);
        if (!groups.size) groups = new Set(data.groups.map((_, j) => j));
      } else groups.add(+i);
      applyFilter();
      renderChips();
    },
  );
}

function savePlace() {
  if (globe.selected < 0) return;
  const i = globe.selected;
  if (saved.has(i)) saved.delete(i);
  else saved.add(i);
  store('saved', [...saved]);
  $('#saved-count').textContent = String(saved.size);
  updateSelection(i);
  toast(saved.has(i) ? '把这束光，留在这里了。' : '已取消收藏');
}

function applyPrefs() {
  globe.autoRotate = prefs.rotate;
  globe.reducedMotion = prefs.reduced;
  globe.setBrightness(prefs.brightness);
  globe.setBloom(prefs.bloom);
  globe.setEco(prefs.eco);
  $('#rotate').setAttribute('aria-pressed', String(prefs.rotate));
  store('preferences', prefs);
}

function toggleRotation() {
  prefs.rotate = !prefs.rotate;
  applyPrefs();
}

function setQuiet(on: boolean) {
  quiet = on;
  document.body.classList.toggle('quiet', on);
  $('.interface').inert = on;
  $('#leave-quiet').hidden = !on;
  if (on) $('#leave-quiet').focus();
  else $('#quiet').focus();
}

function closePanel() {
  $<HTMLDialogElement>('#panel').close();
  panel = '';
  returnFocus?.focus();
}

function openPanel(name: string) {
  if (panel === name) {
    closePanel();
    return;
  }
  const dialog = $<HTMLDialogElement>('#panel');
  if (dialog.open) dialog.close();
  returnFocus = document.activeElement as HTMLElement;
  panel = name;
  const heading = (title: string, sub: string) =>
    `<header class="panel-heading"><div><h2>${title}</h2><p>${sub}</p></div><button class="icon-button panel-close" aria-label="关闭">${icon('close')}</button></header>`;
  const content = $('#panel-content');
  if (name === 'search') {
    content.innerHTML =
      heading('想去哪里？', '从一个名字，或者一组坐标开始。') +
      `<label class="search-input-wrap">${icon('search')}<input id="search-input" type="search" aria-label="搜索城市、国家或坐标" placeholder="城市、国家、经纬度…" autocomplete="off"/></label><div id="search-results"></div><p class="panel-note mono">试试 上海 / Kyoto / 48.86, 2.35</p>`;
    $('#search-input').oninput = renderSearch;
    $('#search-input').onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#search-results button')?.click();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        $('#search-results button')?.focus();
      }
    };
    renderSearch();
  } else if (name === 'saved') {
    content.innerHTML =
      heading('留住的微光', '想再回来时，它们就在这里。') +
      `<div id="saved-list">${saved.size ? [...saved].map(i => `<div class="saved-row"><button class="result" data-saved="${i}"><i style="background:${COLORS[data.group[i]]}"></i><span><b>${escape(titleOf(i))}</b><small>${coordinates(data, i)}</small></span>${icon('arrow')}</button><button class="icon-button" data-remove="${i}" aria-label="移除 ${escape(titleOf(i))}">${icon('close')}</button></div>`).join('') : '<p class="panel-empty">还没有留住的微光。<br>在地球上选中一个地点，按 F 收藏。</p>'}</div>`;
    content.querySelectorAll<HTMLButtonElement>('[data-saved]').forEach(b =>
      b.onclick = () => {
        resetFilter();
        setScene('earth');
        globe.select(+b.dataset.saved!);
        closePanel();
      },
    );
    content.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(b =>
      b.onclick = () => {
        saved.delete(+b.dataset.remove!);
        store('saved', [...saved]);
        $('#saved-count').textContent = String(saved.size);
        if (globe.selected >= 0) updateSelection(globe.selected);
        const opener = returnFocus;
        panel = '';
        openPanel('saved');
        returnFocus = opener;
      },
    );
  } else if (name === 'filter') {
    content.innerHTML =
      heading('缩小一点世界', '循着大陆与海洋，寻找下一束光。') +
      `<label class="field-label" for="country-filter">国家 / 地区</label><select id="country-filter"><option value="-1">全部国家与地区</option>${data.countries.map((c, i) => `<option value="${i}" ${i === country ? 'selected' : ''}>${escape(c[1])} · ${c[0]}</option>`).sort((a, b) => a.localeCompare(b, 'zh')).join('')}</select><p class="panel-note">底部的地理分区可以单独选择，也可以组合。大陆轮廓始终保留。</p><button class="pill wide" id="reset-filter">展开整个世界</button>`;
    $('#country-filter').onchange = e => {
      country = +((e.target as HTMLSelectElement).value);
      applyFilter();
      const i = data.country.findIndex((c, j) => c === country && !!globe.visible[j]);
      if (i >= 0) globe.select(i);
    };
    $('#reset-filter').onclick = () => {
      resetFilter();
      $<HTMLSelectElement>('#country-filter').value = '-1';
    };
  } else {
    const row = (key: keyof Preferences, label: string, sub: string) =>
      `<label class="setting-row"><span><b>${label}</b><small>${sub}</small></span><input id="setting-${key}" data-setting="${key}" type="checkbox" role="switch" ${prefs[key] ? 'checked' : ''}/></label>`;
    content.innerHTML =
      heading('按自己的节奏', '让画面，停在你喜欢的样子。') +
      row('rotate', '探索时自动旋转', '停下操作后，让星图缓缓转动') +
      row('bloom', '柔和辉光', '给每一束微光留一点余晖') +
      `<label class="brightness-row">光点亮度 <output id="brightness-value">${Math.round(prefs.brightness * 100)}%</output><input id="brightness" type="range" aria-label="光点亮度" min="0.4" max="1.8" step="0.05" value="${prefs.brightness}"/></label>` +
      row('eco', '省电模式', '降低画面分辨率与辉光开销') +
      row('reduced', '减少动态效果', '静止自转，关闭惯性与闪烁') +
      '<p class="panel-note mono">/ 搜索 · F 收藏 · G 切换地球与星云<br>空格 自转 · H 复位 · Esc 返回<br>你的偏好与收藏，只保存在此浏览器。</p>';
    content.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input =>
      input.onchange = () => {
        (prefs[input.dataset.setting as keyof Preferences] as boolean) = input.checked;
        applyPrefs();
      },
    );
    $('#brightness').oninput = e => {
      prefs.brightness = +((e.target as HTMLInputElement).value);
      $('#brightness-value').textContent = `${Math.round(prefs.brightness * 100)}%`;
      globe.setBrightness(prefs.brightness);
      store('preferences', prefs);
    };
  }
  content.querySelectorAll<HTMLButtonElement>('.panel-close').forEach(b =>
    b.onclick = closePanel,
  );
  dialog.showModal();
  if (name === 'search') $('#search-input').focus();
}

function nearestPoint(lat: number, lng: number) {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < data.lat.length; i++) {
    const delta = Math.abs(data.lng[i] / 100 - lng);
    const dx = Math.min(delta, 360 - delta) * Math.cos(lat * Math.PI / 180);
    const d = (data.lat[i] / 100 - lat) ** 2 + dx ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return index;
}

function renderSearch() {
  const q = $<HTMLInputElement>('#search-input').value.trim().toLowerCase();
  const results: { name: string; sub: string; index: number }[] = [];
  const coords = q.match(/^(-?\d+(?:\.\d+)?)\s*[,， ]\s*(-?\d+(?:\.\d+)?)$/);
  if (coords && Math.abs(+coords[1]) <= 90 && Math.abs(+coords[2]) <= 180) {
    results.push({
      name: `${coords[1]}°, ${coords[2]}°`,
      sub: '飞往这个坐标',
      index: nearestPoint(+coords[1], +coords[2]),
    });
  }
  CITIES.filter(c => !q || `${c.name} ${c.en} ${c.country}`.toLowerCase().includes(q))
    .slice(0, 6)
    .forEach(c => results.push({
      name: c.name,
      sub: `${c.en} · ${c.country}`,
      index: nearestPoint(c.lat, c.lng),
    }));
  if (q) {
    data.countries.forEach((c, i) => {
      if (`${c[0]} ${c[1]} ${c[2]}`.toLowerCase().includes(q)) {
        results.push({ name: c[1], sub: c[2], index: data.country.indexOf(i) });
      }
    });
  }
  $('#search-results').innerHTML = results.length
    ? results
        .slice(0, 10)
        .map((r, i) => `<button class="result" data-result="${i}">${icon('compass')}<span><b>${escape(r.name)}</b><small>${escape(r.sub)}</small></span>${icon('arrow')}</button>`)
        .join('')
    : '<p class="panel-empty">没有找到这个地方。<br>试试城市、国家，或者输入经纬度。</p>';
  $('#search-results').querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => {
    b.onclick = () => {
      resetFilter();
      setScene('earth');
      globe.select(results[i].index);
      closePanel();
    };
    b.onkeydown = e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (b.nextElementSibling as HTMLElement)?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        ((b.previousElementSibling as HTMLElement) || $('#search-input')).focus();
      }
    };
  });
}

async function share() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('view', scene);
  if (globe.selected >= 0) url.searchParams.set('p', String(globe.selected));
  try {
    await navigator.clipboard.writeText(url.href);
    toast('这片风景的链接，已复制。');
  } catch {
    openPanel('search');
    $('#search-results').innerHTML = `<label class="field-label">复制这片风景的链接<input class="share-url" aria-label="分享链接" readonly value="${escape(url.href)}"/></label>`;
    $<HTMLInputElement>('.share-url').select();
  }
}

async function start() {
  try {
    const responses = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/points.json`),
      fetch(`${import.meta.env.BASE_URL}data/land-dots.json`),
    ]);
    if (responses.some(r => !r.ok)) throw new Error('Map assets unavailable');
    const [points, land] = await Promise.all(responses.map(r => r.json()));
    data = points;
    // Color and nebula clusters follow geography. The original category indices are discarded.
    data.group = data.lat.map((lat, i) => geographicRegion(
      lat / 100,
      data.lng[i] / 100,
      data.countries[data.country[i]][0],
    ));
    saved = new Set(
      [...saved].filter(i => Number.isInteger(i) && i >= 0 && i < data.lat.length),
    );
    globe = new Globe($<HTMLCanvasElement>('#globe'), data, land, {
      select: updateSelection,
      hover,
      frame,
      move: () => $('#hover-tip').hidden = true,
    });
    globe.pinned = true;
    applyPrefs();
    resetFilter();
    $('#saved-count').textContent = String(saved.size);
    const query = new URLSearchParams(location.search);
    const view = query.get('view');
    const p = Number(query.get('p'));
    setScene(view === 'earth' || view === 'nebula' ? view : query.has('p') ? 'earth' : 'observe');
    if (query.has('p') && Number.isInteger(p) && p >= 0 && p < data.lat.length) {
      globe.select(p);
    }
    document.querySelectorAll<HTMLButtonElement>('.scene-nav [data-scene]').forEach(b =>
      b.onclick = () => setScene(b.dataset.scene as Scene),
    );
    $('#brand-home').onclick = () => {
      resetFilter();
      setScene('observe');
    };
    $('#enter-earth').onclick = () => setScene('earth');
    $('#enter-nebula').onclick = () => setScene('nebula');
    for (const name of ['search', 'saved', 'filter', 'settings']) {
      $(`#${name}`).onclick = () => openPanel(name);
    }
    $('#random').onclick = () => globe.random();
    $('#save-place').onclick = savePlace;
    $('#share').onclick = share;
    $('#zoom-in').onclick = () => globe.zoom(0.8);
    $('#zoom-out').onclick = () => globe.zoom(1.25);
    $('#rotate').onclick = toggleRotation;
    $('#home').onclick = () => globe.setView(scene === 'nebula' ? 'nebula' : 'earth');
    $('#reset-empty').onclick = resetFilter;
    $('#quiet').onclick = () => setQuiet(true);
    $('#leave-quiet').onclick = () => setQuiet(false);
    const dialog = $<HTMLDialogElement>('#panel');
    dialog.addEventListener('cancel', e => {
      e.preventDefault();
      closePanel();
    });
    dialog.addEventListener('click', e => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
          closePanel();
        }
      }
    });
    document.addEventListener('keydown', e => {
      if (panel) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePanel();
        }
        return;
      }
      if (
        e.metaKey || e.ctrlKey || e.altKey ||
        (e.target as HTMLElement).matches('input,select,textarea')
      ) {
        return;
      }
      if (e.key === 'Escape') {
        if (quiet) setQuiet(false);
        else if (scene !== 'observe') setScene('observe');
        return;
      }
      if (
        quiet || scene === 'observe' ||
        ((e.target as HTMLElement).matches('button') && [' ', 'Enter'].includes(e.key))
      ) {
        return;
      }
      if ([' ', '/', '+', '-', '='].includes(e.key)) e.preventDefault();
      if (e.key === '/') openPanel('search');
      else if (e.key.toLowerCase() === 'f') savePlace();
      else if (e.key.toLowerCase() === 'g') setScene(scene === 'earth' ? 'nebula' : 'earth');
      else if (e.key === ' ') toggleRotation();
      else if (e.key.toLowerCase() === 'h') globe.setView(scene);
      else if (e.key === '+' || e.key === '=') globe.zoom(0.8);
      else if (e.key === '-') globe.zoom(1.25);
    }, { capture: true });
    $('#chips').addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        $('#chips').scrollLeft += e.deltaY;
      }
    }, { passive: false });
    $('#globe').addEventListener('render-lost', () => toast('图形连接正在恢复，请稍候。'));
    setInterval(updateClock, 15000);
    window.addEventListener('pagehide', e => {
      if (!e.persisted) globe.destroy();
    });
    document.body.dataset.ready = 'true';
    $('#loading').classList.add('loaded');
    setTimeout(() => $('#loading').remove(), 500);
  } catch (error) {
    console.error(error);
    $('#loading').innerHTML = `${mark}<h1>星图暂时无法展开</h1><p>请检查网络与浏览器图形加速，然后重试。</p><button class="pill" id="retry">重新载入</button>`;
    $('#retry').onclick = () => location.reload();
  }
}

function geographicRegion(lat: number, lng: number, cc: string): number {
  const contains = (codes: string) => codes.split(' ').includes(cc);
  if (contains('CN HK MO TW JP KR KP MN')) return 0;
  if (contains('BN KH ID LA MY MM PH SG TH TL VN')) return 1;
  if (contains('AF BD BT IN MV NP PK LK')) return 2;
  if (contains('AE AM AZ BH CY GE IL IQ IR JO KG KW KZ LB OM PS QA SA SY TJ TM TR UZ YE')) return 3;
  if (contains('US CA GL BM PM')) return 6;
  if (contains('MX BZ CR SV GT HN NI PA AG AI AW BB BL BQ BS CU CW DM DO GD GP HT JM KN KY LC MF MQ MS PR SX TC TT VC VG VI')) return 7;
  if (contains('AR BO BR CL CO EC FK GF GY PE PY SR UY VE')) return 8;
  if (contains('AU NZ FJ FM GU KI MH MP NC NF NR NU PF PG PN PW SB TK TO TV VU WF WS AS CK')) return 9;
  if (lat < -55 || contains('AQ BV GS HM TF')) return 10;
  if (contains('DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW')) return 5;
  if (contains('AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MK MT MD MC ME NL NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA AX')) return 4;
  if (lng >= -25 && lng < 60 && lat > 34) return 4;
  if (lng >= -25 && lng < 60 && lat <= 34) return 5;
  if (lng < -25) return lat > 12 ? 6 : 8;
  return lat > 35 ? 3 : 10;
}

void start();
