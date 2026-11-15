// The match: phases, the round timer, money, the buy menu and the bomb.
// One object owns every match number, so the HUD and the bots read the same
// truth. Phases: menu, freeze (buy), live, planted, over, matchover.
import * as THREE from 'three';
import {
  ROUND_TIME, FREEZE_TIME, PLANT_TIME, FUSE_TIME, DEFUSE_TIME,
  WIN_ROUNDS, MAX_ROUNDS, ECONOMY, WEAPONS, GRENADES, ARMOR_PRICE, ARMOR_HP,
} from './config.js';
import { SITES } from './map.js';

export function createRounds(scene, deps) {
  const { bots, player, audio, onEvent } = deps;

  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.4, metalness: 0.6 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  );
  bombLight.position.set(0, 0.14, 0);
  bombMesh.add(bombBody, bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  const state = {
    phase: 'menu',
    round: 0,
    score: { vanguard: 0, sentinel: 0 },
    money: ECONOMY.start,
    lossStreak: 0,
    timer: 0,
    overTimer: 0,
    overReason: '',
    overWinner: null,
    matchWinner: null,
    kills: 0,
    deaths: 0,
    bomb: { state: 'carried', site: null, position: null, fuseLeft: 0 },
    channel: { kind: null, progress: 0 },
    beepAt: 0,
  };

  function aliveCount(team) {
    let count = bots.aliveCount(team);
    if (team === 'vanguard' && player.state.alive) count += 1;
    return count;
  }

  function startMatch() {
    state.phase = 'freeze';
    state.round = 0;
    state.score = { vanguard: 0, sentinel: 0 };
    state.money = ECONOMY.start;
    state.lossStreak = 0;
    state.kills = 0;
    state.deaths = 0;
    state.matchWinner = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.phase = 'freeze';
    state.timer = FREEZE_TIME;
    state.bomb = { state: 'carried', site: null, position: null, fuseLeft: 0 };
    state.channel = { kind: null, progress: 0 };
    bombMesh.visible = false;
    player.reset(deps.spawn(), 0);
    bots.resetRound(state.round - 1, deps.spawns());
    onEvent({ type: 'roundStart', round: state.round });
  }

  function endRound(winner, reason) {
    if (state.phase === 'over' || state.phase === 'matchover') return;
    state.phase = 'over';
    state.overTimer = 5;
    state.overWinner = winner;
    state.overReason = reason;
    state.score[winner] += 1;
    const playerWon = winner === 'vanguard';
    if (playerWon) {
      state.money += ECONOMY.win;
      state.lossStreak = 0;
      audio.roundWin();
    } else {
      const payout = Math.min(ECONOMY.lossStreakCap, ECONOMY.loss + state.lossStreak * ECONOMY.lossStreakBonus);
      state.money += payout;
      state.lossStreak += 1;
      audio.roundLose();
    }
    onEvent({ type: 'roundEnd', winner, reason, score: { ...state.score }, money: state.money });
    // Refill reserves for the next round; the buy menu handles the rest.
    deps.weapons.refill();
  }

  function endMatch() {
    state.phase = 'matchover';
    state.matchWinner = state.score.vanguard > state.score.sentinel ? 'vanguard' : 'sentinel';
    onEvent({ type: 'matchEnd', winner: state.matchWinner, score: { ...state.score } });
  }

  function tick(dt, now) {
    if (state.phase === 'freeze') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_TIME;
        bots.startRound();
        onEvent({ type: 'live' });
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      const attackers = aliveCount('vanguard');
      const defenders = aliveCount('sentinel');
      if (attackers === 0) endRound('sentinel', 'Vanguard eliminated');
      else if (defenders === 0) endRound('vanguard', 'Sentinel eliminated');
      else if (state.timer <= 0) endRound('sentinel', 'Time expired — site held');
      return;
    }
    if (state.phase === 'planted') {
      state.bomb.fuseLeft -= dt;
      const interval = state.bomb.fuseLeft > 20 ? 1 : state.bomb.fuseLeft > 10 ? 0.5 : 0.25;
      if (now >= state.beepAt) {
        state.beepAt = now + interval;
        audio.plantBeep(state.bomb.fuseLeft <= 10);
        bombLight.material.color.setHex(Math.floor(now * 4) % 2 === 0 ? 0xff3020 : 0x881108);
      }
      if (aliveCount('sentinel') === 0 && aliveCount('vanguard') === 0) {
        endRound('vanguard', 'Device detonated');
        return;
      }
      if (state.bomb.fuseLeft <= 0) {
        deps.detonate();
        endRound('vanguard', 'Device detonated');
      }
      return;
    }
    if (state.phase === 'over') {
      state.overTimer -= dt;
      if (state.overTimer <= 0) {
        const v = state.score.vanguard;
        const s = state.score.sentinel;
        if (v >= WIN_ROUNDS || s >= WIN_ROUNDS || state.round >= MAX_ROUNDS) endMatch();
        else startRound();
      }
    }
  }

  // The bomb the bots and the player share: planting, dropping, picking up.
  function plantComplete(siteId, position) {
    if (state.phase !== 'live') return;
    state.phase = 'planted';
    state.bomb = { state: 'planted', site: siteId, position: position.clone(), fuseLeft: FUSE_TIME };
    state.money += ECONOMY.plant;
    bombMesh.visible = true;
    bombMesh.position.copy(position);
    bombMesh.position.y = 0.12;
    onEvent({ type: 'planted', site: siteId, money: state.money });
  }

  function defuseComplete() {
    if (state.phase !== 'planted') return;
    state.bomb.state = 'defused';
    bombMesh.visible = false;
    state.money += ECONOMY.defuse;
    endRound('sentinel', 'Device defused');
  }

  function bombDropped(position) {
    if (state.bomb.state !== 'carried') return;
    state.bomb = { state: 'dropped', site: null, position: position.clone(), fuseLeft: 0 };
    bombMesh.visible = true;
    bombMesh.position.copy(position);
    bombMesh.position.y = 0.12;
    onEvent({ type: 'bombDropped', position: position.clone() });
  }

  function bombPickedUp(by) {
    if (state.bomb.state !== 'dropped') return;
    state.bomb = { state: 'carried', site: null, position: null, fuseLeft: 0 };
    bombMesh.visible = false;
    onEvent({ type: 'bombPickedUp', by: by.name || 'You' });
  }

  function playerInSite() {
    for (const site of Object.values(SITES)) {
      const d = Math.hypot(player.state.position.x - site.x, player.state.position.z - site.z);
      if (d < site.radius) return site.id;
    }
    return null;
  }

  // Called every tick while the player holds E: advances the plant channel,
  // or resets it when the player moves away or lets go. The player is
  // Vanguard, the attacking side, so only planting is theirs: defusing is
  // the defenders' job, and the bots do it.
  function updateChannel(dt, holding) {
    const bomb = state.bomb;
    let kind = null;
    let need = 0;
    if (state.phase === 'live' && bomb.state === 'carried') {
      const site = playerInSite();
      const carrier = deps.bombCarrier();
      if (site && carrier === 'player') {
        kind = 'plant';
        need = PLANT_TIME;
      }
    }
    if (!holding || !kind) {
      state.channel = { kind: null, progress: 0 };
      return;
    }
    if (state.channel.kind !== kind) state.channel = { kind, progress: 0 };
    state.channel.progress += dt;
    if (state.channel.progress >= need) {
      const site = playerInSite();
      plantComplete(site, player.state.position);
      state.channel = { kind: null, progress: 0 };
    }
  }

  // The buy menu: id is a weapon id, 'he', 'flash' or 'armor'.
  function buy(id) {
    if (state.phase !== 'freeze') return { ok: false, reason: 'Buy only during the freeze phase' };
    if (id === 'armor') {
      if (player.state.armor >= ARMOR_HP) return { ok: false, reason: 'Armour already full' };
      if (state.money < ARMOR_PRICE) return { ok: false, reason: 'Not enough money' };
      state.money -= ARMOR_PRICE;
      player.state.armor = ARMOR_HP;
      audio.buy();
      return { ok: true };
    }
    if (id === 'he' || id === 'flash') {
      const def = GRENADES[id];
      if (state.money < def.price) return { ok: false, reason: 'Not enough money' };
      if (deps.weapons.state.grenades[id] >= 2) return { ok: false, reason: 'Carrying the maximum' };
      state.money -= def.price;
      deps.weapons.state.grenades[id] += 1;
      audio.buy();
      return { ok: true };
    }
    const def = WEAPONS[id];
    if (!def) return { ok: false, reason: 'Unknown item' };
    if (state.money < def.price) return { ok: false, reason: 'Not enough money' };
    state.money -= def.price;
    deps.weapons.buyWeapon(id);
    audio.buy();
    return { ok: true };
  }

  function addKillMoney() {
    state.money += ECONOMY.kill;
    state.kills += 1;
  }

  return {
    state, startMatch, startRound, endRound, tick, plantComplete, defuseComplete,
    bombDropped, bombPickedUp, updateChannel, buy, addKillMoney, aliveCount, playerInSite,
  };
}
