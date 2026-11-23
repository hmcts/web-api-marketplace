import { Logger as HmctsLogger } from '@hmcts/nodejs-logging';

import { getCorrelationId } from '../correlation/context';

type LogLevel = 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error';

type LoggerDelegate = Record<LogLevel, (...args: unknown[]) => unknown>;

type AppInsightsClient = {
  trackTrace: (telemetry: {
    message: string;
    severity: 'Verbose' | 'Information' | 'Warning' | 'Error';
    properties: Record<string, string>;
  }) => void;
};

const severityByLevel: Record<LogLevel, 'Verbose' | 'Information' | 'Warning' | 'Error'> = {
  silly: 'Verbose',
  debug: 'Verbose',
  verbose: 'Verbose',
  info: 'Information',
  warn: 'Warning',
  error: 'Error',
};

const loggerCache = new Map<string, TelemetryLogger>();
let appInsightsClient: AppInsightsClient | undefined;

class TelemetryLogger {
  public constructor(
    private readonly name: string,
    private readonly delegate: LoggerDelegate
  ) {}

  public silly(...args: unknown[]): void {
    this.write('silly', args);
  }

  public debug(...args: unknown[]): void {
    this.write('debug', args);
  }

  public verbose(...args: unknown[]): void {
    this.write('verbose', args);
  }

  public info(...args: unknown[]): void {
    this.write('info', args);
  }

  public warn(...args: unknown[]): void {
    this.write('warn', args);
  }

  public error(...args: unknown[]): void {
    this.write('error', args);
  }

  /** A log line whose properties also reach App Insights as custom dimensions, so it can be queried by field. */
  public event(level: LogLevel, message: string, properties: Record<string, string>): void {
    this.write(level, [message], properties);
  }

  private write(level: LogLevel, args: unknown[], properties: Record<string, string> = {}): void {
    const correlationId = getCorrelationId();
    this.delegate[level](...(correlationId ? withCorrelationId(args, correlationId) : args));

    try {
      appInsightsClient?.trackTrace({
        message: formatLogMessage(args),
        severity: severityByLevel[level],
        properties: {
          ...properties,
          loggerName: this.name,
          ...(correlationId && { correlationId }),
        },
      });
    } catch {
      // Telemetry must never prevent the application from writing its normal console log.
    }
  }
}

export function setAppInsightsClient(client: AppInsightsClient): void {
  appInsightsClient = client;
}

export type AppLogger = TelemetryLogger;

export class Logger {
  public static getLogger(name: string): TelemetryLogger {
    const existingLogger = loggerCache.get(name);
    if (existingLogger) {
      return existingLogger;
    }

    const logger = new TelemetryLogger(name, HmctsLogger.getLogger(name) as LoggerDelegate);
    loggerCache.set(name, logger);
    return logger;
  }
}

function withCorrelationId(args: unknown[], correlationId: string): unknown[] {
  const last = args[args.length - 1];
  if (isPlainObject(last)) {
    return [...args.slice(0, -1), { ...last, correlationId }];
  }
  return [...args, { correlationId }];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function formatLogMessage(args: unknown[]): string {
  return args.map(argument => formatValue(argument, new WeakSet<object>())).join(' ');
}

function formatValue(value: unknown, seen: WeakSet<object>): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return `[${value.map(item => formatValue(item, seen)).join(', ')}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return Object.entries(value)
    .map(([key, item]) => `${key}=${formatValue(item, seen)}`)
    .join(', ');
}
