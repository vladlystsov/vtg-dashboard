#!/usr/bin/env node
/**
 * Разовая миграция: Archive.org → Backblaze B2 + перелинковка Firestore.
 *
 * Что делает:
 *   1) обходит коллекции Firestore tracks / beats / projects;
 *   2) находит ссылки archive.org/download/<id>/<file> в полях:
 *        tracks:   platformUrl, projectZipUrl, projectZips[].zipUrl
 *        beats:    platformUrl
 *        projects: zipUrl
 *   3) скачивает файл с Archive.org и загружает в B2:
 *        vtgbeat-* → beats/, vtgtrack-* → tracks/, zip/vtgproj-* → projects/;
 *   4) перезаписывает ссылки в Firestore на публичные ссылки B2.
 *
 * Подготовка:
 *   1) npm i -D firebase-admin  (для Firestore; B2 — @aws-sdk/client-s3, уже в deps)
 *   2) Firebase Console → Project settings → Service accounts →
 *      Generate new private key → сохранить как serviceAccountKey.json в корне
 *      (в git не коммитится — уже в .gitignore).
 *   3) Заполнить env: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_REGION
 *      (те же значения, что для api/b2-storage.mjs).
 *
 * Запуск:
 *   node _migrate-ia-to-b2.mjs --dry-run    — только показать план
 *   node _migrate-ia-to-b2.mjs              — выполнить миграцию
 *   node _migrate-ia-to-b2.mjs --delete-ia  — дополнительно удалить файл с IA
 *       (нужны env IA_S3_ACCESS_KEY / IA_S3_SECRET_KEY «издательского» аккаунта)
 */

import { readFileSync, createWriteStream, createReadStream } from 'node:fs';
import { unlink, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const DELETE_IA = args.has('--delete-ia');

const keyPath = process.env.SERVICE_ACCOUNT_KEY || 'serviceAccountKey.json';
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`Не найден ${keyPath}. Смотри «Подготовка» в шапке этого файла.`);
  process.exit(1);
}

const missingEnv = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET_NAME', 'B2_REGION'].filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Нет env: ${missingEnv.join(', ')} (те же значения, что для api/b2-storage.mjs)`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const B2_REGION = process.env.B2_REGION.trim();
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME.trim();
const s3 = new S3Client({
  region: B2_REGION,
  endpoint: `https://s3.${B2_REGION}.backblazeb2.com`,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID.trim(),
    secretAccessKey: process.env.B2_APP_KEY.trim(),
  },
  forcePathStyle: true,
});

// Ссылка на файл для Firestore. Для приватного бакета это ссылка на функцию
// (env B2_LINK_BASE, напр. https://<project>.vercel.app/api/b2-storage) — она
// 302-редиректом отдаёт presigned GET. Для публичного бакета можно оставить
// дружественный URL B2 (без B2_LINK_BASE).
function b2PublicUrl(path) {
  const linkBase = (process.env.B2_LINK_BASE || '').trim().replace(/\/+$/, '');
  if (linkBase) return `${linkBase}?path=${encodeURIComponent(path)}`;
  const base = (process.env.B2_PUBLIC_BASE || '').trim();
  if (base) return `${base.replace(/\/+$/, '')}/${path}`;
  const digits = /(\d{3})$/.exec(B2_REGION);
  return `https://f${digits ? digits[1] : '000'}.backblazeb2.com/file/${B2_BUCKET_NAME}/${path}`;
}

const IA_URL_RE = /archive\.org\/download\/([^/?#]+)\/([^/?#]+)/i;
const CT_BY_EXT = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
  zip: 'application/zip',
};

function parseIaUrl(url) {
  const m = IA_URL_RE.exec((url || '').trim());
  if (!m) return null;
  try {
    return { id: decodeURIComponent(m[1]), file: decodeURIComponent(m[2]), raw: (url || '').trim() };
  } catch {
    return null;
  }
}

function targetPath(ia) {
  const id = (ia.id || '').toLowerCase();
  if (ia.file.toLowerCase().endsWith('.zip') || id.startsWith('vtgproj')) return `projects/${ia.file}`;
  if (id.startsWith('vtgtrack')) return `tracks/${ia.file}`;
  return `beats/${ia.file}`;
}

// Дедупликация: один и тот же файл может упоминаться в нескольких документах
const migrated = new Map(); // ia.raw → { path, url }

const MAX_ATTEMPTS = 3;

async function downloadFromIa(ia) {
  const url = `https://archive.org/download/${encodeURIComponent(ia.id)}/${ia.file
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok && res.body) return res;
    // 429/5xx — временная проблема IA, пробуем ещё раз
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      process.stdout.write(` (${res.status}, retry ${attempt + 1}/${MAX_ATTEMPTS}) `);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      continue;
    }
    lastErr = new Error(`Archive.org ответил ${res.status}`);
    lastErr.status = res.status;
    return Promise.reject(lastErr);
  }
  return Promise.reject(lastErr || new Error('download failed'));
}

async function uploadToB2(path, tmpFile, size, ia) {
  const ext = (ia.file.split('.').pop() || '').toLowerCase();
  // Content-Type берём по расширению — Archive.org часто отдаёт generic для mp3/zip
  const contentType = CT_BY_EXT[ext] || 'application/octet-stream';
  await s3.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: path,
      Body: createReadStream(tmpFile),
      ContentLength: size,
      ContentType: contentType,
    })
  );
  return { path, url: b2PublicUrl(path) };
}

async function migrateIaFile(ia) {
  if (migrated.has(ia.raw)) return migrated.get(ia.raw);
  const path = targetPath(ia);
  const tmpFile = join(tmpdir(), `vtg-migrate-${randomBytes(6).toString('hex')}.tmp`);
  try {
    process.stdout.write(`   ↓ ${ia.id}/${ia.file} → ${path} … `);
    const res = await downloadFromIa(ia);
    // Качаем во временный файл — стрим в S3 без известной длины ломает B2 (aws-chunked)
    const writeStream = createWriteStream(tmpFile);
    await new Promise((resolve, reject) => {
      Readable.fromWeb(res.body)
        .pipe(writeStream)
        .on('error', reject)
        .on('finish', resolve);
    });
    const { size } = await stat(tmpFile);
    if (size === 0) throw new Error('Пустой файл (0 байт)');
    const out = await uploadToB2(path, tmpFile, size, ia);
    console.log('ok');
    migrated.set(ia.raw, out);
    return out;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

async function deleteFromIa(ia) {
  const accessKey = process.env.IA_S3_ACCESS_KEY;
  const secretKey = process.env.IA_S3_SECRET_KEY;
  if (!accessKey || !secretKey) {
    console.log('   IA delete: пропущено (нет IA_S3_ACCESS_KEY / IA_S3_SECRET_KEY в env)');
    return;
  }
  const r = await fetch(
    `https://s3.us.archive.org/${encodeURIComponent(ia.id)}/${ia.file
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    {
      method: 'DELETE',
      headers: { authorization: `LOW ${accessKey}:${secretKey}`, 'x-archive-keep-old-version': '0' },
    }
  );
  console.log(`   IA delete ${ia.file}: HTTP ${r.status}${r.status === 403 ? ' (служебные файлы IA через API удалить нельзя)' : ''}`);
}

// === JOBS ===

function jobsForTracks(d) {
  const jobs = [];
  const pu = parseIaUrl(d.platformUrl);
  if (pu) jobs.push({ ia: pu, label: 'platformUrl', update: (ref, url) => ref.update('platformUrl', url) });
  const pzu = parseIaUrl(d.projectZipUrl);
  if (pzu) jobs.push({ ia: pzu, label: 'projectZipUrl', update: (ref, url) => ref.update('projectZipUrl', url) });
  const zips = Array.isArray(d.projectZips) ? d.projectZips : [];
  zips.forEach((z, i) => {
    const ia = parseIaUrl(z && z.zipUrl);
    if (ia) {
      jobs.push({
        ia,
        label: `projectZips[${i}].zipUrl`,
        update: (ref, url) => ref.update(new FieldPath('projectZips', String(i), 'zipUrl'), url),
      });
    }
  });
  return jobs;
}

function jobsForBeats(d) {
  const ia = parseIaUrl(d.platformUrl);
  return ia ? [{ ia, label: 'platformUrl', update: (ref, url) => ref.update('platformUrl', url) }] : [];
}

function jobsForProjects(d) {
  const ia = parseIaUrl(d.zipUrl);
  return ia ? [{ ia, label: 'zipUrl', update: (ref, url) => ref.update('zipUrl', url) }] : [];
}

async function main() {
  console.log(`Бакет: ${B2_BUCKET_NAME} (${B2_REGION})`);
  console.log(`Режим: ${DRY_RUN ? 'DRY-RUN (ничего не изменяется)' : 'ЗАПИСЬ'}${DELETE_IA ? ' + удаление файлов с Archive.org' : ''}`);
  try {
    await s3.send(new PutObjectCommand({ Bucket: B2_BUCKET_NAME, Key: '.migration-check', Body: 'ok' }));
    console.log('Доступ к B2: ok (тестовый объект .migration-check записан — можно удалить в консоли B2)');
  } catch (e) {
    console.error(`\nНет доступа к бакету «${B2_BUCKET_NAME}»: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
  if (!process.env.B2_LINK_BASE) {
    console.log('! B2_LINK_BASE не задан: в Firestore попадут дружественные ссылки B2 —');
    console.log('  они работают только для ПУБЛИЧНОГО бакета. Для частного задайте B2_LINK_BASE.');
  }

  const plan = [
    { name: 'tracks', collect: jobsForTracks },
    { name: 'beats', collect: jobsForBeats },
    { name: 'projects', collect: jobsForProjects },
  ];

  let migratedCount = 0;
  const errors = [];

  for (const { name, collect } of plan) {
    const snap = await db.collection(name).get();
    console.log(`\n== ${name}: ${snap.size} документов`);
    for (const doc of snap.docs) {
      for (const job of collect(doc.data())) {
        console.log(` • ${name}/${doc.id} · ${job.label}: ${job.ia.id}/${job.ia.file}`);
        if (DRY_RUN) continue;
        try {
          const out = await migrateIaFile(job.ia);
          await job.update(doc.ref, out.url);
          migratedCount++;
          if (DELETE_IA) await deleteFromIa(job.ia);
        } catch (e) {
          const msg = `${name}/${doc.id} · ${job.label}: ${e && e.message ? e.message : e}`;
          errors.push(msg);
          console.log(`   ОШИБКА: ${msg}`);
        }
      }
    }
  }

  console.log('\n=== Итог ===');
  console.log(`Ссылок перенесено: ${migratedCount}`);
  if (errors.length) {
    console.log(`Ошибки (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exitCode = 1;
  }
  if (!DRY_RUN) {
    console.log('\nДальше:');
    console.log(' 1) Проверь в админ-панели → «Хранилище», что файлы на месте, а треки/биты играются.');
    console.log(' 2) Удали содержимое на Archive.org (вкладка «Archive.org (легаси)»).');
    console.log(' 3) Запроси полную стирку аккаунта на info@archive.org.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});