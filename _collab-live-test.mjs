// Живая проверка: реальные заголовки из прод-прокси → парсер участников.
// Запуск: node _collab-live-test.mjs
import { parseTrackCollaborators } from './src/services/collabParser.ts';

const res = await fetch('https://vtg-dashboard.vercel.app/api/soundcloud-profile?url=' +
  encodeURIComponent('https://soundcloud.com/zhenya-11413880') + '&limit=30');
const j = await res.json();
console.log('proxy:', res.status, j?.user?.username, 'tracks:', j?.total, 'items:', j?.items?.length);
for (const it of j.items || []) {
  const pc = parseTrackCollaborators(it.title, { mainAuthor: it.author });
  const bits = [];
  if (pc.extraArtists.length) bits.push('артисты: ' + pc.extraArtists.join(', '));
  if (pc.feat.length) bits.push('feat: ' + pc.feat.join(', '));
  if (pc.beatmakers.length) bits.push('битмейкеры: ' + pc.beatmakers.join(', '));
  if (pc.mixers.length) bits.push('микс: ' + pc.mixers.join(', '));
  console.log(`- ${it.title}\n    ${bits.length ? '→ ' + bits.join(' | ') : '→ без участников'}`);
}
console.log('LIVE: ок');