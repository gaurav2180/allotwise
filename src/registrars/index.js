import * as kfintech from './kfintech.js';
import * as linkintime from './linkintime.js';
import * as bigshare from './bigshare.js';
import * as maashitla from './maashitla.js';
import { AppError } from '../lib/errors.js';

// Registrars with a queryable status endpoint. Each module exposes the same
// two functions: queryByPan({ clientId, pan }) -> { found, records } and
// normalizeRecords(records) -> normalized applications.
const API_REGISTRARS = { kfintech, linkintime, bigshare, maashitla };

// Registrars whose status page cannot be queried server-side: the caller gets a
// deep link to the registrar's own page instead. Empty since Bigshare dropped
// its captcha; kept so a registrar that adds one can move here.
const DEEPLINK_REGISTRARS = {};

export function getRegistrar(name) {
  if (API_REGISTRARS[name]) return { kind: 'api', name, client: API_REGISTRARS[name] };
  if (DEEPLINK_REGISTRARS[name]) return { kind: 'deeplink', name, ...DEEPLINK_REGISTRARS[name] };
  throw new AppError(501, 'REGISTRAR_UNSUPPORTED', `Registrar "${name}" is not supported yet.`);
}

export const supportedRegistrars = [
  ...Object.keys(API_REGISTRARS).map((name) => ({ name, mode: 'api' })),
  ...Object.keys(DEEPLINK_REGISTRARS).map((name) => ({ name, mode: 'deeplink' })),
];
