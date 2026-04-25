# 배포 가이드 (단계별)

이 문서는 **이 폴더 그대로 GitHub에 올리고 Vercel에 배포**하는 단계별 가이드입니다.
대부분 GUI 클릭만 따라가면 되며, 명령어는 1~2개만 사용합니다.

---

## STEP 1: Gemini API 키 발급 (5분)

1. **Google AI Studio** 접속: https://aistudio.google.com/app/apikey
2. Google 계정으로 로그인 (개인 계정이면 OK)
3. 우측 상단 **"+ Create API Key"** 클릭
4. "Create API key in new project" 선택
5. 생성된 키를 **메모장 등에 복사해두세요** (예: `AIzaSy...`)

> ✨ **중요**: 결제수단을 등록하지 마세요. 무료 tier만 사용하면 어떤 경우에도 비용이 발생하지 않습니다.

---

## STEP 2: GitHub repo 생성 (5분)

### A. GitHub에 로그인 (없으면 가입: https://github.com/signup)

### B. 새 repo 생성:
1. 우측 상단 **"+"** → **"New repository"**
2. 다음과 같이 입력:
   - **Repository name**: `ird-toolkit` (원하는 이름)
   - **Description**: (선택) "IRD Toolkit — A new lens for UX designers"
   - **Private** 또는 **Public** 선택 (Public 추천 — 무료 + 검색 가능)
   - **Add a README file**: ❌ **체크 해제** (이미 있음)
   - **.gitignore**: None
   - **License**: None (또는 원하는 라이선스)
3. **"Create repository"** 클릭

### C. 생성된 repo의 URL 복사:
화면에 보이는 URL (예: `https://github.com/your-username/ird-toolkit.git`)을 복사해두세요.

---

## STEP 3: 로컬에서 GitHub에 파일 업로드 (10분)

### 옵션 A: 명령어 사용 (Mac/Linux/Windows 터미널)

이 폴더로 이동한 후:

```bash
# Git 초기화
git init

# 모든 파일 추가
git add .

# 첫 커밋
git commit -m "Initial commit: IRD Toolkit"

# main 브랜치로 변경
git branch -M main

# GitHub repo 연결 (URL은 STEP 2에서 복사한 것)
git remote add origin https://github.com/your-username/ird-toolkit.git

# Push
git push -u origin main
```

> 처음이면 GitHub 인증을 요청합니다. **Personal Access Token**이 필요할 수 있어요:
> 1. https://github.com/settings/tokens → "Generate new token (classic)"
> 2. "repo" 권한만 체크 → Generate
> 3. 토큰 복사해두고 push 시 비밀번호 자리에 붙여넣기

### 옵션 B: GitHub Desktop 앱 사용 (GUI 선호 시)

1. **GitHub Desktop** 다운로드: https://desktop.github.com/
2. 로그인 후 **"Add an Existing Repository from your hard drive..."**
3. 이 폴더 선택 → **"Publish repository"**
4. repo 이름 입력 → **"Publish"**

### 옵션 C: GitHub 웹에서 직접 업로드 (가장 쉬움, 작은 파일에 적합)

1. STEP 2에서 만든 repo 페이지로 이동
2. **"uploading an existing file"** 링크 클릭
3. 이 폴더의 모든 파일을 드래그해서 업로드
4. 하단 **"Commit changes"** 클릭

> ⚠️ 주의: `rebound-design-studio.html`이 1.7MB로 좀 커서 업로드 시간이 걸릴 수 있어요. 옵션 A 또는 B가 더 안정적입니다.

---

## STEP 4: Vercel 계정 생성 + 배포 (10분)

### A. Vercel 가입 (없으면)
1. https://vercel.com/signup 접속
2. **"Continue with GitHub"** 클릭 → GitHub 계정으로 로그인
3. 권한 승인 (Vercel이 GitHub repo에 접근할 수 있게)

### B. 프로젝트 import:
1. Vercel 대시보드에서 **"Add New..."** → **"Project"**
2. STEP 2에서 만든 repo (`ird-toolkit`)를 찾아서 **"Import"** 클릭
3. 프로젝트 설정 화면이 나타남:
   - **Project Name**: 기본값 그대로 (배포 URL이 됨, 예: `ird-toolkit.vercel.app`)
   - **Framework Preset**: **Other** 선택 (자동 감지될 수도 있음)
   - **Build Command**: 비워둠
   - **Output Directory**: 비워둠

### C. 환경변수 등록 (가장 중요!)
**"Environment Variables"** 섹션에서:
- **Name**: `GEMINI_API_KEY`
- **Value**: STEP 1에서 발급받은 Gemini API 키 (붙여넣기)
- **Environment**: Production, Preview, Development **모두 체크**

### D. 배포 시작:
**"Deploy"** 버튼 클릭 → 1~2분 후 **"Congratulations!"** 화면이 나타나면 성공!

배포된 사이트 URL이 표시됩니다 (예: `https://ird-toolkit.vercel.app`).

---

## STEP 5: 동작 확인

배포된 사이트에서:

1. ✅ **홈 화면** 정상 표시 → 4개 진입 버튼 클릭 가능
2. ✅ **What is IRD?** → 콘텐츠 정상 표시
3. ✅ **Hints** → 정상 표시
4. ✅ **Backend Translator**:
   - 시나리오 입력 (예: "사용자가 영상을 자동재생으로 시청해요")
   - "변환하기" 클릭
   - 1~3초 후 결과 카드가 나타나면 성공!
   - 만약 "AI 응답 실패" 에러: STEP 4-C에서 환경변수 확인
5. ⭐ **Studio**: 노드 만들기/연결/그리기 + **AI 리플렉션 자동 생성** 모두 작동

---

## STEP 6: 이후 수정하기

배포 후 코드를 수정하려면:

```bash
# 파일 수정 후
git add .
git commit -m "수정 내용 설명"
git push
```

→ Vercel이 자동으로 새 버전 배포합니다 (1~2분 소요).

또는 GitHub 웹 인터페이스에서 직접 파일 편집 → 자동 배포.

---

## 문제 해결

### "vercel command not found"
Vercel CLI를 사용하지 않아도 배포 가능. 위 STEP 4-B처럼 GUI에서 import하면 됨.

### "Gemini API error: 429"
오늘의 무료 한도(1,000 RPD)에 도달. 자정(태평양 시간) 이후 자동 리셋.

### "AI 응답 실패" 에러가 계속 발생
1. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
2. `GEMINI_API_KEY`가 등록되어 있는지 확인
3. 키 값이 올바른지 (앞뒤 공백 없이) 확인
4. 변경 후 **"Redeploy"** 필요

### 사이트가 404 에러
`vercel.json`이 올바른지 확인. 또는 첫 배포 시 `index.html` 이름이 정확한지 확인.

---

## 참고: 폴더 구조

```
ird-toolkit/
├── index.html                       # 메인 페이지 (모든 탭, 5개 화면)
├── rebound-design-studio.html       # Studio iframe (정적 빌드)
├── api/
│   └── translate.js                 # Vercel Function — Gemini AI 프록시
├── package.json                     # Vercel 프로젝트 메타
├── vercel.json                      # Vercel 라우팅 설정
├── .gitignore                       # Git 무시 파일
├── .env.local.example               # 로컬 개발용 환경변수 예시
├── README.md                        # 프로젝트 설명
└── DEPLOY_GUIDE.md                  # 이 파일
```

---

배포가 완료되면 사이트 URL을 공유하실 수 있어요. 문의나 문제 발생 시 알려주세요!
