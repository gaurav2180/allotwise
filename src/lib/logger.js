// Structured logger with hard PAN redaction.
//
// DPDP posture: a PAN must never reach disk. Application code is instructed not
// to log PANs, but instructions are not a control -- so every value that passes
// through here is scrubbed against the PAN shape regardless of who logged it.

const PAN_GLOBAL = /\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/g;

export function maskPan(pan) {
  if (typeof pan !== 'string' || pan.length !== 10) return '[REDACTED]';
  return `${pan.slice(0, 4)}****${pan.slice(8)}`;
}

function scrub(value, depth = 0) {
  if (depth > 6) return '[DEPTH]';
  if (typeof value === 'string') return value.replace(PAN_GLOBAL, '[PAN_REDACTED]');
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Belt and braces: drop anything named like a PAN carrier outright.
      if (/^(pan|pan_no|panNo|reqparam)$/i.test(k)) {
        out[k] = '[PAN_REDACTED]';
        continue;
      }
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level, msg, meta = {}) {
  const line = { ts: new Date().toISOString(), level, msg: scrub(msg), ...scrub(meta) };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', msg, meta);
  },
};
