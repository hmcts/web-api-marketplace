import { Logger as HmctsLogger } from '@hmcts/nodejs-logging';

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

  private write(level: LogLevel, args: unknown[]): void {
    this.delegate[level](...args);

    try {
      appInsightsClient?.trackTrace({
        message: formatLogMessage(args),
        severity: severityByLevel[level],
        properties: {
          loggerName: this.name,
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
