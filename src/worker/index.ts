import { Hono } from 'hono';

import { onError, onNotFound, securityHeaders } from './middleware/error-handler';
import auth from './routes/auth';
import progress from './routes/progress';
import quiz from './routes/quiz';
import review from './routes/review';
import settings from './routes/settings';
import stats from './routes/stats';
import type { AppEnv } from './types';

/**
 * Worker entry point.
 *
 * `wrangler.jsonc` routes `/api/*` here first (`run_worker_first`) and serves
 * everything else from the static asset bundle with SPA fallback, so deep links
 * such as /words/consolidate resolve to index.html and are then handled by
 * React Router.
 */
const app = new Hono<AppEnv>().basePath('/api');

app.use('*', securityHeaders);

app.route('/auth', auth);
app.route('/progress', progress);
app.route('/quiz', quiz);
app.route('/review', review);
app.route('/settings', settings);
app.route('/stats', stats);

app.get('/health', (c) => c.json({ ok: true }));

app.onError(onError);
app.notFound(onNotFound);

export default app;
export type { AppEnv };
