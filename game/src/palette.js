// The look plan, in one place: dusk over a container yard. Six scene colours
// and one accent; the lighting makes every shade the game needs. The same names
// are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#1a1d29', // dusk indigo, also the fog colour
  ground: '#3a3630', // worn asphalt-sand
  concrete: '#6b6a63',
  rust: '#a4552f', // container orange
  teal: '#2f6b6b', // container teal
  sand: '#b08d4f', // container ochre
  ink: '#f2ede3',
  muted: '#9aa0a8',
  accent: '#ffb02e', // Vanguard amber
  danger: '#e0533d', // Sentinel red
};

export function hex(name) {
  return PALETTE[name];
}
