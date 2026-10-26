# Folio — 브라우저에서 끝내는 PDF 편집

사이트 주소(배포 후): **https://makerskim.github.io/web1/pdf/**

PDF를 올리면 페이지를 정리하고, 합치고, 나누고, 다른 형식으로 바꿔서 내려받는 사이트예요.
**파일은 서버로 올라가지 않아요.** PDF를 읽고(pdf.js), 새로 만들고(pdf-lib), PPTX로 바꾸는(PptxGenJS) 일이 모두 방문자의 브라우저 안에서 일어나요. 그래서 서버 · 데이터베이스 · 저장 공간이 필요 없고, 정적 파일만 올려 두면 운영돼요.

## 기능

| 화면 | 할 수 있는 것 |
| --- | --- |
| **정리** | 페이지 끌어서 옮기기(여러 장 한꺼번에), 왼쪽 · 오른쪽 회전, 지우기, 복제, 빈 페이지 넣기, 순서 뒤집기, 홀수 · 짝수 · 반대로 고르기, 크게 보기, 되돌리기 · 다시 하기 |
| **합치기** | PDF와 사진(JPG · PNG · WebP · GIF)을 여러 개 올리면 한 문서로 이어져요. 페이지마다 어느 파일에서 왔는지 색으로 보여요 |
| **골라 만들기** | 두 개 이상의 PDF를 나란히 펼쳐 놓고, 누르는 페이지만 오른쪽 '새 문서'에 차례로 넣어요 |
| **저장 → PDF** | 지금 순서 · 회전 그대로 저장. 페이지 번호(1, 2, 3 / 1 / 12) 넣기 선택 |
| **저장 → 나누기** | 범위로(`1-3, 4-8, 9-`), N페이지씩, 한 장씩 → 여러 파일은 ZIP 하나로 |
| **저장 → PPTX** | 페이지마다 슬라이드 한 장(고화질 이미지라 원본과 똑같이 보여요). 페이지 글자를 발표자 노트에 넣기 선택 |
| **저장 → 이미지** | PNG · JPG, 1200 / 2000 / 3200px, ZIP 하나로 |

고른 페이지만 따로 저장할 수도 있어요(아래 검은 막대의 '고른 페이지 저장').

단축키: 클릭 고르기 · ⇧클릭 범위 · 두 번 클릭 크게 보기 · `R` / `⇧R` 회전 · `Delete` 지우기 · `⌘D` 복제 · `⌘A` 모두 · `Esc` 해제 · `⌘Z` / `⇧⌘Z` 되돌리기 · `⌘S` 저장. 휴대폰에서는 길게 눌러서 옮겨요.

## 내 컴퓨터에서 실행하기

```bash
cd pdf
npm install
npm run dev        # http://localhost:5173 에서 열려요
npm run build      # dist/ 에 올릴 파일이 만들어져요
npm run preview    # 만든 결과를 http://localhost:4173 에서 확인
```

Node.js 20 이상이 필요해요.

## 사이트 운영하기 (GitHub Pages, 무료)

이 저장소에는 이미 자동 배포가 들어 있어요(`.github/workflows/pages.yml`). `master`에 합쳐지면 앨범 앱과 함께 이 편집기도 빌드되어 `/pdf/` 주소로 올라가요.

1. **처음 한 번**: GitHub 저장소 → **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿔요. (앨범 앱 때문에 이미 바꿨다면 건너뛰세요.)
2. 이 브랜치의 Pull Request를 만들고 `master`에 **Merge** 해요.
3. 저장소의 **Actions** 탭에서 'Deploy site'가 초록 ✓ 이 될 때까지 기다려요(2~3분).
4. **https://makerskim.github.io/web1/pdf/** 를 열어요.

이후에는 코드를 고쳐서 `master`에 합칠 때마다 자동으로 다시 올라가요.

### 내 도메인으로 운영하고 싶다면

- **GitHub Pages 그대로**: Settings → Pages → **Custom domain** 에 `pdf.내도메인.com` 을 적고, 도메인 관리 화면(가비아 · 카페24 · Cloudflare 등)에서 `CNAME` 레코드를 `makerskim.github.io` 로 추가해요. **Enforce HTTPS** 를 켜요. 이때 주소는 `pdf.내도메인.com/pdf/` 가 돼요.
- **편집기만 따로 올리기** (주소를 `pdf.내도메인.com/` 처럼 깔끔하게): Cloudflare Pages · Netlify · Vercel 중 하나에서 이 저장소를 연결하고 아래처럼 적어요. 모두 무료 요금제로 충분해요.
  - Root directory: `pdf`
  - Build command: `npm run build`
  - Output directory: `dist`
  - 그다음 각 서비스의 'Custom domain' 메뉴에서 도메인을 연결해요.

빌드 결과는 상대 경로(`base: './'`)라서 어느 주소 아래에 올려도 그대로 동작해요. 서버 설정(리다이렉트 등)도 필요 없어요(주소는 `#/studio` 처럼 해시를 써요).

### 운영할 때 알아 두면 좋은 것

- **비용**: 정적 파일 6~7MB 뿐이라 트래픽이 많아도 GitHub Pages · Cloudflare Pages 무료 범위로 충분해요. PDF 처리는 방문자 기기가 하니 서버 비용이 늘지 않아요.
- **개인정보**: 업로드가 없으니 개인정보 처리방침에 '파일을 수집 · 저장하지 않음'이라고 적을 수 있어요. 방문자 통계를 넣고 싶다면 쿠키 없는 도구(Cloudflare Web Analytics, Plausible 등)를 권해요. 글꼴(Pretendard)만 jsDelivr CDN에서 받아요.
- **한계**: 암호가 걸린 PDF는 열 수 없어요. PPTX는 페이지가 이미지로 들어가서 글자를 바로 고칠 수 없어요(노트에 글자를 넣어 줘요). 아주 큰 파일(수백 MB)은 휴대폰에서 메모리가 부족할 수 있어요.

## 코드 구조

```
pdf/
├─ index.html
├─ scripts/copy-pdfjs.mjs   # pdf.js 의 한글(CJK) 글꼴 지도 · 표준 글꼴 · 이미지 해독기를 public/pdfjs 로 복사 (빌드 때 자동)
└─ src/
   ├─ main.tsx              # #/ 첫 화면, #/studio 편집기
   ├─ landing/              # 첫 화면
   ├─ lib/pdf.ts            # 읽기 · 썸네일 · PDF/PPTX/이미지 만들기 · 범위 해석
   ├─ lib/store.ts          # 페이지 목록, 고르기, 되돌리기 (zustand)
   └─ studio/               # 편집기 화면 (Board 정리 · Pick 골라 만들기 · Export 저장 · Preview 크게 보기)
```
