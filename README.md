# Rush Hour Kitchen

[![make.fun](https://make.fun/badge/competition/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137)
[![make.fun](https://make.fun/badge/repository/valentinoivan1203-crypto/best-cooking-game-entry.svg)](https://github.com/valentinoivan1203-crypto/best-cooking-game-entry)
[![make.fun](https://make.fun/badge/account/van-ivan.svg)](https://make.fun/profile/van-ivan)

An entry for [best-cooking-game-20261125-0137](https://make.fun/bounty/best-cooking-game-20261125-0137) — a complete, original cooking game that runs offline in a desktop browser from static files.

## The game

You are the chef on a 3-minute shift. Three orders sit on the board at once, each with its own countdown and a tip that shrinks as the clock runs down. Pick ingredients from the counter, cook the patty, egg and pasta on the stove, chop the lettuce and tomato on the board, build the dish on the plate, and serve the matching order before it times out. Serve fast for a bigger tip, serve in a row for a streak bonus — and an order that times out costs one of your three lives.

**Dishes:** Garden Salad, Pasta Special, Breakfast Plate, Classic Burger, Cheese Burger, Double Burger — 3- and 4-ingredient recipes that combine the 8 ingredients in different ways.

**Controls:** mouse (click everything) and keyboard — `1–8` pick an ingredient, `Space` cook / chop / take, `Enter` serve, `Backspace` clear the plate, `P` pause.

**Tech:** plain HTML, CSS and JavaScript (no libraries, no network requests, no build step). All food art is hand-drawn inline SVG; all sounds are synthesized with the Web Audio API. The source is split into files with one clear job each: `recipes.js` (dishes and ingredients), `orders.js` (the board, timers, scoring), `kitchen.js` (stove, board, hand, plate), `sound.js` (synthesized effects), `main.js` (state machine, loop, input, rendering).

Play it: serve `game/` with any static server and open `index.html` — for example `python3 -m http.server 8080 --directory game`.

## Screenshots

The `screenshots/` folder holds real renders of the game's own code: the start screen, a dish mid-assembly, a plate ready to serve, and the game-over screen. They are taken with the game's own `?shot=` states (`start`, `play`, `serve`, `end`).

---

Play more bounties with my referral link: https://make.fun/r/dehpqxrn (referral code `dehpqxrn`).
