# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/zul456/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/zul456/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE is a round-based tactical FPS in the browser: five-on-five on Yard 9, a dusk container yard, with a bomb to plant or defuse, money between rounds, and gunfire where stopping to aim pays.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

Entered on [make.fun](https://make.fun/?ref=kz2xm0e8&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards

## The game

Serve `game/` with any static server (`node serve.ts`, then http://localhost:8080) and click to play. No build step, no network: three.js 0.187.0 is vendored in `game/`.

**Objective.** Vanguard attacks, Sentinel defends. Win a round by eliminating the other team, or by planting the device at site A or B and letting it detonate. Defenders win on time, by defusing, or by elimination. First to 8 rounds takes the match.

**Controls.** WASD move, mouse look, click fire, R reload, 1/2 weapons, B buy menu (freeze phase), hold E to plant the device, G grenade, Ctrl crouch, Shift sprint, Space jump, M mute.

**Arsenal.** P9 Sidearm, VK-9 SMG, AR-77 rifle, M870 shotgun, LR-50 scoped sniper, HE frag and flashbang grenades, kevlar. Kills and round wins pay; the buy menu spends it.

**Bots.** Four teammates and five opponents walk the waypoint graph, hold angles, rotate on the plant, react to gunfire they hear, and fire in bursts with an aim error that grows with distance and movement.

**How it is built.** `game/src/` is one module per job: `map.js` (Yard 9, lanes, sites, waypoints), `bots.js` (AI), `combat.js` (hitscan, headshots, falloff), `rounds.js` (phases, economy, bomb), `weapons.js` (view models, recoil, bloom), `player.js` (acceleration, crouch, collision), `physics.js` (AABB movement, line of sight), `grenades.js`, `effects.js`, `audio.js` (synthesised sound, no files), `hud.js`, `textures.js` (procedural canvas textures). The simulation runs at a fixed 60 Hz, apart from rendering. `main.ts` copies `game/` and `screenshots/` to the output and writes `dossier.json` with the vendored `vendor/makefun-threejs.ts`.
