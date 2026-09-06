import { getDb } from './index.js';
import { logger } from '../lib/logger.js';

getDb();
logger.info('migrations applied');
