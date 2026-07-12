import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type ScheduleEntry = { id: string; contentRecordId: string; conversationId: string; scheduledAt: number; status: "planned" | "completed" | "cancelled"; notes: string | null; createdAt: number; updatedAt: number; title?: string };

export function createScheduleService(sqlite: Database.Database) {
  const list = (operatorId: string): ScheduleEntry[] => sqlite.prepare(`SELECT s.id, s.content_record_id as contentRecordId, c.conversation_id as conversationId, s.scheduled_at as scheduledAt, s.status, s.notes, s.created_at as createdAt, s.updated_at as updatedAt, c.title FROM schedule_entries s JOIN content_records c ON c.id = s.content_record_id WHERE c.created_by_operator_id = ? ORDER BY s.scheduled_at`).all(operatorId) as ScheduleEntry[];
  return {
    list,
    create(input: { contentRecordId: string; scheduledAt: number; operatorId: string; notes?: string }): ScheduleEntry {
      const id = randomUUID(); const now = Date.now();
      sqlite.transaction(() => {
        const result = sqlite.prepare(`INSERT INTO schedule_entries (id, content_record_id, scheduled_at, status, notes, created_by_operator_id, created_at, updated_at) SELECT ?, id, ?, 'planned', ?, ?, ?, ? FROM content_records WHERE id = ? AND created_by_operator_id = ?`).run(id, input.scheduledAt, input.notes ?? null, input.operatorId, now, now, input.contentRecordId, input.operatorId);
        if (!result.changes) throw new Error("Content not found");
        sqlite.prepare(`UPDATE content_records SET status = CASE WHEN status IN ('published', 'archived') THEN status ELSE 'scheduled' END, updated_at = ? WHERE id = ?`).run(now, input.contentRecordId);
      })();
      return list(input.operatorId).find((entry) => entry.id === id)!;
    },
    updateStatus(id: string, status: ScheduleEntry["status"], operatorId: string) {
      const now = Date.now();
      sqlite.transaction(() => {
        sqlite.prepare(`UPDATE schedule_entries SET status = ?, updated_at = ? WHERE id = ? AND content_record_id IN (SELECT id FROM content_records WHERE created_by_operator_id = ?)`).run(status, now, id, operatorId);
        if (status === "completed") sqlite.prepare(`UPDATE content_records SET status = 'published', updated_at = ? WHERE id = (SELECT content_record_id FROM schedule_entries WHERE id = ?) AND created_by_operator_id = ? AND status <> 'archived'`).run(now, id, operatorId);
      })();
      return list(operatorId).find((entry) => entry.id === id);
    },
  };
}
