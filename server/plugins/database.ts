export default defineNitroPlugin(async () => {
  const db = hubDatabase()
  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      params_json TEXT NOT NULL,
      allied_agent TEXT NOT NULL DEFAULT 'human',
      japanese_agent TEXT NOT NULL DEFAULT 'rule-based',
      winner TEXT NOT NULL,
      duration_steps INTEGER NOT NULL,
      allied_points INTEGER NOT NULL DEFAULT 0,
      japanese_points INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id),
      step_number INTEGER NOT NULL,
      allied_snapshot_json TEXT NOT NULL,
      japanese_snapshot_json TEXT NOT NULL
    );
  `)
})
