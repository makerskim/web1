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

Supabase 왼쪽 메뉴 **Authentication → URL Configuration**
1. **Site URL**: `https://makerskim.github.io/web1/album/` → **Save changes**
2. **Redirect URLs → Add URL**: `https://makerskim.github.io/web1/album/**` → **Save URLs**

## 3. 카카오 로그인

카카오 개발자 사이트는 2025년 12월에 메뉴가 바뀌었어요. 아래는 바뀐 메뉴 기준이에요.
앱이 카카오에 **닉네임·프로필 사진만** 요청하도록 만들어 두어서, 이메일 동의항목이나 비즈 앱 전환은 **필요 없어요**.

1. [Kakao Developers](https://developers.kakao.com) → 오른쪽 위 **로그인** → 위쪽 메뉴 **앱** → **앱 생성**
   - 앱 이름 `Pastel Memories`, 회사명은 내 이름, 카테고리 아무거나, 대표 도메인 `https://makerskim.github.io` → 운영정책 동의 → **저장**
2. 만든 앱 → 왼쪽 **앱 → 플랫폼 키** → **REST API 키** 값을 복사해 두기 (JavaScript 키 아님)
3. 같은 화면에서 그 **REST API 키를 눌러** 수정 화면 열기
   - **카카오 로그인 리다이렉트 URI**: `https://nontwyuhvjizyuconxej.supabase.co/auth/v1/callback` → **저장**
   - **카카오 로그인 클라이언트 시크릿** 코드 복사 (상태가 켜져 있는지 확인)
4. 왼쪽 **제품 설정 → 카카오 로그인 → 일반** → **사용 설정 상태 ON**
5. **제품 설정 → 카카오 로그인 → 동의항목**
   - **닉네임** → 설정 → 필수 동의, 동의 목적 `가족 앨범에 이름 표시` → 저장
   - **프로필 사진** → 설정 → 선택 동의(또는 필수), 동의 목적 `가족 앨범 프로필 사진` → 저장
   - 카카오계정(이메일)은 **그대로 두세요** (권한 없음이어도 괜찮아요)
6. Supabase → **Authentication → Sign In / Providers → Kakao**
   - **Kakao enabled** 켜기
   - **REST API Key** ← 2번의 REST API 키
   - **Client Secret Code** ← 3번의 클라이언트 시크릿
   - **Allow users without an email** 켜기 (꼭!)
   - **Save**

## 4. 구글 로그인

구글 클라우드는 'OAuth 동의 화면'이 **Google 인증 플랫폼**으로 바뀌었어요.

1. [Google Cloud Console](https://console.cloud.google.com) → 위쪽 프로젝트 선택 → **새 프로젝트** (이름 `Pastel Memories`) → 만들기 → 그 프로젝트가 선택됐는지 확인
2. ☰ 메뉴 → **Google 인증 플랫폼** (바로가기: `console.cloud.google.com/auth/overview`) → **시작하기**
   - 앱 이름 `Pastel Memories`, 사용자 지원 이메일 = 내 Gmail → 다음
   - 대상 **외부** → 다음 → 연락처 이메일 → 다음 → 정책 동의 → **만들기**
   - 앱 로고는 **올리지 마세요** (로고를 올리면 구글 심사가 필요해져요)
3. 왼쪽 **클라이언트 → + 클라이언트 만들기**
   - 애플리케이션 유형 **웹 애플리케이션**
   - **승인된 JavaScript 원본**: `https://makerskim.github.io` (끝에 / 없이)
   - **승인된 리디렉션 URI**: `https://nontwyuhvjizyuconxej.supabase.co/auth/v1/callback`
   - **만들기** → 나오는 **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 **바로 복사** (창을 닫으면 비밀번호는 다시 볼 수 없어요)
4. 왼쪽 **대상 → 앱 게시 → 확인** (게시 상태가 '프로덕션 단계'가 되면 OK)
   - 안 하면 등록한 테스트 사용자만 로그인할 수 있어요. 기본 정보만 쓰므로 심사는 필요 없어요.
5. Supabase → **Authentication → Sign In / Providers → Google**
   - **Enable Sign in with Google** 켜기
   - **Client IDs** ← 클라이언트 ID, **Client Secret (for OAuth)** ← 보안 비밀번호 → **Save**
6. 구글 로그인 화면에 `nontwyuhvjizyuconxej.supabase.co(으)로 이동`이라고 보이는 건 정상이에요.

## 5. 앱 올리기 (GitHub)

1. 저장소 **Settings → Pages → Build and deployment → Source** 가 **GitHub Actions** 인지 확인 (아니면 바꾸기 — 저장 버튼 없이 바로 적용돼요)
2. https://github.com/makerskim/web1/compare/master...claude/nifty-hopper-2vokua 열기 → 초록 **Create pull request** → 한 번 더 **Create pull request** → 맨 아래 **Merge pull request** → **Confirm merge**
   - 'Squash and merge'로 보이면 옆 화살표에서 **Create a merge commit**을 고르세요
   - 'Delete branch' 버튼은 누르지 마세요
3. **Actions** 탭 → *Deploy site* 의 두 단계(build, deploy)가 초록색 ✓ 이 되면 끝 (1~2분)
   - 다시 올리고 싶을 때: **Actions → Deploy site → Run workflow** → Branch는 **master** → **Run workflow**
4. 휴대폰으로 **https://makerskim.github.io/web1/album/** 열기 → 카카오나 구글로 로그인 → 앨범 만들기 → 가족 초대

> 이후로는 `master`에 합칠 때마다 자동으로 다시 빌드되고 올라가요.
> 업데이트에 `supabase/schema.sql` 이 바뀌었으면 합친 뒤 **1번(데이터베이스 설정)을 한 번 더** 실행하세요. 여러 번 실행해도 안전하고, 사진·앨범은 그대로예요.

## 6. (선택) 사진을 구글 드라이브에 저장하기

앨범 관리자의 구글 드라이브(무료 15GB)에 사진을 모을 수 있어요. 앨범마다 **설정 → 앨범 설정 → 사진 저장 위치**에서 고를 수 있고, 사진은 드라이브의 `Pastel Memories · 앨범이름` 폴더에 **비공개**로 저장돼요. 가족은 앱 안에서만 볼 수 있고, 내려받으면 각자 휴대폰에 저장돼요.

1. Google Cloud Console(4번과 같은 프로젝트) → **API 및 서비스 → 라이브러리** → `Google Drive API` 검색 → **사용**
2. **Google 인증 플랫폼 → 데이터 액세스 → 범위 추가 또는 삭제** → `.../auth/drive.file` 체크 (목록에 없으면 아래 '직접 범위 추가' 칸에 `https://www.googleapis.com/auth/drive.file` 붙여넣고 **테이블에 추가**) → **업데이트** → **저장**
   - `drive.file`은 앱이 만든 파일만 다루는 권한이라 구글 심사가 필요 없어요. 앱은 꼭 **게시(프로덕션)** 상태여야 해요 (테스트 상태면 7일마다 연결이 끊겨요).
   - 리디렉션 URI는 더 넣을 필요 없어요. 4-3의 **승인된 JavaScript 원본** `https://makerskim.github.io` 만 있으면 돼요.
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**
   - 편집기의 내용을 모두 지우고 [`supabase/functions/drive/index.ts`](supabase/functions/drive/index.ts) 내용을 전부 붙여넣기
   - **Function name**: `drive` → **Deploy function**
4. **Edge Functions → drive → Settings** → **Verify JWT with legacy secret** 끄기 → **Save changes**
   - 함수 안에서 로그인한 가족인지 직접 확인해요
5. **Edge Functions → Secrets → Add new secrets**
   - `GOOGLE_CLIENT_ID` = 4-3의 클라이언트 ID → **Add another**
   - `GOOGLE_CLIENT_SECRET` = 4-3의 보안 비밀번호 → **Bulk save**
6. `app/src/lib/config.ts` 의 `googleClientId: ''` 에 클라이언트 ID가 들어가야 해요. **master에서 직접 고치지 말고** 저에게 클라이언트 ID를 알려 주시면 브랜치에 넣어 드릴게요 (직접 고치면 다음 합치기에서 충돌이 날 수 있어요).
7. 합치고 배포가 끝나면, 앱(크롬·사파리에서. 카카오톡 안 브라우저는 안 돼요) → **가족 → ⚙ 설정 → 앨범 설정 → 사진 저장 위치 → 구글 드라이브 연결** → 구글 계정 고르기 → 허용

## 무료로 얼마나?

- Supabase 무료 저장공간 **1GB**: 사진은 언제나 원본과 함께 저장돼서 약 250~400장 (휴대폰 사진 크기에 따라 달라요). 더 많이 올리려면 6번의 구글 드라이브를 연결하세요.
- 구글 드라이브: 관리자의 드라이브 공간(무료 15GB)만큼
- 7일 동안 아무도 앱을 쓰지 않으면 Supabase 프로젝트가 잠시 멈춰요. 대시보드에서 **Restore**를 누르면 다시 켜져요.

## 문제 해결

| 증상 | 해결 |
|---|---|
| “이 로그인 방법이 아직 켜져 있지 않아요” | 3-6 · 4-5번 Providers 설정 확인 |
| 카카오 **KOE006** | 3-3 리다이렉트 URI가 2번과 **같은 REST API 키**에 정확히 들어갔는지 |
| 카카오 **KOE010** | 3-3 · 3-6번: Client Secret Code가 같은 REST API 키의 시크릿인지 |
| 카카오 **KOE101** | 3-6번: REST API Key 칸에 JavaScript 키를 넣지 않았는지 |
| 카카오 **KOE004** | 3-4번: 사용 설정 ON |
| 카카오 **KOE205** | 3-5번: 닉네임·프로필 사진 동의항목이 '사용 안 함'이 아닌지 |
| 카카오 로그인 후 “Error getting user email” | 3-6번: **Allow users without an email** 켜기 |
| 구글 **redirect_uri_mismatch** | 4-3 승인된 리디렉션 URI 확인 (JavaScript 원본 칸이 아니에요) |
| 로그인 후 다시 첫 화면으로 와요 | 2번 Redirect URLs 확인 |
| 카카오톡 안에서 구글 로그인이 안 돼요 | 구글이 카카오톡 안 브라우저를 막아요. 버튼을 누르면 휴대폰 브라우저로 열려요 |
| “새 데이터베이스 설정이 필요해요” · “데이터베이스 설정이 아직 안 되어 있어요” | 1번 다시 실행 (최신 `schema.sql` 전체를 붙여넣기) |
| 드라이브 연결 버튼이 회색이에요 | 6-6번 `googleClientId` 확인 |
| “구글 드라이브 기능이 아직 설정되지 않았어요” | 6-3 ~ 6-5번 확인 |
| 드라이브 연결 창에 **origin_mismatch** | 4-3 승인된 JavaScript 원본이 `https://makerskim.github.io` (경로·끝 / 없이) 인지 |

## 개발

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 검사 + app/dist 에 빌드
```

- 화면: `app/src/screens` · 공통 부품: `app/src/components` · 데이터: `app/src/lib` (사진 올리기 준비: `app/src/lib/photo.ts`)
- 디자인 규칙(색·글자 크기·간격·모서리·움직임)은 모두 `app/src/styles/tokens.css` 에 있어요.
