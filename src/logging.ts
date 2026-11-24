import { format } from 'node:util';

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(`[${new Date().toISOString()}] ${format(...args)}`);
  };
}
