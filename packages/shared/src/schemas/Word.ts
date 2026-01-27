import { Schema, type, ArraySchema } from '@colyseus/schema';
import { Letter } from './Letter.js';

export class SwipeHistoryEntry extends Schema {
  @type('string') fromHandle: string = '';
  @type('string') fromWord: string = '';
  @type('string') toHandle: string = '';
  @type('number') timestamp: number = 0;
}

export class Word extends Schema {
  @type('string') id: string = '';
  @type('string') word: string = ''; // The actual word (uppercase)
  @type([Letter]) letters = new ArraySchema<Letter>();
  @type('string') ownerId: string = ''; // Session ID of owner
  @type('number') score: number = 0;
  @type('string') stolenFrom: string = ''; // Previous owner if stolen
  @type('string') stolenFromHandle: string = ''; // Handle of previous owner
  @type([SwipeHistoryEntry]) swipeHistory = new ArraySchema<SwipeHistoryEntry>(); // Full swipe history
  @type('number') createdAt: number = 0;
}
