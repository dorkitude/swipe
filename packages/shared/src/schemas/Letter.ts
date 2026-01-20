import { Schema, type } from '@colyseus/schema';

export class Letter extends Schema {
  @type('string') id: string = '';
  @type('string') char: string = ''; // A-Z or "*" for blank
  @type('number') value: number = 0;
  @type('boolean') isBlank: boolean = false;
  @type('string') usedAs: string = ''; // If blank, what letter it represents
  @type('number') createdAt: number = 0; // When this letter was added to pool
}
