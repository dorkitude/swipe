import { Schema, type, ArraySchema } from '@colyseus/schema';
import { Word } from './Word.js';

export class Player extends Schema {
  @type('string') sessionId: string = '';
  @type('string') odId: string = ''; // Database user ID
  @type('string') handle: string = '';
  @type('number') score: number = 0;
  @type([Word]) words = new ArraySchema<Word>();
  @type('boolean') isReady: boolean = false;
  @type('boolean') isConnected: boolean = true;
}
