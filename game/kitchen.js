// Rush Hour Kitchen — the kitchen stations: the stove (cook), the
// chopping board (chop), the hand (what the chef carries) and the plate.
// Each station slot holds one item and runs its own progress clock.

import { ING_BY_ID } from './recipes.js';

// How long each prep takes, in seconds (mirrors recipes.js).
export function prepSeconds(ing) {
  if (ing.prep === 'stove') return ing.cookSecs ?? 2.5;
  if (ing.prep === 'board') return ing.chopSecs ?? 1.5;
  return 0;
}

export function stationFor(ing) {
  return ing.prep; // 'stove' | 'board' | null
}

// One slot on a station.
export function makeSlot() {
  return { ing: null, progress: 0, needed: 0, done: false };
}

export class Kitchen {
  constructor() {
    this.burners = [makeSlot(), makeSlot()]; // stove
    this.slots = [makeSlot(), makeSlot()];   // chopping board
    // What the chef carries: null, or { id, prepared } — an ingredient is
    // only "prepared" once it has passed through its station (or needs none).
    this.hand = null;
    this.plate = [];  // prepared ingredient ids on the plate
  }

  // Put the held ingredient onto a free slot of its station. Returns true.
  placeOnStation() {
    if (!this.hand || this.hand.prepared) return false;
    const ing = ING_BY_ID[this.hand.id];
    if (!ing.prep) return false;
    const row = ing.prep === 'stove' ? this.burners : this.slots;
    const free = row.find((s) => s.ing === null);
    if (!free) return false;
    free.ing = ing.id;
    free.progress = 0;
    free.needed = prepSeconds(ing);
    free.done = false;
    this.hand = null;
    return true;
  }

  // Pick up a finished item from a station slot. Returns the ingredient id.
  takeFrom(slot) {
    if (!slot.ing || !slot.done || this.hand) return null;
    const id = slot.ing;
    slot.ing = null;
    slot.progress = 0;
    slot.needed = 0;
    slot.done = false;
    this.hand = { id, prepared: true };
    return id;
  }

  // Advance every running slot by dt seconds.
  tick(dt) {
    for (const row of [this.burners, this.slots]) {
      for (const s of row) {
        if (s.ing && !s.done) {
          s.progress += dt;
          if (s.progress >= s.needed) { s.progress = s.needed; s.done = true; }
        }
      }
    }
  }

  // Add the held ingredient to the plate. Only a prepared ingredient (or
  // one that needs no prep) may go on the plate.
  addToPlate() {
    if (!this.hand) return false;
    const ing = ING_BY_ID[this.hand.id];
    if (ing.prep && !this.hand.prepared) return false;
    this.plate.push(this.hand.id);
    this.hand = null;
    return true;
  }

  clearPlate() {
    const had = this.plate.length > 0;
    this.plate = [];
    return had;
  }

  // The station slot a held raw ingredient belongs on, if any.
  heldStation() {
    if (!this.hand || this.hand.prepared) return null;
    return stationFor(ING_BY_ID[this.hand.id]);
  }
}

// Small helper: an <svg> that draws one ingredient icon.
export function iconSVG(ingId, cls = '') {
  const ing = ING_BY_ID[ingId];
  const symbol = ing.prep ? ing.rawIcon : ing.icon;
  return `<svg class="${cls}"><use href="#${symbol}"/></svg>`;
}

// The prepared icon (always the finished look) for the plate and orders.
export function cookedIconSVG(ingId) {
  return `<svg><use href="#ing-${ingId}"/></svg>`;
}
