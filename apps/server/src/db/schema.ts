import { pgTable, uuid, varchar, text, timestamp, integer, bigint, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table (linked to Google OAuth)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleId: varchar('google_id', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Handles table (globally unique, case-insensitive)
export const handles = pgTable('handles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  handle: varchar('handle', { length: 32 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Case-insensitive uniqueness (Drizzle doesn't support this directly, apply via migration)
  uniqueIndex('handles_lower_idx').on(table.handle),
]);

// Game history
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  rounds: integer('rounds').default(0).notNull(),
});

// Game participants and scores
export const gamePlayers = pgTable('game_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  finalScore: integer('final_score').default(0).notNull(),
  placement: integer('placement'),
  wordsFormed: integer('words_formed').default(0).notNull(),
  wordsStolen: integer('words_stolen').default(0).notNull(),
  wordsLost: integer('words_lost').default(0).notNull(),
});

// User statistics (materialized for performance)
export const userStats = pgTable('user_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  gamesPlayed: integer('games_played').default(0).notNull(),
  gamesWon: integer('games_won').default(0).notNull(),
  totalScore: bigint('total_score', { mode: 'number' }).default(0).notNull(),
  totalWordsFormed: integer('total_words_formed').default(0).notNull(),
  totalWordsStolen: integer('total_words_stolen').default(0).notNull(),
  longestWord: varchar('longest_word', { length: 50 }),
  highestScoringWord: varchar('highest_scoring_word', { length: 50 }),
  highestScoringWordValue: integer('highest_scoring_word_value').default(0).notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  handle: one(handles, {
    fields: [users.id],
    references: [handles.userId],
  }),
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
}));

export const handlesRelations = relations(handles, ({ one }) => ({
  user: one(users, {
    fields: [handles.userId],
    references: [users.id],
  }),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  players: many(gamePlayers),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, {
    fields: [gamePlayers.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [gamePlayers.userId],
    references: [users.id],
  }),
}));
