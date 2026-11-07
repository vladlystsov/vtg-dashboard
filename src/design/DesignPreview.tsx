/**
 * РўР•РЎРўРћР’РђРЇ РЎРўР РђРќРР¦Рђ Р”РР—РђР™Рќ-РЎРРЎРўР•РњР« (РїСЂРµРІСЊСЋ).
 * РР·РѕР»РёСЂРѕРІР°РЅР° ет РїСЂРёР»РѕР¶РµРЅРёСЏ: РїРѕРґРєР»СЋС‡Р°РµС‚ С‚РѕР»СЊРєРѕ design/tokens.css + preview.css.
 * РћС‚РєСЂС‹РІР°РµС‚СЃСЏ зе /design.html Ц dev-СЂРµР¶РёРјРµ.
 */
import { useEffect, useState } from 'react';
import './preview.css';
import {
  BellIcon, ChatIcon, GroupIcon, TrashIcon, PlusIcon, CheckIcon,
  CloseIcon, SunIcon, MoonIcon, CalendarIcon, SparkIcon, DownloadIcon,
} from './icons';

type Theme = 'light' | 'dark';

const SWATCHES: { name: string; v: string }[] = [
  { name: 'РљСЂР°СЃРЅС‹Р№ 400', v: 'var(--blue-400)' },
  { name: 'РљСЂР°СЃРЅС‹Р№ 500', v: 'var(--blue-500)' },
  { name: 'РљСЂР°СЃРЅС‹Р№ 600', v: 'var(--blue-600)' },
  { name: 'РљСЂР°СЃРЅС‹Р№ 700', v: 'var(--blue-700)' },
  { name: 'Зелете (РґРµРґР»Р°Р№РЅ)', v: 'var(--gold-400)' },
  { name: 'Р§С‘СЂРЅС‹Р№ 900', v: 'var(--gray-900)' },
  { name: 'Р“СЂР°РЅРёС†С‹ 300', v: 'var(--gray-300)' },
  { name: 'РџРѕРІРµСЂС…РЅРѕСЃС‚СЊ', v: 'var(--surface)' },
  { name: 'РљСЂР°СЃРЅС‹Р№ С‚РµРєСЃС‚', v: 'var(--red-600)' },
  { name: 'Р—РµР»С‘РЅС‹Р№ 600', v: 'var(--green-600)' },
];

export default function DesignPreview() {
  const [theme, setTheme] = useState<Theme>('light');
  const [reminders, setReminders] = useState<Record<string, boolean>>({
    h1: true, d1: true, d2: false, d3: false,
  });
  const [newsState, setNewsState] = useState<'update' | 'current' | 'hidden'>('update');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('vtg-theme', theme);
    } catch {
      /* РїСЂРёРІР°С‚РЅС‹Р№ СЂРµР¶РёРј вЂ” РїСЂРѕСЃС‚Рѕ Хе СЃРѕС…СЂР°РЅСЏРµРј */
    }
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <div className="dv-page">
      {/* ===== РџРµСЂРµРєР»СЋС‡Р°С‚РµР»СЊ тейъ (РґР»СЏ РїСЂРѕРІРµСЂРєРё) ===== */}
      <div className="dv-topbar">
        <span className="dv-logo-img dv-logo-img-sm" role="img" aria-label="VTG" />
        <div>
          <div className="dv-topbar-title">РџСЂРµРІСЊСЋ РЅРѕРІРѕР№ РґРёР·Р°Р№РЅ-СЃРёСЃС‚РµРјС‹</div>
          <div className="dv-topbar-sub">Р¤Р°Р·Р° 0-1 · С‚РµРјР°, РїР°Р»РёС‚СЂР°, идеХди, СЃС‚СЂР°РЅРёС†Р° РІС…РѕРґР°</div>
        </div>
        <div className="dv-spacer" />
        <div className="dv-theme-switch">
          <button
            className={!isDark ? 'active' : ''}
            onClick={() => setTheme('light')}
          >
            <SunIcon size={16} /> РЎРІРµС‚Р»Р°СЏ
          </button>
          <button
            className={isDark ? 'active is-dark' : ''}
            onClick={() => setTheme('dark')}
          >
            <MoonIcon size={16} /> РўС‘РјРЅР°СЏ
          </button>
        </div>
      </div>

      {/* ===== РРјРёС‚Р°С†РёСЏ С€Р°РїРєРё РїСЂРёР»РѕР¶РµРЅРёСЏ ===== */}
      <div className="dv-header">
        <div className="dv-header-left">
          <div className="dv-logo">
            <span className="dv-logo-img dv-logo-img-sm" role="img" aria-label="VTG" />
          </div>
          <nav className="dv-nav">
            <button className="active">Р”РѕСЃРєР°</button>
            <button>Р‘РёС‚С‹</button>
            <button>РўСЂРµРєРё</button>
            <button>РџСЂРѕРµРєС‚С‹</button>
            <button>Р§Р°С‚</button>
          </nav>
        </div>
        <div className="dv-header-right">
          <span className="dv-net"><span className="dv-net-dot" /> РћРЅР»Р°Р№РЅ</span>
          <button className="dv-btn dv-btn-danger"><PlusIcon size={16} /> РЎРѕР·РґР°С‚СЊ С‚СЂРµРє</button>
          <button className="dv-iconbtn" title="РЈРІРµРґРѕРјР»РµРЅРёСЏ">
            <BellIcon size={19} />
            <span className="dv-badge">3</span>
          </button>
          <button className="dv-iconbtn" title="Р§Р°С‚">
            <ChatIcon size={19} />
            <span className="dv-badge">2</span>
          </button>
          <button className="dv-user">
            <span className="dv-avatar">Р’</span>
            <span className="dv-user-name">Vlad</span>
          </button>
        </div>
      </div>

      <div className="dv-wrap">
        {/* ---------- РџР°Р»РёС‚СЂР° ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РџР°Р»РёС‚СЂР°</h2>
          <p className="dv-section-note">
            Р§С‘СЂРЅС‹Р№, зелете и РєСЂР°СЃРЅС‹Р№. Р—РЅР°С‡РµРЅРёСЏ тедеХеЦ РјРµРЅСЏСЋС‚СЃСЏ РІРјРµСЃС‚Рµ СЃ С‚РµРјРѕР№ вЂ”
            РІСЃРµ СЌР»РµРјРµРЅС‚С‹ Хиже Р°РґР°РїС‚РёСЂСѓСЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.
          </p>
          <div className="dv-swatches">
            {SWATCHES.map((s) => (
              <div className="dv-sw" key={s.name}>
                <div className="dv-sw-chip" style={{ background: s.v }} />
                <div className="dv-sw-label">{s.name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- РРєРѕРЅРєРё ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РРєРѕРЅРєРё</h2>
          <p className="dv-section-note">
            РЎРІРѕРё SVG РІРјРµСЃС‚Рѕ СЌРјРѕРґР·Рё вЂ” РµРґРёРЅС‹Р№ СЃС‚РёР»СЊ и РєРѕСЂСЂРµРєС‚РЅС‹Р№ цЦет Ц РѕР±РµРёС… С‚РµРјР°С….
          </p>
          <div className="dv-card">
            <div className="dv-row">
              <span className="dv-iconbtn"><BellIcon size={19} /></span>
              <span className="dv-iconbtn"><ChatIcon size={19} /></span>
              <span className="dv-iconbtn"><GroupIcon size={19} /></span>
              <span className="dv-iconbtn active"><CalendarIcon size={19} /></span>
              <span className="dv-iconbtn"><TrashIcon size={19} /></span>
              <span className="dv-iconbtn"><CheckIcon size={19} /></span>
              <span className="dv-iconbtn"><SparkIcon size={19} /></span>
              <span className="dv-iconbtn"><DownloadIcon size={19} /></span>
              <span className="dv-iconbtn"><SunIcon size={19} /></span>
              <span className="dv-iconbtn"><MoonIcon size={19} /></span>
              <span className="dv-iconbtn"><PlusIcon size={19} /></span>
              <span className="dv-iconbtn"><CloseIcon size={19} /></span>
            </div>
            <div className="dv-subhead dv-mt">Р›РѕРіРѕС‚РёРї (СЃРІРµС‚Р»Р°СЏ С‚РµРјР°)</div>
            <div className="dv-row">
              <span className="dv-logo-img" role="img" aria-label="VTG" />
            </div>
            <div className="dv-subhead dv-mt">Р›РѕРіРѕС‚РёРї (С‚С‘РјРЅР°СЏ С‚РµРјР° вЂ” Р±РµР»С‹Р№)</div>
            <div className="dv-row dv-logo-dark">
              <span className="dv-logo-img" role="img" aria-label="VTG" />
            </div>
          </div>
        </section>

        {/* ---------- кХезди ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">кХезди</h2>
          <p className="dv-section-note">
            Р§С‘СЂРЅР°СЏ вЂ” РѕСЃРЅРѕРІРЅРѕРµ РґРµР№СЃС‚РІРёРµ, Р·РѕР»РѕС‚Р°СЏ вЂ” Р°РєС†РµРЅС‚, РєСЂР°СЃРЅР°СЏ вЂ” СЃРѕР·РґР°РЅРёРµ/РѕРїР°СЃРЅРѕСЃС‚СЊ.
          </p>
          <div className="dv-card">
            <div className="dv-row">
              <button className="dv-btn dv-btn-primary">РЎРѕС…СЂР°РЅРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё</button>
              <button className="dv-btn dv-btn-gold"><DownloadIcon size={16} /> РЎРєР°С‡Р°С‚СЊ РѕР±РЅРѕРІР»РµРЅРёРµ</button>
              <button className="dv-btn dv-btn-danger"><PlusIcon size={16} /> РЎРѕР·РґР°С‚СЊ С‚СЂРµРє</button>
              <button className="dv-btn dv-btn-secondary">РћС‚РјРµРЅР°</button>
              <button className="dv-btn dv-btn-ghost">РџСЂРѕС‡РёС‚Р°С‚СЊ РІСЃС‘</button>
            </div>
          </div>
        </section>

        {/* ---------- РќРѕРІРѕСЃС‚РЅР°СЏ РїР»Р°С€РєР° (Р·Р°РґР°С‡Р° 1) ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РџР»Р°С€РєР° РЅРѕРІРѕСЃС‚РµР№</h2>
          <p className="dv-section-note">
            РЎС‚РѕРёС‚ РЅР° РІРєР»Р°РґРєРµ В«Р”РѕСЃРєР°В» вЂ” Хиже РїР»РµРµСЂР° и РІС‹С€Рµ Р±Р»РѕРєР° В«Р¤РёР»СЊС‚СЂВ».
            РџРµСЂРµРєР»СЋС‡РёС‚Рµ РІРёРґ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ РѕР±Р° СЃРѕСЃС‚РѕСЏРЅРёСЏ.
          </p>
          <div className="dv-row" style={{ marginBottom: 14 }}>
            <button className="dv-btn dv-btn-secondary" onClick={() => setNewsState('update')}>
              Р”РѕСЃС‚СѓРїРЅРѕ РѕР±РЅРѕРІР»РµРЅРёРµ
            </button>
            <button className="dv-btn dv-btn-secondary" onClick={() => setNewsState('current')}>
              РЈСЃС‚Р°РЅРѕРІР»РµРЅР° РїРѕСЃР»РµРґРЅСЏСЏ
            </button>
            <button className="dv-btn dv-btn-ghost" onClick={() => setNewsState('hidden')}>
              РЎРєСЂС‹С‚СЊ
            </button>
          </div>

          {newsState === 'update' && (
            <div className="dv-news">
              <div className="dv-news-icon"><SparkIcon size={20} /></div>
              <div className="dv-news-body">
                <div className="dv-news-title">
                  Р”РѕСЃС‚СѓРїРЅРѕ РѕР±РЅРѕРІР»РµРЅРёРµ<span className="dv-news-version">v2.4.0</span>
                </div>
                <div className="dv-news-text">
                  РЈСЃС‚Р°РЅРѕРІР»РµРЅР° РІРµСЂСЃРёСЏ v2.3.1. Чте РёР·РјРµРЅРёС‚СЃСЏ Ц СЃР»РµРґСѓСЋС‰РµРј РѕР±РЅРѕРІР»РµРЅРёРё:
                </div>
                <ul className="dv-news-list">
                  <li>РРјРїРѕСЂС‚ СЃ YouTube и SoundCloud вЂ” РІС‹Р±РѕСЂ В«РўСЂРµРєВ» или В«Р‘РёС‚В» РґР»СЏ РєР°Р¶РґРѕРіРѕ</li>
                  <li>РўС‘РјРЅР°СЏ С‚РµРјР° и РЅРѕРІР°СЏ РїР°Р»РёС‚СЂР°: С‡С‘СЂРЅС‹Р№, зелете, РєСЂР°СЃРЅС‹Р№</li>
                  <li>РўРµРіРё РґР°С‚ РЅР° Р·Р°РґР°С‡Р°С… и РЅР°РїРѕРјРёРЅР°РЅРёСЏ е СЃСЂРѕРєР°С… СЃРґР°С‡Рё</li>
                  <li>Р§Р°С‚: личХъе РґРёР°Р»РѕРіРё и РіСЂСѓРїРїРѕРІС‹Рµ С‡Р°С‚С‹ зе Р·Р°РґР°С‡Р°Рј</li>
                </ul>
                <div className="dv-news-actions">
                  <button className="dv-btn dv-btn-gold"><DownloadIcon size={16} /> РЎРєР°С‡Р°С‚СЊ APK</button>
                  <button className="dv-btn dv-btn-secondary">РќР°РїРѕРјРЅРёС‚СЊ зезже</button>
                </div>
              </div>
              <button className="dv-news-dismiss" title="РЎРєСЂС‹С‚СЊ"><CloseIcon size={16} /></button>
            </div>
          )}

          {newsState === 'current' && (
            <div className="dv-news is-current">
              <div className="dv-news-icon"><CheckIcon size={20} /></div>
              <div className="dv-news-body">
                <div className="dv-news-title">
                  Щ РІР°СЃ РїРѕСЃР»РµРґРЅСЏСЏ РІРµСЂСЃРёСЏ<span className="dv-news-version">v2.4.0</span>
                </div>
                <div className="dv-news-text">Чте ХеЦеже Ц СЌС‚РѕРј РѕР±РЅРѕРІР»РµРЅРёРё:</div>
                <ul className="dv-news-list">
                  <li>РџРµСЂРµСЂР°Р±РѕС‚Р°РЅ РёРјРїРѕСЂС‚ СЃ РїР»РѕС‰Р°РґРѕРє: РєР°Р¶РґС‹Р№ С‚СЂРµРє РІС‹Р±РёСЂР°РµС‚СЃСЏ РІСЂСѓС‡РЅСѓСЋ</li>
                  <li>РќРѕРІР°СЏ С†РІРµС‚РѕРІР°СЏ РіР°РјРјР° и РїРµСЂРµРєР»СЋС‡Р°С‚РµР»СЊ СЃРІРµС‚Р»РѕР№/С‚С‘РјРЅРѕР№ тейъ</li>
                  <li>РќР° РґРѕСЃРєРµ РїРѕСЏРІРёР»РёСЃСЊ тежи РґР°С‚ и РїРѕРґСЃРєР°Р·РєРё зе СЃСЂРѕРєР°Рј СЃРґР°С‡Рё</li>
                </ul>
              </div>
              <button className="dv-news-dismiss" title="РЎРєСЂС‹С‚СЊ"><CloseIcon size={16} /></button>
            </div>
          )}
        </section>

        {/* ---------- РљР°СЂС‚РѕС‡РєРё Р·Р°РґР°С‡ + тежи РґР°С‚ (Р·Р°РґР°С‡Р° 2) ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РљР°СЂС‚РѕС‡РєР° Р·Р°РґР°С‡Рё и теж РґР°С‚С‹</h2>
          <p className="dv-section-note">
            Р¦РІРµС‚ С‚РµРіР° Р·Р°РІРёСЃРёС‚ ет СЃСЂРѕС‡РЅРѕСЃС‚Рё: РїСЂРѕСЃСЂРѕС‡РµРЅРѕ вЂ” РєСЂР°СЃРЅС‹Р№, СЃРµРіРѕРґРЅСЏ вЂ” зелете, зезже вЂ” СЃРµСЂС‹Р№.
          </p>
          <div className="dv-grid dv-grid-3">
            <div className="dv-card-track is-overdue">
              <div className="dv-ct-head">
                <span className="dv-ct-project">РђР»СЊР±РѕРј В«РЎРµРІРµСЂВ» · 03</span>
                <span className="dv-date dv-date-overdue"><CalendarIcon size={13} /> РїСЂРѕСЃСЂРѕС‡РµРЅРѕ 2 Рґ.</span>
              </div>
              <div className="dv-ct-title">РўС‘РјРЅС‹Р№ РґРѕР¶РґСЊ</div>
              <div className="dv-ct-meta"><span>Vlad</span><span>prod. РљРёСЂРёР»Р»</span></div>
              <div className="dv-progress"><div className="dv-progress-fill" style={{ width: '45%' }} /></div>
              <div className="dv-ct-foot">
                <span className="dv-ct-status">Р’ СЂР°Р±РѕС‚Рµ</span>
                <span className="dv-date dv-date-overdue">14.10</span>
              </div>
            </div>

            <div className="dv-card-track">
              <div className="dv-ct-head">
                <span className="dv-ct-project">РЎРёРЅРіР» · 01</span>
                <span className="dv-date dv-date-today"><CalendarIcon size={13} /> СЃРµРіРѕРґРЅСЏ</span>
              </div>
              <div className="dv-ct-title">РќРµРѕРЅРѕРІС‹Р№ СЃРІРµС‚</div>
              <div className="dv-ct-meta"><span>Vlad</span><span>mix by РђСЂС‚С‘Рј</span></div>
              <div className="dv-progress"><div className="dv-progress-fill" style={{ width: '72%' }} /></div>
              <div className="dv-ct-foot">
                <span className="dv-ct-status">РЎРІРµРґРµРЅРёРµ</span>
                <span className="dv-date dv-date-today">СЃРµРіРѕРґРЅСЏ, 19:00</span>
              </div>
            </div>

            <div className="dv-card-track">
              <div className="dv-ct-head">
                <span className="dv-ct-project">РЎРёРЅРіР» · 02</span>
                <span className="dv-date dv-date-soon"><CalendarIcon size={13} /> С‡РµСЂРµР· 2 Рґ.</span>
              </div>
              <div className="dv-ct-title">Р“РѕСЂРѕРґ Хе СЃРїРёС‚</div>
              <div className="dv-ct-meta"><span>Vlad</span><span>prod. РљРёСЂРёР»Р»</span></div>
              <div className="dv-progress"><div className="dv-progress-fill" style={{ width: '20%' }} /></div>
              <div className="dv-ct-foot">
                <span className="dv-ct-status">РРґРµСЏ</span>
                <span className="dv-date dv-date-soon">С‡РµСЂРµР· 2 РґРЅСЏ</span>
              </div>
            </div>
          </div>

          <div className="dv-subhead dv-mt">Р’Р°СЂРёР°РЅС‚С‹ С‚РµРіР° РґР°С‚С‹</div>
          <div className="dv-datelist">
            <span className="dv-date dv-date-overdue"><CalendarIcon size={13} /> РїСЂРѕСЃСЂРѕС‡РµРЅРѕ 2 Рґ.</span>
            <span className="dv-date dv-date-today"><CalendarIcon size={13} /> СЃРµРіРѕРґРЅСЏ</span>
            <span className="dv-date dv-date-today"><CalendarIcon size={13} /> С‡РµСЂРµР· 2 ч.</span>
            <span className="dv-date dv-date-soon"><CalendarIcon size={13} /> С‡РµСЂРµР· 2 Рґ.</span>
            <span className="dv-date dv-date-far"><CalendarIcon size={13} /> 30.11</span>
            <span className="dv-date dv-date-far">Р±РµР· СЃСЂРѕРєР°</span>
          </div>
        </section>

        {/* ---------- РќР°СЃС‚СЂРѕР№РєР° РЅР°РїРѕРјРёРЅР°РЅРёР№ (Р·Р°РґР°С‡Р° 2) ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РќР°РїРѕРјРёРЅР°РЅРёСЏ е СЃСЂРѕРєРµ</h2>
          <p className="dv-section-note">
            Р’С‹Р±РёСЂР°СЋС‚СЃСЏ РїСЂРё СЃРѕР·РґР°РЅРёРё/РїСЂР°РІРєРµ Р·Р°РґР°С‡Рё. пе СѓРјРѕР»С‡Р°РЅРёСЋ РІРєР»СЋС‡РµРЅС‹ В«Р·Р° С‡Р°СЃВ» и В«Р·Р° РґРµРЅСЊВ».
          </p>
          <div className="dv-card">
            <div className="dv-field">
              <label className="dv-label">РЎСЂРѕРє СЃРґР°С‡Рё</label>
              <input className="dv-input" type="datetime-local" defaultValue="2026-10-20T19:00" />
            </div>
            <div className="dv-subhead">РќР°РїРѕРјРЅРёС‚СЊ Р·Р°</div>
            <div className="dv-checks">
              {[
                ['h1', '1 С‡Р°СЃ'],
                ['d1', '1 РґРµРЅСЊ'],
                ['d2', '2 РґРЅСЏ'],
                ['d3', '3 РґРЅСЏ'],
              ].map(([k, label]) => (
                <label key={k} className={`dv-check ${reminders[k] ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!reminders[k]}
                    onChange={(e) => setReminders((p) => ({ ...p, [k]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="dv-hint dv-mt">
              РЈРІРµРґРѕРјР»РµРЅРёРµ РїСЂРёРґС‘С‚ Ц РїСЂРёР»РѕР¶РµРЅРёРµ РЅР° телефеХ, РґР°Р¶Рµ РµСЃР»Рё еХе Р·Р°РєСЂС‹С‚Рѕ.
            </p>
          </div>
        </section>

        {/* ---------- РЈРІРµРґРѕРјР»РµРЅРёСЏ ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РЈРІРµРґРѕРјР»РµРЅРёСЏ</h2>
          <p className="dv-section-note">
            РћС‚РґРµР»СЊРЅР°СЏ РІРєР»Р°РґРєР° СЃ С„РёР»СЊС‚СЂРѕРј зе С‚РёРїР°Рј. РЎСЋРґР° же РїРѕРїР°РґР°СЋС‚ РЅРѕРІРѕСЃС‚Рё РѕР± РѕР±РЅРѕРІР»РµРЅРёСЏС….
          </p>
          <div className="dv-card">
            <div className="dv-notif unread">
              <div className="dv-notif-icon"><CalendarIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">РЎРєРѕСЂРѕ СЃСЂРѕРє СЃРґР°С‡Рё: В«РўС‘РјРЅС‹Р№ РґРѕР¶РґСЊВ» вЂ” РѕСЃС‚Р°Р»РѕСЃСЊ 2 РґРЅСЏ</div>
                <div className="dv-notif-time">12 йиХ РЅР°Р·Р°Рґ</div>
              </div>
            </div>
            <div className="dv-notif unread">
              <div className="dv-notif-icon"><SparkIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">Р”РѕСЃС‚СѓРїРЅРѕ РѕР±РЅРѕРІР»РµРЅРёРµ v2.4.0: С‚С‘РјРЅР°СЏ С‚РµРјР°, С‡Р°С‚ и тежи РґР°С‚</div>
                <div className="dv-notif-time">2 С‡Р°СЃР° РЅР°Р·Р°Рґ</div>
              </div>
            </div>
            <div className="dv-notif">
              <div className="dv-notif-icon"><GroupIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">
                  Р—Р°РґР°С‡Р° В«РќРµРѕРЅРѕРІС‹Р№ СЃРІРµС‚В» РїРµСЂРµРІРµРґРµРЅР° Ц В«Р“РѕС‚РѕРІРѕВ» вЂ” РєРѕРјР°РЅРґСѓ РЅСѓР¶РЅРѕ СЂР°СЃС„РѕСЂРјРёСЂРѕРІР°С‚СЊ
                </div>
                <div className="dv-notif-time">РІС‡РµСЂР°</div>
              </div>
            </div>
            <div className="dv-notif">
              <div className="dv-notif-icon"><ChatIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">РљРёСЂРёР»Р»: Р‘РёС‚ жетеЦ, Р·Р°Р±РёСЂР°СЋ Це РІРєР»Р°РґРєСѓ В«Р’ СЂР°Р±РѕС‚РµВ»</div>
                <div className="dv-notif-time">РІС‡РµСЂР°</div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Р§Р°С‚ ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Р§Р°С‚</h2>
          <p className="dv-section-note">
            Р›РёС‡РЅС‹Рµ РґРёР°Р»РѕРіРё и РіСЂСѓРїРїС‹ Р·Р°РґР°С‡. Р“СЂСѓРїРїР° СЃРѕР·РґР°С‘С‚СЃСЏ РїСЂРё РїРѕСЃС‚Р°РЅРѕРІРєРµ Р·Р°РґР°С‡Рё вЂ” СЃРѕСЃС‚Р°РІ
            СЃРѕР±РёСЂР°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё из СѓС‡Р°СЃС‚РЅРёРєРѕРІ, Р»РёС€РЅРёС… йежХе СЃРЅСЏС‚СЊ С‡РµРєР±РѕРєСЃР°РјРё.
          </p>
          <div className="dv-grid dv-grid-2">
            <div className="dv-chat">
              <div className="dv-chat-head">
                <span className="dv-iconbtn" style={{ width: 34, height: 34 }}><ChatIcon size={17} /></span>
                <div>
                  <div className="dv-chat-title">РљРёСЂРёР»Р»</div>
                  <div className="dv-chat-sub">Р›РёС‡РЅС‹Р№ РґРёР°Р»РѕРі</div>
                </div>
              </div>
              <div className="dv-chat-body">
                <div className="dv-msg dv-msg-in">
                  РџСЂРёРІРµС‚! РЎРєРёРЅСЊ СЂРµС„РµСЂРµРЅСЃ зе Р±РёС‚Сѓ
                  <span className="dv-msg-time">12:41</span>
                </div>
                <div className="dv-msg dv-msg-out">
                  Р”РµСЂР¶Рё, Р·Р°РїРёСЃР°Р» Ц Р·Р°РґР°С‡Сѓ
                  <span className="dv-msg-time">12:44</span>
                </div>
                <div className="dv-msg dv-msg-in">
                  мд, Р±РµСЂСѓ Ц СЂР°Р±РѕС‚Сѓ
                  <span className="dv-msg-time">12:45</span>
                </div>
              </div>
              <div className="dv-chat-input">
                <input className="dv-input" placeholder="РЎРѕРѕР±С‰РµРЅРёРµвЂ¦" />
                <button className="dv-btn dv-btn-gold"><PlusIcon size={16} /></button>
              </div>
            </div>

            <div className="dv-chat">
              <div className="dv-chat-head">
                <span className="dv-iconbtn" style={{ width: 34, height: 34 }}><GroupIcon size={17} /></span>
                <div>
                  <div className="dv-chat-title">РќРµРѕРЅРѕРІС‹Р№ СЃРІРµС‚</div>
                  <div className="dv-chat-sub">Р“СЂСѓРїРїР° Р·Р°РґР°С‡Рё · 4 СѓС‡Р°СЃС‚РЅРёРєР°</div>
                </div>
              </div>
              <div className="dv-chat-body">
                <div className="dv-msg dv-msg-in">
                  РЎСЂРѕРєРё СЃРґРІРёРЅСѓР»Рё РЅР° РїСЏС‚РЅРёС†Сѓ, РІСЃРµ Ц РєСѓСЂСЃРµ?
                  <span className="dv-msg-time">10:02</span>
                </div>
                <div className="dv-msg dv-msg-out">
                  Р”Р°, РѕР±РЅРѕРІРёР» РґРµРґР»Р°Р№РЅ Ц Р·Р°РґР°С‡Рµ
                  <span className="dv-msg-time">10:05</span>
                </div>
                <div className="dv-msg dv-msg-in">
                  РњРёРєСЃ СЃРґР°СЋ Р·Р°РІС‚СЂР° РґРѕ РІРµС‡РµСЂР°
                  <span className="dv-msg-time">10:07</span>
                </div>
              </div>
              <div className="dv-chat-input">
                <input className="dv-input" placeholder="РЎРѕРѕР±С‰РµРЅРёРµ Ц РіСЂСѓРїРїСѓвЂ¦" />
                <button className="dv-btn dv-btn-gold"><PlusIcon size={16} /></button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- РЎС‚СЂР°РЅРёС†Р° РІС…РѕРґР° ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">РЎС‚СЂР°РЅРёС†Р° РІС…РѕРґР° и СЂРµРіРёСЃС‚СЂР°С†РёРё</h2>
          <p className="dv-section-note">
            Р§С‘СЂРЅС‹Р№ феХ, Р·РѕР»РѕС‚Р°СЏ РѕР±РІРѕРґРєР° РєР°СЂС‚РѕС‡РєРё. РџРµСЂРµРєР»СЋС‡РёС‚Рµ С‚РµРјСѓ РІРІРµСЂС…Сѓ вЂ” ецеХите РѕР±Рµ.
          </p>
          <div className="dv-login">
            <div className="dv-login-card">
              <div className="dv-login-logo">
                <span className="dv-logo-img dv-logo-img-lg" role="img" aria-label="VTG" />
                <p>Internal Dashboard</p>
              </div>
              <div className="dv-field">
                <label className="dv-label">Email</label>
                <input className="dv-input" type="email" placeholder="email@example.com" defaultValue="vlad@example.com" />
              </div>
              <div className="dv-field">
                <label className="dv-label">РџР°СЂРѕР»СЊ</label>
                <input className="dv-input" type="password" placeholder="РњРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ" defaultValue="secret123" />
              </div>
              <div className="dv-error">ое СѓРґР°Р»РѕСЃСЊ РІРѕР№С‚Рё. РџСЂРѕРІРµСЂСЊС‚Рµ РїР°СЂРѕР»СЊ.</div>
              <button className="dv-btn dv-btn-primary" style={{ width: '100%', marginTop: 14 }}>
                Р’РѕР№С‚Рё
              </button>
              <button className="dv-login-toggle">оет Р°РєРєР°СѓРЅС‚Р°? Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
