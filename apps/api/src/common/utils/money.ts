import { Prisma } from '../../generated/prisma/client.js';

export type DecimalValue = Prisma.Decimal;

/**
 * 金额计算工具。
 * 所有工资相关计算必须使用 Prisma.Decimal，禁止使用 JavaScript Number 做乘法和累计。
 */

export function toDecimal(
  value: string | number | Prisma.Decimal | null | undefined,
): Prisma.Decimal {
  if (value === null || value === undefined || value === '') {
    return new Prisma.Decimal(0);
  }
  return new Prisma.Decimal(value);
}

export function multiplyDecimal(
  quantity: number,
  unitPrice: string | number | Prisma.Decimal,
): Prisma.Decimal {
  return new Prisma.Decimal(quantity).mul(toDecimal(unitPrice));
}

export function sumDecimal(
  values: Array<string | number | Prisma.Decimal>,
): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (total, value) => total.add(toDecimal(value)),
    new Prisma.Decimal(0),
  );
}

/** 金额（最多三位小数），去掉无意义的末尾 0，至少保留两位小数 */
export function formatAmount(
  value: string | number | Prisma.Decimal,
): string {
  const fixed = toDecimal(value).toFixed(3);
  if (fixed.endsWith('0')) {
    const trimmed = fixed.replace(/0+$/, '');
    const [integer, decimals = ''] = trimmed.split('.');
    return `${integer}.${decimals.padEnd(2, '0')}`;
  }
  return fixed;
}

/** 单价固定三位小数，与 NUMERIC(12,3) 一致 */
export function formatUnitPrice(
  value: string | number | Prisma.Decimal,
): string {
  return toDecimal(value).toFixed(3);
}

/** 计算总金额并输出字符串（最多三位小数） */
export function totalAmountOf(
  rows: Array<{ quantity: number; unitPrice: string | Prisma.Decimal }>,
): string {
  const total = rows.reduce<Prisma.Decimal>(
    (sum, row) => sum.add(multiplyDecimal(row.quantity, row.unitPrice)),
    new Prisma.Decimal(0),
  );
  return formatAmount(total);
}

export function isValidUnitPrice(value: string): boolean {
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(value)) return false;
  return new Prisma.Decimal(value).greaterThanOrEqualTo(0);
}
