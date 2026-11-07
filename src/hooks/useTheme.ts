import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vtg-theme';

/**
 * РџРµСЂРµРєР»СЋС‡Р°С‚РµР»СЊ тейъ. РџСЂРёРјРµРЅСЏРµС‚ data-theme д <html> вЂ” CSS-РїРµСЂРµРјРµРЅРЅС‹Рµ
 * Ц index.css СЃР°РјРё РїРµСЂРµРєСЂР°С€РёРІР°СЋС‚ РІСЃРµ СЌР»РµРјРµРЅС‚С‹.
 *
 * РўРµРјР° СЃС‚Р°РІРёС‚СЃСЏ Р”Рћ РїРµСЂРІРѕР№ РѕС‚СЂРёСЃРѕРІРєРё РёРЅР»Р°Р№РЅ-СЃРєСЂРёРїС‚РѕРј Ц index.html,
 * Р·РґРµСЃСЊ вЂ” С‚РѕР»СЊРєРѕ РґР»СЏ РїРѕСЃР»РµРґСѓСЋС‰РёС… РїРµСЂРµРєР»СЋС‡РµРЅРёР№ и СЃРѕС…СЂР°РЅРµРЅРёСЏ РІС‹Р±РѕСЂР°.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      // пе СѓРјРѕР»С‡Р°РЅРёСЋ вЂ” С‚С‘РјРЅР°СЏ: С‡С‘СЂРЅС‹Р№ СЃ зелетей и РєСЂР°СЃРЅС‹Рј РІС‹РіР»СЏРґРёС‚
      // РІС‹СЂР°Р·РёС‚РµР»СЊРЅРµРµ и Р±Р»РёР¶Рµ д С‚РµРјР°С‚РёРєРµ.
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* РїСЂРёРІР°С‚РЅС‹Р№ СЂРµР¶РёРј вЂ” РїСЂРѕСЃС‚Рѕ Хе СЃРѕС…СЂР°РЅСЏРµРј */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggle };
}
