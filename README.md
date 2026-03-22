# 근무표 프리뷰 앱

## 실행

```bash
npm install
npm run dev
```

## Firebase 공유 모드 설정

1. `.env.example`를 복사해 `.env` 파일을 만듭니다.
2. Firebase 프로젝트의 웹 앱 설정 값을 입력합니다.

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_WORKSPACE_ID=default
```

- `VITE_FIREBASE_WORKSPACE_ID`를 동일하게 설정한 사용자끼리 같은 근무표를 공유합니다.
- 환경변수가 없으면 앱은 자동으로 로컬 모드(브라우저 저장소)로 동작합니다.

## Android 앱/위젯 레이어 (Capacitor)

```bash
npm run android:sync
npm run android:open
```

- Android Studio에서 `Run`으로 앱 설치 후, 홈 화면에서 `근무표 위젯`을 추가합니다.
- 앱 데이터가 바뀌면 위젯에 오늘 근무/일정이 자동 반영됩니다.

### 실행 스크립트

- `npm run android:sync`: 웹 빌드 후 Android 프로젝트 동기화
- `npm run android:open`: Android Studio 열기
- `npm run android:run`: 빌드 후 연결된 기기에 앱 실행
