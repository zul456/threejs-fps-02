// DUSTLINE — tuning, weapons and economy, in one place. Every number the
// simulation or the HUD shows comes from here, so a balance change is one edit.
export const TICK = 1 / 60;
export const ROUND_TIME = 100; // seconds of live play before the defenders win on time
export const FREEZE_TIME = 12; // buy phase at the start of every round
export const PLANT_TIME = 3; // seconds holding E on a site to arm the device
export const FUSE_TIME = 35; // seconds from armed to detonation
export const DEFUSE_TIME = 5; // seconds holding E by the device to defuse
export const WIN_ROUNDS = 8; // first team to this many round wins takes the match
export const MAX_ROUNDS = 15; // 7-7 goes to one sudden-death round

export const TEAMS = {
  vanguard: { name: 'Vanguard', short: 'VG', color: 0xffb02e, css: '#ffb02e' },
  sentinel: { name: 'Sentinel', short: 'SN', color: 0xe0533d, css: '#e0533d' },
};

export const BOT_NAMES = {
  vanguard: ['Kestrel', 'Bramble', 'Juno', 'Pike'],
  sentinel: ['Vex', 'Onyx', 'Sable', 'Rook', 'Flint'],
};

// Money: kill and objective rewards, round payouts, loss-streak bonus.
export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 3250,
  loss: 1900,
  lossStreakBonus: 500,
  lossStreakCap: 3400,
  plant: 300,
  defuse: 300,
};

// A weapon: damage is per hit before falloff and armour; headMult multiplies it
// on a head hit; spread is radians, still / moving; bloom grows per shot fired.
export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 2, name: 'P9 Sidearm', price: 0,
    damage: 26, headMult: 4, mag: 12, reserve: 48, rate: 0.18, auto: false,
    reload: 1.4, spreadStill: 0.006, spreadMove: 0.03, bloom: 0.006, bloomMax: 0.05,
    kick: 0.012, range: 30, falloff: 0.7, tracer: 0xffe9a8,
  },
  smg: {
    id: 'smg', slot: 1, name: 'VK-9 Ripper', price: 1250,
    damage: 24, headMult: 4, mag: 30, reserve: 120, rate: 0.075, auto: true,
    reload: 1.9, spreadStill: 0.009, spreadMove: 0.045, bloom: 0.005, bloomMax: 0.07,
    kick: 0.009, range: 28, falloff: 0.65, tracer: 0xffe9a8,
  },
  rifle: {
    id: 'rifle', slot: 1, name: 'AR-77 Dusk', price: 2700,
    damage: 33, headMult: 4, mag: 30, reserve: 90, rate: 0.096, auto: true,
    reload: 2.1, spreadStill: 0.004, spreadMove: 0.032, bloom: 0.005, bloomMax: 0.06,
    kick: 0.014, range: 40, falloff: 0.75, tracer: 0xffe9a8,
  },
  shotgun: {
    id: 'shotgun', slot: 1, name: 'M870 Breacher', price: 1500,
    damage: 9, headMult: 2, mag: 6, reserve: 24, rate: 0.85, auto: false,
    reload: 2.6, spreadStill: 0.05, spreadMove: 0.08, bloom: 0.01, bloomMax: 0.09,
    kick: 0.045, range: 14, falloff: 0.4, pellets: 8, tracer: 0xffd27a,
  },
  sniper: {
    id: 'sniper', slot: 1, name: 'LR-50 Longshot', price: 4750,
    damage: 95, headMult: 4, mag: 5, reserve: 15, rate: 1.2, auto: false,
    reload: 3.0, spreadStill: 0.001, spreadMove: 0.09, bloom: 0.03, bloomMax: 0.1,
    kick: 0.06, range: 80, falloff: 1, tracer: 0xfff2c0, scope: true,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'HE Frag', price: 300, radius: 6.5, damage: 110 },
  flash: { id: 'flash', name: 'Flashbang', price: 200, radius: 14, blind: 2.6 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_HP = 50; // absorbs half of each hit until depleted

// Bot skill: reaction time, aim error and burst length are drawn per bot.
export const BOT_SKILL = {
  reactionMin: 0.28, reactionMax: 0.65,
  errorBase: 0.016, errorPerMetre: 0.0009, errorMove: 0.02, errorTargetSpeed: 0.004,
  burstMin: 3, burstMax: 6, burstPauseMin: 0.5, burstPauseMax: 1.1,
  hearRadius: 30, seeRange: 50, fovCos: 0.34, // ~110 degrees
  walkSpeed: 4.2, strafeChance: 0.35,
};
