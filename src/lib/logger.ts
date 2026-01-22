type LogData = Record<string, unknown> | Error | unknown;

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, message: string, data?: LogData): [string, LogData?] {
  const prefix = `[${formatTimestamp()}] [${level}]`;
  return data !== undefined ? [`${prefix} ${message}`, data] : [`${prefix} ${message}`];
}

export const logger = {
  debug(message: string, data?: LogData): void {
    if (isDev) {
      const [formatted, logData] = formatMessage('DEBUG', message, data);
      logData !== undefined ? console.log(formatted, logData) : console.log(formatted);
    }
  },

  info(message: string, data?: LogData): void {
    const [formatted, logData] = formatMessage('INFO', message, data);
    logData !== undefined ? console.log(formatted, logData) : console.log(formatted);
  },

  warn(message: string, data?: LogData): void {
    const [formatted, logData] = formatMessage('WARN', message, data);
    logData !== undefined ? console.warn(formatted, logData) : console.warn(formatted);
  },

  error(message: string, data?: LogData): void {
    const [formatted, logData] = formatMessage('ERROR', message, data);
    logData !== undefined ? console.error(formatted, logData) : console.error(formatted);
  },
};
