// Проверка парсера участников импорта (Node >= 23: type stripping по умолчанию).
// Запуск: node _collab-parser-test.mjs
import { parseTrackCollaborators } from './src/services/collabParser.ts';

const P = (title, author) => parseTrackCollaborators(title, { mainAuthor: author });
const eq = (a, b, msg) => {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) {
    console.error('FAIL:', msg, '→', ja, 'ожидалось', jb);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
};

// Реальные заголовки профиля FLEXXXY
let r = P('FOR L1FE prod @Flexxxy', 'FLEXXXY');
eq(r.beatmakers, ['Flexxxy'], '«prod @хендл» → beatmakers, @ срезан');
eq(r.feat, [], 'feat пуст');

r = P('Saint Swagg (prod.by @LILKILLABEAT)', 'FLEXXXY');
eq(r.beatmakers, ['LILKILLABEAT'], '«(prod.by @…)» → beatmakers');

r = P('WHOOP WHOOP prod.by @FlexxxyBeatz', 'FLEXXXY');
eq(r.beatmakers, ['FlexxxyBeatz'], '«prod.by @FlexxxyBeatz»');

r = P('WAY TO HOOD', 'FLEXXXY');
eq(r, { extraArtists: [], feat: [], beatmakers: [] }, 'без упоминаний → всё пусто');

// feat / комбинации
r = P('Song (feat. Artist B & Artist C) (prod. by Killa)', 'MAIN');
eq(r.feat, ['Artist B', 'Artist C'], 'feat с & → список');
eq(r.beatmakers, ['Killa'], 'prod. by в том же названии');

r = P('Song ft. Yung Lean', 'MAIN');
eq(r.feat, ['Yung Lean'], 'ft. → feat');

r = P('Трек (при участии Петя) prod by Вася', 'MAIN');
eq(r.feat, ['Петя'], '«при участии» → feat');
eq(r.beatmakers, ['Вася'], '«prod by» по-русски → beatmakers');

r = P('Трек (продюсер Миша)', 'MAIN');
eq(r.beatmakers, ['Миша'], '«продюсер» после скобки (кириллица + lookbehind)');

r = P('Бумбокс совместно с Бумбастер', 'MAIN');
eq(r.feat, ['Бумбастер'], '«совместно с» → feat');

r = P('Трек прод.Никитос', 'MAIN');
eq(r.beatmakers, ['Никитос'], '«прод.Имя» без пробела');

r = P('New Song (with Artist D)', 'MAIN');
eq(r.feat, ['Artist D'], 'with → feat');

// со-артисты из шапки
r = P('FLEX x SAINT - Song Title', 'FLEX');
eq(r.extraArtists, ['SAINT'], '«FLEX x SAINT - Song» → SAINT со-артист');

r = P('FLEX & SAINT - Song', 'FLEX');
eq(r.extraArtists, ['SAINT'], '«FLEX & SAINT - Song» → SAINT со-артист');

// ложные срабатывания
r = P('Track production started', 'MAIN');
eq(r, { extraArtists: [], feat: [], beatmakers: [] }, '«production» не матчится');

r = P('Song feat. official video', 'MAIN');
eq(r.feat, [], 'мусорное «official video» отброшено');

r = P('Song (prod. by )', 'MAIN');
eq(r.beatmakers, [], 'пустое имя после prod. by');

// основной автор исключается из feat, но может быть битмейкером своего трека
r = P('Song (feat. FLEXXXY)', 'FLEXXXY');
eq(r.feat, [], 'feat. самого себя не добавляется');
r = P('FOR L1FE prod @Flexxxy', 'FLEXXXY');
eq(r.beatmakers, ['Flexxxy'], 'автор-битмейкер своего трека сохраняется');

// описание трека: проза после prod by отсекается
r = parseTrackCollaborators('prod by Killa, mixed by Dj, mastered at Home Studio', {
  mainAuthor: 'MAIN',
  allowArtistSplit: false,
});
eq(r.beatmakers, ['Killa'], 'проза описания («mixed by», «mastered») отсечена');

console.log(process.exitCode ? 'PARSER: ЕСТЬ ОШИБКИ' : 'PARSER: всё ок');