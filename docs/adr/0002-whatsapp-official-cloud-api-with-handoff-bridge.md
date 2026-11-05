# Official WhatsApp Cloud API as the destination, wa.me handoff until the CNPJ

Progresso will send WhatsApp through Meta's official Cloud API, as a Tech Provider onboarding each clinic with Embedded Signup. Meta requires business verification before App Review, and we have no CNPJ for at least the next couple of months, so until then the app prepares each message and the coach sends it from their own WhatsApp through a `wa.me` link. The coach always presses send, and we record that the message was opened, never that it was sent.

## Considered Options

- **OpenWA or Evolution API (Baileys / whatsapp-web.js)**: rejected. Both are reverse-engineered clients. Our automations message students proactively from each coach's business number, which is reportedly the riskiest pattern, and a banned number is generally reported as lost. WhatsApp's terms also bar reverse engineering and unauthorized non-personal use.
- **One Progresso number for all clinics**: rejected. Vonage reports Meta prohibits one account or number sending on behalf of several businesses.
- **A BSP as a way around verification**: rejected. Twilio, 360dialog and Infobip all list business verification as a Tech Provider step.
- **Evolution API's Cloud API mode**: rejected. It avoids the ban risk but adds a service to host and a license to comply with, just to reach an API we can call directly.

## Consequences

- Automations don't reach students on their own during the bridge; they wait in a queue for the coach, and replies arrive in the coach's own WhatsApp, not our inbox.
- Marketing copy must not promise automation until the Cloud API ships per clinic.
- The provider port has to become per clinic before launch, so connected clinics use the API while others stay on handoff.
