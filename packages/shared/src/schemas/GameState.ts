import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { Player } from './Player.js';
import { Letter } from './Letter.js';
import { Word } from './Word.js';

export class GameState extends Schema {
  @type('string') phase: string = 'waiting'; // waiting | countdown | playing | round_end | game_end
  @type('number') roundNumber: number = 0;
  @type('number') roundStartTime: number = 0;
  @type('number') roundEndTime: number = 0;
  @type('number') countdownEndTime: number = 0;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Letter]) availableLetters = new ArraySchema<Letter>();
  @type([Word]) allWords = new ArraySchema<Word>(); // All claimed words in the game
}
