// The DOM HUD: health, ammo, timer, score, money, killfeed, prompts and the
// buy menu. It never touches the simulation; main.js pushes numbers in and
// reads the play and buy callbacks out. Every setter skips a DOM write when
// the value did not change.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';

const BUY_ITEMS = [
  { id: 'smg', name: 'VK-9 Ripper', desc: 'SMG · fast, close range', price: WEAPONS.smg.price },
  { id: 'rifle', name: 'AR-77 Dusk', desc: 'Rifle · accurate, all-round', price: WEAPONS.rifle.price },
  { id: 'shotgun', name: 'M870 Breacher', desc: 'Shotgun · 8 pellets, close', price: WEAPONS.shotgun.price },
  { id: 'sniper', name: 'LR-50 Longshot', desc: 'Sniper · one shot, scoped', price: WEAPONS.sniper.price },
  { id: 'he', name: 'HE Frag', desc: 'Grenade · blast damage', price: GRENADES.he.price },
  { id: 'flash', name: 'Flashbang', desc: 'Grenade · blinds on sight', price: GRENADES.flash.price },
  { id: 'armor', name: 'Kevlar Vest', desc: 'Armour · absorbs half damage', price: ARMOR_PRICE },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const flashOverlay = $('flash-overlay');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorFill = $('armor-fill');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const timerEl = $('timer');
  const scoreVg = $('score-vg');
  const scoreSn = $('score-sn');
  const roundNum = $('round-num');
  const aliveVg = $('alive-vg');
  const aliveSn = $('alive-sn');
  const moneyEl = $('money');
  const killfeed = $('killfeed');
  const promptEl = $('prompt');
  const channelWrap = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const bombStatus = $('bomb-status');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  const buyHint = $('buy-hint');
  const spectate = $('spectate');

  let last = {};
  let hitTimer = 0;
  let flashTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  const buyButtons = {};
  for (const item of BUY_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.innerHTML = `<b></b><span></span><i></i>`;
    button.querySelector('b').textContent = item.name;
    button.querySelector('span').textContent = item.desc;
    button.querySelector('i').textContent = `$${item.price}`;
    button.addEventListener('click', () => buyHandler && buyHandler(item.id));
    buyGrid.appendChild(button);
    buyButtons[item.id] = button;
  }
  let buyHandler = null;

  return {
    setHealth(hp, armor) {
      if (last.hp !== hp) {
        last.hp = hp;
        healthFill.style.width = `${Math.max(0, hp)}%`;
        healthNum.textContent = String(Math.ceil(hp));
        healthFill.classList.toggle('low', hp <= 30);
      }
      if (last.armor !== armor) {
        last.armor = armor;
        armorFill.style.width = `${Math.max(0, armor * 2)}%`;
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = phase === 'freeze' ? `BUY ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        : phase === 'planted' ? `BOMB ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('freeze', phase === 'freeze');
      timerEl.classList.toggle('danger', phase === 'planted');
    },
    setScore(vg, sn, round) {
      setText(scoreVg, 'svg', String(vg));
      setText(scoreSn, 'ssn', String(sn));
      setText(roundNum, 'round', `ROUND ${round}`);
    },
    setAlive(vg, sn) {
      setText(aliveVg, 'avg', '●'.repeat(vg) + '○'.repeat(Math.max(0, 5 - vg)));
      setText(aliveSn, 'asn', '●'.repeat(sn) + '○'.repeat(Math.max(0, 5 - sn)));
    },
    setMoney(n) {
      setText(moneyEl, 'money', `$${n}`);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), 110);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    flashBang(duration) {
      flashOverlay.style.opacity = '1';
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashOverlay.style.transition = `opacity ${duration}s linear`;
        flashOverlay.style.opacity = '0';
        setTimeout(() => { flashOverlay.style.transition = ''; }, duration * 1000 + 50);
      }, 60);
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const killerSpan = document.createElement('b');
      killerSpan.textContent = killer;
      killerSpan.style.color = killerTeam === 'vanguard' ? 'var(--accent)' : 'var(--danger)';
      const victimSpan = document.createElement('span');
      victimSpan.textContent = `${headshot ? ' ⌖ ' : ' ✕ '}${victim}`;
      row.append(killerSpan, victimSpan);
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    showPrompt(text) {
      // Prompts are our own authored strings and may contain <kbd> markup.
      const html = text || '';
      if (last.promptHtml !== html) {
        last.promptHtml = html;
        promptEl.innerHTML = html;
      }
      promptEl.hidden = !text;
    },
    setChannel(kind, progress) {
      if (!kind) {
        channelWrap.hidden = true;
        return;
      }
      channelWrap.hidden = false;
      channelLabel.textContent = kind === 'plant' ? 'PLANTING DEVICE' : 'DEFUSING DEVICE';
      channelFill.style.width = `${Math.min(100, progress * 100)}%`;
    },
    setBombStatus(fuseLeft, site) {
      if (fuseLeft === null) {
        bombStatus.hidden = true;
        return;
      }
      bombStatus.hidden = false;
      bombStatus.textContent = `DEVICE ARMED · SITE ${site} · ${fuseLeft.toFixed(1)}s`;
    },
    showBuy(open, money, owned) {
      buyMenu.hidden = !open;
      if (!open) return;
      buyMoney.textContent = `$${money}`;
      for (const item of BUY_ITEMS) {
        const button = buyButtons[item.id];
        button.classList.toggle('owned', !!owned[item.id]);
        button.classList.toggle('poor', money < item.price && !owned[item.id]);
      }
    },
    setBuyHint(text) {
      setText(buyHint, 'buyhint', text || '');
    },
    setSpectate(name) {
      spectate.hidden = !name;
      if (name) spectate.textContent = `You are down — spectating ${name}`;
    },
    showOverlay(mode, data = {}) {
      const texts = {
        start: ['DUSTLINE', 'Yard 9 — a dusk container yard. Five on five, bomb at site A or B. First to 8 rounds takes the match.', 'Click to play'],
        paused: ['DUSTLINE', 'Paused. Click to resume.', 'Click to resume'],
        round: [data.title || 'Round over', data.copy || '', 'Next round starts soon'],
        match: [data.title || 'Match over', data.copy || '', 'Play again'],
      };
      const [t, c, action] = texts[mode] || texts.start;
      title.textContent = t;
      copy.textContent = c;
      play.textContent = action;
      overlay.hidden = false;
      if (mode === 'start' || mode === 'paused') play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
  };
}
