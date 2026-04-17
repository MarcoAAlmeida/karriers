export { sql, eq, and, or } from 'drizzle-orm'
export const tables = schema
export function useDrizzle() {
  return db
}
