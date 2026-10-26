# Folio — 브라우저에서 끝내는 PDF 편집

사이트 주소(배포 후): **https://makerskim.github.io/<저장소 이름>/** (예: 저장소 이름이 `folio`면 https://makerskim.github.io/folio/)

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

이 폴더는 앨범 앱과 상관없이 **혼자서 하나의 저장소**가 되도록 만들어져 있어요. 폴더 안의 `.github/workflows/deploy.yml` 이 자동 배포를 해 줘요.

1. GitHub에서 새 저장소를 만들어요(예: `folio`, Public). README 추가 등은 체크하지 않아요.
2. 이 폴더의 **안에 있는 파일들**(`package.json` 이 맨 위에 오게)을 저장소에 올려요. `node_modules` · `dist` 는 올리지 않아요.
3. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿔요.
4. **Actions** 탭 → **Deploy** 가 초록 ✓ 이 되면(2~3분) `https://makerskim.github.io/folio/` 에서 열려요. (처음 올릴 때 Pages 설정 전이라 빨간 ✗ 가 났다면 Deploy → **Run workflow** 로 다시 실행해요.)

이후에는 `main` 브랜치에 고친 파일을 올릴 때마다 자동으로 다시 배포돼요.

### 내 도메인으로 운영하고 싶다면

- **GitHub Pages 그대로**: Settings → Pages → **Custom domain** 에 `pdf.내도메인.com` 을 적고, 도메인 관리 화면(가비아 · 카페24 · Cloudflare 등)에서 `CNAME` 레코드를 `makerskim.github.io` 로 추가해요. **Enforce HTTPS** 를 켜요. 별도 저장소라서 주소는 `pdf.내도메인.com/` 그대로예요.
- **다른 무료 호스팅**: Cloudflare Pages · Netlify · Vercel 중 하나에서 이 저장소를 연결하고 아래처럼 적어요. 모두 무료 요금제로 충분해요.
  - Root directory: 비워 두기(저장소 맨 위)
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
