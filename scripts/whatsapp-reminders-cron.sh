#!/bin/sh
set -eu

# shellcheck disable=SC1091
. /etc/whatsapp-reminders.env

curl -fsS -X POST "$APP_URL/api/cron/whatsapp-reminders" \
  -H "x-cron-secret: $CRON_SECRET" \
  -o /dev/null
