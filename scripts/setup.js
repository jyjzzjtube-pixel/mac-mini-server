#!/usr/bin/env node
/**
 * 맥미니 M4 AI 홈서버 - 초기 설정 스크립트
 * node scripts/setup.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   🖥️  맥미니 M4 AI 홈서버 설정 시작       ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// 1. 디렉토리 생성
const dirs = ['data', 'logs', 'uploads', 'backups', 'credentials'];
dirs.forEach(dir => {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ 디렉토리 생성: ${dir}/`);
  } else {
    console.log(`⏭️  이미 존재: ${dir}/`);
  }
});

// 2. .env 파일 확인
const envPath = path.join(ROOT, '.env');
const envExample = path.join(ROOT, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envPath);
  console.log('✅ .env 파일 생성됨 (.env.example → .env)');
  console.log('   ⚠️  .env 파일에 API 키를 설정해주세요!');
} else if (fs.existsSync(envPath)) {
  console.log('⏭️  .env 이미 존재');
}

// 3. npm 의존성 설치
console.log('\n📦 서버 의존성 설치 중...');
try {
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
  console.log('✅ 서버 의존성 설치 완료');
} catch (e) {
  console.error('❌ 서버 의존성 설치 실패:', e.message);
}

// 4. 클라이언트 의존성
const clientDir = path.join(ROOT, 'client');
if (fs.existsSync(path.join(clientDir, 'package.json'))) {
  console.log('\n📦 클라이언트 의존성 설치 중...');
  try {
    execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
    console.log('✅ 클라이언트 의존성 설치 완료');
  } catch (e) {
    console.error('❌ 클라이언트 의존성 설치 실패:', e.message);
  }
}

// 5. PM2 확인
console.log('\n🔍 PM2 확인...');
try {
  const pm2V = execSync('pm2 --version', { encoding: 'utf8' }).trim();
  console.log(`✅ PM2 설치됨: v${pm2V}`);
} catch (e) {
  console.log('⚠️  PM2 미설치 - 글로벌 설치 필요:');
  console.log('   npm install -g pm2');
}

// 6. Tailscale 확인
console.log('\n🔍 Tailscale 확인...');
try {
  const tsStatus = execSync('tailscale version 2>/dev/null', { encoding: 'utf8' }).trim();
  console.log(`✅ Tailscale 설치됨: ${tsStatus.split('\n')[0]}`);
  try {
    const tsIP = execSync('tailscale ip -4 2>/dev/null', { encoding: 'utf8' }).trim();
    console.log(`   📡 Tailscale IP: ${tsIP}`);
  } catch (e) {
    console.log('   ⚠️  Tailscale 미연결 - tailscale up 실행 필요');
  }
} catch (e) {
  console.log('⚠️  Tailscale 미설치');
  console.log('   macOS: brew install tailscale');
  console.log('   또는: https://tailscale.com/download/mac');
}

console.log('\n');
console.log('╔══════════════════════════════════════════╗');
console.log('║   🎉 설정 완료!                           ║');
console.log('║                                          ║');
console.log('║   시작: npm start                        ║');
console.log('║   PM2:  pm2 start ecosystem.config.js    ║');
console.log('║   개발: npm run dev                      ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
