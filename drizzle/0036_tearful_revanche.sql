CREATE INDEX "invitation_clinic_student_idx" ON "invitation" USING btree ("clinic_id","student_id");--> statement-breakpoint
CREATE INDEX "user_clinic_idx" ON "user" USING btree ("clinic_id");