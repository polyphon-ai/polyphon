import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

export function nowMs(): number {
  return Date.now();
}
