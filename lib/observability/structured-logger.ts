type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, string | number | boolean | null | undefined>;

function write(level: LogLevel, message: string, fields: LogFields = {}) {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

export const requestLogContext = (request: Request, route: string) => ({
  route,
  requestId: request.headers.get('x-vercel-id') ?? request.headers.get('x-request-id') ?? 'local',
});

export const logInfo = (message: string, fields?: LogFields) => write('info', message, fields);
export const logWarn = (message: string, fields?: LogFields) => write('warn', message, fields);
export const logError = (message: string, error: unknown, fields: LogFields = {}) => write('error', message, {
  ...fields,
  error: error instanceof Error ? error.message : String(error),
});
