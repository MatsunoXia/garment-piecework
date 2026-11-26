import { describe, expect, it } from 'vitest';

import {
  formatAmount,
  formatUnitPrice,
  isValidUnitPrice,
  multiplyDecimal,
  sumDecimal,
  toDecimal,
} from './money.js';

describe('金额计算（Decimal 精确计算）', () => {
  it('三位小数工价乘整数数量不产生浮点误差', () => {
    expect(multiplyDecimal(200, '0.005').toFixed(3)).toBe('1.000');
    expect(multiplyDecimal(3, '0.333').toFixed(3)).toBe('0.999');
    expect(multiplyDecimal(7, '0.015').toFixed(3)).toBe('0.105');
  });

  it('累计金额不产生浮点误差', () => {
    const rows = ['0.1', '0.2', '0.005', '0.005'];
    expect(sumDecimal(rows).toFixed(3)).toBe('0.310');
  });

  it('大批量金额精确计算', () => {
    const total = sumDecimal([
      multiplyDecimal(1000, '0.005'),
      multiplyDecimal(1000, '0.005'),
      multiplyDecimal(999, '0.999'),
    ]);
    expect(total.toFixed(3)).toBe('1008.001');
  });

  it('金额格式化保留至少两位小数并去掉多余 0', () => {
    expect(formatAmount('110.000')).toBe('110.00');
    expect(formatAmount('0.500')).toBe('0.50');
    expect(formatAmount('1.005')).toBe('1.005');
    expect(formatAmount(0)).toBe('0.00');
  });

  it('工价统一输出三位小数', () => {
    expect(formatUnitPrice('0.5')).toBe('0.500');
    expect(formatUnitPrice(toDecimal('1'))).toBe('1.000');
  });

  it('工价合法性校验', () => {
    expect(isValidUnitPrice('0')).toBe(true);
    expect(isValidUnitPrice('0.005')).toBe(true);
    expect(isValidUnitPrice('12.345')).toBe(true);
    expect(isValidUnitPrice('-1')).toBe(false);
    expect(isValidUnitPrice('0.0005')).toBe(false);
    expect(isValidUnitPrice('abc')).toBe(false);
    expect(isValidUnitPrice('1,5')).toBe(false);
  });
});
