export const GAME_CONSTANTS = {
  // Letters
  LETTERS_PER_ROUND: 8,
  MIN_WORD_LENGTH: 4,

  // Timing (milliseconds)
  ROUND_DURATION_MS: 35_000, // 35 seconds per round
  LOBBY_COUNTDOWN_MS: 10_000, // 10 seconds before game starts

  // Players
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,

  // Handle constraints
  HANDLE_MIN_LENGTH: 3,
  HANDLE_MAX_LENGTH: 24,
  HANDLE_PATTERN: /^[a-zA-Z0-9_]+$/,
} as const;

export type GamePhase = 'waiting' | 'countdown' | 'playing' | 'round_end' | 'game_end';

export type LobbyStatus = 'waiting' | 'countdown' | 'starting' | 'in_game';
