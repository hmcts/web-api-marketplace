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
import { Helmet } from './modules/helmet';
import { I18next } from './modules/i18next';
import { Logger } from './modules/logging';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

const env = process.env.NODE_ENV || 'development';
const developmentMode = env === 'development';

const limiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per windowMs
});

export const app = express();
app.locals.ENV = env;

const logger = Logger.getLogger('app');

new PropertiesVolume().enableFor(app);
new AppInsights().enable();
new Nunjucks(config.get('dynatrace'), developmentMode, config.get('analytics.gtmContainerId')).enableFor(app);
// secure the application by adding various HTTP headers to its responses
new Helmet(config.get('security'), developmentMode).enableFor(app);
new Container().enableFor(app);

app.get('/favicon.ico', limiter, (req, res) => {
  res.sendFile(path.join(__dirname, '/public/assets/rebrand/images/favicon.ico'));
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.set('trust proxy', 1);

// No server-side session: nothing in this app reads req.session, and an in-memory
// store would not survive the multi-replica deployment. Add express-session with a
// shared store (Redis) if a journey ever needs one.
app.use(cookieParser());
new I18next().enableFor(app);

// Registered before the controllers: a controller that renders ends the middleware
// chain, so a header set after them never reaches an actual page or API response.
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate, no-store');
  next();
});

app.use(scopePerRequest(app.locals.container));
app.use(loadControllers('controllers/**/*.+(ts|js)', { cwd: __dirname }));

app.use(express.static(path.join(__dirname, 'public')));

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
