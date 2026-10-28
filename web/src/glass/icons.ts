// 10×10 pixel icons, drawn as SVG squares so they stay crisp at any size.
const ICONS: Record<string, string[]> = {
  eye: ['..........', '...####...', '.##....##.', '#...##...#', '#..####..#', '#..####..#', '#...##...#', '.##....##.', '...####...', '..........'],
  wallet: ['..........', '.#######..', '#.......#.', '#########.', '#.....####', '#.....#..#', '#.....####', '#........#', '##########', '..........'],
  coin: ['..######..', '.#......#.', '#.######.#', '#......#.#', '#.....#..#', '#....#...#', '#...#....#', '#.######.#', '.#......#.', '..######..'],
  shield: ['.########.', '.#......#.', '.#..##..#.', '.#.####.#.', '.#..##..#.', '.#..##..#.', '..#....#..', '...#..#...', '....##....', '..........'],
  mail: ['..........', '##########', '##......##', '#.#....#.#', '#..#..#..#', '#...##...#', '#........#', '##########', '..........', '..........'],
  exit: ['..........', '#####.....', '#...#..#..', '#...#...#.', '#...######', '#...#...#.', '#...#..#..', '#####.....', '..........', '..........'],
  star: ['....##....', '....##....', '...####...', '##########', '.########.', '..######..', '..######..', '.###..###.', '.##....##.', '..........'],
  play: ['..........', '..##......', '..####....', '..######..', '..########', '..######..', '..####....', '..##......', '..........', '..........'],
  lock: ['...####...', '..#....#..', '..#....#..', '.########.', '.###..###.', '.###..###.', '.####.###.', '.########.', '..........', '..........'],
  check: ['..........', '.........#', '........##', '.......##.', '#.....##..', '##...##...', '.##.##....', '..###.....', '...#......', '..........'],
};
export const LEVEL_ICONS = ['eye', 'wallet', 'coin', 'shield', 'mail', 'exit', 'star'];

export function icon(name: string, size = 20, cls = ''): SVGSVGElement {
  const g = ICONS[name] ?? ICONS.star;
  const rects: string[] = [];
  g.forEach((row, y) => row.split('').forEach((c, x) => { if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`); }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10 10'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', `px-icon ${cls}`); svg.setAttribute('shape-rendering', 'crispEdges');
  svg.innerHTML = `<g fill="currentColor">${rects.join('')}</g>`;
  return svg;
}

/** A burst of square confetti from the middle of an element. */
export function confetti(host: HTMLElement, n = 40): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#12a15a', '#5dff8f', '#ffd23f', '#0e7490', '#e5484d', '#15221b'];
  const layer = document.createElement('div'); layer.className = 'confetti'; host.append(layer);
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 180;
    s.style.setProperty('--x', `${Math.cos(a) * d}px`); s.style.setProperty('--y', `${Math.sin(a) * d - 60}px`);
    s.style.setProperty('--r', `${Math.random() * 540 - 270}deg`); s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.12}s`;
    layer.append(s);
  }
  setTimeout(() => layer.remove(), 1600);
}
