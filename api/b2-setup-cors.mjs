/**
 * Скрипт для настройки CORS на бакете Backblaze B2.
 * 
 * Применяет правила CORS через B2 собственный API (b2_update_bucket).
 * Если на бакете уже есть B2 Native CORS правила, S3 API не может их перезаписать.
 * 
 * Использование:
 *   node api/b2-setup-cors.mjs
 * 
 * Требует переменные окружения:
 *   B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_REGION
 */

// CORS-правила для B2 Native API
// Разрешаем все необходимые операции из браузера
const corsRules = [
  {
    corsRuleName: 'downloadFromAnyOrigin',
    allowedOrigins: ['*'],
    allowedOperations: [
      'b2_download_file_by_id',
      'b2_download_file_by_name',
      's3_head',
      's3_get',
    ],
    allowedHeaders: ['authorization', 'range'],
    maxAgeSeconds: 3600,
  },
  {
    corsRuleName: 'uploadFromAnyOrigin',
    allowedOrigins: ['*'],
    allowedOperations: [
      'b2_upload_file',
      'b2_upload_part',
      's3_put',
      's3_post',
      's3_delete',
    ],
    allowedHeaders: [
      'authorization',
      'content-type',
      'content-length',
      'x-bz-content-sha1',
      'x-bz-file-name',
      'x-bz-upload-timestamp',
      'x-bz-info-author',
      'cache-control',
    ],
    exposeHeaders: ['x-bz-content-sha1', 'x-bz-file-name'],
    maxAgeSeconds: 3600,
  },
];

async function setupB2NativeCors() {
  const region = (process.env.B2_REGION || '').trim();
  const bucketName = process.env.B2_BUCKET_NAME || '';
  const keyId = process.env.B2_KEY_ID || '';
  const appKey = process.env.B2_APP_KEY || '';

  if (!region || !bucketName || !keyId || !appKey) {
    console.error('❌ Необходимо задать B2_REGION, B2_BUCKET_NAME, B2_KEY_ID и B2_APP_KEY');
    process.exit(1);
  }

  console.log(`🔧 Настройка CORS для бакета: ${bucketName} (B2 Native API)`);

  // Авторизация в B2 API
  const authString = Buffer.from(`${keyId}:${appKey}`).toString('base64');
  
  let bucketId;
  let apiUrl;
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
    
    // B2 API v3 возвращает apiUrl в apiInfo.storageApi
    const storageApi = authData.apiInfo && authData.apiInfo.storageApi;
    if (!storageApi || !storageApi.apiUrl) {
      console.error('   Ответ авторизации:', JSON.stringify(authData, null, 2));
      throw new Error('Не удалось получить apiUrl из ответа авторизации');
    }
    
    apiUrl = storageApi.apiUrl;
    
    // Если bucketId уже есть в ответе (когда key привязан к конкретному бакету), используем его
    if (storageApi.bucketId && storageApi.bucketName === bucketName) {
      bucketId = storageApi.bucketId;
      console.log(`   Найден бакет (из ключа): ${bucketId}`);
    } else {
      // Иначе получаем список бакетов и ищем нужный
      const bucketsRes = await fetch(`${apiUrl}/b2api/v3/b2_list_buckets`, {
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
        const errorText = await bucketsRes.text();
        throw new Error(`Ошибка получения списка бакетов: ${bucketsRes.status} - ${errorText}`);
      }
      
      const bucketsData = await bucketsRes.json();
      const bucket = bucketsData.buckets.find((b) => b.bucketName === bucketName);
      
      if (!bucket) {
        throw new Error(`Бакет "${bucketName}" не найден`);
      }
      
      bucketId = bucket.bucketId;
      console.log(`   Найден бакет: ${bucketId}`);
    }
    
    // Применяем CORS правила через b2_update_bucket
    const updateRes = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
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
    
    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      throw new Error(`Ошибка применения CORS: ${updateRes.status} - ${errorText}`);
    }
    
    const updateData = await updateRes.json();
    console.log('✅ CORS правила успешно применены через B2 Native API');
    console.log('   Правила:');
    for (const rule of updateData.corsRules || []) {
      console.log(`   - ${rule.corsRuleName}: ${rule.allowedOperations.join(', ')}`);
    }
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

  // Применяем CORS через B2 Native API (b2_update_bucket)
  // Примечание: S3 API не может перезаписать B2 Native CORS правила
  try {
    await setupB2NativeCors();
  } catch (err) {
    console.error('❌ Не удалось применить CORS:', err.message);
    process.exit(1);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Готово! CORS правила применены.');
  console.log('=' .repeat(60));
}

main().catch((err) => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
