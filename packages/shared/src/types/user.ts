export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface UserHandle {
  id: string;
  odId: string;
  handle: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStats {
  odId: string;
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  totalWordsFormed: number;
  totalWordsStolen: number;
  longestWord: string | null;
  highestScoringWord: string | null;
  highestScoringWordValue: number;
}

export interface AuthUser {
  id: string;
  handle: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
