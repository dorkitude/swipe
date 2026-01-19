import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { handles, users } from '../db/schema.js';
import { GAME_CONSTANTS } from '@swipe/shared';

const ADJECTIVES = [
  'Swift', 'Brave', 'Clever', 'Quick', 'Bright',
  'Bold', 'Keen', 'Witty', 'Sharp', 'Noble',
  'Sly', 'Wise', 'Wild', 'Cool', 'Epic',
  'Zesty', 'Lucky', 'Plucky', 'Spry', 'Deft',
];

const NOUNS = [
  'Fox', 'Eagle', 'Wolf', 'Hawk', 'Bear',
  'Lion', 'Tiger', 'Raven', 'Falcon', 'Otter',
  'Panda', 'Koala', 'Lynx', 'Owl', 'Shark',
  'Viper', 'Cobra', 'Crane', 'Heron', 'Badger',
];

export class HandleService {
  /**
   * Generate a default handle for new users
   * Format: Adjective + Noun + 4-digit number
   */
  async generateDefaultHandle(): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
      const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
      const num = Math.floor(1000 + Math.random() * 9000);

      const handle = `${adj}${noun}${num}`;

      if (await this.isHandleAvailable(handle)) {
        return handle;
      }
    }

    // Fallback: Use timestamp-based handle
    return `Player${Date.now().toString(36)}`;
  }

  /**
   * Check if a handle is available (case-insensitive)
   */
  async isHandleAvailable(handle: string): Promise<boolean> {
    const result = await db
      .select({ id: handles.id })
      .from(handles)
      .where(sql`LOWER(${handles.handle}) = LOWER(${handle})`)
      .limit(1);

    return result.length === 0;
  }

  /**
   * Validate handle format
   */
  isValidHandleFormat(handle: string): { valid: boolean; error?: string } {
    if (handle.length < GAME_CONSTANTS.HANDLE_MIN_LENGTH) {
      return { valid: false, error: `Handle must be at least ${GAME_CONSTANTS.HANDLE_MIN_LENGTH} characters` };
    }

    if (handle.length > GAME_CONSTANTS.HANDLE_MAX_LENGTH) {
      return { valid: false, error: `Handle must be at most ${GAME_CONSTANTS.HANDLE_MAX_LENGTH} characters` };
    }

    if (!GAME_CONSTANTS.HANDLE_PATTERN.test(handle)) {
      return { valid: false, error: 'Handle can only contain letters, numbers, and underscores' };
    }

    return { valid: true };
  }

  /**
   * Create a handle for a user
   */
  async createHandle(userId: string, handle: string): Promise<void> {
    const validation = this.isValidHandleFormat(handle);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    if (!(await this.isHandleAvailable(handle))) {
      throw new Error('Handle is already taken');
    }

    await db.insert(handles).values({
      userId,
      handle,
    });
  }

  /**
   * Update a user's handle
   */
  async updateHandle(userId: string, newHandle: string): Promise<void> {
    const validation = this.isValidHandleFormat(newHandle);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    if (!(await this.isHandleAvailable(newHandle))) {
      throw new Error('Handle is already taken');
    }

    await db
      .update(handles)
      .set({
        handle: newHandle,
        updatedAt: new Date(),
      })
      .where(eq(handles.userId, userId));
  }

  /**
   * Get a user's handle
   */
  async getHandle(userId: string): Promise<string | null> {
    const result = await db
      .select({ handle: handles.handle })
      .from(handles)
      .where(eq(handles.userId, userId))
      .limit(1);

    return result[0]?.handle ?? null;
  }

  /**
   * Get user ID by handle
   */
  async getUserIdByHandle(handle: string): Promise<string | null> {
    const result = await db
      .select({ userId: handles.userId })
      .from(handles)
      .where(sql`LOWER(${handles.handle}) = LOWER(${handle})`)
      .limit(1);

    return result[0]?.userId ?? null;
  }
}

export const handleService = new HandleService();
