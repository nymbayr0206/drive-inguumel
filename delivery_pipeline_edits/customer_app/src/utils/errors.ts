/**
 * Customer app — error message mapping.
 * Never show raw "Internal error". Map known codes to Mongolian.
 * Default: "Алдаа гарлаа. Дахин оролдоно уу."
 */

export const ERROR_MESSAGES_MN: Record<string, string> = {
  VALIDATION_ERROR: 'Оруулсан мэдээлэл буруу байна.',
  WAREHOUSE_NOT_ASSIGNED: 'Агуулах тохируулаагүй байна.',
  FORBIDDEN: 'Эрх хүрэхгүй байна.',
  NOT_FOUND: 'Олдсонгүй.',
  NETWORK_ERROR: 'Сүлжээнд холбогдох боломжгүй. Дахин оролдоно уу.',
};

const DEFAULT_MESSAGE = 'Алдаа гарлаа. Дахин оролдоно уу.';

export function getErrorMessageMn(code: string | undefined, fallback?: string): string {
  if (!code) return fallback ?? DEFAULT_MESSAGE;
  return ERROR_MESSAGES_MN[code] ?? fallback ?? DEFAULT_MESSAGE;
}

export function normalizeApiError(err: unknown): { message: string; code?: string } {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { code?: string; message?: string }; status?: number } }).response;
    const data = res?.data;
    const code = data?.code;
    const message = data?.message ?? getErrorMessageMn(code);
    return { message, code };
  }
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('network')) {
      return { message: ERROR_MESSAGES_MN.NETWORK_ERROR ?? DEFAULT_MESSAGE };
    }
    return { message: err.message || DEFAULT_MESSAGE };
  }
  return { message: DEFAULT_MESSAGE };
}
