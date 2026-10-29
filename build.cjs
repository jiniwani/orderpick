const fs = require('fs');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (Boolean(url) !== Boolean(key)) throw Error('SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 함께 설정하세요');
if (url) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw Error('Supabase URL을 확인하세요');
  if (!key.startsWith('sb_publishable_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); } catch {}
    if (claims?.role !== 'anon') throw Error('publishable 또는 기존 anon 키만 허용합니다');
  }
} else console.warn('Supabase 미연결: 화면 미리보기로 배포합니다. 주문 저장은 연결 후 사용할 수 있습니다.');
fs.mkdirSync('public', { recursive: true });
for (const file of ['index.html', 'app.js','photos.js', '_headers']) fs.copyFileSync(file, 'public/' + file);
fs.writeFileSync('public/config.js', 'window.ORDERPICK_CONFIG=' + JSON.stringify(url ? { url, key } : {}) + ';');

fs.mkdirSync('public/assets', { recursive: true });
fs.copyFileSync('assets/coffee-banner-red.jpg', 'public/assets/coffee-banner-red.jpg');
