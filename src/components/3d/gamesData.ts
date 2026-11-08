export interface GameSpec {
  id: string
  title: string
  tabTitle?: string
  shortTabTitle?: string
  accentColor: string
  videoUrl: string
  posterUrl: string
}

export const SHOWCASE_GAMES: GameSpec[] = [
  {
    id: 're2',
    title: 'RESIDENT EVIL 2',
    shortTabTitle: 'RE2',
    accentColor: '#F43F5E',
    videoUrl: '/videos/games/re2.mp4',
    posterUrl: '/videos/games/re2_poster.webp',
  },
  {
    id: 'ori',
    title: 'ORI & THE WILL OF THE WISPS',
    tabTitle: 'ORI',
    shortTabTitle: 'ORI',
    accentColor: '#06B6D4',
    videoUrl: '/videos/games/ori.mp4',
    posterUrl: '/videos/games/ori_poster.webp',
  },
  {
    id: 'alien',
    title: 'ALIEN: ISOLATION',
    shortTabTitle: 'ALIEN',
    accentColor: '#10B981',
    videoUrl: '/videos/games/alien.mp4',
    posterUrl: '/videos/games/alien_poster.webp',
  },
  {
    id: 'diablo',
    title: 'DIABLO IV',
    shortTabTitle: 'DIABLO IV',
    accentColor: '#F59E0B',
    videoUrl: '/videos/games/diablo.mp4',
    posterUrl: '/videos/games/diablo_poster.webp',
  },
]
