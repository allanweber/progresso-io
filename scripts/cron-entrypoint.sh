#!/bin/sh
set -eu

: "${APP_URL:?APP_URL is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

# cron(8) strips the environment from jobs, so write it to a file the job
# script sources instead of baking it into the crontab line (which would leak
# the secret to `ps`).
{
  echo "APP_URL=$APP_URL"
  echo "CRON_SECRET=$CRON_SECRET"
} > /etc/whatsapp-reminders.env
chmod 600 /etc/whatsapp-reminders.env

exec cron -f
