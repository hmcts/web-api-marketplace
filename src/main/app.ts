import * as path from 'path';

import { loadControllers, scopePerRequest } from 'awilix-express';
import * as bodyParser from 'body-parser';
import config = require('config');
import cookieParser from 'cookie-parser';
import express from 'express';
import RateLimit from 'express-rate-limit';

import { HTTPError } from './HttpError';
import { setupDev } from './development';
import { AppRequest } from './interfaces/AppRequest';
import { AppInsights } from './modules/appinsights';
import { Container } from './modules/awilix';
import { Correlation } from './modules/correlation';
import { Csrf } from './modules/csrf';
import { Helmet } from './modules/helmet';
import { I18next } from './modules/i18next';
import { Logger } from './modules/logging';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';
import { Session } from './modules/session';
import { configureDataStore } from './modules/store';
import { refreshExpiringToken } from './services/TokenRefresh';

const env = process.env.NODE_ENV || 'development';
const developmentMode = env === 'development';

const limiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per windowMs
});

export const app = express();
app.locals.ENV = env;
// First, before anything reads config: config locks itself on its first get(), and the
// secrets mounted from Key Vault (Redis, the session secret, Entra) can only be added before.
new PropertiesVolume().enableFor(app);

// Whether pages may show the emails GOV.UK Notify would have sent — see services/Notify.
app.locals.showEmailsOnPage = config.get<boolean>('notify.showEmailsOnPage');

const logger = Logger.getLogger('app');

new AppInsights().enable();
new Nunjucks(
  config.get('dynatrace'),
  developmentMode,
  config.get('analytics.gtmContainerId'),
  config.get('marketplaceSite.url')
).enableFor(app);
// secure the application by adding various HTTP headers to its responses
new Helmet(config.get('security'), developmentMode).enableFor(app);
new Container().enableFor(app);

app.get('/favicon.ico', limiter, (req, res) => {
  res.sendFile(path.join(__dirname, '/public/assets/rebrand/images/favicon.ico'));
});

// Ahead of the session, so a page's css, scripts and images are not each parsed for a body,
// handed a session and checked for an expiring token. A file on disk needs none of it.
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.set('trust proxy', 1);

app.use(cookieParser());
new Session(config.get('session')).enableFor(app);
configureDataStore(config.get('session.redis'));

// Before anything reads the session: a token close to expiring is renewed here, so a page and
// the API calls it makes are working from one that will still be good when they land.
app.use(((req: AppRequest, _res: express.Response, next: express.NextFunction) => {
  refreshExpiringToken(req).then(() => next(), next);
}) as express.RequestHandler);

// Every page's navigation needs to know whether anyone is signed in, so the user goes on
// res.locals rather than being passed by each controller that happens to render.
app.use(((req: AppRequest, res: express.Response, next: express.NextFunction) => {
  res.locals.user = req.session?.user;
  next();
}) as express.RequestHandler);

new Csrf(config.get<boolean>('useCSRFProtection')).enableFor(app);

new I18next().enableFor(app);

// Registered before the controllers: a controller that renders ends the middleware
// chain, so a header set after them never reaches an actual page or API response.
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate, no-store');
  next();
});

new Correlation().enableFor(app);

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - startedAt}ms`);
  });
  next();
});

app.use(scopePerRequest(app.locals.container));
app.use(loadControllers('controllers/**/*.+(ts|js)', { cwd: __dirname }));

setupDev(app, developmentMode);
// returning "not found" for requests with paths not resolved by the router
app.use((req: express.Request, res: express.Response) => {
  const appReq = req as AppRequest;
  res.status(404);
  const data = appReq.i18n?.getDataByLanguage(appReq.lng)['not-found'];
  res.render('not-found', data ?? {});
});

// error handler
app.use((err: HTTPError, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const appReq = req as AppRequest;
  logger.error(`${err.stack || err}`);

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = env === 'development' ? err : {};
  res.status(err.status || 500);
  const data = appReq.i18n?.getDataByLanguage(appReq.lng)?.error;
  res.render('error', data);
});
