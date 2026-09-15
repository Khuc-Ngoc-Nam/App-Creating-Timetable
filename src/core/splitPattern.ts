export function parseSplitPattern(pattern: string): number[] {
  const normalized = pattern
    .replace(/[，,;]/g, "+")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (normalized.length === 0) return [];

  return normalized.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`Phân rã "${pattern}" chỉ được gồm số nguyên dương và dấu +.`);
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Phân rã "${pattern}" có phần không hợp lệ: ${part}.`);
    }
    return value;
  });
}

export function formatSplitPattern(parts: number[]): string {
  return parts.join(" + ");
}

export function defaultSplitPattern(total: number, periodsPerSession: number, numberOfRealDays: number): string {
  if (total <= 0) return "";
  const desiredParts = Math.max(1, Math.min(total, numberOfRealDays));
  const parts: number[] = [];
  let remaining = total;

  for (let index = 0; index < desiredParts; index += 1) {
    const slotsLeft = desiredParts - index;
    const next = Math.min(periodsPerSession, Math.ceil(remaining / slotsLeft));
    parts.push(next);
    remaining -= next;
  }

  while (remaining > 0) {
    const next = Math.min(periodsPerSession, remaining);
    parts.push(next);
    remaining -= next;
  }

  return formatSplitPattern(parts);
}

export function validateSplitPattern(pattern: string, total: number, periodsPerSession: number): string[] {
  const errors: string[] = [];
  let parts: number[] = [];

  try {
    parts = parseSplitPattern(pattern);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const sum = parts.reduce((acc, part) => acc + part, 0);
  if (sum !== total) {
    errors.push(`Tổng phân rã ${sum} khác tổng tiết ${total}.`);
  }

  const tooLong = parts.find((part) => part > periodsPerSession);
  if (tooLong !== undefined) {
    errors.push(`Một hoạt động có ${tooLong} tiết, vượt số tiết tối đa mỗi buổi là ${periodsPerSession}.`);
  }

  return errors;
}
