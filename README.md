# IRD Toolkit

> Infrastructural Reflective Design — A new lens for UX designers

UX 디자이너가 자신의 설계 결정이 백엔드 인프라에 미치는 환경적 영향을 함께 고려할 수 있도록 돕는 도구 모음입니다.

## 구성

- **Home** (`/`) — 랜딩 화면, 4개 도구 진입점
- **What is IRD?** — IRD 개념 소개 (논문 기반)
- **Hints to begin with** — 사고의 시작점 가이드
- **Backend Translator** — UX 시나리오를 백엔드 연산 영향으로 사변적 변환 (Gemini AI)
- **Rebound Design Studio** — 디자인 결정 시뮬레이션 캔버스 + AI 리플렉션 (Gemini AI)

## 배포 (Vercel)

이 프로젝트는 **Vercel**에 배포되어 있습니다. GitHub repo의 main 브랜치에 push하면 자동 배포됩니다.

### 환경변수 설정 (필수)

Vercel 프로젝트의 **Settings → Environment Variables**에 다음을 추가:

| Key | Value | 환경 |
|-----|-------|------|
| `GEMINI_API_KEY` | (Google AI Studio에서 발급한 키) | Production, Preview, Development |

### Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/app/apikey) 접속
2. Google 계정으로 로그인
3. "Create API Key" 클릭
4. 생성된 키를 복사해서 Vercel 환경변수에 등록
5. **결제수단 등록하지 않음** → 한도 초과 시 자동 거부, 비용 발생 0

### 사용 모델

`gemini-2.5-flash-lite` (무료 tier, 1,000 RPD)

## 로컬 개발

```bash
# Vercel CLI 설치 (한 번만)
npm install -g vercel

# 로컬에서 dev 서버 실행 (Vercel Functions까지 시뮬레이션)
vercel dev
```

`http://localhost:3000`에서 접근.

`vercel dev`를 처음 실행하면 환경변수 설정을 묻는데, `.env.local` 파일을 만들어서:

```
GEMINI_API_KEY=your-key-here
```

## 파일 구조

```
.
├── index.html                       # 메인 페이지 (5개 탭, 모든 화면)
├── rebound-design-studio.html       # Studio iframe (정적 빌드 + window.claude polyfill)
├── api/
│   ├── translate.js                 # Vercel Function — Translator용 Gemini API 프록시
│   └── studio.js                    # Vercel Function — Studio AI용 Gemini API 프록시
├── package.json
├── vercel.json
└── README.md
```

## 라이선스 / 출처

본 도구는 다음 논문을 기반으로 합니다:
- _Infrastructural Reflexivity_ (DIS 2026 in submission)
