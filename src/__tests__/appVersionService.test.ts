import { describe, expect, it } from 'vitest';
import { compareVersions } from '../services/appVersionService';

describe('compareVersions', () => {
  it('считает равные версии равными', () => {
    expect(compareVersions('2.4.0', '2.4.0')).toBe(0);
  });

  it('различает порядок версий', () => {
    expect(compareVersions('2.4.1', '2.4.0')).toBe(1);
    expect(compareVersions('2.4.0', '2.4.1')).toBe(-1);
    expect(compareVersions('3.0.0', '2.99.99')).toBe(1);
  });

  // Строкальное сравнение путало бы '2.10.0' и '2.9.0': '1' < '9'.
  it('сравнивает сегменты как числа, а не как строки', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1);
    expect(compareVersions('2.9.0', '2.10.0')).toBe(-1);
  });

  it('не падает на разном числе сегментов', () => {
    expect(compareVersions('2.4', '2.4.0')).toBe(0);
    expect(compareVersions('2.4.1', '2.4')).toBe(1);
  });

  it('считает pre-release старее релиза', () => {
    expect(compareVersions('2.4.0', '2.4.0-beta')).toBe(1);
  });

  // Сравнение возвращает разницу сегментов, а не только знак; вызывающий
  // код смотрит лишь на знак (version > 0 → есть обновление).
  it('не роняется на мусорных значениях', () => {
    expect(Math.sign(compareVersions('', '2.4.0'))).toBe(-1);
    expect(Math.sign(compareVersions('2.x.0', '2.4.0'))).toBe(-1);
  });
});