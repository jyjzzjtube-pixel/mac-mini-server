# 🖥️ 맥미니 M4 AI 홈서버 설치 가이드

## 📋 사전 준비

### 맥미니 M4 스펙
- CPU: Apple M4
- RAM: 16GB
- SSD: 256GB
- OS: macOS Sonoma/Sequoia

---

## 1단계: 기본 소프트웨어 설치

### Homebrew 설치
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Node.js 20 LTS
```bash
brew install node@20
```

### PM2 (프로세스 매니저)
```bash
npm install -g pm2
```

### Git
```bash
brew install git
```

---

## 2단계: Tailscale VPN 설치

### 설치
```bash
brew install tailscale
```

### 또는 Mac App Store에서 Tailscale 다운로드

### Tailscale 시작
```bash
# 데몬 시작
sudo tailscaled &

# 로그인
tailscale up

# IP 확인
tailscale ip -4
```

### 휴대폰에서 접속
1. Galaxy S24 Ultra에 Tailscale 앱 설치
2. 같은 계정으로 로그인
3. 맥미니의 Tailscale IP로 접속: `http://100.x.x.x:3000`

---

## 3단계: 프로젝트 설치

```bash
# 프로젝트 디렉토리로 이동
cd ~/mac-mini-server

# 설정 스크립트 실행
node scripts/setup.js

# 또는 수동 설치
npm install
cd client && npm install && npm run build && cd ..
```

---

## 4단계: 환경변수 설정

`.env` 파일을 편집:

```bash
nano .env
```

### 필수 설정
```
GEMINI_API_KEY=AIzaSyCg4xE3lYbZVxWmP9vpcccmpLVxIr3Czms
ANTHROPIC_API_KEY=sk-ant-api03-...
ADMIN_PASSWORD=원하는비밀번호
JWT_SECRET=랜덤문자열
```

### Google Drive 연결 (선택)
1. https://console.cloud.google.com 접속
2. 프로젝트 생성 → APIs & Services → Credentials
3. OAuth 2.0 Client ID 생성
4. Redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Client ID와 Secret을 .env에 입력

---

## 5단계: 서버 시작

### 개발 모드
```bash
npm run dev
```

### 프로덕션 (PM2)
```bash
# PM2로 시작
pm2 start ecosystem.config.js

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save
```

### 접속
- 로컬: http://localhost:3000
- Tailscale: http://100.x.x.x:3000
- 비밀번호: .env의 ADMIN_PASSWORD

---

## 6단계: 자동 시작 설정

### PM2 부팅 시 자동 실행
```bash
pm2 startup
# 출력된 명령어 실행
pm2 save
```

### macOS 절전 모드 비활성화 (24시간 가동)
```bash
# 절전 모드 끄기
sudo pmset -a sleep 0
sudo pmset -a disksleep 0
sudo pmset -a displaysleep 0

# 확인
pmset -g
```

---

## 🔧 유지보수 명령어

```bash
# 서버 상태 확인
pm2 status

# 로그 보기
pm2 logs

# 재시작
pm2 restart all

# 업데이트 후
cd ~/mac-mini-server
git pull
npm install
cd client && npm install && npm run build && cd ..
pm2 restart all
```

---

## 📱 모바일 접속 (Galaxy S24 Ultra)

1. Tailscale 앱 설치 & 로그인
2. Chrome에서 `http://100.x.x.x:3000` 접속
3. 홈 화면에 추가 (PWA)

---

## 🔐 보안 체크리스트

- [x] 관리자 비밀번호 변경
- [x] Tailscale 접속만 허용 (외부 포트 미개방)
- [x] API 키 .env에만 저장
- [x] Rate Limiting 적용 (15분당 200요청)
- [x] 위험 명령어 차단 (rm -rf, mkfs 등)
