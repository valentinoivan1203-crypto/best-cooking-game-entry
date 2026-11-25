// Rush Hour Kitchen — recipes and ingredients.
// A dish is a multiset of prepared ingredients. The plate matches an order
// when its contents equal the dish's list (order does not matter, duplicates do).

// Every ingredient the counter offers. `prep` names the station it needs
// before it can go on a plate: 'stove' (cook), 'board' (chop) or null (ready).
// `icon` is the SVG symbol id in index.html; `rawIcon` is the un-prepped look.
export const INGREDIENTS = [
  { id: 'bun',     name: 'Bun',     key: '1', prep: null,    prepLabel: 'ready',    icon: 'ing-bun',        rawIcon: 'ing-bun' },
  { id: 'patty',   name: 'Patty',   key: '2', prep: 'stove', prepLabel: 'cook 3s',  icon: 'ing-patty',      rawIcon: 'ing-patty-raw', cookSecs: 3.0 },
  { id: 'lettuce', name: 'Lettuce', key: '3', prep: 'board', prepLabel: 'chop 1.5s', icon: 'ing-lettuce',   rawIcon: 'ing-lettuce',   chopSecs: 1.5 },
  { id: 'tomato',  name: 'Tomato',  key: '4', prep: 'board', prepLabel: 'chop 1.5s', icon: 'ing-tomato',    rawIcon: 'ing-tomato',    chopSecs: 1.5 },
  { id: 'cheese',  name: 'Cheese',  key: '5', prep: null,    prepLabel: 'ready',    icon: 'ing-cheese',     rawIcon: 'ing-cheese' },
  { id: 'pasta',   name: 'Pasta',   key: '6', prep: 'stove', prepLabel: 'boil 2.5s', icon: 'ing-pasta',      rawIcon: 'ing-pasta',     cookSecs: 2.5 },
  { id: 'sauce',   name: 'Sauce',   key: '7', prep: null,    prepLabel: 'ready',    icon: 'ing-sauce',      rawIcon: 'ing-sauce' },
  { id: 'egg',     name: 'Egg',     key: '8', prep: 'stove', prepLabel: 'fry 2.5s',  icon: 'ing-egg',        rawIcon: 'ing-egg-raw',   cookSecs: 2.5 },
];

export const ING_BY_ID = Object.fromEntries(INGREDIENTS.map((ing) => [ing.id, ing]));

// Dishes. `needs` is the list of prepared ingredient ids, one entry per
// portion (a double burger really needs two patties). `base` is the points
// for serving it before any tip or streak multiplier.
export const DISHES = [
  {
    id: 'garden-salad', name: 'Garden Salad', base: 80, difficulty: 1,
    needs: ['lettuce', 'tomato', 'cheese'],
    blurb: 'Crisp, fresh, fast.',
  },
  {
    id: 'pasta-special', name: 'Pasta Special', base: 90, difficulty: 1,
    needs: ['pasta', 'sauce', 'cheese'],
    blurb: 'Boil, toss, serve.',
  },
  {
    id: 'breakfast-plate', name: 'Breakfast Plate', base: 90, difficulty: 1,
    needs: ['egg', 'cheese', 'tomato'],
    blurb: 'Sunny side up.',
  },
  {
    id: 'classic-burger', name: 'Classic Burger', base: 100, difficulty: 2,
    needs: ['bun', 'patty', 'lettuce', 'tomato'],
    blurb: 'The house favourite.',
  },
  {
    id: 'cheese-burger', name: 'Cheese Burger', base: 110, difficulty: 2,
    needs: ['bun', 'patty', 'cheese', 'lettuce'],
    blurb: 'Extra melt, extra joy.',
  },
  {
    id: 'double-burger', name: 'Double Burger', base: 140, difficulty: 3,
    needs: ['bun', 'patty', 'patty', 'cheese'],
    blurb: 'Two patties, no mercy.',
  },
];

export const DISH_BY_ID = Object.fromEntries(DISHES.map((d) => [d.id, d]));

// How long an order stays on the board (seconds) at a given shift progress
// (0 at the start of the shift, 1 at the end). Orders get less patient.
export function orderLifetimeSeconds(progress) {
  return 48 - 16 * progress;
}

// Base tip for an order, paid in full when served instantly, shrinking
// linearly to zero as its timer runs out.
export function maxTip() {
  return 50;
}

// Spawn delay (seconds) before a fresh order appears after one leaves.
export function spawnDelaySeconds(progress) {
  return 2.5 - 1.0 * progress;
}

// Which dishes may appear at a given shift progress. Early on only the
// quick 3-ingredient dishes; the 4-ingredient ones join in later.
export function dishPool(progress) {
  if (progress < 0.33) return DISHES.filter((d) => d.difficulty === 1);
  if (progress < 0.66) return DISHES.filter((d) => d.difficulty <= 2);
  return DISHES;
}
