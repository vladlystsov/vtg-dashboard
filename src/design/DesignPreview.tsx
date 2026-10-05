/**
 * ТЕСТОВАЯ СТРАНИЦА ДИЗАЙН-СИСТЕМЫ (превью).
 * Изолирована от приложения: подключает только design/tokens.css + preview.css.
 * Открывается по /design.html в dev-режиме.
 */
import { useEffect, useState } from 'react';
import './preview.css';
import {
  LogoMark, BellIcon, ChatIcon, GroupIcon, TrashIcon, PlusIcon, CheckIcon,
  CloseIcon, SunIcon, MoonIcon, CalendarIcon, SparkIcon, DownloadIcon,
} from './icons';

type Theme = 'light' | 'dark';

const SWATCHES: { name: string; v: string }[] = [
  { name: 'Золото 400', v: 'var(--gold-400)' },
  { name: 'Золото 500', v: 'var(--gold-500)' },
  { name: 'Золото 600', v: 'var(--gold-600)' },
  { name: 'Золото 700', v: 'var(--gold-700)' },
  { name: 'Чёрный 900', v: 'var(--gray-900)' },
  { name: 'Границы 300', v: 'var(--gray-300)' },
  { name: 'Поверхность', v: 'var(--surface)' },
  { name: 'Красный 600', v: 'var(--red-600)' },
  { name: 'Зелёный 600', v: 'var(--green-600)' },
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
      /* приватный режим — просто не сохраняем */
    }
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <div className="dv-page">
      {/* ===== Переключатель темы (для проверки) ===== */}
      <div className="dv-topbar">
        <LogoMark size={30} />
        <div>
          <div className="dv-topbar-title">Превью новой дизайн-системы</div>
          <div className="dv-topbar-sub">Фаза 0-1 · тема, палитра, иконки, страница входа</div>
        </div>
        <div className="dv-spacer" />
        <div className="dv-theme-switch">
          <button
            className={!isDark ? 'active' : ''}
            onClick={() => setTheme('light')}
          >
            <SunIcon size={16} /> Светлая
          </button>
          <button
            className={isDark ? 'active is-dark' : ''}
            onClick={() => setTheme('dark')}
          >
            <MoonIcon size={16} /> Тёмная
          </button>
        </div>
      </div>

      {/* ===== Имитация шапки приложения ===== */}
      <div className="dv-header">
        <div className="dv-header-left">
          <div className="dv-logo">
            <LogoMark size={38} />
            <div>
              <div className="dv-logo-text">VTG</div>
              <div className="dv-logo-sub">Dashboard</div>
            </div>
          </div>
          <nav className="dv-nav">
            <button className="active">Доска</button>
            <button>Биты</button>
            <button>Треки</button>
            <button>Проекты</button>
            <button>Чат</button>
          </nav>
        </div>
        <div className="dv-header-right">
          <span className="dv-net"><span className="dv-net-dot" /> Онлайн</span>
          <button className="dv-btn dv-btn-danger"><PlusIcon size={16} /> Создать трек</button>
          <button className="dv-iconbtn" title="Уведомления">
            <BellIcon size={19} />
            <span className="dv-badge">3</span>
          </button>
          <button className="dv-iconbtn" title="Чат">
            <ChatIcon size={19} />
            <span className="dv-badge">2</span>
          </button>
          <button className="dv-user">
            <span className="dv-avatar">В</span>
            <span className="dv-user-name">Vlad</span>
          </button>
        </div>
      </div>

      <div className="dv-wrap">
        {/* ---------- Палитра ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Палитра</h2>
          <p className="dv-section-note">
            Чёрный, золото и красный. Значения токенов меняются вместе с темой —
            все элементы ниже адаптируются автоматически.
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

        {/* ---------- Иконки ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Иконки</h2>
          <p className="dv-section-note">
            Свои SVG вместо эмодзи — единый стиль и корректный цвет в обеих темах.
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
              <span className="dv-iconbtn"><LogoMark size={26} /></span>
            </div>
          </div>
        </section>

        {/* ---------- Кнопки ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Кнопки</h2>
          <p className="dv-section-note">
            Чёрная — основное действие, золотая — акцент, красная — создание/опасность.
          </p>
          <div className="dv-card">
            <div className="dv-row">
              <button className="dv-btn dv-btn-primary">Сохранить настройки</button>
              <button className="dv-btn dv-btn-gold"><DownloadIcon size={16} /> Скачать обновление</button>
              <button className="dv-btn dv-btn-danger"><PlusIcon size={16} /> Создать трек</button>
              <button className="dv-btn dv-btn-secondary">Отмена</button>
              <button className="dv-btn dv-btn-ghost">Прочитать всё</button>
            </div>
          </div>
        </section>

        {/* ---------- Новостная плашка (задача 1) ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Плашка новостей</h2>
          <p className="dv-section-note">
            Стоит на вкладке «Доска» — ниже плеера и выше блока «Фильтр».
            Переключите вид, чтобы увидеть оба состояния.
          </p>
          <div className="dv-row" style={{ marginBottom: 14 }}>
            <button className="dv-btn dv-btn-secondary" onClick={() => setNewsState('update')}>
              Доступно обновление
            </button>
            <button className="dv-btn dv-btn-secondary" onClick={() => setNewsState('current')}>
              Установлена последняя
            </button>
            <button className="dv-btn dv-btn-ghost" onClick={() => setNewsState('hidden')}>
              Скрыть
            </button>
          </div>

          {newsState === 'update' && (
            <div className="dv-news">
              <div className="dv-news-icon"><SparkIcon size={20} /></div>
              <div className="dv-news-body">
                <div className="dv-news-title">
                  Доступно обновление<span className="dv-news-version">v2.4.0</span>
                </div>
                <div className="dv-news-text">
                  Установлена версия v2.3.1. Что изменится в следующем обновлении:
                </div>
                <ul className="dv-news-list">
                  <li>Импорт с YouTube и SoundCloud — выбор «Трек» или «Бит» для каждого</li>
                  <li>Тёмная тема и новая палитра: чёрный, золото, красный</li>
                  <li>Теги дат на задачах и напоминания о сроках сдачи</li>
                  <li>Чат: личные диалоги и групповые чаты по задачам</li>
                </ul>
                <div className="dv-news-actions">
                  <button className="dv-btn dv-btn-gold"><DownloadIcon size={16} /> Скачать APK</button>
                  <button className="dv-btn dv-btn-secondary">Напомнить позже</button>
                </div>
              </div>
              <button className="dv-news-dismiss" title="Скрыть"><CloseIcon size={16} /></button>
            </div>
          )}

          {newsState === 'current' && (
            <div className="dv-news is-current">
              <div className="dv-news-icon"><CheckIcon size={20} /></div>
              <div className="dv-news-body">
                <div className="dv-news-title">
                  У вас последняя версия<span className="dv-news-version">v2.4.0</span>
                </div>
                <div className="dv-news-text">Что нового в этом обновлении:</div>
                <ul className="dv-news-list">
                  <li>Переработан импорт с площадок: каждый трек выбирается вручную</li>
                  <li>Новая цветовая гамма и переключатель светлой/тёмной темы</li>
                  <li>На доске появились теги дат и подсказки по срокам сдачи</li>
                </ul>
              </div>
              <button className="dv-news-dismiss" title="Скрыть"><CloseIcon size={16} /></button>
            </div>
          )}
        </section>

        {/* ---------- Карточки задач + теги дат (задача 2) ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Карточка задачи и тег даты</h2>
          <p className="dv-section-note">
            Цвет тега зависит от срочности: просрочено — красный, сегодня — золото, позже — серый.
          </p>
          <div className="dv-grid dv-grid-3">
            <div className="dv-card-track is-overdue">
              <div className="dv-ct-head">
                <span className="dv-ct-project">Альбом «Север» · 03</span>
                <span className="dv-date dv-date-overdue"><CalendarIcon size={13} /> просрочено 2 д.</span>
              </div>
              <div className="dv-ct-title">Тёмный дождь</div>
              <div className="dv-ct-meta"><span>Vlad</span><span>prod. Кирилл</span></div>
              <div className="dv-progress"><div className="dv-progress-fill" style={{ width: '45%' }} /></div>
              <div className="dv-ct-foot">
                <span className="dv-ct-status">В работе</span>
                <span className="dv-date dv-date-overdue">14.10</span>
              </div>
            </div>

            <div className="dv-card-track">
              <div className="dv-ct-head">
                <span className="dv-ct-project">Сингл · 01</span>
                <span className="dv-date dv-date-today"><CalendarIcon size={13} /> сегодня</span>
              </div>
              <div className="dv-ct-title">Неоновый свет</div>
              <div className="dv-ct-meta"><span>Vlad</span><span>mix by Артём</span></div>
              <div className="dv-progress"><div className="dv-progress-fill" style={{ width: '72%' }} /></div>
              <div className="dv-ct-foot">
                <span className="dv-ct-status">Сведение</span>
                <span className="dv-date dv-date-today">сегодня, 19:00</span>
              </div>
            </div>

            <div className="dv-card-track">
              <div className="dv-ct-head">
                <span className="dv-ct-project">Сингл · 02</span>
                <span className="dv-date dv-date-soon"><CalendarIcon size={13} /> через 2 д.</span>
              </div>
              <div className="dv-ct-title">Город не спит</div>
              <div className="dv-ct-meta"><span>Vlad</span><span>prod. Кирилл</span></div>
              <div className="dv-progress"><div className="dv-progress-fill" style={{ width: '20%' }} /></div>
              <div className="dv-ct-foot">
                <span className="dv-ct-status">Идея</span>
                <span className="dv-date dv-date-soon">через 2 дня</span>
              </div>
            </div>
          </div>

          <div className="dv-subhead dv-mt">Варианты тега даты</div>
          <div className="dv-datelist">
            <span className="dv-date dv-date-overdue"><CalendarIcon size={13} /> просрочено 2 д.</span>
            <span className="dv-date dv-date-today"><CalendarIcon size={13} /> сегодня</span>
            <span className="dv-date dv-date-today"><CalendarIcon size={13} /> через 2 ч.</span>
            <span className="dv-date dv-date-soon"><CalendarIcon size={13} /> через 2 д.</span>
            <span className="dv-date dv-date-far"><CalendarIcon size={13} /> 30.11</span>
            <span className="dv-date dv-date-far">без срока</span>
          </div>
        </section>

        {/* ---------- Настройка напоминаний (задача 2) ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Напоминания о сроке</h2>
          <p className="dv-section-note">
            Выбираются при создании/правке задачи. По умолчанию включены «за час» и «за день».
          </p>
          <div className="dv-card">
            <div className="dv-field">
              <label className="dv-label">Срок сдачи</label>
              <input className="dv-input" type="datetime-local" defaultValue="2026-10-20T19:00" />
            </div>
            <div className="dv-subhead">Напомнить за</div>
            <div className="dv-checks">
              {[
                ['h1', '1 час'],
                ['d1', '1 день'],
                ['d2', '2 дня'],
                ['d3', '3 дня'],
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
              Уведомление придёт в приложение на телефон, даже если оно закрыто.
            </p>
          </div>
        </section>

        {/* ---------- Уведомления ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Уведомления</h2>
          <p className="dv-section-note">
            Отдельная вкладка с фильтром по типам. Сюда же попадают новости об обновлениях.
          </p>
          <div className="dv-card">
            <div className="dv-notif unread">
              <div className="dv-notif-icon"><CalendarIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">Скоро срок сдачи: «Тёмный дождь» — осталось 2 дня</div>
                <div className="dv-notif-time">12 мин назад</div>
              </div>
            </div>
            <div className="dv-notif unread">
              <div className="dv-notif-icon"><SparkIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">Доступно обновление v2.4.0: тёмная тема, чат и теги дат</div>
                <div className="dv-notif-time">2 часа назад</div>
              </div>
            </div>
            <div className="dv-notif">
              <div className="dv-notif-icon"><GroupIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">
                  Задача «Неоновый свет» переведена в «Готово» — команду нужно расформировать
                </div>
                <div className="dv-notif-time">вчера</div>
              </div>
            </div>
            <div className="dv-notif">
              <div className="dv-notif-icon"><ChatIcon size={16} /></div>
              <div className="dv-notif-body">
                <div className="dv-notif-text">Кирилл: Бит готов, забираю во вкладку «В работе»</div>
                <div className="dv-notif-time">вчера</div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Чат ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Чат</h2>
          <p className="dv-section-note">
            Личные диалоги и группы задач. Группа создаётся при постановке задачи — состав
            собирается автоматически из участников, лишних можно снять чекбоксами.
          </p>
          <div className="dv-grid dv-grid-2">
            <div className="dv-chat">
              <div className="dv-chat-head">
                <span className="dv-iconbtn" style={{ width: 34, height: 34 }}><ChatIcon size={17} /></span>
                <div>
                  <div className="dv-chat-title">Кирилл</div>
                  <div className="dv-chat-sub">Личный диалог</div>
                </div>
              </div>
              <div className="dv-chat-body">
                <div className="dv-msg dv-msg-in">
                  Привет! Скинь референс по биту
                  <span className="dv-msg-time">12:41</span>
                </div>
                <div className="dv-msg dv-msg-out">
                  Держи, записал в задачу
                  <span className="dv-msg-time">12:44</span>
                </div>
                <div className="dv-msg dv-msg-in">
                  Ок, беру в работу
                  <span className="dv-msg-time">12:45</span>
                </div>
              </div>
              <div className="dv-chat-input">
                <input className="dv-input" placeholder="Сообщение…" />
                <button className="dv-btn dv-btn-gold"><PlusIcon size={16} /></button>
              </div>
            </div>

            <div className="dv-chat">
              <div className="dv-chat-head">
                <span className="dv-iconbtn" style={{ width: 34, height: 34 }}><GroupIcon size={17} /></span>
                <div>
                  <div className="dv-chat-title">Неоновый свет</div>
                  <div className="dv-chat-sub">Группа задачи · 4 участника</div>
                </div>
              </div>
              <div className="dv-chat-body">
                <div className="dv-msg dv-msg-in">
                  Сроки сдвинули на пятницу, все в курсе?
                  <span className="dv-msg-time">10:02</span>
                </div>
                <div className="dv-msg dv-msg-out">
                  Да, обновил дедлайн в задаче
                  <span className="dv-msg-time">10:05</span>
                </div>
                <div className="dv-msg dv-msg-in">
                  Микс сдаю завтра до вечера
                  <span className="dv-msg-time">10:07</span>
                </div>
              </div>
              <div className="dv-chat-input">
                <input className="dv-input" placeholder="Сообщение в группу…" />
                <button className="dv-btn dv-btn-gold"><PlusIcon size={16} /></button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Страница входа ---------- */}
        <section className="dv-section">
          <h2 className="dv-section-title">Страница входа и регистрации</h2>
          <p className="dv-section-note">
            Чёрный фон, золотая обводка карточки. Переключите тему вверху — оцените обе.
          </p>
          <div className="dv-login">
            <div className="dv-login-card">
              <div className="dv-login-logo">
                <h1>VTG</h1>
                <p>Internal Dashboard</p>
              </div>
              <div className="dv-field">
                <label className="dv-label">Email</label>
                <input className="dv-input" type="email" placeholder="email@example.com" defaultValue="vlad@example.com" />
              </div>
              <div className="dv-field">
                <label className="dv-label">Пароль</label>
                <input className="dv-input" type="password" placeholder="Минимум 6 символов" defaultValue="secret123" />
              </div>
              <div className="dv-error">Не удалось войти. Проверьте пароль.</div>
              <button className="dv-btn dv-btn-primary" style={{ width: '100%', marginTop: 14 }}>
                Войти
              </button>
              <button className="dv-login-toggle">Нет аккаунта? Зарегистрироваться</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
