# web1

- `index.html`, `1.html` ~ `3.html` : 생활코딩 WEB1 연습 페이지
- `app/` : 🤍 **Pastel Memories** — 멀리 있는 가족과 함께 보는 아이 사진 앨범 (React + TypeScript)
- `supabase/` : 데이터베이스 설정(`schema.sql`)과 구글 드라이브 서버 기능(`functions/drive`)

앱 주소: **https://makerskim.github.io/web1/album/**

---

# Pastel Memories 설정 순서

처음 한 번만 하면 돼요. 순서대로 따라 해 주세요.

## 0. 예전 시험용 데이터 지우기 (한 번만)

v1(익명 로그인)으로 만든 앨범은 새 로그인과 연결되지 않아요.

1. Supabase → **SQL Editor** → 아래 한 줄 실행
   ```sql
   delete from public.families;
   ```
2. (선택) **Storage → photos** 에서 남은 폴더를 선택해 지우면 공간이 비워져요.

## 1. 데이터베이스 설정

Supabase → **SQL Editor → New query** → [`supabase/schema.sql`](supabase/schema.sql) 내용을 **전부** 붙여넣고 **Run**.
(GitHub에서 파일을 열고 오른쪽 위 복사 버튼 → 붙여넣기. 마지막 줄이 `photos_delete` 정책인지 확인)

- 결과에 **Success. No rows returned** 가 나오면 성공이에요.
- 중간에 오류가 나면 그 실행 전체가 취소돼요. 고친 파일로 다시 실행하면 돼요 (여러 번 실행해도 안전).
- `members_avatar_check ... violated by some row` 오류가 났었다면: 예전 v1 가족의 이모지 얼굴 때문이었어요. 지금 파일은 그걸 자동으로 비우니 **최신 파일을 다시 복사**해서 실행하세요.

## 2. 주소 설정 (Supabase)

**Authentication → URL Configuration**
- **Site URL**: `https://makerskim.github.io/web1/album/`
- **Redirect URLs**에 추가: `https://makerskim.github.io/web1/album/**`

## 3. 카카오 로그인

1. [Kakao Developers](https://developers.kakao.com) → 로그인 → **내 애플리케이션 → 애플리케이션 추가하기** (앱 이름: Pastel Memories)
2. **앱 설정 → 플랫폼 → Web 플랫폼 등록** → 사이트 도메인: `https://makerskim.github.io`
3. **제품 설정 → 카카오 로그인** → **활성화 설정 ON**
   - **Redirect URI**: `https://nontwyuhvjizyuconxej.supabase.co/auth/v1/callback`
4. **카카오 로그인 → 동의항목**: `닉네임`, `프로필 사진`을 **필수 동의**로 설정
   - `카카오계정(이메일)`은 비즈 앱에서만 받을 수 있어요. 받지 않으려면 Supabase의 Kakao 설정에서 **Allow users without an email**을 켜 주세요.
5. **제품 설정 → 카카오 로그인 → 보안** → **Client Secret 코드 생성** → 활성화 상태 **사용함**
6. Supabase → **Authentication → Sign In / Providers → Kakao** → 켜기
   - **REST API Key** (Kakao 앱 키 화면) → *Client ID* 칸에
   - **Client Secret 코드** → *Client Secret* 칸에 → **Save**

## 4. 구글 로그인

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 (이름: Pastel Memories)
2. **API 및 서비스 → OAuth 동의 화면** → 외부(External) → 앱 이름·이메일 입력 → 저장
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 유형 **웹 애플리케이션**
   - **승인된 JavaScript 원본**: `https://makerskim.github.io`
   - **승인된 리디렉션 URI**: `https://nontwyuhvjizyuconxej.supabase.co/auth/v1/callback`
4. 만들어진 **클라이언트 ID / 클라이언트 보안 비밀번호**를 Supabase → **Providers → Google**에 붙여넣고 켜기 → Save
5. OAuth 동의 화면에서 **앱 게시(프로덕션으로 푸시)** — 테스트 상태로 두면 등록한 테스트 사용자만 로그인할 수 있어요.

## 5. 앱 올리기 (GitHub)

1. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꾸기 (처음 한 번만)
2. https://github.com/makerskim/web1/compare/master...claude/nifty-hopper-2vokua 열기 → **Create pull request** → 한 번 더 **Create pull request** → **Merge pull request** → **Confirm merge**
3. **Actions** 탭에서 *Deploy site* 가 초록색 ✓ 이 되면 끝 (1~2분)
   - 1번보다 먼저 합쳤다면: **Actions → Deploy site → Run workflow → Run workflow** 로 한 번 다시 실행
4. 휴대폰으로 **https://makerskim.github.io/web1/album/** 열기 → 카카오나 구글로 시작 → 앨범 만들기 → 가족 초대

> 이후로는 `master`에 합칠 때마다 자동으로 다시 빌드되고 올라가요.

## 6. (선택) 사진을 구글 드라이브에 저장하기

앨범 관리자의 구글 드라이브(무료 15GB)에 사진을 모을 수 있어요. 앨범마다 **설정 → 사진 저장 위치**에서 고를 수 있고, 사진은 드라이브의 `Pastel Memories · 앨범이름` 폴더에 **비공개**로 저장돼요. 가족은 앱 안에서만 볼 수 있고, 저장은 각자 휴대폰에 돼요.

1. Google Cloud Console(4번과 같은 프로젝트) → **API 및 서비스 → 라이브러리 → Google Drive API → 사용**
2. **OAuth 동의 화면 → 데이터 액세스(범위) → 범위 추가** → `.../auth/drive.file` 추가 → 저장
   - `drive.file`은 앱이 만든 파일만 다루는 권한이라 구글 심사 없이 쓸 수 있어요. 앱은 꼭 **게시(프로덕션)** 상태여야 해요 (테스트 상태면 7일마다 연결이 끊겨요).
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**
   - 함수 이름: `drive`
   - [`supabase/functions/drive/index.ts`](supabase/functions/drive/index.ts) 내용을 전부 붙여넣고 **Deploy**
   - 함수의 **Details(설정)** 에서 **Verify JWT (JWT 확인)** 를 **끄기** — 함수 안에서 로그인한 가족인지 직접 확인해요
4. Supabase → **Edge Functions → Secrets** 에 두 개 추가
   - `GOOGLE_CLIENT_ID` = 4번의 클라이언트 ID
   - `GOOGLE_CLIENT_SECRET` = 4번의 클라이언트 보안 비밀번호
5. GitHub에서 [`app/src/lib/config.ts`](app/src/lib/config.ts) → `googleClientId: ''` 에 클라이언트 ID 넣고 저장 (자동으로 다시 올라가요)
6. 앱 → **가족 → ⚙ 설정 → 사진 저장 위치 → 구글 드라이브 연결** → 구글 계정 고르기 → 허용

## 무료로 얼마나?

- Supabase 무료 저장공간 **1GB**: 원본까지 올리면 약 250~400장, 원본 없이 3,000장 이상
- 구글 드라이브: 관리자의 드라이브 공간(무료 15GB)만큼
- 7일 동안 아무도 앱을 쓰지 않으면 Supabase 프로젝트가 잠시 멈춰요. 대시보드에서 **Restore**를 누르면 다시 켜져요.

## 문제 해결

| 증상 | 해결 |
|---|---|
| “이 로그인 방법이 아직 켜져 있지 않아요” | 3·4번 Providers 설정 확인 |
| 로그인 후 다시 첫 화면으로 와요 | 2번 Redirect URLs 확인 |
| 카카오톡 안에서 구글 로그인이 안 돼요 | 구글이 카카오톡 안 브라우저를 막아요. 버튼을 누르면 휴대폰 브라우저로 열려요 |
| “데이터베이스 설정이 아직 안 되어 있어요” | 1번 다시 실행 |
| 드라이브 연결 버튼이 회색이에요 | 6-5번 `googleClientId` 확인 |
| “구글 드라이브 기능이 아직 설정되지 않았어요” | 6-3·6-4번 확인 |

## 개발

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 검사 + app/dist 에 빌드
```

- 화면: `app/src/screens` · 공통 부품: `app/src/components` · 데이터: `app/src/lib` · 사진 편집기: `app/src/editor`
- 디자인 규칙(색·글자 크기·간격·모서리·움직임)은 모두 `app/src/styles/tokens.css` 에 있어요.
