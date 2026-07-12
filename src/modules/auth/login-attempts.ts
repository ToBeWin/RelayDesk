const windowMs = 15 * 60 * 1000;
const maxFailures = 8;
const attempts = new Map<string, { failures: number; resetAt: number }>();

export function canAttemptLogin(key: string, now = Date.now()): boolean {
  const attempt = attempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    attempts.delete(key);
    return true;
  }
  return attempt.failures < maxFailures;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const attempt = attempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    attempts.set(key, { failures: 1, resetAt: now + windowMs });
    return;
  }
  attempt.failures += 1;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
