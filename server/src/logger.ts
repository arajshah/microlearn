type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const line = `${prefix} ${message}`;

  if (level === 'error') {
    if (meta !== undefined) console.error(line, meta);
    else console.error(line);
    return;
  }
  if (level === 'warn') {
    if (meta !== undefined) console.warn(line, meta);
    else console.warn(line);
    return;
  }
  if (meta !== undefined) console.log(line, meta);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};

export type Logger = typeof logger;
