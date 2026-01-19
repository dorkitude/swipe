// Client -> Server messages
export interface SubmitWordMessage {
  word: string;
}

export interface StealWordMessage {
  targetWordId: string;
  newWord: string;
}

export interface SetReadyMessage {
  ready: boolean;
}

// Server -> Client messages
export interface WordResultMessage {
  success: boolean;
  wordId?: string;
  reason?: string;
}

export interface StealResultMessage {
  success: boolean;
  wordId?: string;
  stolenFromHandle?: string;
  reason?: string;
}

export interface GameStartMessage {
  gameRoomId: string;
}

export interface ErrorMessage {
  code: string;
  message: string;
}
