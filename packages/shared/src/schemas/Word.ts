import { Schema, type, ArraySchema } from '@colyseus/schema';
import { Letter } from './Letter.js';

export class Word extends Schema {
  @type('string') id: string = '';
  @type('string') word: string = ''; // The actual word (uppercase)
  @type([Letter]) letters = new ArraySchema<Letter>();
  @type('string') ownerId: string = ''; // Session ID of owner
  @type('number') score: number = 0;
  @type('string') stolenFrom: string = ''; // Previous owner if stolen
  @type('number') createdAt: number = 0;
}
