(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540, GROUND = 474, GRAVITY = 0.62, PLAYER_W = 34, PLAYER_H = 43;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const levels = [
    { name: 'SUNNY PARK', seconds: 45, ground: '#65bd82', edge: '#439e69', platform: '#70d491', accent: '#2a9579',
      platforms: [{ x: 78, y: 368, w: 198 }, { x: 329, y: 299, w: 160 }, { x: 575, y: 360, w: 180 }, { x: 750, y: 258, w: 132 }] },
    { name: 'ROOFTOPS', seconds: 50, ground: '#4c588d', edge: '#353b6c', platform: '#6777aa', accent: '#48d8cd',
      platforms: [{ x: 45, y: 389, w: 143 }, { x: 240, y: 323, w: 193 }, { x: 509, y: 392, w: 182 }, { x: 752, y: 305, w: 150 }, { x: 387, y: 213, w: 133 }] },
    { name: 'CANYONS', seconds: 55, ground: '#d38764', edge: '#a95d50', platform: '#e5a274', accent: '#ffe5a6',
      platforms: [{ x: 70, y: 393, w: 133 }, { x: 273, y: 333, w: 148 }, { x: 483, y: 268, w: 151 }, { x: 720, y: 352, w: 165 }, { x: 810, y: 217, w: 111 }] },
  ];

  const p1Controls = { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], dash: ['ShiftLeft'] };
  const p2Controls = { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], dash: ['ShiftRight'] };
  const keys = new Set();

  let levelIndex = 0, mode = 'bot', phase = 'menu', it = 1, remaining = 45, tagLock = 0;
  let cameraTime = 0, lastTime = 0, message = '', messageTimer = 0;
  let players = [];

  const isDown = bind => bind.some(k => keys.has(k));
  const getLeftRight = bind => +isDown(bind.right) - +isDown(bind.left);

  const makePlayer = (id, x) => ({
    id, x, y: GROUND - PLAYER_H, w: PLAYER_W, h: PLAYER_H, vx: 0, vy: 0, face: id ? -1 : 1,
    grounded: true, jumps: 0, dashTime: 0, dashCooldown: 0,
    botJumpCooldown: 0, botDashCooldown: 0, botWish: 0, aiClock: 0,
  });

  // ---------- Screens / UI ----------
  function setPhase(next) {
    phase = next;
    $('menu').classList.toggle('hidden', next !== 'menu');
    $('pauseMenu').classList.toggle('hidden', next !== 'paused');
    $('endMenu').classList.toggle('hidden', next !== 'ended');
    $('hud').classList.toggle('hidden', !['playing', 'paused'].includes(next));
  }

  function selectLevel(i) {
    levelIndex = i;
    document.querySelectorAll('[data-level]').forEach(b => {
      const sel = Number(b.dataset.level) === i;
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
  }

  function showMenu() {
    setPhase('menu');
    keys.clear();
    message = ''; messageTimer = 0;
  }

  function begin() {
    players = [makePlayer(0, 115), makePlayer(1, 815)];
    it = 1; remaining = levels[levelIndex].seconds; tagLock = 1.35;
    cameraTime = 0;
    message = 'GO!'; messageTimer = .8;
    $('levelHud').textContent = `0${levelIndex + 1}  ·  ${levels[levelIndex].name}`;
    setPhase('playing');
    refreshHud();
  }

  function refreshHud() {
    const youIt = it === 0;
    $('clock').textContent = Math.max(0, Math.ceil(remaining));
    $('statusHud').textContent = youIt ? "● YOU'RE IT!" : "● YOU'RE SAFE";
    $('statusHud').classList.toggle('danger', youIt);
    $('dashFill').style.width = `${Math.round((1 - clamp((players[0]?.dashCooldown || 0) / 1.45, 0, 1)) * 100)}%`;
  }

  function finish() {
    setPhase('ended');
    const won = it !== 0, last = levelIndex === 2, bot = mode === 'bot';
    $('endEyebrow').textContent = bot ? (won ? 'LEVEL COMPLETE' : 'TIME IS UP') : 'GAME OVER';
    $('endTitle').textContent = !bot ? `Player ${it === 0 ? 2 : 1} wins!` : won ? (last ? 'You beat all 3 levels!' : 'Nice escape!') : 'You were IT!';
    $('endDesc').textContent = bot
      ? (won ? 'You were safe when the timer ran out.' : 'Try again! Dash away and use your double jump to escape.')
      : `Player ${it + 1} was IT when time ran out.`;
    $('nextLevel').textContent = last ? 'LEVEL 1 ↻' : 'NEXT LEVEL →';
    $('nextLevel').style.display = won ? '' : 'none';
  }

  // ---------- Input ----------
  function jump(p) {
    if (phase !== 'playing' || p.jumps >= 2) return;
    p.vy = p.jumps === 0 ? -12.3 : -11.3;
    p.jumps++; p.grounded = false;
  }

  function dash(p) {
    if (phase !== 'playing' || p.dashCooldown > 0) return;
    p.dashTime = .17; p.dashCooldown = 1.45;
    p.vx = p.face * 15.5; p.vy = Math.min(p.vy, 1.3);
  }

  function action(id, type) {
    if (phase !== 'playing') return;
    (type === 'jump' ? jump : dash)(players[id]);
  }

  window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (phase === 'playing') setPhase('paused'); else if (phase === 'paused') setPhase('playing');
      return;
    }
    if (phase !== 'playing') return;
    const pairs = mode === 'local' ? [[0, p1Controls], [1, p2Controls]] : [[0, p1Controls]];
    for (const [id, c] of pairs) {
      if (c.jump.includes(e.code)) action(id, 'jump');
      if (c.dash.includes(e.code)) action(id, 'dash');
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); if (phase === 'playing') setPhase('paused'); });

  $('levelGrid').addEventListener('click', e => {
    const card = e.target.closest('[data-level]');
    if (card) selectLevel(Number(card.dataset.level));
  });
  $('modeButtons').addEventListener('click', e => {
    const button = e.target.closest('[data-mode]');
    if (!button) return;
    mode = button.dataset.mode;
    $('modeButtons').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
  });
  $('startButton').onclick = begin;
  $('resumeButton').onclick = () => setPhase('playing');
  $('quitButton').onclick = $('endLevels').onclick = showMenu;
  $('replay').onclick = begin;
  $('nextLevel').onclick = () => { selectLevel((levelIndex + 1) % 3); begin(); };

  // ---------- Simulation ----------
  function botControl(p, dt) {
    const other = players[0];
    p.aiClock -= dt; p.botJumpCooldown -= dt; p.botDashCooldown -= dt;
    if (p.aiClock <= 0) {
      p.aiClock = .18 + Math.random() * .21;
      const myCenter = p.x + p.w / 2, dist = other.x + other.w / 2 - myCenter;
      let direction = Math.sign(dist) || 1;
      if (it !== p.id) {
        direction = -direction;
        if (Math.abs(dist) > 355) direction = Math.sign(480 - myCenter) || 1;
      }
      p.botWish = direction;
      const high = other.y < p.y - 30, near = Math.abs(dist) < 220;
      const obstacle = levels[levelIndex].platforms.some(s => Math.abs(s.x + s.w / 2 - myCenter) < 65 && s.y < p.y && s.y > p.y - 205);
      if (p.botJumpCooldown <= 0 && p.jumps < 2 && (high || obstacle || (near && Math.random() < .22))) {
        jump(p); p.botJumpCooldown = .45 + Math.random() * .37;
      }
      if (p.botDashCooldown <= 0 && p.dashCooldown <= 0 && Math.abs(dist) > 90 && Math.abs(dist) < 300 && Math.random() < .13) {
        p.face = direction; dash(p); p.botDashCooldown = 2.8;
      }
    }
    return p.botWish;
  }

  function updatePlayer(p, dir, dt) {
    const scale = dt * 60;
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.dashTime > 0) {
      p.dashTime -= dt; p.vx = p.face * 15.5; p.vy = Math.min(p.vy, 1.4);
    } else {
      if (dir) { p.face = dir; p.vx = lerp(p.vx, dir * 5.4, Math.min(1, .24 * scale)); }
      else p.vx *= Math.pow(.79, scale);
      p.vy = Math.min(17, p.vy + GRAVITY * scale);
    }
    p.x = clamp(p.x + p.vx * scale, 4, W - p.w - 4);
    const oldBottom = p.y + p.h;
    p.y += p.vy * scale;
    p.grounded = false;
    if (p.vy >= 0) {
      let surface = GROUND;
      for (const s of levels[levelIndex].platforms) {
        if (p.x + p.w - 6 > s.x && p.x + 6 < s.x + s.w && oldBottom <= s.y + 10 && p.y + p.h >= s.y && s.y < surface) surface = s.y;
      }
      if (p.y + p.h >= surface) { p.y = surface - p.h; p.vy = 0; p.grounded = true; p.jumps = 0; }
    }
    p.y = Math.max(0, p.y);
  }

  function tagLogic() {
    if (tagLock > 0) return;
    const [a, b] = players;
    const dx = a.x + a.w / 2 - (b.x + b.w / 2), dy = a.y + a.h / 2 - (b.y + b.h / 2);
    if (Math.abs(dx) < 29 && Math.abs(dy) < 36) {
      it = 1 - it; tagLock = 1.35;
      message = mode === 'bot' ? (it === 0 ? "YOU'RE IT!" : 'BOT IS IT!') : `PLAYER ${it + 1} IS IT!`;
      messageTimer = .9;
    }
  }

  function tick(dt) {
    cameraTime += dt;
    if (phase !== 'playing') return;
    remaining -= dt; tagLock -= dt; messageTimer -= dt;
    for (const p of players) {
      const dir = p.id === 1 && mode === 'bot' ? botControl(p, dt) : getLeftRight(p.id === 0 ? p1Controls : p2Controls);
      updatePlayer(p, dir, dt);
    }
    tagLogic();
    if (remaining <= 0) { remaining = 0; finish(); }
    refreshHud();
  }

  // ---------- Drawing ----------
  const rounded = (x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };
  const circle = (x, y, r, color) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
  const gradient = (a, b) => { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const sky = (a, b) => { ctx.fillStyle = gradient(a, b); ctx.fillRect(0, 0, W, H); };

  function poly(fill, pts) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(...pts[0]);
    pts.slice(1).forEach(p => ctx.lineTo(...p));
    ctx.fill();
  }
  function hill(fill, y0, curves) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(0, y0);
    curves.forEach(c => ctx.quadraticCurveTo(...c));
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  }
  function cloud(x, y, size, color = '#ffffffaa') {
    circle(x, y, size * .27, color);
    circle(x + size * .31, y - size * .11, size * .35, color);
    circle(x + size * .67, y, size * .29, color);
    rounded(x - size * .09, y, size * .95, size * .22, 10, color);
  }

  function drawPark() {
    sky('#91d8f5', '#e4f8ef');
    circle(760, 95, 43, '#fff4ae');
    cloud(115, 88, 122);
    cloud(526, 129, 97);
    cloud(826, 184, 89);
    hill('#b4e1c3', 414, [[135, 313, 280, 421], [430, 313, 595, 423], [788, 316, 960, 417]]);
    hill('#83c8a0', 460, [[198, 386, 355, 464], [554, 356, 742, 457], [845, 402, 960, 444]]);
    for (let i = 0; i < 9; i++) {
      const x = 32 + i * 119, y = 430 + Math.sin(i * 2.1) * 13;
      rounded(x - 5, y - 9, 10, 44, 3, '#488e6d');
      circle(x, y - 25, 21, '#62b789');
      circle(x - 12, y - 15, 16, '#72c497');
    }
  }

  function drawCity() {
    sky('#5867a5', '#aeb4d9');
    circle(797, 111, 36, '#fff3d5');
    cloud(100, 120, 116, '#d7d4ed65');
    for (let i = 0; i < 20; i++) {
      const x = i * 55 - 12, h = 95 + (i * 53 % 111), y = GROUND - h + 38;
      rounded(x, y, 49, h + 70, 2, i % 2 ? '#53608d' : '#606d98');
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
        if ((r * 3 + c + i) % 3 !== 0) rounded(x + 8 + c * 13, y + 12 + r * 22, 6, 10, 1, '#e9e3c766');
    }
    for (let i = 0; i < 10; i++) {
      const x = i * 107 + 12, h = 58 + (i * 79 % 90), y = GROUND - h + 48;
      rounded(x, y, 96, h + 90, 2, '#394673');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++)
        if ((r * 7 + c + i) % 4 === 0) rounded(x + 8 + c * 17, y + 15 + r * 20, 7, 7, 1, '#a5efdd96');
    }
  }

  function drawCanyon() {
    sky('#ffd5a2', '#f4b18e');
    circle(755, 129, 58, '#ffedb8');
    poly('#e9ab89', [[0, 416], [0, 319], [90, 319], [90, 382], [211, 382], [211, 292], [321, 292], [321, 373], [486, 373], [486, 323], [569, 323], [569, 416], [W, 416], [W, H], [0, H]]);
    poly('#d88b6e', [[0, 455], [0, 385], [140, 385], [140, 356], [242, 356], [242, 415], [381, 415], [381, 339], [508, 339], [508, 412], [651, 412], [651, 379], [832, 379], [832, 310], [921, 310], [921, 430], [W, 430], [W, H], [0, H]]);
    for (let i = 0; i < 8; i++) {
      const x = 59 + i * 129;
      rounded(x, 448, 5, 22, 3, '#9d7056');
      rounded(x - 6, 455, 6, 5, 3, '#9d7056');
      rounded(x + 5, 448, 7, 5, 3, '#9d7056');
    }
  }

  function drawTerrain() {
    const l = levels[levelIndex];
    rounded(0, GROUND, W, H - GROUND, 0, l.ground);
    rounded(0, GROUND, W, 9, 0, l.accent);
    for (let i = 0; i < 22; i++) circle((i * 107) % W, GROUND + 24 + (i * 23) % 37, 2.2, l.edge);
    for (const p of l.platforms) {
      rounded(p.x + 2, p.y + 8, p.w, 15, 5, l.edge);
      rounded(p.x, p.y, p.w, 17, 6, l.platform);
      rounded(p.x + 4, p.y, p.w - 8, 5, 3, l.accent);
    }
  }

  function drawPlayer(p, t) {
    const mint = p.id === 0, base = mint ? '#23bfa9' : '#ff796b', shadow = mint ? '#129783' : '#dd5e58';
    // Soft floor shadow below the character.
    const yFeet = p.y + p.h;
    let floor = GROUND;
    for (const s of levels[levelIndex].platforms)
      if (p.x + p.w > s.x && p.x < s.x + s.w && s.y >= yFeet - 3) floor = Math.min(floor, s.y);
    ctx.globalAlpha = clamp(.18 - (floor - yFeet) * .00025, .045, .18);
    ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, floor + 5, 19, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#223b46'; ctx.fill();
    ctx.globalAlpha = 1;

    // "IT" marker.
    if (p.id === it) {
      circle(p.x + p.w / 2, p.y + 7, 27, '#fff2aa6b');
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y - 14);
      rounded(-17, -20, 34, 19, 9, '#fff');
      rounded(-11, -16, 22, 11, 6, '#ff755f');
      ctx.fillStyle = '#fff'; ctx.font = '900 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('IT', 0, -8);
      ctx.restore();
    }

    // Legs run subtly while moving, then body.
    const leg = Math.abs(p.vx) > 1 && p.grounded ? Math.sin(t * 18) * 4 : 0;
    rounded(p.x + 7, p.y + 30, 9, 15 + leg, 4, shadow);
    rounded(p.x + 20, p.y + 30, 9, 15 - leg, 4, shadow);
    rounded(p.x, p.y, PLAYER_W, 39, 12, base);
    rounded(p.x + 4, p.y + 4, PLAYER_W - 8, 8, 5, '#ffffff38');

    // Face looks towards the direction of travel.
    const eye = p.face === 1 ? 3 : -3;
    circle(p.x + 12 + eye, p.y + 17, 4.4, '#fff');
    circle(p.x + 24 + eye, p.y + 17, 4.4, '#fff');
    circle(p.x + 13 + eye, p.y + 18, 2.1, '#183747');
    circle(p.x + 25 + eye, p.y + 18, 2.1, '#183747');
    ctx.strokeStyle = shadow; ctx.lineWidth = 2.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(p.x + 18 + eye, p.y + 24, 5, .18, Math.PI - .18); ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    [drawPark, drawCity, drawCanyon][levelIndex]();
    drawTerrain();
    players.forEach(p => drawPlayer(p, cameraTime));
    if (phase === 'playing' && messageTimer > 0) {
      ctx.globalAlpha = clamp(messageTimer * 2, 0, 1);
      ctx.textAlign = 'center'; ctx.fillStyle = '#194756'; ctx.font = '1000 37px ui-rounded, system-ui';
      ctx.fillText(message, W / 2, 175);
      ctx.globalAlpha = 1;
    }
  }

  function loop(time) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .034) : 1 / 60;
    lastTime = time;
    tick(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Live preview behind the start menu.
  players = [makePlayer(0, 160), makePlayer(1, 780)];
  requestAnimationFrame(loop);
})();