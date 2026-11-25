// Rush Hour Kitchen — the game itself: state machine, shift loop, input,
// rendering and the ?shot= hooks the screenshots use.
// Play: pick ingredients (click or 1-8), cook on the stove / chop on the
// board, build the dish on the plate, serve the matching order (click it or
// Enter). Orders time out; the shift lasts 180 seconds.

import { INGREDIENTS, ING_BY_ID, DISH_BY_ID } from './recipes.js';
import {
  makeOrder, tickOrders, plateMatchesOrder, plateOverlap,
  servePoints, orderCardHTML, currentTip,
} from './orders.js';
import { Kitchen, cookedIconSVG } from './kitchen.js';
import { sfx, unlockAudio, setMuted, isMuted } from './sound.js';

const SHIFT_SECS = 180;
const MAX_LIVES = 3;
const MAX_ORDERS = 3;

// Deterministic RNG for screenshot states (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | over
    this.kitchen = new Kitchen();
    this.rng = Math.random;
    this.score = 0;
    this.served = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lives = MAX_LIVES;
    this.shiftLeft = SHIFT_SECS;
    this.elapsed = 0;
    this.orders = [];
    this.spawnIn = 0; // seconds until the next order spawns
    this.dirty = true; // structural re-render needed
    this.lastTick = 0;
    this.lastToast = 0;
    this.toastTimer = null;
    this.lastTickSecond = -1;
  }

  get progress() {
    return Math.min(1, this.elapsed / SHIFT_SECS);
  }

  // ---------- lifecycle ----------

  startGame(opts = {}) {
    this.state = 'playing';
    this.kitchen = new Kitchen();
    this.rng = opts.rng || Math.random;
    this.score = 0;
    this.served = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lives = MAX_LIVES;
    this.shiftLeft = SHIFT_SECS;
    this.elapsed = 0;
    this.orders = [];
    this.spawnIn = 0;
    // Two orders on the board at once; the third joins after a beat.
    this.orders.push(makeOrder(0, this.rng));
    this.orders.push(makeOrder(0, this.rng));
    this.spawnIn = 2.0;
    this.dirty = true;
    hideOverlay();
    sfx.start();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    showOverlay(pauseHTML());
    $('btn-resume').addEventListener('click', () => this.resume());
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    hideOverlay();
  }

  gameOver(reason) {
    this.state = 'over';
    sfx.timeout();
    showOverlay(gameOverHTML(this, reason));
    $('btn-again').addEventListener('click', () => this.startGame());
  }

  // ---------- orders ----------

  spawnOrder() {
    if (this.orders.length >= MAX_ORDERS) return;
    this.orders.push(makeOrder(this.progress, this.rng));
    this.dirty = true;
  }

  serveOrder(order) {
    if (!plateMatchesOrder(this.kitchen.plate, order)) {
      sfx.error();
      toast("That plate doesn't match this order yet.", 'bad');
      return false;
    }
    const points = servePoints(order, this.streak);
    this.score += points;
    this.served += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.orders = this.orders.filter((o) => o.id !== order.id);
    this.kitchen.clearPlate();
    this.spawnIn = Math.max(this.spawnIn, 1.2);
    this.dirty = true;
    sfx.serve();
    toast(`Served ${orderDishName(order)}! +${points}`, 'good');
    return true;
  }

  serveFirstMatch() {
    const match = this.orders.find((o) => plateMatchesOrder(this.kitchen.plate, o));
    if (match) return this.serveOrder(match);
    if (this.kitchen.plate.length === 0) {
      toast('Your plate is empty — build a dish first.', 'bad');
    } else {
      toast('No order matches this plate. Check the board!', 'bad');
    }
    sfx.error();
    return false;
  }

  expireOrder(order) {
    this.orders = this.orders.filter((o) => o.id !== order.id);
    this.lives -= 1;
    this.streak = 0;
    this.spawnIn = Math.max(this.spawnIn, 1.5);
    this.dirty = true;
    sfx.timeout();
    toast(`Order timed out! ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left.`, 'bad');
    if (this.lives <= 0) this.gameOver('out of lives');
  }

  // ---------- input actions ----------

  pickIngredient(ingId) {
    if (this.state !== 'playing') return;
    const ing = ING_BY_ID[ingId];
    if (!ing) return;
    unlockAudio();
    if (this.kitchen.hand) {
      toast('Hands full — put the held item down first.', 'bad');
      sfx.error();
      return;
    }
    // Ready ingredients are prepared at once; the rest need their station.
    this.kitchen.hand = { id: ingId, prepared: !ing.prep };
    this.dirty = true;
    sfx.pick();
  }

  // Context action (Space): cook/chop what is held, take a finished item,
  // or plate a ready one.
  contextAction() {
    if (this.state !== 'playing') return;
    unlockAudio();
    const k = this.kitchen;
    if (k.hand) {
      const ing = ING_BY_ID[k.hand.id];
      if (ing.prep && !k.hand.prepared) {
        if (k.placeOnStation()) { sfx.cookStart(); this.dirty = true; }
        else toast('No free spot on the ' + (ing.prep === 'stove' ? 'stove' : 'board') + '!', 'bad');
      } else if (k.addToPlate()) {
        sfx.plate();
        this.dirty = true;
      }
      return;
    }
    // Hands empty: take the first finished station item.
    for (const row of [k.burners, k.slots]) {
      for (const slot of row) {
        if (slot.ing && slot.done) {
          k.takeFrom(slot);
          sfx.pick();
          this.dirty = true;
          return;
        }
      }
    }
    toast('Nothing to do — pick an ingredient first.', 'bad');
  }

  clickStation(rowName, index) {
    if (this.state !== 'playing') return;
    unlockAudio();
    const k = this.kitchen;
    const row = rowName === 'stove' ? k.burners : k.slots;
    const slot = row[index];
    if (!slot) return;
    if (slot.ing && slot.done) {
      if (k.hand) { toast('Hands full — put the held item down first.', 'bad'); return; }
      k.takeFrom(slot);
      sfx.pick();
      this.dirty = true;
      return;
    }
    if (slot.ing && !slot.done) {
      toast('Still cooking — watch the bar!', 'bad');
      return;
    }
    // Empty slot: place the held raw ingredient if it belongs here.
    if (k.hand) {
      const ing = ING_BY_ID[k.hand.id];
      if (ing.prep === rowName && !k.hand.prepared) {
        if (k.placeOnStation()) { sfx.cookStart(); this.dirty = true; }
      } else if (ing.prep && !k.hand.prepared) {
        toast(`${ing.name} goes on the ${ing.prep === 'stove' ? 'stove' : 'chopping board'}, not here.`, 'bad');
      } else {
        toast(`${ing.name} is ready — click the plate to add it.`, 'bad');
      }
    }
  }

  clickPlate() {
    if (this.state !== 'playing') return;
    unlockAudio();
    const k = this.kitchen;
    if (!k.hand) { toast('Pick an ingredient first.', 'bad'); return; }
    const ing = ING_BY_ID[k.hand.id];
    if (ing.prep && !k.hand.prepared) {
      toast(`${ing.name} needs to be ${ing.prep === 'stove' ? 'cooked' : 'chopped'} first!`, 'bad');
      sfx.error();
      return;
    }
    k.addToPlate();
    sfx.plate();
    this.dirty = true;
  }

  clickHand() {
    if (this.state !== 'playing') return;
    if (!this.kitchen.hand) return;
    this.kitchen.hand = null;
    this.dirty = true;
    sfx.drop();
  }

  // ---------- loop ----------

  tick(dt) {
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    this.shiftLeft -= dt;
    if (this.shiftLeft <= 0) {
      this.shiftLeft = 0;
      this.gameOver('shift over');
      return;
    }
    // Low-time warning tick each second under 30s.
    const sec = Math.ceil(this.shiftLeft);
    if (sec <= 30 && sec !== this.lastTickSecond) {
      this.lastTickSecond = sec;
      sfx.tick();
    }
    // Orders.
    const expired = tickOrders(this.orders, dt);
    for (const order of expired) this.expireOrder(order);
    if (this.state !== 'playing') return; // game over may have fired
    // Spawning.
    if (this.orders.length < MAX_ORDERS) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawnOrder();
        this.spawnIn = 2.5 - 1.0 * this.progress;
      }
    }
    // Stations.
    const before = this.kitchen.burners.concat(this.kitchen.slots).map((s) => s.done);
    this.kitchen.tick(dt);
    const after = this.kitchen.burners.concat(this.kitchen.slots).map((s) => s.done);
    if (after.some((done, i) => done && !before[i])) {
      sfx.ready();
      this.dirty = true;
    }
  }

  loop = (t) => {
    const dt = Math.min(0.1, (t - this.lastTick) / 1000 || 0);
    this.lastTick = t;
    this.tick(dt);
    this.render(dt);
    requestAnimationFrame(this.loop);
  };

  // ---------- rendering ----------

  render(dt) {
    // Dynamic numbers every frame (cheap text/style writes).
    renderHUD(this);
    renderOrderTimers(this);
    renderStationProgress(this);
    // Structural rebuilds only when something changed.
    if (this.dirty) {
      renderOrders(this);
      renderStations(this);
      renderHand(this);
      renderPlate(this);
      this.dirty = false;
    }
  }
}

function orderDishName(order) {
  return DISH_BY_ID[order.dishId].name;
}

// ---------- HUD ----------

function renderHUD(g) {
  $('score').textContent = g.score;
  const secs = Math.max(0, Math.ceil(g.shiftLeft));
  $('shift-timer').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('hud-timer').classList.toggle('low', secs <= 30 && g.state === 'playing');
  $('served').textContent = g.served;
  const mult = g.streak >= 8 ? 2 : g.streak >= 5 ? 1.5 : g.streak >= 3 ? 1.25 : 1;
  $('streak').textContent = `x${mult}`;
  $('lives').innerHTML = '&#10084;'.repeat(g.lives) + '<span style="opacity:0.25">' + '&#10084;'.repeat(MAX_LIVES - g.lives) + '</span>';
}

// ---------- orders ----------

function renderOrders(g) {
  const wrap = $('orders');
  if (g.orders.length === 0) {
    wrap.innerHTML = '<div class="order-empty">Next order coming up…</div>';
    return;
  }
  wrap.innerHTML = g.orders.map((order) => {
    const matched = plateMatchesOrder(g.kitchen.plate, order);
    const frac = Math.max(0, order.leftSecs / order.totalSecs);
    const urgent = frac < 0.3;
    return `<div class="order-card${matched ? ' match' : ''}${urgent ? ' urgent' : ''}" data-order="${order.id}">${orderCardHTML(order, g.kitchen.plate)}</div>`;
  }).join('');
}

function renderOrderTimers(g) {
  // The timer text and bars move every frame; update them in place.
  for (const order of g.orders) {
    const card = document.querySelector(`.order-card[data-order="${order.id}"]`);
    if (!card) continue;
    const frac = Math.max(0, order.leftSecs / order.totalSecs);
    const secs = Math.max(0, Math.ceil(order.leftSecs));
    const timerEl = card.querySelector('.order-timer');
    if (timerEl) {
      timerEl.textContent = `${secs}s`;
      timerEl.classList.toggle('low', frac < 0.3);
    }
    const tipEl = card.querySelector('.order-tip');
    if (tipEl) tipEl.textContent = `TIP +$${currentTip(order)}`;
    const bar = card.querySelector('.order-bar i');
    if (bar) {
      bar.style.width = `${Math.round(frac * 100)}%`;
      bar.classList.toggle('low', frac < 0.3);
    }
    card.classList.toggle('urgent', frac < 0.3);
    card.classList.toggle('match', plateMatchesOrder(g.kitchen.plate, order));
  }
}

// ---------- stations ----------

function slotHTML(slot, stationName, label) {
  if (!slot.ing) {
    return `<span class="empty-label">${label}</span>`;
  }
  const ing = ING_BY_ID[slot.ing];
  const pct = slot.needed > 0 ? Math.round((slot.progress / slot.needed) * 100) : 100;
  const state = slot.done ? 'READY' : (stationName === 'stove' ? 'COOKING' : 'CHOPPING');
  return `
    <span class="item"><svg><use href="#${slot.done ? ing.icon : ing.rawIcon}"/></svg></span>
    <span class="state">${state}</span>
    ${slot.done ? '' : `<span class="prog"><i style="width:${pct}%"></i></span>`}
  `;
}

function renderStations(g) {
  const k = g.kitchen;
  k.burners.forEach((slot, i) => {
    const el = $(`burner-${i}`);
    el.innerHTML = slotHTML(slot, 'stove', 'empty burner');
    el.classList.toggle('done', !!slot.done);
  });
  k.slots.forEach((slot, i) => {
    const el = $(`slot-${i}`);
    el.innerHTML = slotHTML(slot, 'board', 'empty slot');
    el.classList.toggle('done', !!slot.done);
  });
}

function renderStationProgress(g) {
  const k = g.kitchen;
  const rows = [['burner', k.burners], ['slot', k.slots]];
  for (const [prefix, slots] of rows) {
    slots.forEach((slot, i) => {
      if (!slot.ing || slot.done) return;
      const bar = document.querySelector(`#${prefix}-${i} .prog i`);
      if (bar) bar.style.width = `${Math.round((slot.progress / slot.needed) * 100)}%`;
    });
  }
}

// ---------- hand & plate ----------

function renderHand(g) {
  const hand = g.kitchen.hand;
  const el = $('hand-item');
  if (!hand) {
    el.innerHTML = '<span class="hand-empty">empty</span>';
    el.parentElement.querySelector('.hand-name')?.remove();
    return;
  }
  const ing = ING_BY_ID[hand.id];
  el.innerHTML = `<svg><use href="#${hand.prepared ? ing.icon : ing.rawIcon}"/></svg>`;
  let nameEl = el.parentElement.querySelector('.hand-name');
  if (!nameEl) {
    nameEl = document.createElement('span');
    nameEl.className = 'hand-name';
    el.parentElement.appendChild(nameEl);
  }
  nameEl.textContent = ing.name + (ing.prep && !hand.prepared ? ` (raw — ${ing.prep === 'stove' ? 'cook it' : 'chop it'})` : ' (ready)');
}

function renderPlate(g) {
  const dish = $('plate-dish');
  const plate = g.kitchen.plate;
  dish.innerHTML = plate.map((ing) => `<span class="dish-ing">${cookedIconSVG(ing)}</span>`).join('');
  const empty = document.querySelector('#plate .plate-empty');
  if (plate.length === 0 && !empty) {
    const div = document.createElement('div');
    div.className = 'plate-empty';
    div.textContent = 'Click the plate to add an ingredient';
    $('plate').prepend(div);
  } else if (plate.length > 0 && empty) {
    empty.remove();
  }
  // Hint: what is this plate building toward?
  const need = $('plate-need');
  const serveBtn = $('btn-serve');
  if (plate.length === 0) {
    need.textContent = 'Build a dish from the order board.';
    serveBtn.classList.remove('ready');
    return;
  }
  const match = g.orders.find((o) => plateMatchesOrder(plate, o));
  if (match) {
    need.innerHTML = `<b>Ready! Serve the ${orderDishName(match)}.</b>`;
    serveBtn.classList.add('ready');
    return;
  }
  serveBtn.classList.remove('ready');
  let best = null, bestHit = 0;
  for (const o of g.orders) {
    const hit = plateOverlap(plate, o);
    if (hit > bestHit) { bestHit = hit; best = o; }
  }
  if (best && bestHit > 0) {
    need.textContent = `${orderDishName(best)}: ${bestHit}/${best.needs.length} on the plate`;
  } else {
    need.textContent = 'This plate matches no order — bin it and start over.';
  }
}

// ---------- overlay & toast ----------

function showOverlay(html) {
  $('overlay-card').innerHTML = html;
  $('overlay').classList.add('show');
}

function hideOverlay() {
  $('overlay').classList.remove('show');
}

function menuHTML() {
  return `
    <h1>RUSH HOUR KITCHEN</h1>
    <p><b>One chef. One shift. Three hungry orders at a time.</b><br>
    Cook, chop, plate and serve before the clock — or the orders — run out.</p>
    <div class="howto">
      <div><b>1.</b> Pick an ingredient from the counter (click or press <b>1&ndash;8</b>).</div>
      <div><b>2.</b> Patty, egg and pasta go on the <b>stove</b>; lettuce and tomato go on the <b>chopping board</b>. Wait for the bar, then take them.</div>
      <div><b>3.</b> Click the <b>plate</b> to add what you hold. Match an order on the board, then click it — or press <b>Enter</b> — to serve.</div>
      <div><b>4.</b> Serve fast for a bigger tip. Serve in a row for a streak bonus. An order that times out costs a life. Three lives, one 3-minute shift.</div>
    </div>
    <button class="big-btn" id="btn-start" type="button">START SHIFT</button>
    <p style="font-size:12px;color:#7a6a58">Keyboard: 1&ndash;8 pick &middot; Space cook / chop / take &middot; Enter serve &middot; Backspace clear plate &middot; P pause</p>
  `;
}

function pauseHTML() {
  return `
    <h2>PAUSED</h2>
    <p>The kitchen waits for no one — except right now.</p>
    <button class="big-btn" id="btn-resume" type="button">RESUME</button>
  `;
}

function gameOverHTML(g, reason) {
  const title = reason === 'out of lives' ? 'OUT OF LIVES!' : 'SHIFT OVER!';
  return `
    <h2>${title}</h2>
    <div class="big-score">${g.score} pts</div>
    <div class="stats">
      <div><b>${g.served}</b>dishes served</div>
      <div><b>x${g.bestStreak >= 8 ? 2 : g.bestStreak >= 5 ? 1.5 : g.bestStreak >= 3 ? 1.25 : 1}</b>best streak</div>
      <div><b>${g.lives}</b>lives left</div>
    </div>
    <p>${g.served === 0 ? 'No dishes made it out. The orders were faster than the chef.' : g.served >= 10 ? 'A blazing shift — the dining room is still talking about it.' : 'A solid shift. Faster hands next time and the tips will follow.'}</p>
    <button class="big-btn" id="btn-again" type="button">PLAY AGAIN</button>
  `;
}

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2200);
}

// ---------- screenshot states ----------
// ?shot=start  — the menu (default).
// ?shot=play  — mid-shift, a dish half-built on the plate, stove and board busy.
// ?shot=serve — a finished Garden Salad on the plate, its order lit up to serve.
// ?shot=end   — the game-over screen with a final score.
// ?seed=N    — fixes the order draw so the shots are reproducible.
// These states exist so the screenshots are real renders of the game's own
// code in a known state, never edited or composited.

function setupShot(game, shot, seed) {
  const rng = mulberry32(seed);
  game.startGame({ rng });
  if (shot === 'start') {
    game.state = 'menu';
    showOverlay(menuHTML());
    $('btn-start').addEventListener('click', () => game.startGame());
    return;
  }
  if (shot === 'play') {
    // Mid-assembly: a Classic Burger half-built on the plate (bun + patty),
    // a patty cooking, lettuce chopping, three orders on the board.
    const burger = { id: 9002, dishId: 'classic-burger', needs: ['bun', 'patty', 'lettuce', 'tomato'], totalSecs: 48, leftSecs: 41, tip: 50 };
    game.orders[0] = burger;
    game.spawnOrder(); // third order on the board right away
    game.kitchen.plate = ['bun', 'patty'];
    game.kitchen.burners[0] = { ing: 'patty', progress: 1.5, needed: 3.0, done: false };
    game.kitchen.slots[0] = { ing: 'lettuce', progress: 0.9, needed: 1.5, done: false };
    game.shiftLeft = 150;
    game.elapsed = 30;
    game.score = 240;
    game.served = 2;
    game.streak = 2;
    game.bestStreak = 2;
    game.dirty = true;
    return;
  }
  if (shot === 'serve') {
    // A finished Garden Salad on the plate; force the first order to match it
    // and the second to be a different dish so the board shows variety.
    const salad = { id: 9001, dishId: 'garden-salad', needs: ['lettuce', 'tomato', 'cheese'], totalSecs: 48, leftSecs: 34, tip: 50 };
    const pasta = { id: 9003, dishId: 'pasta-special', needs: ['pasta', 'sauce', 'cheese'], totalSecs: 48, leftSecs: 48, tip: 50 };
    game.orders[0] = salad;
    game.orders[1] = pasta;
    game.kitchen.plate = ['lettuce', 'tomato', 'cheese'];
    game.shiftLeft = 120;
    game.elapsed = 60;
    game.score = 320;
    game.served = 3;
    game.streak = 3;
    game.bestStreak = 3;
    game.dirty = true;
    return;
  }
  if (shot === 'end') {
    game.score = 1240;
    game.served = 11;
    game.bestStreak = 5;
    game.lives = 1;
    game.shiftLeft = 0;
    game.gameOver('shift over');
    return;
  }
}

// ---------- boot ----------

function buildIngredientButtons(game) {
  const wrap = $('ingredients');
  wrap.innerHTML = INGREDIENTS.map((ing) => `
    <button class="ing-btn" type="button" data-ing="${ing.id}" title="${ing.name} — ${ing.prepLabel}">
      <span class="ing-key">${ing.key}</span>
      <svg><use href="#${ing.prep ? ing.rawIcon : ing.icon}"/></svg>
      <span class="ing-name">${ing.name}</span>
      <span class="ing-prep">${ing.prepLabel}</span>
    </button>
  `).join('');
}

function bindEvents(game) {
  // Ingredient counter (event delegation).
  $('ingredients').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ing]');
    if (!btn) return;
    game.pickIngredient(btn.dataset.ing);
    document.querySelectorAll('.ing-btn').forEach((b) => b.classList.remove('held'));
    if (game.kitchen.hand?.id === btn.dataset.ing) btn.classList.add('held');
  });
  // Stations.
  $('stove').addEventListener('click', (e) => {
    const b = e.target.closest('.burner');
    if (b) game.clickStation('stove', Number(b.id.split('-')[1]));
  });
  $('board').addEventListener('click', (e) => {
    const s = e.target.closest('.slot');
    if (s) game.clickStation('board', Number(s.id.split('-')[1]));
  });
  // Plate, hand, actions.
  $('plate').addEventListener('click', () => game.clickPlate());
  $('hand').addEventListener('click', () => game.clickHand());
  $('btn-bin').addEventListener('click', () => {
    if (game.state !== 'playing') return;
    if (game.kitchen.clearPlate()) { sfx.drop(); game.dirty = true; }
  });
  $('btn-serve').addEventListener('click', () => {
    if (game.state === 'playing') game.serveFirstMatch();
  });
  // Orders (event delegation so re-renders keep working).
  $('orders').addEventListener('click', (e) => {
    const card = e.target.closest('.order-card');
    if (!card || game.state !== 'playing') return;
    const order = game.orders.find((o) => o.id === Number(card.dataset.order));
    if (order) game.serveOrder(order);
  });
  // HUD buttons.
  $('btn-pause').addEventListener('click', () => {
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
  });
  $('btn-mute').addEventListener('click', () => {
    setMuted(!isMuted());
    $('btn-mute').textContent = isMuted() ? '✕' : '♪';
    $('btn-mute').title = isMuted() ? 'Sound off' : 'Sound on/off';
  });
  // Keyboard.
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (game.state === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      game.startGame();
      return;
    }
    if (game.state === 'over' && e.key === 'Enter') {
      game.startGame();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      if (game.state === 'playing') game.pause();
      else if (game.state === 'paused') game.resume();
      return;
    }
    if (game.state !== 'playing') return;
    const ing = INGREDIENTS.find((i) => i.key === e.key);
    if (ing) { game.pickIngredient(ing.id); return; }
    if (e.key === ' ') { e.preventDefault(); game.contextAction(); }
    else if (e.key === 'Enter') { game.serveFirstMatch(); }
    else if (e.key === 'Backspace') {
      e.preventDefault();
      if (game.kitchen.clearPlate()) { sfx.drop(); game.dirty = true; }
    }
  });
  // Keep the held-ingredient highlight in sync.
  const syncHeld = () => {
    document.querySelectorAll('.ing-btn').forEach((b) => {
      b.classList.toggle('held', game.kitchen.hand?.id === b.dataset.ing);
    });
  };
  setInterval(syncHeld, 200);
}

function boot() {
  const game = new Game();
  buildIngredientButtons(game);
  bindEvents(game);
  renderHUD(game);
  renderOrders(game);
  renderStations(game);
  renderHand(game);
  renderPlate(game);
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '1');
  if (shot) {
    setupShot(game, shot, seed);
  } else {
    showOverlay(menuHTML());
    $('btn-start').addEventListener('click', () => game.startGame());
  }
  game.lastTick = performance.now();
  requestAnimationFrame(game.loop);
}

boot();
