import { describe, expect, it } from 'vitest';
import { compareVersions, isUpdateAvailable } from '../services/appVersionService';

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

describe('isUpdateAvailable', () => {
  const base = {
    installedVersion: '2.4.0',
    installedBuild: 1,
    latestVersion: '2.4.0',
    latestBuild: 1,
  };

  it('считает одинаковые versionName и versionCode актуальной версией', () => {
    expect(isUpdateAvailable(base)).toBe(false);
  });

  // Главный сценарий Android: versionName забыли поднять, а versionCode вырос —
  // по нему система и понимает, что установленный APK старее опубликованного.
  it('видит обновление, когда вырос только versionCode', () => {
    expect(isUpdateAvailable({ ...base, latestBuild: 2 })).toBe(true);
    expect(isUpdateAvailable({ ...base, latestBuild: 10, installedBuild: 9 })).toBe(true);
  });

  it('не предлагает обновление, если versionCode опубликованного старше не установленного', () => {
    expect(isUpdateAvailable({ ...base, installedBuild: 3, latestBuild: 2 })).toBe(false);
  });

  it('откатывается к сравнению версий, если build-кодов нет (старый APK/веб)', () => {
    expect(isUpdateAvailable({ ...base, installedBuild: null, latestBuild: null })).toBe(false);
    expect(isUpdateAvailable({
      ...base,
      installedVersion: '2.4.0',
      latestVersion: '2.5.0',
      installedBuild: null,
      latestBuild: null,
    })).toBe(true);
    // build есть только у опубликованного — сравнивать их не с чем
    expect(isUpdateAvailable({ ...base, installedBuild: null, latestBuild: 5 })).toBe(false);
  });

  it('не предлагает обновление без установленной или опубликованной версии', () => {
    expect(isUpdateAvailable({ ...base, installedVersion: null })).toBe(false);
    expect(isUpdateAvailable({ ...base, latestVersion: null })).toBe(false);
  });
});