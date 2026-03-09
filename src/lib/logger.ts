type LogData = Record<string, unknown> | Error | unknown;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
const DEFAULT_LOG_LEVEL: LogLevel = isDev ? 'debug' : 'info';

function resolveLogLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();

  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured;
  }

  return DEFAULT_LOG_LEVEL;
}

function getVerboseScopes(): Set<string> {
  const configured = process.env.LOG_VERBOSE_SCOPES?.trim();
  if (!configured) {
    return new Set();
  }

  return new Set(
    configured
      .split(',')
      .map((scope) => scope.trim().toLowerCase())
      .filter(Boolean)
  );
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[resolveLogLevel()];
}

function shouldLogVerbose(scope: string): boolean {
  const scopes = getVerboseScopes();
  return scopes.has('*') || scopes.has(scope.trim().toLowerCase());
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, message: string, data?: LogData): [string, LogData?] {
  const prefix = `[${formatTimestamp()}] [${level}]`;
  return data !== undefined ? [`${prefix} ${message}`, data] : [`${prefix} ${message}`];
}

function write(level: Uppercase<LogLevel>, method: 'log' | 'warn' | 'error', message: string, data?: LogData): void {
  const [formatted, logData] = formatMessage(level, message, data);
  if (logData !== undefined) {
    console[method](formatted, logData);
    return;
  }

  console[method](formatted);
}

export const logger = {
  debug(message: string, data?: LogData): void {
    if (shouldLog('debug')) {
      write('DEBUG', 'log', message, data);
    }
  },

  info(message: string, data?: LogData): void {
    if (shouldLog('info')) {
      write('INFO', 'log', message, data);
    }
  },

  warn(message: string, data?: LogData): void {
    if (shouldLog('warn')) {
      write('WARN', 'warn', message, data);
    }
  },

  error(message: string, data?: LogData): void {
    if (shouldLog('error')) {
      write('ERROR', 'error', message, data);
    }
  },

  verbose(scope: string, message: string, data?: LogData): void {
    if (shouldLog('debug') && shouldLogVerbose(scope)) {
      write('DEBUG', 'log', `[${scope}] ${message}`, data);
    }
  },
};
