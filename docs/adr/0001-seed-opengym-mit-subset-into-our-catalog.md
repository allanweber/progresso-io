# Seed only openGym's MIT exercises, merged into our catalog

We extend the base exercise catalog with the 1,324 ExerciseDB-origin exercises that openGym ships, taken from the MIT-licensed upstream (`hasaneyldrm/exercises-dataset`) rather than from openGym's repository, and we keep our own catalog and prescription model instead of adopting openGym's. Everything else in openGym's catalogue (its newer exercises, descriptions, muscle corrections and every translation, pt-BR included) is AGPL, which a closed SaaS can't absorb without legal risk; and all exercise media in both repos is licensed from Gym visual for openGym's use only. An incoming exercise that matches one we already have is merged into our row (recording its openGym id, keeping our pt-BR text and images) instead of becoming a duplicate; the rest become image-less base exercises with build-time pt-BR translation.

## Considered Options

- **Replace our catalog and format with openGym's**: rejected. The media can't be used, most of the text is AGPL, and every workout row references our exercise ids with `on delete restrict`, so the migration would be large for a catalog we couldn't fully use.
- **Take the full ~6,554-exercise catalogue**: rejected pending a legal review of AGPL content in a SaaS.
- **Add the 1,324 as separate rows**: rejected; coaches would see duplicate exercises, one with images and one without.

## Consequences

- New exercises have no images until we source media we're allowed to use.
- The openGym id stored on a base exercise is what export uses; a separate id-mapping table isn't needed.
