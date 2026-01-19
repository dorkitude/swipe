import { Schema, type, MapSchema } from '@colyseus/schema';

export class LobbyPlayer extends Schema {
  @type('string') sessionId: string = '';
  @type('string') odId: string = ''; // Database user ID
  @type('string') handle: string = '';
  @type('boolean') isReady: boolean = false;
  @type('number') joinedAt: number = 0;
}

export class LobbyState extends Schema {
  @type('string') lobbyId: string = '';
  @type('string') status: string = 'waiting'; // waiting | countdown | starting | in_game
  @type('number') countdownEndTime: number = 0;
  @type('number') minPlayers: number = 2;
  @type('number') maxPlayers: number = 4;
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
}
