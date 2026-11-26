/** 统一按中国时区（UTC+8）处理业务日期，避免服务器时区差异 */

export function chinaYearMonth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}${month}`;
}

export function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

/** 解析 YYYY-MM-DD 或 ISO 时间；非法值返回 null */
export function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateRangeFilter(
  dateFrom?: string,
  dateTo?: string,
): { gte?: Date; lte?: Date } | undefined {
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: startOfDay(from) } : {}),
    ...(to ? { lte: endOfDay(to) } : {}),
  };
}
