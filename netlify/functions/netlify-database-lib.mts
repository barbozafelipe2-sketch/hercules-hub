import { getDatabase } from "@netlify/database";

export async function netlifyDatabaseReady(): Promise<boolean> {
  try {
    const database = getDatabase();
    const result = await database.pool.query("SELECT 1 AS ready");
    return result.rows[0]?.ready === 1;
  } catch {
    return false;
  }
}
