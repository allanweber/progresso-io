# Progresso

A coaching platform where coaches in a clinic prescribe workouts and diets to their alunos and follow their progress.

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

**openGym id**:
The permanent number openGym gives an exercise in its catalogue; a base exercise that has one is the same exercise in both apps.
_Avoid_: ExerciseDB id

**Exercise merge**:
Folding a base exercise imported from openGym into one of ours that is the same exercise: ours takes its openGym id and its uses in workouts, and the imported one is archived for good.
_Avoid_: Link (when a duplicate is absorbed), dedupe
