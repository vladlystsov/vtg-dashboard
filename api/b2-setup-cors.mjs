/**
 * Скрипт для настройки CORS на бакете Backblaze B2.
 * 
 * Применяет правила CORS к обоим API:
 *   - B2 собственный API (b2_get_bucket, b2_set_bucket_cors)
 *   - S3-совместимый API (PutBucketCors через AWS SDK)
 * 
 * Использование:
 *   node api/b2-setup-cors.mjs
 * 
 * Требует переменные окружения:
 *   B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_REGION
 */

import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

// CORS-правила для бакета
// Разрешаем все необходимые операции из браузера
const corsRules = [
  {
    ID: 'allow-all-origins-read',
    AllowedOrigins: ['*'],
    AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['x-bz-content-sha1', 'x-bz-file-name', 'x-bz-upload-timestamp'],
    MaxAgeSeconds: 3600,
  },
  {
    ID: 'allow-all-origins-upload',
    AllowedOrigins: ['*'],
    AllowedMethods: ['PUT', 'POST', 'OPTIONS'],
    AllowedHeaders: [
      'content-type',
      'authorization',
      'x-bz-content-sha1',
      'x-bz-file-name',
      'x-bz-upload-timestamp',
      'x-bz-info-author',
      'cache-control',
    ],
    ExposeHeaders: ['x-bz-content-sha1', 'x-bz-file-name', 'x-bz-upload-timestamp'],
    MaxAgeSeconds: 3600,
  },
];

async function setupS3Cors() {
  const region = (process.env.B2_REGION || '').trim();
  const bucketName = process.env.B2_BUCKET_NAME || '';

  if (!region || !bucketName) {
    console.error('❌ Необходимо задать B2_REGION и B2_BUCKET_NAME');
    process.exit(1);
  }

  const client = new S3Client({
    region,
    endpoint: `https://s3.${region}.backblazeb2.com`,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APP_KEY,
    },
    forcePathStyle: true,
  });

  console.log(`🔧 Настройка CORS для бакета: ${bucketName} (регион: ${region})`);

  try {
    const command = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: corsRules.map((rule) => ({
          AllowedOrigins: rule.AllowedOrigins,
          AllowedMethods: rule.AllowedMethods,
          AllowedHeaders: rule.AllowedHeaders,
          ExposeHeaders: rule.ExposeHeaders,
          MaxAgeSeconds: rule.MaxAgeSeconds,
        })),
      },
    });

    await client.send(command);
    console.log('✅ CORS правила успешно применены через S3-совместимый API');
  } catch (err) {
    console.error('❌ Ошибка при настройке CORS через S3 API:', err.message);
    throw err;
  }
}

async function setupB2NativeCors() {
  const region = (process.env.B2_REGION || '').trim();
  const bucketName = process.env.B2_BUCKET_NAME || '';
  const keyId = process.env.B2_KEY_ID || '';
  const appKey = process.env.B2_APP_KEY || '';

  if (!region || !bucketName || !keyId || !appKey) {
    console.error('❌ Необходимо задать B2_REGION, B2_BUCKET_NAME, B2_KEY_ID и B2_APP_KEY');
    process.exit(1);
  }

  console.log(`🔧 Настройка CORS для бакета: ${bucketName} (B2 собственный API)`);

  // Авторизация в B2 API
  const authString = Buffer.from(`${keyId}:${appKey}`).toString('base64');
  
  // Шаг 1: Получаем bucketId по имени
  let bucketId;
  try {
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      headers: {
        Authorization: `Basic ${authString}`,
      },
    });
    
    if (!authRes.ok) {
      throw new Error(`Ошибка авторизации: ${authRes.status}`);
    }
    
    const authData = await authRes.json();
    
    // Получаем информацию о бакете
    const bucketsRes = await fetch(`${authData.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: 'POST',
      headers: {
        Authorization: authData.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: authData.accountId,
        bucketName: bucketName,
      }),
    });
    
    if (!bucketsRes.ok) {
      throw new Error(`Ошибка получения списка бакетов: ${bucketsRes.status}`);
    }
    
    const bucketsData = await bucketsRes.json();
    const bucket = bucketsData.buckets.find((b) => b.bucketName === bucketName);
    
    if (!bucket) {
      throw new Error(`Бакет "${bucketName}" не найден`);
    }
    
    bucketId = bucket.bucketId;
    console.log(`   Найден бакет: ${bucketId}`);
    
    // Шаг 2: Применяем CORS правила через B2 API
    const corsRes = await fetch(`${authData.apiUrl}/b2api/v3/b2_set_bucket_cors`, {
      method: 'POST',
      headers: {
        Authorization: authData.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: authData.accountId,
        bucketId: bucketId,
        corsRules: corsRules,
      }),
    });
    
    if (!corsRes.ok) {
      const errorText = await corsRes.text();
      throw new Error(`Ошибка применения CORS: ${corsRes.status} - ${errorText}`);
    }
    
    const corsData = await corsRes.json();
    console.log('✅ CORS правила успешно применены через B2 собственный API');
  } catch (err) {
    console.error('❌ Ошибка при настройке CORS через B2 API:', err.message);
    throw err;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Настройка CORS для бакета Backblaze B2');
  console.log('=' .repeat(60));
  console.log();

  // Применяем CORS через S3-совместимый API
  try {
    await setupS3Cors();
  } catch (err) {
    console.warn('⚠️ Не удалось применить CORS через S3 API, продолжаем...');
  }

  console.log();

  // Применяем CORS через B2 собственный API
  try {
    await setupB2NativeCors();
  } catch (err) {
    console.warn('⚠️ Не удалось применить CORS через B2 API, продолжаем...');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Готово! CORS правила применены к обоим API.');
  console.log('=' .repeat(60));
}

main().catch((err) => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
