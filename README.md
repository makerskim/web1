# web1

- `index.html`, `1.html` ~ `3.html` : 생활코딩 WEB1 연습 페이지
- `app/` : 🤍 **Pastel Memories** — 멀리 있는 가족과 함께 보는 아이 사진 앨범 (React + TypeScript)
- `supabase/` : 데이터베이스 설정(`schema.sql`)과 구글 드라이브 서버 기능(`functions/drive`)

앱 주소: **https://makerskim.github.io/web1/album/**

> **어디에 무엇이 저장되나요?**
> - **사진·동영상**: 올린 사람의 **구글 드라이브** `Pastel Memories › 앨범이름` 폴더 (각자 무료 15GB)
> - **로그인·앨범·글·댓글·좋아요**: Supabase (무료). 카카오 로그인과 '누가 어느 앨범의 멤버인지'를 지켜 주는 곳이라 꼭 필요해요. 사진 파일은 저장하지 않아요.
> - **올리기**는 구글 로그인을 한 사람만 할 수 있어요. 카카오로 로그인한 가족은 보기·좋아요·댓글을 하고, **+** 를 누르면 '구글 로그인이 필요해요 (예/아니요)'가 나와요.

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

## 4. 구글 로그인 (Google Cloud · 한 번만)

여기서 만드는 **클라이언트 ID·보안 비밀번호 한 쌍**을 두 곳에 넣어요: Supabase 구글 로그인(4-6)과 서버 기능 비밀값(6-6).
두 곳이 **같은 값**이어야 구글로 앱에 로그인할 때 내 구글 드라이브도 함께 연결돼요.

> **왜 이걸 해야 하나요?**
> 구글은 다른 앱이 내 구글 계정을 쓰려면, 그 앱을 구글에 미리 등록하게 해요. 등록할 것은 세 가지예요.
> - **클라이언트** = 구글이 이 앱을 알아보는 **신분증** (클라이언트 ID + 보안 비밀번호). 없으면 구글 로그인 창이 열리지 않아요.
> - **데이터 액세스 `drive.file`** = "이 앱은 **자기가 만든 파일만** 만질게요"라는 약속. 그래서 드라이브의 다른 사진·문서는 앱이 볼 수 없어요.
> - **대상: 외부 + 프로덕션** = "구글 계정(Gmail)이 있는 사람은 **누구나** 로그인할 수 있어요". '내부'면 같은 회사 사람만, '테스트'면 등록한 사람만 로그인돼요.

### 4-1. 계정·프로젝트 확인
1. [Google Cloud Console](https://console.cloud.google.com) → 오른쪽 위 동그란 계정 사진을 눌러 **개인 Gmail 계정**인지 확인해요.
   - 회사·학교 계정이면 **계정 전환**으로 개인 Gmail 계정을 골라요.
2. 맨 위 프로젝트 이름을 눌러요.
   - `Pastel Memories` 가 있으면 그걸 골라요.
   - 없으면 **새 프로젝트** → 이름 `Pastel Memories` → (위치/조직 칸이 보이면 **조직 없음**) → **만들기** → 알림에서 **프로젝트 선택**
3. 맨 위에 `Pastel Memories` 가 보이는지 다시 확인해요. 아래 단계는 모두 이 프로젝트에서 해요.

### 4-2. Google 인증 플랫폼 시작하기 (앱 이름 · 대상)
1. ☰ 메뉴 → **Google 인증 플랫폼** (바로가기: `console.cloud.google.com/auth/overview`)
   - **시작하기** 버튼이 보이면 눌러요. 이미 했으면 '개요' 화면이 보여요 → 아래 '내부' 확인만 하고 4-3으로.
2. **앱 정보**: 앱 이름 `Pastel Memories`, 사용자 지원 이메일 = 내 Gmail → **다음**
3. **대상**: **외부** → **다음**
4. **연락처 정보**: 내 Gmail → **다음** → 정책 동의 체크 → **계속** → **만들기**
5. 앱 로고는 **올리지 마세요** (로고를 올리면 구글 심사가 필요해져요)

> **왼쪽 '대상'에 사용자 유형이 '내부'로 되어 있다면**
> - '내부'는 **회사·학교 구글 계정(조직)으로 만든 프로젝트**에서만 생겨요. 그 조직 계정만 로그인할 수 있어서, 가족의 Gmail 계정은 `액세스 차단됨 (org_internal)` 오류가 나요.
> - '내부'에는 '테스트 / 프로덕션' 게시 상태가 없어서 **앱 게시** 버튼도 보이지 않아요.
> - **고치는 방법 1 (추천)**: 4-1로 돌아가 **개인 Gmail 계정**으로 새 프로젝트를 만들고 4-2부터 다시 해요. 회사 계정을 정리해도 앱이 멈추지 않아요.
> - **고치는 방법 2**: **대상** 화면에서 사용자 유형 옆 **외부로 전환**(영어 화면은 *Make external*) → 게시 상태 **프로덕션 단계** → **확인**. 버튼이 없거나 회사 정책으로 막혀 있으면 방법 1로 해요.

### 4-3. 클라이언트 만들기 (왼쪽 '클라이언트' 화면이 비어 있으면 여기부터)
1. 왼쪽 **클라이언트** → **+ 클라이언트 만들기**
2. **애플리케이션 유형**: **웹 애플리케이션** · 이름: `Pastel Memories 웹`
3. **승인된 JavaScript 원본** → **+ URI 추가** → `https://makerskim.github.io`
   - 끝에 `/`나 `/web1/album` 을 붙이지 않아요.
4. **승인된 리디렉션 URI** → **+ URI 추가** → `https://nontwyuhvjizyuconxej.supabase.co/auth/v1/callback`
5. **만들기** → 뜨는 창의 **클라이언트 ID**(`...apps.googleusercontent.com`)와 **클라이언트 보안 비밀번호**(`GOCSPX-...`)를 메모장에 복사해요.
   - 보안 비밀번호는 **이 창에서만** 보여요. 놓쳤으면 목록에서 클라이언트를 눌러 **Add secret(보안 비밀번호 추가)** 로 새로 만들어요.
6. 목록에 `Pastel Memories 웹` 이 보이면 끝이에요. 실제로 쓰이기까지 몇 분 걸릴 수 있어요.

### 4-4. 데이터 액세스: 드라이브 권한 추가
1. 왼쪽 **데이터 액세스** → **범위 추가 또는 삭제**
2. 오른쪽에 열린 표에서 `.../auth/drive.file` 줄을 체크해요.
   - 목록에 없으면 아래 **직접 범위 추가** 칸에 `https://www.googleapis.com/auth/drive.file` 을 붙여넣고 **테이블에 추가**
3. **업데이트** → 화면 아래 **저장**
   - `drive.file`은 구글 분류로 '민감하지 않음'이라 **구글 심사가 필요 없어요**.

### 4-5. 대상: 앱 게시 (프로덕션)
1. 왼쪽 **대상** → 사용자 유형이 **외부**인지 확인 ('내부'면 4-2 아래 상자대로)
2. 게시 상태가 **테스트 중**이면 **앱 게시** → **확인** → **프로덕션 단계**가 되면 OK
   - 테스트 상태로 두면 '테스트 사용자'로 등록한 사람만 로그인되고, 드라이브 연결도 **7일마다 끊겨요**.
   - 이 앱은 이름·이메일·프로필 사진과 `drive.file`만 써서 심사 없이 바로 게시돼요.

### 4-6. Supabase에 넣기
1. Supabase → **Authentication → Sign In / Providers → Google**
2. **Enable Sign in with Google** 켜기
3. **Client IDs** ← 4-3의 클라이언트 ID, **Client Secret (for OAuth)** ← 4-3의 보안 비밀번호 → **Save**
4. 구글 로그인 화면에 `nontwyuhvjizyuconxej.supabase.co(으)로 이동`이라고 보이는 건 정상이에요.

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

## 6. 구글 드라이브 준비 (필수 · 앱을 만든 분이 한 번만)

사진·동영상은 **올린 사람의 구글 드라이브**에 저장되고, 앨범 멤버는 앱에서 함께 봐요.

- **폴더**: 각자 드라이브에 `Pastel Memories › 앨범이름` 폴더가 저절로 생겨요.
  - 원본 사진·동영상은 그 폴더에 `2026-10-23 IMG_1234.HEIC` 처럼 찍은 날과 원래 이름으로 저장돼요.
  - 앱이 쓰는 작은 사진은 그 안의 `앱용 작은 사진` 폴더에 들어가요.
- **공유**: 앨범 폴더만 **'링크가 있는 사람 보기'**로 공유돼요.
  - 주소를 아는 사람만 볼 수 있고 검색되지 않아요. 주소는 앱 안에만 있어요.
  - `Pastel Memories` 폴더와 드라이브의 다른 파일은 공유되지 않아요.
- **비용**: **0원**이에요. 구글 로그인, Google Drive API, API 키는 무료이고 결제 계정도 필요 없어요.

아래는 4번에서 쓴 **같은 Google Cloud 프로젝트**에서 해요 (맨 위 프로젝트 이름 확인). 앱 코드는 고치지 않아요.

### 6-1. Google Drive API 켜기
1. [Google Cloud Console](https://console.cloud.google.com) → 맨 위 프로젝트 이름이 `Pastel Memories` 인지 확인
2. ☰ 메뉴 → **API 및 서비스 → 라이브러리**
3. 검색창에 `Google Drive API` → 결과에서 **Google Drive API** 누르기 → 파란 **사용** 버튼
   - 이미 켜져 있으면 **관리** 버튼이 보여요. 그대로 두면 돼요.

### 6-2. 드라이브 권한 · 앱 게시 확인
4-4(데이터 액세스에 `drive.file`)와 4-5(대상: 외부 · 프로덕션 단계)를 했는지 확인해요. 4번을 아직 안 했으면 4번부터 해요.
- 왼쪽 **대상**에 '내부'가 보이면 4-2 아래 상자를 보세요.
- 왼쪽 **클라이언트**가 비어 있으면 4-3을 해요. 클라이언트가 없으면 구글 로그인 창이 열리지 않아요.

### 6-3. API 키 만들기 (가족이 공유된 사진을 앱에서 볼 때 써요)
1. ☰ 메뉴 → **API 및 서비스 → 사용자 인증 정보**
2. 위쪽 **+ 사용자 인증 정보 만들기 → API 키**를 누르면 키가 만들어져요. 창을 닫지 말고 아래처럼 제한을 걸어요.
   - 창이 닫혔으면 목록의 **API 키** 줄 오른쪽 **⋮ → API 키 수정(연필)**
3. **애플리케이션 제한사항** → **웹사이트** 선택 → **웹사이트 제한사항 → 추가** → `https://makerskim.github.io/*` → **완료**
4. **API 제한사항** → **키 제한** → 드롭다운에서 **Google Drive API**만 체크 → **확인**
5. **저장** → 키 값(`AIza`로 시작)을 **복사**해 두세요 (6-6에서 써요)

### 6-4. 서버 기능 `drive` 올리기 (Supabase)
1. GitHub에서 [`supabase/functions/drive/index.ts`](supabase/functions/drive/index.ts) 를 열고 오른쪽 위 **복사(Copy raw file)** 버튼
2. Supabase → 왼쪽 **Edge Functions**
   - **처음이면**: **Deploy a new function → Via Editor** → 편집기의 내용을 모두 지우고 붙여넣기
     - 아래 **Function name** 칸에 미리 들어 있는 이름(예: `swift-endpoint`)을 지우고 영어로 `drive` 입력 → 그다음에 **Deploy function**
     - ⚠ 이 칸은 **처음 만들 때만** 주소가 돼요. 먼저 만든 뒤 Details에서 이름만 `drive`로 바꾸면, 화면의 이름만 바뀌고 주소는 `.../functions/v1/swift-endpoint` 그대로라 앱이 찾지 못해요. 그때는 그 함수를 지우고 새로 만들어요.
   - **이미 `drive`가 있으면**: **drive → Code** 탭 → 내용을 모두 지우고 붙여넣기 → **Deploy updates**
     - 업데이트가 있을 때마다 이렇게 새 코드로 바꿔 주세요. 이번 업데이트에도 꼭 해 주세요.
3. **맞는 곳에 올라갔는지 확인** (`NOT_FOUND`가 나오면 여기가 문제예요)
   - Supabase 화면 주소창에 `project/nontwyuhvjizyuconxej` 가 들어 있어야 해요. 다른 글자면 **다른 프로젝트**에 올린 거예요.
     - 바로가기: `https://supabase.com/dashboard/project/nontwyuhvjizyuconxej/functions` 를 열면 앱이 쓰는 프로젝트의 함수 목록이 나와요.
   - 그 목록에 **`drive`** 가 있어야 해요. 눌러서 나오는 **Endpoint URL**(또는 URL)이 `https://nontwyuhvjizyuconxej.supabase.co/functions/v1/drive` 로 끝나야 해요.
     - `swift-endpoint`, `hello-world` 처럼 주소 끝이 `drive`가 아니면(목록의 이름이 `drive`여도) 앱이 찾지 못해요. 그 함수를 지우고 위 '처음이면'대로 `drive`로 새로 만들어요. 비밀값(6-6)은 프로젝트 전체에 들어 있어서 다시 넣지 않아도 돼요.
   - 주소창에 `https://nontwyuhvjizyuconxej.supabase.co/functions/v1/drive/config` 를 열어 `{"error":"not_signed_in"}` 이 나오면 성공이에요 (6-5까지 한 뒤).

### 6-5. Verify JWT 끄기
1. **Edge Functions → drive → Settings**
2. **Verify JWT with legacy secret** 스위치 끄기 → **Save changes**
   - 로그인한 가족인지는 서버 기능 안에서 직접 확인해요.

### 6-6. 비밀값 넣기 (값 3개를 구해서 Supabase에 넣어요)

'비밀값'은 서버 기능(drive)만 볼 수 있는 메모예요. 앱 코드에는 들어가지 않아서 다른 사람에게 보이지 않아요.
먼저 **메모장**(휴대폰 메모 앱도 OK)을 하나 열어 두고, 아래 ①②③ 값을 차례로 복사해 붙여 두세요.

**① `GOOGLE_CLIENT_ID` (클라이언트 ID) 구하기**
1. [console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients) 열기 (맨 위 프로젝트가 `Pastel Memories` 인지 확인)
2. 목록의 `Pastel Memories 웹`(4-3에서 만든 것) 이름을 눌러요.
3. 오른쪽(또는 위쪽)의 **클라이언트 ID** 옆 **복사 아이콘(겹친 네모)** → 메모장에 붙여넣기
   - 모양: `123456789012-abc...xyz.apps.googleusercontent.com` (숫자-글자 뒤에 `.apps.googleusercontent.com`)

**② `GOOGLE_CLIENT_SECRET` (클라이언트 보안 비밀번호) 구하기**
- 4-3에서 클라이언트를 만들 때 복사해 둔 `GOCSPX-` 로 시작하는 값이에요.
- 복사해 둔 게 없으면 (구글은 만든 뒤에 다시 보여 주지 않아요):
  1. ①의 같은 클라이언트 화면에서 **클라이언트 보안 비밀번호** 칸 → **+ Add secret** (보안 비밀번호 추가)
  2. 새로 생긴 `GOCSPX-...` 옆 **복사 아이콘** → 메모장에 붙여넣기
  3. 새로 만들었으면 **4-6(Supabase → Google)의 Client Secret 칸도 이 새 값으로** 바꾸고 Save 해요. 두 곳을 같은 값으로 맞춰 두면 헷갈리지 않아요.

**③ `GOOGLE_API_KEY` (API 키) 구하기**
1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) 열기
2. **API 키** 칸에서 6-3에서 만든 키 줄의 **키 표시**(Show key)를 누르거나, 줄 끝 복사 아이콘을 눌러요.
3. `AIza` 로 시작하는 39글자 → 메모장에 붙여넣기
   - 키가 없으면 6-3을 먼저 해요.

**④ Supabase에 넣기**
1. [supabase.com/dashboard](https://supabase.com/dashboard) → 내 프로젝트 → 왼쪽 메뉴 **Edge Functions** → **Secrets**
   - 바로가기: `https://supabase.com/dashboard/project/nontwyuhvjizyuconxej/functions/secrets`
2. 위쪽 **Add or replace secrets** 칸 (화면에 따라 버튼 이름이 조금 다를 수 있어요)
   - 첫 줄 **Name**: `GOOGLE_CLIENT_ID` · **Value**: ①의 값
   - **Add another** → **Name**: `GOOGLE_CLIENT_SECRET` · **Value**: ②의 값
   - **Add another** → **Name**: `GOOGLE_API_KEY` · **Value**: ③의 값
3. **Save** (또는 **Bulk save**)
4. 아래 목록에 세 이름이 보이면 끝이에요. 값은 보안 때문에 다시 보이지 않고 이상한 글자(요약값)로 보여요. 정상이에요.
   - 저장하면 바로 적용돼요. 함수를 다시 배포할 필요 없어요.
   - 목록에 원래 있던 `SUPABASE_...` 들은 Supabase가 넣은 거예요. 건드리지 마세요.

**자주 하는 실수**
- 이름은 **대문자와 밑줄(_)** 그대로: `GOOGLE_CLIENT_ID` (띄어쓰기·소문자 안 돼요). 복사해서 붙여넣는 게 가장 안전해요.
- 값 앞뒤에 **빈칸이나 따옴표**가 들어가지 않게 해요.
- ①과 ②는 **같은 클라이언트**(`Pastel Memories 웹`)의 값이어야 하고, 4-6에 넣은 것과 같아야 해요.
- 잘못 넣었으면 같은 이름으로 다시 넣고 Save 하면 바뀌어요.

**제대로 됐는지 확인**: 앱 → 가족 탭 → ⚙ 설정 → **내 구글 드라이브**
- **구글 로그인** 버튼이 보이면 OK예요.
- '아직 준비 중이에요 · 비밀값 ○○이 아직 없어요'가 보이면 그 이름을 다시 확인하고 **다시 확인**을 눌러요.

### 6-7. 1번(데이터베이스 설정)을 한 번 더
이번 업데이트에서 `schema.sql`이 바뀌었어요. **SQL Editor**에서 최신 파일 전체를 다시 실행해요.
- 이제 Supabase 저장소에는 새 사진이 올라가지 않아요.
- 예전에 올린 사진은 그대로 보여요.

### 6-8. 구글 로그인하고 첫 사진 올리기 (나부터)
**크롬이나 사파리**에서 앱을 열어요. 카카오톡 안 브라우저에서는 구글 창이 열리지 않아요.

**방법 A. + 버튼에서 (카카오로 로그인했어도 똑같아요)**
1. 아래 가운데 **+** 를 눌러요.
2. '**사진을 올리기 위해서는 구글 로그인이 필요해요**' 창 → **예** (아니요를 누르면 그냥 돌아가요)
3. 구글 창에서 사진을 저장할 **구글 계정**을 골라요. (구글로 앱에 로그인한 분은 그 계정으로 바로 넘어가요)
4. 'Pastel Memories에서 Google 계정에 액세스하려고 합니다' 화면
   - **Google Drive** 항목(이 앱에서 사용하는 Drive 파일 보기·수정·생성·삭제)에 **체크** → **계속**
5. 앱에 '**구글 로그인이 됐어요**'가 나오면 내 드라이브에 폴더가 이미 만들어진 거예요 → **사진 고르기**로 바로 올려요.

**방법 B. 처음부터 구글로 앱에 로그인**
- 첫 화면에서 **Google 로그인** → 구글 화면에서 **Google Drive** 항목도 체크 → **계속**
- 따로 연결하지 않아도 폴더가 바로 생기고, **+** 를 누르면 바로 사진을 골라요.
- Google Drive 항목을 체크하지 않았으면 + 를 누를 때 방법 A처럼 한 번 물어봐요.

**내 드라이브에는 이렇게 생겨요**
```
내 드라이브
└─ Pastel Memories                 ← 구글 로그인하면 바로 생겨요 (공유 안 됨)
   ├─ 씩씩이네 앨범                 ← 내가 들어 있는 앨범마다 하나씩 (링크가 있는 사람 보기)
   │   ├─ 2026-10-23 IMG_1234.HEIC  ← 원본 사진·동영상 (찍은 날 + 원래 이름)
   │   └─ 앱용 작은 사진             ← 앱 화면에 빨리 보이는 작은 사진
   └─ 우리 가족
       └─ ...
```
- 사진을 올리면 내 앨범 폴더에 저장되면서 **바로 앱에 올라와요**. 앨범 멤버는 앱에서 보고 내려받아요.
- 나중에 새로 들어간 앨범은 그 앨범에 처음 올릴 때 폴더가 생겨요.
- **설정 → 내 구글 드라이브**에서 로그인된 계정 확인, **드라이브에서 폴더 열기**, 다른 계정으로 바꾸기, 구글 로그아웃을 할 수 있어요.

> 아이폰 **홈 화면 앱**에서 구글 창이 안 열리면, **사파리**에서 앱 주소를 열고 한 번 구글 로그인하세요. 그다음에는 홈 화면 앱에서도 계속 올릴 수 있어요.
> 설정 → 내 구글 드라이브에 '아직 준비 중이에요'와 몇 번을 하라는 안내가 보이면 그 단계를 확인하고 **다시 확인**을 눌러요.

### 6-9. 다른 사람(가족·친구)도 올릴 수 있게 하기
1. 앱에서 **초대하기** → QR을 보여 주거나 **초대 링크 보내기**로 보내요.
2. 받은 사람은 링크를 열거나 QR을 찍어서 **카카오 또는 구글로 로그인** → 초대 코드가 들어간 화면에서 **들어가기**
3. 보기·좋아요·댓글은 바로 할 수 있어요.
4. 사진을 올리고 싶으면 **+** → **예** → 구글 계정 고르기 → **Google Drive** 체크 → **계속** (6-8 방법 A와 같아요. 한 번만 해요)
   - 각자 **자기** 구글 드라이브에 저장돼요. 다른 사람의 드라이브 공간을 쓰지 않아요.
   - 카카오로 로그인한 분도 구글 계정이 있으면 이렇게 하면 돼요. 카카오 로그인은 그대로예요.
5. 아래 **8번**의 안내 글을 가족 대화방에 그대로 보내도 돼요.

> 동영상은 1개 1GB까지 올릴 수 있어요. 큰 파일은 나눠서 올리고, 중간에 끊겨도 이어서 올려요.
> 구글 로그아웃을 하거나 다른 계정으로 바꿔도, 이미 올린 사진은 그 드라이브에 그대로 있고 가족도 계속 볼 수 있어요. 드라이브에서 파일이나 앨범 폴더를 지우면 앱에서도 안 보여요.

## 7. (선택) 알림: 새 사진 · 댓글 · 기념일·추억

1. 1번(데이터베이스 설정)을 **한 번 더** 실행해요 (알림·드라이브 표가 새로 생겨요)
2. 6-4의 서버 기능 `drive`가 새 코드로 배포돼 있으면 새 사진·댓글 알림은 바로 돼요. 알림 서명 키는 서버 기능이 처음에 스스로 만들어요.
3. **매일 아침 9시 알림** (오늘 기념일 · N년 전 오늘 사진)
   - Supabase → **Database → Extensions** → `pg_cron`과 `pg_net`을 찾아 각각 켜기
   - **SQL Editor → New query** → 아래를 붙여넣고 **Run** (한 번만)

```sql
select cron.schedule('pastel-daily', '0 0 * * *', $$
  select net.http_post(
    url := 'https://nontwyuhvjizyuconxej.supabase.co/functions/v1/drive/daily',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select value #>> '{}' from public.app_keys where name = 'cron'))
  )
$$);
```

   - `0 0 * * *` 은 세계 표준시 0시, 한국 시간 오전 9시예요. 같은 내용을 다시 실행해도 하나만 남아요.
4. 각자 휴대폰: **설정 → 알림 → 이 휴대폰에서 알림 받기** 켜기 → '허용'
   - 아이폰은 **홈 화면에 추가한 앱**에서만 알림을 받을 수 있어요 (iOS 16.4 이상)
   - 받을 알림(새 사진·동영상 / 댓글 / 기념일·추억)을 골라 끌 수 있어요

## 8. 가족에게 보낼 안내 (복사해서 보내세요)

```
🤍 우리 앨범 사용법
1) 초대 링크를 누르거나 QR을 찍어요 → 카카오나 구글로 로그인 → [들어가기]
2) 사진 보기·좋아요·댓글은 바로 할 수 있어요
3) 사진·동영상을 올리고 싶으면 (처음 한 번만):
   아래 가운데 [+] → '구글 로그인이 필요해요' [예]
   → 구글 계정 고르기 → 'Google Drive' 항목 체크 → [계속] → [사진 고르기]
   (사진은 내 구글 드라이브 'Pastel Memories' 폴더에 저장돼요)
4) 아이폰은 사파리에서 열고 [공유 → 홈 화면에 추가]를 하면 앱처럼 쓰고 알림도 받아요
   (구글 로그인은 사파리에서 한 번 해 주세요)
```

## 무료로 얼마나?

- **구글 드라이브**: 각자 자기 드라이브 공간(무료 15GB)만큼 사진·동영상을 올려요. 구글 API 사용료는 없어요.
- **Supabase 무료 요금제**: 돈이 나가지 않아요. 한도를 넘으면 잠시 멈출 뿐이에요.
  - 데이터베이스 500MB: 글·댓글 같은 글자 정보만이라 넉넉해요.
  - Edge Function 한 달 50만 번: 사진을 올릴 때 1번, 알림을 보낼 때 1번씩 써요.
- 7일 동안 아무도 앱을 쓰지 않으면 Supabase 프로젝트가 잠시 멈춰요. 대시보드에서 **Restore**를 누르면 다시 켜져요.

## 문제 해결

| 증상 | 해결 |
|---|---|
| “이 로그인 방법이 아직 켜져 있지 않아요” | 3-6 · 4-6번 Providers 설정 확인 |
| 카카오 **KOE006** | 3-3 리다이렉트 URI가 2번과 **같은 REST API 키**에 정확히 들어갔는지 |
| 카카오 **KOE010** | 3-3 · 3-6번: Client Secret Code가 같은 REST API 키의 시크릿인지 |
| 카카오 **KOE101** | 3-6번: REST API Key 칸에 JavaScript 키를 넣지 않았는지 |
| 카카오 **KOE004** | 3-4번: 사용 설정 ON |
| 카카오 **KOE205** | 3-5번: 닉네임·프로필 사진 동의항목이 '사용 안 함'이 아닌지 |
| 카카오 로그인 후 “Error getting user email” | 3-6번: **Allow users without an email** 켜기 |
| 구글 **redirect_uri_mismatch** | 4-3 승인된 리디렉션 URI 확인 (JavaScript 원본 칸이 아니에요) |
| 구글 **액세스 차단됨 · org_internal** | 대상이 '내부'예요. 4-2 아래 상자대로 개인 Gmail 프로젝트로 하거나 '외부로 전환' |
| 구글 **invalid_client** · 구글 창이 바로 닫혀요 | 4-3 클라이언트가 있는지, 6-6 `GOOGLE_CLIENT_ID`가 그 클라이언트 ID인지 |
| 로그인 후 다시 첫 화면으로 와요 | 2번 Redirect URLs 확인 |
| 카카오톡 안에서 구글 로그인이 안 돼요 | 구글이 카카오톡 안 브라우저를 막아요. 버튼을 누르면 휴대폰 브라우저로 열려요 |
| “새 데이터베이스 설정이 필요해요” · “데이터베이스 설정이 아직 안 되어 있어요” | 1번 다시 실행 (최신 `schema.sql` 전체를 붙여넣기) |
| 설정 → 내 구글 드라이브에 ‘아직 준비 중이에요’ | 카드 아래 안내에 적힌 6번의 단계를 하고 **다시 확인** |
| “서버 기능(drive)에 닿지 않아요” · “예전 코드예요” | 6-4 함수 이름이 정확히 `drive` 인지, 새 코드로 다시 배포했는지 · 6-5 Verify JWT를 껐는지. 앱의 **직접 확인하기**로 아래 세 줄 중 어느 것인지 봐요 |
| 직접 확인에 `NOT_FOUND` (Requested function was not found) | 앱이 쓰는 프로젝트(`nontwyuhvjizyuconxej`)에 `drive` 함수가 없어요. 6-4의 3번(다른 프로젝트·다른 이름인지) 확인 |
| 직접 확인에 `401` · `JWT` | 6-5 Verify JWT 끄기 → Save changes |
| 직접 확인에 `{"error":"not_signed_in"}` | 서버 기능은 정상이에요. 앱에서 **다시 확인** (안 바뀌면 새로고침) |
| “Supabase 비밀값 GOOGLE_API_KEY…이 아직 없어요” | 6-3에서 API 키를 만들고 6-6에 넣기 |
| “GOOGLE_CLIENT_SECRET이 클라이언트 ID와 맞지 않아요” | 6-6 두 값이 **같은 클라이언트**의 것인지 (앞뒤 빈칸 없이) |
| “Google Drive API가 아직 꺼져 있어요” | 6-1번 (켠 뒤 몇 분 걸릴 수 있어요) |
| “‘Google Drive 파일’ 항목에 체크한 뒤…” | 구글 화면에서 드라이브 항목의 체크를 풀었어요. 다시 눌러서 체크하고 계속 |
| “앨범 폴더를 링크로 공유하지 못했어요” | 회사·학교 구글 계정은 링크 공유가 막혀 있을 수 있어요. 개인 Gmail 계정으로 구글 로그인 |
| 드라이브 사진이 회색으로만 보여요 | 6-3 API 키의 웹사이트 제한이 `https://makerskim.github.io/*` 인지, API 제한에 Google Drive API가 있는지 · 올린 사람이 드라이브에서 지우지 않았는지 |
| + 를 누르면 '구글 로그인이 필요해요'가 나와요 | 정상이에요. **예** → 구글 계정 고르기 → Google Drive 체크 → 계속 (6-8). 한 번만 하면 돼요 |
| 구글로 로그인했는데 + 에서 또 물어봐요 | 로그인할 때 Google Drive 항목을 체크하지 않았거나, 4-6과 6-6의 클라이언트가 달라요. **예**를 눌러 한 번 더 하면 돼요 |
| “사진은 구글 드라이브에만 올릴 수 있어요” | 예전 앱 화면이 남아 있어요. 앱을 완전히 닫았다가 다시 열기 |
| “구글 로그인이 풀렸어요” | 구글 계정에서 앱 권한을 없앴거나 만료됐어요. + → 예 로 다시 구글 로그인 (이미 올린 사진은 그대로 보여요) |
| 구글 로그인이 일주일쯤 뒤에 풀려요 · 다른 사람은 구글 로그인이 안 돼요 | 4-5 게시 상태를 **프로덕션 단계**로 바꾼 뒤 다시 구글 로그인 |
| 구글 창에 **origin_mismatch** | 4-3 승인된 JavaScript 원본이 `https://makerskim.github.io` (경로·끝 / 없이) 인지 |
| 아이폰 홈 화면 앱에서 구글 창이 안 열려요 | Safari에서 앱 주소를 열고 한 번만 구글 로그인하면 돼요 |
| 동영상이 재생되지 않아요 | 그 휴대폰이 못 여는 형식이에요. 동영상 아래 **구글 드라이브에서 보기**를 누르면 드라이브가 바꿔서 보여 줘요 |
| 알림이 안 와요 | 설정 → 알림이 켜져 있는지 (아이폰은 홈 화면 앱에서), 휴대폰 설정에서 알림이 허용돼 있는지 |
| 매일 아침 알림만 안 와요 | 7-3 `pg_cron` · `pg_net` 을 켜고 SQL을 실행했는지 (**Integrations → Cron**에서 `pastel-daily` 확인) |

## 개발

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 검사 + app/dist 에 빌드
```

- 화면: `app/src/screens` · 공통 부품: `app/src/components` · 데이터: `app/src/lib` (사진 올리기 준비: `app/src/lib/photo.ts`)
- 디자인 규칙(색·글자 크기·간격·모서리·움직임)은 모두 `app/src/styles/tokens.css` 에 있어요.
