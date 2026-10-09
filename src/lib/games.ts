// Free homebrew CHIP-8 library (David Winter's public archive + friends).
// MESHplay ships no commercial ROMs — ever.

export interface GameDef {
  id: string
  title: string
  tagline: string
  desc: string
  rom: string
  colors: [string, string]
  year: string
  author: string
}

export const GAMES: GameDef[] = [
  {
    id: 'brix', title: 'Brix', tagline: 'The wall must fall',
    desc: 'The classic brick-basher. Angle your paddle, keep the ball alive, and eat through every wall before your lives run out.',
    rom: 'brix.ch8', colors: ['#f97316', '#ec4899'], year: '1990', author: 'Andreas Gustafsson',
  },
  {
    id: 'spaceinvaders', title: 'Space Invaders', tagline: 'They are coming down',
    desc: 'The invasion, distilled to its purest form. Slide, shoot, and hold the line as the aliens march ever downward.',
    rom: 'spaceinvaders.ch8', colors: ['#22c55e', '#0ea5e9'], year: '199x', author: 'David Winter',
  },
  {
    id: 'blitz', title: 'Blitz', tagline: 'Bomb the skyline',
    desc: 'You are the bomber. Level every skyscraper low enough to land on — before your plane runs out of city.',
    rom: 'blitz.ch8', colors: ['#a855f7', '#ef4444'], year: '199x', author: 'David Winter',
  },
  {
    id: 'tetris', title: 'Tetris', tagline: 'Falling forever',
    desc: 'Seven shapes, one well, no mercy. Rotate, slot, clear — chase the perfect tetris clear.',
    rom: 'tetris.ch8', colors: ['#3b82f6', '#8b5cf6'], year: '1991', author: 'Fran Dachille',
  },
  {
    id: 'blinky', title: 'Blinky', tagline: 'Eat the maze',
    desc: 'A pellet-munching maze chase. Gobble everything, dodge the ghosts, and save the power pellets for a comeback.',
    rom: 'blinky.ch8', colors: ['#facc15', '#f97316'], year: '1991', author: 'Hans Christian Egeberg',
  },
  {
    id: 'tank', title: 'Tank', tagline: 'Duel of steel',
    desc: 'Two tanks, one battlefield, zero mercy. Bounce shots off walls and out-think your opponent.',
    rom: 'tank.ch8', colors: ['#64748b', '#ef4444'], year: '199x', author: 'Unknown',
  },
  {
    id: 'missile', title: 'Missile', tagline: 'Defend the cities',
    desc: 'Enemy warheads rain from the sky. Cross your streams and intercept everything before your cities burn.',
    rom: 'missile.ch8', colors: ['#1d4ed8', '#f97316'], year: '199x', author: 'David Winter',
  },
  {
    id: 'ufo', title: 'UFO', tagline: 'Shoot the skies',
    desc: 'Unidentified craft on every radar sweep. Track, lead your shots, and fill the sky with wreckage.',
    rom: 'ufo.ch8', colors: ['#6366f1', '#22d3ee'], year: '1992', author: 'Lutz V',
  },
  {
    id: 'tron', title: 'Tron', tagline: 'Leave a light trail',
    desc: 'Light-cycles, arena rules. Every move you make is a wall — trap your rival before the grid traps you.',
    rom: 'tron.ch8', colors: ['#06b6d4', '#2563eb'], year: '199x', author: 'Unknown',
  },
  {
    id: 'syzygy', title: 'Syzygy', tagline: 'Gravity is the enemy',
    desc: 'Asteroids with pull. Thrust, drift and slingshot through fields of rocks that want you dead.',
    rom: 'syzygy.ch8', colors: ['#94a3b8', '#3b82f6'], year: '1990', author: 'Roy Trevino',
  },
  {
    id: 'connect4', title: 'Connect 4', tagline: 'Four in a row',
    desc: 'Drop, stack, scheme. Build your line of four before the opponent builds theirs.',
    rom: 'connect4.ch8', colors: ['#f59e0b', '#f43f5e'], year: '199x', author: 'David Winter',
  },
  {
    id: 'hidden', title: 'Hidden', tagline: 'Remember everything',
    desc: 'A memory duel against the machine. Watch the pattern, hold it in your head, repeat it perfectly.',
    rom: 'hidden.ch8', colors: ['#14b8a6', '#84cc16'], year: '1996', author: 'David Winter',
  },
]
