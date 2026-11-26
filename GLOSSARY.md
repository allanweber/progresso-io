# Progresso

A coaching platform where coaches in a clinic prescribe workouts and diets to their alunos and follow their progress.

## Messaging

**Handoff**:
Sending a WhatsApp message by opening it, already written, in the coach's own WhatsApp through a `wa.me` link. The coach presses send, so the app knows it was opened, not that it was delivered.
_Avoid_: Sent, delivered, automatic sending

## Training

**Workout**:
A coach-authored, reusable training program template ("Programa de treino") made of sessions.
_Avoid_: Plan, program, routine

**Session**:
One named block of a workout ("Ficha", e.g. "Ficha A · Peito e Tríceps") holding an ordered list of exercises.
_Avoid_: Routine, day, ficha (in code)

**Student workout**:
A versioned copy of a workout assigned to one aluno.
_Avoid_: Assigned plan

**Base exercise**:
An exercise of the shared catalog every clinic sees.
_Avoid_: Global exercise, system exercise

**Custom exercise**:
An exercise a clinic registered for itself, visible only to that clinic.
_Avoid_: Private exercise

## Interop

**openGym plan**:
The shareable plan file of the external openGym app; a workout exports to one, each session becoming one of its routines.
_Avoid_: Plan (unqualified)

**Catalog id**:
The permanent number of an exercise in the source catalogue. It is the `code` of a base exercise, so the openGym plan uses the same id for the same exercise.
_Avoid_: ExerciseDB id
