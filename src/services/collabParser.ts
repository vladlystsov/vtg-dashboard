/**
 * Разбор названия трека (или описания) на участников:
 * со-артисты из шапки («A x B — Song»), «feat./ft./при участии/with»
 * и «prod by / produced by / продюсер / beat by».
 *
 * Примеры, которые покрываем:
 *   «FOR L1FE prod @Flexxxy»              → beatmakers: [Flexxxy]
 *   «Saint Swagg (prod.by @LILKILLABEAT)» → beatmakers: [LILKILLABEAT]
 *   «Song (feat. B & C) (prod. by X)»     → feat: [B, C], beatmakers: [X]
 *   «A x B — Song»                        → extraArtists: [B]
 *
 * Чистая функция без зависимостей — используется при импорте треков
 * (platformImportService) и тестируется отдельно (node _collab-parser-test.mjs).
 */

export interface ParsedCollabs {
  /** Со-артисты из шапки названия (кроме основного автора). */
  extraArtists: string[];
  /** Участники из «feat. / ft. / featuring / при участии / with». */
  feat: string[];
  /** Из «prod / produced by / продюсер / beat by». */
  beatmakers: string[];
  /** Из «mixed by / mix by / сведение». */
  mixers: string[];
}

const NAME_MIN_LEN = 2;
const NAME_MAX_LEN = 40;
const NAME_MAX_WORDS = 5;

/**
 * Ключевые слова участников. /u + \p{L} — кириллица тоже «буквы»:
 * обычный \b не работает с кириллицей (не словесный символ для JS-regex),
 * поэтому границы проверяем lookbehind/lookahead по классу букв и цифр.
 */
const KEYWORD_RE =
  /(?<![\p{L}\p{N}@])(?:prod(?:uced)?(?:\s*\.?\s*by)?\.?|прод\.?(?:\s*by)?|продюсер|beat\s+by|mix(?:ed)?\s*\.?\s*by|сведени[ея]\.?(?:\s*by)?|feat(?:uring)?\.?|ft\.?|при\s+(?:участии|уч\.)|совместно\s+с|with|уч\.?)(?![\p{L}\p{N}])/giu;

/** Позиция ключевого слова в тексте. */
interface KeywordHit {
  start: number;
  end: number;
  isProd: boolean;
  isMix: boolean;
}

function isProdKeyword(text: string): boolean {
  return /^(?:prod|прод|продюсер|beat)/i.test(text.trim());
}

function isMixKeyword(text: string): boolean {
  return /^(?:mix|сведени)/i.test(text.trim());
}

function cleanName(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[[\]{}"'«»„“”]/g, '')
    .replace(/\([^()]*$/, ' ') // незакрытая скобка от обрезки по «)»
    .trim()
    .replace(/^[@\s.,;:\-–—]+/, '') // @хендлы и мусорные префиксы — уже после trim
    .replace(/[\s.,;:\-–—]+$/, '');
}

function isValidName(s: string): boolean {
  if (s.length < NAME_MIN_LEN || s.length > NAME_MAX_LEN) return false;
  if (s.split(/\s+/).length > NAME_MAX_WORDS) return false;
  if (/https?:|www\.|\.com\b|\.ru\b/i.test(s)) return false;
  if (/^(?:official|video|audio|lyrics?|visualizer|music|song|prod|премьера|клип|видео|трек|минусовка|mp3)\b/i.test(s)) {
    return false;
  }
  return /[a-zа-яё0-9]/i.test(s);
}

/** Значение после ключевого слова → список имён. */
function splitNames(value: string): string[] {
  return value
    .split(/\s*(?:,|&|\/|\+|\b×\b|\bx\b)\s*/i)
    .map(cleanName)
    .filter(isValidName);
}

function pushUnique(list: string[], name: string): void {
  if (!name) return;
  const key = name.toLowerCase();
  if (!list.some((n) => n.toLowerCase() === key)) list.push(name);
}

export function parseTrackCollaborators(
  text: string,
  opts?: { mainAuthor?: string; allowArtistSplit?: boolean }
): ParsedCollabs {
  const out: ParsedCollabs = { extraArtists: [], feat: [], beatmakers: [], mixers: [] };
  const source = String(text || '');
  if (!source.trim()) return out;
  const mainAuthor = (opts?.mainAuthor || '').trim().toLowerCase();
  const allowArtistSplit = opts?.allowArtistSplit !== false;

  // 1. Находим все ключевые слова.
  const hits: KeywordHit[] = [];
  KEYWORD_RE.lastIndex = 0;
  for (let m = KEYWORD_RE.exec(source); m; m = KEYWORD_RE.exec(source)) {
    hits.push({ start: m.index, end: m.index + m[0].length, isProd: isProdKeyword(m[0]), isMix: isMixKeyword(m[0]) });
  }

  // 2. Значение каждого ключа: до следующего ключа, закрывающей скобки,
  //    «прозы» (mastered / recorded / …) или конца строки.
  for (let i = 0; i < hits.length; i++) {
    let stop = source.length;
    for (let p = hits[i].end; p < source.length; p++) {
      if (/[)\]|;\n\r]/.test(source[p])) {
        stop = p;
        break;
      }
    }
    for (let j = i + 1; j < hits.length; j++) {
      if (hits[j].start >= hits[i].end) stop = Math.min(stop, hits[j].start);
    }
    let value = source.slice(hits[i].end, stop);
    value = value.split(/\b(?:mastered|recorded|written|released)(?![a-zа-яё])/i)[0];
    const names = splitNames(value);
    const target = hits[i].isProd ? out.beatmakers : hits[i].isMix ? out.mixers : out.feat;
    for (const n of names) pushUnique(target, n);
  }

  // 3. Со-артисты из шапки названия (текст до первого ключевого слова).
  //    Разделители: «x», «&», «+» и запятая. Запятая считается разделителем
  //    со-артистов только когда шапка отделена от названия тире или
  //    продолжается ключевым словом — иначе «Song, Part 2» (без тире и
  //    участников) породило бы мусорного со-артиста «Part 2».
  if (allowArtistSplit) {
    const head = source.slice(0, hits.length ? hits[0].start : source.length);
    const dashIdx = head.search(/[-–—]/);
    const pre = dashIdx >= 0 ? head.slice(0, dashIdx) : head;
    const commaCounts = dashIdx >= 0 || hits.length > 0;
    const sepRe = commaCounts ? /\s+[x×+]\s+|&|,/i : /\s+[x×+]\s+|&/i;
    if (sepRe.test(pre)) {
      const parts = pre
        .split(sepRe)
        .map(cleanName)
        .filter(isValidName);
      const allShort = parts.every((p) => p.split(/\s+/).length <= NAME_MAX_WORDS);
      if (parts.length >= 2 && allShort) {
        for (const p of parts) pushUnique(out.extraArtists, p);
      }
    }
  }

  // 4. Основной автор не попадает в feat и со-артисты (feat. самого себя не
  //    бывает, а дубликат в artists[] уже есть). Но битмейкером быть может —
  //    «Track prod @Flexxxy» в профиле FLEXXXY = он сам спродюсировал трек.
  if (mainAuthor) {
    out.extraArtists = out.extraArtists.filter((n) => n.toLowerCase() !== mainAuthor);
    out.feat = out.feat.filter((n) => n.toLowerCase() !== mainAuthor);
  }
  return out;
}