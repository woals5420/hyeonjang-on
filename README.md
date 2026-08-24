# 현장ON

한국가스기술공사 공개데이터 8종, 1,110건을 연결한 안전운영 웹입니다.

- `/` 종합현황
- `/digsafe` 굴착공사 관리와 딥러닝 미신고 가능성
- `/recover` 긴급복구장비 현황과 지원 가능 사업장

공공데이터와 학습된 모델 값은 `app/data`의 JSON 파일에 포함되어 있습니다. 별도의 API 키나 데이터베이스가 없어도 실행됩니다.

## 필요한 프로그램

1. Visual Studio Code
2. Node.js 22 이상
3. GitHub 계정
4. Vercel 계정

## 내 컴퓨터에서 실행

압축을 풀고 Visual Studio Code에서 이 폴더를 엽니다. `터미널 → 새 터미널`을 누르고 아래 명령을 순서대로 실행합니다.

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 종료할 때는 터미널에서 `Ctrl+C`를 누릅니다.

배포 전 확인:

```powershell
npm run build
```

## 누구나 보는 주소로 배포 — 추천

### 1. GitHub에 코드 올리기

가장 쉬운 방법은 GitHub Desktop을 설치하는 것입니다.

1. GitHub Desktop에서 `File → Add local repository`를 누릅니다.
2. 이 폴더를 선택합니다.
3. 저장소가 없다는 안내가 나오면 `create a repository`를 누릅니다.
4. 저장소 이름을 `hyeonjang-on`으로 정합니다.
5. `Publish repository`를 누릅니다.
6. 누구나 코드를 보게 할 필요가 없다면 `Keep this code private`를 체크해도 웹 공개에는 문제가 없습니다.

### 2. Vercel에 배포하기

1. `https://vercel.com`에서 GitHub 계정으로 로그인합니다.
2. `Add New → Project`를 누릅니다.
3. 방금 만든 `hyeonjang-on` 저장소를 선택하고 `Import`를 누릅니다.
4. Framework Preset이 `Next.js`인지 확인합니다.
5. Build Command와 Output Directory는 수정하지 않습니다.
6. `Deploy`를 누릅니다.

완료되면 `https://프로젝트이름.vercel.app` 주소가 생기며 로그인 없이 누구나 볼 수 있습니다. 이후 GitHub Desktop에서 수정 내용을 Push하면 Vercel이 자동으로 다시 배포합니다.

## 명령어로 바로 배포

GitHub 없이 Vercel CLI로도 배포할 수 있습니다.

```powershell
npm install
npm run build
npx vercel --prod
```

처음 한 번만 Vercel 로그인과 프로젝트 이름을 묻습니다.

## 자주 수정하는 파일

- `app/page.tsx`: 종합현황 화면
- `app/digsafe/page.tsx`: 굴착공사 관리
- `app/recover/page.tsx`: 긴급복구장비
- `app/globals.css`: 디자인 전체
- `app/data/*.json`: 공공데이터와 모델 값
- `app/layout.tsx`: 사이트 제목과 공유 미리보기

## 주의

이 서비스의 확률과 우선순위는 현장 확인을 돕는 참고값입니다. 실제 신고 여부와 안전조치는 EOCS 및 한국가스기술공사의 현장 절차로 확인해야 합니다.
