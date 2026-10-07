#!/usr/bin/env node
// Sends one message so you can see Telegram alerting is wired up:
//   npm run alert:test
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first (or ALERTS_DRY_RUN=true to
// see the message printed instead).

import { alertsEnabled, sendTelegram } from '../src/lib/alerts.js';

if (!alertsEnabled()) {
  console.error('Alerts are off: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
  process.exit(1);
}
const ok = await sendTelegram('Test message. Alerts are connected.');
console.log(ok ? 'Sent.' : 'Telegram did not accept the message. Check the token and chat id.');
process.exit(ok ? 0 : 1);
