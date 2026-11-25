// Rush Hour Kitchen — orders: what the board shows, how they time out,
// and what serving one pays. Pure logic, no DOM here except the icons it
// renders into a card element.

import { DISH_BY_ID, dishPool, maxTip, orderLifetimeSeconds } from './recipes.js';

let nextOrderId = 1;

// An order: { id, dishId, needs (ingredient ids), totalSecs, leftSecs, tip }
export function makeOrder(progress, rng) {
  const pool = dishPool(progress);
  const dish = pool[Math.floor(rng() * pool.length)];
  const total = orderLifetimeSeconds(progress);
  return {
    id: nextOrderId++,
    dishId: dish.id,
    needs: [...dish.needs],
    totalSecs: total,
    leftSecs: total,
    tip: maxTip(),
  };
}

export function orderDish(order) {
  return DISH_BY_ID[order.dishId];
}

// Tip left on an order right now: full at spawn, zero at expiry.
export function currentTip(order) {
  const frac = Math.max(0, order.leftSecs / order.totalSecs);
  return Math.round(maxTip() * frac);
}

// Tick every order down by dt seconds. Returns the orders that just expired.
export function tickOrders(orders, dt) {
  const expired = [];
  for (const order of orders) {
    order.leftSecs -= dt;
    if (order.leftSecs <= 0) expired.push(order);
  }
  return expired;
}

// Does the plate (a list of prepared ingredient ids) match this order?
// Same multiset, order does not matter, duplicates count.
export function plateMatchesOrder(plate, order) {
  if (plate.length !== order.needs.length) return false;
  const a = [...plate].sort();
  const b = [...order.needs].sort();
  return a.every((ing, i) => ing === b[i]);
}

// How many of the plate's ingredients belong to this order (for the hint).
export function plateOverlap(plate, order) {
  const remaining = [...order.needs];
  let hit = 0;
  for (const ing of plate) {
    const i = remaining.indexOf(ing);
    if (i !== -1) { remaining.splice(i, 1); hit++; }
  }
  return hit;
}

// Points for serving: base + tip, times the streak multiplier.
export function servePoints(order, streak) {
  const dish = orderDish(order);
  const mult = streakMultiplier(streak);
  return Math.round((dish.base + currentTip(order)) * mult);
}

export function streakMultiplier(streak) {
  if (streak >= 8) return 2.0;
  if (streak >= 5) return 1.5;
  if (streak >= 3) return 1.25;
  return 1.0;
}

// Render one order card's inner HTML (icons + timer). Called on every
// render tick; cheap enough at this size.
export function orderCardHTML(order, plate) {
  const dish = orderDish(order);
  const matched = plateMatchesOrder(plate, order);
  const frac = Math.max(0, order.leftSecs / order.totalSecs);
  const secs = Math.max(0, Math.ceil(order.leftSecs));
  const low = frac < 0.3;
  const needs = order.needs.map((ing) => {
    const onPlate = plate.includes(ing);
    return `<span class="need${onPlate ? ' done' : ''}" title="${ing}"><svg><use href="#ing-${ing}"/></svg></span>`;
  }).join('');
  return `
    <div class="order-name">${dish.name}</div>
    <div class="order-sub">${dish.blurb}</div>
    <div class="order-need">${needs}</div>
    <div class="order-meta">
      <span class="order-tip">TIP +$${currentTip(order)}</span>
      <span class="order-timer${low ? ' low' : ''}">${secs}s</span>
    </div>
    <div class="order-bar"><i class="${low ? ' low' : ''}" style="width:${Math.round(frac * 100)}%"></i></div>
  `;
}
