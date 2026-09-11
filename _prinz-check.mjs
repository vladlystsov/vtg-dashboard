// Разовая проверка: трек PRINZ с профиля zhenya-11413880 через прод-прокси.
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
  const pc = parseTrackCollaborators(it.title, { mainAuthor: it.author });
  const authors = [it.author, ...pc.extraArtists];
  console.log('---');
  console.log('title :', JSON.stringify(it.title));
  console.log('author:', JSON.stringify(it.author));
  console.log('url   :', it.url);
  console.log('publisherArtist:', JSON.stringify(it.publisherArtist ?? null));
  console.log('description   :', JSON.stringify((it.description || '').slice(0, 300)));
  console.log('artists (итог импорта):', JSON.stringify(authors));
  console.log('feat  :', JSON.stringify(pc.feat), '| prod:', JSON.stringify(pc.beatmakers));
}
