// Разовая проверка: трек PRINZ с профиля zhenya-11413880 через прод-прокси.
// Повторяет клиентскую логику импорта (fetchSoundCloudProfileItems):
// название + со-кредиты (publisher_artist) + описание.
// Запуск: node _prinz-check.mjs
import { parseTrackCollaborators } from './src/services/collabParser.ts';

const res = await fetch(
  'https://vtg-dashboard.vercel.app/api/soundcloud-profile?url=' +
    encodeURIComponent('https://soundcloud.com/zhenya-11413880')
);
const j = await res.json();
console.log('proxy:', res.status, '| профиль:', j?.user?.username, '| треков:', j?.total);
for (const it of j?.items || []) {
  if (!/prinz/i.test(it.title) && !/prinz/i.test(String(it.url))) continue;
  const author = String(it.author || '').trim() || 'SoundCloud';
  const pc = parseTrackCollaborators(it.title, { mainAuthor: author });
  const extraArtists = [...pc.extraArtists];
  const addExtra = (name) => {
    const v = String(name || '').trim();
    if (!v || v.length > 40 || /https?:|prod/i.test(v)) return;
    const k = v.toLowerCase();
    if (k === author.toLowerCase()) return;
    if (extraArtists.some((x) => x.toLowerCase() === k)) return;
    extraArtists.push(v);
  };
  const publisherArtist = String(it.publisherArtist || '').trim();
  if (publisherArtist) {
    for (const name of publisherArtist.split(/\s*(?:,|&|\/|\+|\b×\b|\bx\b)\s*/i)) addExtra(name);
  }
  const desc = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const dc = desc.trim() ? parseTrackCollaborators(desc, { mainAuthor: author, allowArtistSplit: false }) : null;
  const beatmakers = pc.beatmakers.length ? pc.beatmakers : dc?.beatmakers || [];
  const featNames = pc.feat.length ? pc.feat : dc?.feat || [];
  const mixers = pc.mixers.length ? pc.mixers : dc?.mixers || [];
  for (const a of dc?.extraArtists || []) addExtra(a);
  console.log('---');
  console.log('title :', JSON.stringify(it.title));
  console.log('author:', JSON.stringify(author));
  console.log('url   :', it.url);
  console.log('artists (итог импорта):', JSON.stringify([author, ...extraArtists]));
  console.log('feat  :', JSON.stringify(featNames), '| prod:', JSON.stringify(beatmakers), '| mix:', JSON.stringify(mixers));
}
