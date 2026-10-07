import { config } from '../config.js';

// Telegram alerts for the backend and its scheduled jobs.
//
// Two kinds, both deliberately quiet:
//   - an error logged anywhere is sent once per distinct error per window, so a
//     job failing every 15 minutes is one message, not ninety-six a day;
//   - registrar incidents (a self-test failing, a company list gone stale, an
//     issue missing from its registrar) are sent when they appear and again,
//     as "resolved", when they clear -- never repeated while they persist.
//
// Everything here is best-effort and silent on failure. An alert that throws,
// or logs an error that alerts, would turn a monitoring problem into an outage.
// Message text is built from the logger's already PAN-scrubbed output.

const LIMIT = 3900; // Telegram caps a message at 4096 characters.

export const alertsEnabled = () =>
  config.alerts.dryRun || Boolean(config.alerts.telegramToken && config.alerts.telegramChatId);

const withPrefix = (text) => `[Allotwise ${config.alerts.label}] ${text}`.slice(0, LIMIT);

/** Send one message. Returns whether it went (or would have, in a dry run). */
export async function sendTelegram(text) {
  if (!alertsEnabled()) return false;
  const body = withPrefix(text);
  if (config.alerts.dryRun) {
    process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'alert (dry run)', text: body })}\n`);
    return true;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.alerts.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.alerts.telegramChatId, text: body, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function state() {
  return import('../db/index.js');
}

/** Reserve the right to send `key`, at most once per `minutes`. */
export async function claim(key, minutes = config.alerts.repeatMinutes) {
  const { getAlertState, setAlertState } = await state();
  const prev = getAlertState(key);
  if (prev && prev.ageMinutes < minutes) return false;
  setAlertState(key, new Date().toISOString());
  return true;
}

/** What an error log line becomes as a message. Exported for tests. */
export function describeError(line) {
  const { ts, level, msg, ...meta } = line;
  const detail = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
    .slice(0, 900);
  return `ERROR: ${msg}${detail ? `\n${detail}` : ''}`;
}

/** Called by the logger for every error. Never throws. */
export async function notifyError(line) {
  try {
    if (!alertsEnabled()) return;
    const key = `err:${line.msg}:${line.registrar ?? line.source ?? line.issue ?? ''}`.slice(0, 200);
    if (!(await claim(key))) return;
    await sendTelegram(describeError(line));
  } catch {
    // Alerting must never be the thing that fails.
  }
}

/**
 * Report what is wrong now against what was reported last time: new problems
 * as an alert, cleared ones as a resolution. `incidents` is a Map of stable key
 * to human text. Nothing is recorded unless the message was delivered, so a
 * failed send is tried again on the next run.
 */
export async function reportIncidents(incidents, { send = sendTelegram, stateKey = 'incidents' } = {}) {
  if (!alertsEnabled()) return { sent: false };
  const { getAlertState, setAlertState } = await state();

  let previous = {};
  try {
    previous = JSON.parse(getAlertState(stateKey)?.value ?? '{}');
  } catch {
    previous = {};
  }

  const added = [...incidents].filter(([k]) => !(k in previous));
  const cleared = Object.entries(previous).filter(([k]) => !incidents.has(k));
  if (!added.length && !cleared.length) return { sent: false, added: 0, cleared: 0 };

  const lines = [];
  if (added.length) lines.push(`ALERT (${added.length} new)`, ...added.map(([, t]) => `- ${t}`));
  if (cleared.length) {
    if (lines.length) lines.push('');
    lines.push(`RESOLVED (${cleared.length})`, ...cleared.map(([, t]) => `- ${t}`));
  }

  const ok = await send(lines.join('\n'));
  if (ok) setAlertState(stateKey, JSON.stringify(Object.fromEntries(incidents)));
  return { sent: ok, added: added.length, cleared: cleared.length };
}
