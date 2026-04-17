import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  paramsJson: text('params_json').notNull(),
  alliedAgent: text('allied_agent').notNull().default('human'),
  japaneseAgent: text('japanese_agent').notNull().default('rule-based'),
  winner: text('winner', { enum: ['allied', 'japanese', 'draw'] }).notNull(),
  durationSteps: integer('duration_steps').notNull(),
  alliedPoints: integer('allied_points').notNull().default(0),
  japanesePoints: integer('japanese_points').notNull().default(0),
  createdAt: integer('created_at').notNull()
})

export const steps = sqliteTable('steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull().references(() => games.id),
  stepNumber: integer('step_number').notNull(),
  alliedSnapshotJson: text('allied_snapshot_json').notNull(),
  japaneseSnapshotJson: text('japanese_snapshot_json').notNull()
})
