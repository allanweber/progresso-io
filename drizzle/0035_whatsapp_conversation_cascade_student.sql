-- Deleting an aluno now deletes their WhatsApp thread.
--
-- `whatsapp_conversation.student_id` was ON DELETE SET NULL, so a hard-deleted
-- student left the conversation and every message behind: personal data the
-- erasure was meant to remove, plus a nameless orphan thread in the coach's
-- inbox. Messages already cascade from the conversation
-- (`whatsapp_message.conversation_id`), so switching this one FK removes both.
--
-- Enforced in the database rather than in `hardDeleteStudent` so that no delete
-- path can forget it. Archive is unaffected — it is a status change, not a
-- delete.
--
-- NO BACKFILL, deliberately. A conversation with a NULL student_id is ALSO the
-- legitimate state for an inbound from a number that never belonged to a
-- student, and nothing distinguishes the two after the fact. Any pre-existing
-- orphans need a human to look at them.

ALTER TABLE "whatsapp_conversation" DROP CONSTRAINT "whatsapp_conversation_student_id_students_id_fk";
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;