# 새 프로젝트 세팅 가이드

이 저장소를 기반으로 새로운 Next.js + Supabase 프로젝트를 처음부터 세팅하는 방법을 단계별로 설명합니다.

<p>
  <a href="#-사전-준비"><strong>사전 준비</strong></a> ·
  <a href="#1-저장소-복제"><strong>저장소 복제</strong></a> ·
  <a href="#2-supabase-프로젝트-생성"><strong>Supabase 생성</strong></a> ·
  <a href="#3-환경-변수-설정"><strong>환경 변수</strong></a> ·
  <a href="#4-데이터베이스-마이그레이션-적용"><strong>마이그레이션</strong></a> ·
  <a href="#5-google-oauth-설정-선택"><strong>Google OAuth</strong></a> ·
  <a href="#6-mcp-설정-claude-code용"><strong>MCP 설정</strong></a> ·
  <a href="#7-github-cicd-설정"><strong>CI/CD</strong></a> ·
  <a href="#-최종-체크리스트"><strong>체크리스트</strong></a>
</p>

---

## ✅ 사전 준비

시작 전에 다음이 설치되어 있어야 합니다.

| 도구         | 버전 | 확인 방법            |
| ------------ | ---- | -------------------- |
| Node.js      | 22.x | `node -v`            |
| Git          | 최신 | `git --version`      |
| Supabase CLI | 최신 | `supabase --version` |

**계정 준비:**

- [GitHub](https://github.com) 계정
- [Supabase](https://supabase.com) 계정

---

## 1. 저장소 복제

GitHub에서 이 저장소를 새 프로젝트용으로 복제합니다.

```bash
# 새 프로젝트 이름으로 클론
git clone https://github.com/<your-username>/nextjs-supabase-app.git <new-project-name>
cd <new-project-name>

# 원격 저장소를 새 GitHub 저장소로 교체
git remote set-url origin https://github.com/<your-username>/<new-project-name>.git
git push -u origin main

# 의존성 설치
npm install
```

> **팁**: GitHub에서 이 저장소를 Template으로 설정해두면 "Use this template" 버튼으로 원격 저장소를 바로 만들 수 있습니다. git 히스토리가 초기화되어 더 깔끔합니다.

---

## 2. Supabase 프로젝트 생성

> ⚠️ 기존 Supabase 프로젝트를 재사용하지 말고 새 프로젝트를 생성하세요. 마이그레이션이 중복 적용되거나 RLS 정책이 충돌할 수 있습니다.

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** 클릭
2. 프로젝트 정보 입력:
   - **Name**: 새 프로젝트 이름
   - **Database Password**: 안전한 비밀번호 저장 (마이그레이션 연결 시 필요)
   - **Region**: 서비스 대상 지역과 가장 가까운 곳 선택
3. **Create new project** 클릭 후 프로비저닝 완료 대기 (약 1~2분)

프로젝트 생성 후 URL에서 `project-ref`를 확인해두세요.

```
https://supabase.com/dashboard/project/<project-ref>
```

---

## 3. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성합니다. 이 파일은 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

```bash
touch .env.local
```

Supabase Dashboard → **Project Settings** → **API** 에서 값을 복사해 붙여넣습니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-or-anon-key>
```

> **`PUBLISHABLE_KEY` 참고**: Dashboard에는 `ANON KEY`로 표시될 수 있지만 값은 그대로 사용 가능합니다. Supabase가 키 이름을 publishable key로 전환하는 중입니다. [관련 공지](https://github.com/orgs/supabase/discussions/29260)

---

## 4. 데이터베이스 마이그레이션 적용

`supabase/migrations/`에 있는 마이그레이션 파일을 새 Supabase 프로젝트에 적용합니다. 이 마이그레이션은 `profiles` 테이블, RLS 정책, 트리거를 생성합니다.

### 방법 A: Supabase CLI (권장)

```bash
# Supabase 계정 로그인
supabase login

# 새 프로젝트에 연결
supabase link --project-ref <your-project-ref>

# 마이그레이션 일괄 적용
supabase db push
```

### 방법 B: Dashboard SQL Editor

1. Supabase Dashboard → **SQL Editor** 이동
2. `supabase/migrations/` 파일을 파일명 숫자 순서대로 열어 SQL을 직접 실행

마이그레이션 적용 후 Dashboard → **Table Editor** 에서 `profiles` 테이블이 생성되었는지 확인합니다.

---

## 5. Google OAuth 설정 (선택)

Google 소셜 로그인이 필요한 경우에만 진행합니다. 이메일/비밀번호 인증만 사용한다면 건너뜁니다.

### Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 생성 (또는 기존 프로젝트 선택)
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
3. Application type: **Web application** 선택
4. **Authorized redirect URIs** 에 추가:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. **Client ID** 와 **Client Secret** 저장

### Supabase에 등록

1. Supabase Dashboard → **Authentication** → **Providers** → **Google**
2. **Enable Sign in with Google** 활성화
3. Client ID / Client Secret 입력 후 저장

---

## 6. MCP 설정 (Claude Code용)

`.mcp.json`은 `.gitignore`에 포함되어 있으므로 직접 생성해야 합니다.

```bash
touch .mcp.json
```

아래 내용을 붙여넣고 `<your-project-ref>` 와 API 키를 교체합니다.

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<your-project-ref>"
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium"]
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "<your-context7-api-key>"
      }
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

**Supabase MCP 인증**: `https://mcp.supabase.com`은 Claude Code가 Supabase 계정으로 인증된 경우 자동으로 처리됩니다. 인증이 필요하면 Claude Code에서 Supabase MCP 도구를 처음 호출할 때 안내가 표시됩니다.

---

## 7. GitHub CI/CD 설정

`.github/workflows/ci.yml`의 빌드 단계에서 Supabase 환경 변수가 필요합니다. 등록하지 않으면 CI `build` 단계가 실패합니다.

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** 으로 두 값을 등록합니다:

| Secret 이름                            | 값 출처                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase → Project Settings → API → Project URL          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API → Publishable/Anon key |

---

## 8. 개발 서버 실행

```bash
npm run dev
```

[localhost:3000](http://localhost:3000) 에서 앱이 실행됩니다. 다음 기능이 정상적으로 동작하는지 확인합니다:

- 회원가입 → 이메일 확인 링크 클릭 → 로그인
- 로그인 후 `/protected` 페이지 접근
- 로그아웃

---

## (선택) 튜토리얼 컨텐츠 정리

원본 스타터킷의 데모용 컴포넌트는 실제 서비스에 불필요합니다. 기능 개발을 시작하기 전에 정리합니다.

### 제거 대상

```bash
# 튜토리얼 전용 컴포넌트 디렉토리
rm -rf components/tutorial/

# 스타터킷 전용 UI 컴포넌트
rm components/hero.tsx
rm components/deploy-button.tsx
rm components/env-var-warning.tsx
rm components/supabase-logo.tsx
rm components/next-logo.tsx
```

### 페이지 교체

- `app/page.tsx` — 튜토리얼 콘텐츠 제거 후 실제 서비스 홈페이지로 교체
- `app/protected/page.tsx` — 실제 대시보드 또는 메인 서비스 페이지로 교체

정리 후 깨진 import가 없는지 반드시 확인합니다.

```bash
npm run lint
npm run typecheck
```

---

## ✅ 최종 체크리스트

- [ ] 원격 저장소 URL을 새 GitHub 저장소로 교체했다
- [ ] `npm install` 완료
- [ ] `.env.local` 생성 및 Supabase URL/Key 입력
- [ ] `supabase db push` 로 마이그레이션 적용 완료
- [ ] `npm run dev` 실행 후 [localhost:3000](http://localhost:3000) 정상 확인
- [ ] 회원가입 → 이메일 확인 → 로그인 플로우 테스트 완료
- [ ] (Google OAuth 사용 시) 소셜 로그인 테스트 완료
- [ ] GitHub Secrets 등록 완료 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- [ ] Push 후 GitHub Actions CI 통과 확인
- [ ] `.mcp.json` 생성 (Claude Code 사용 시)
- [ ] (선택) 튜토리얼 컨텐츠 정리 후 `lint` / `typecheck` 통과 확인
