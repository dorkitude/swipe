import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { Player } from './Player.js';
import { Letter } from './Letter.js';
import { Word } from './Word.js';

export class GameState extends Schema {
  @type('string') phase: string = 'waiting'; // waiting | playing
  @type('string') roomName: string = ''; // Fun name for this game room
  @type('string') roomCode: string = ''; // 6-char shareable code for joining
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Letter]) availableLetters = new ArraySchema<Letter>();
  @type([Word]) allWords = new ArraySchema<Word>(); // All claimed words in the game
  @type('number') lastPoolActivity: number = 0; // When letters were last used (for stagnation detection)
}
