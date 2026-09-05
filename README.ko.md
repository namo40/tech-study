# Tech Study

[English](README.md) | **한국어** | [日本語](README.ja.md)

서버 기술을 움직임으로 설명합니다.

Tech Study는 서버 기술 키워드를 짧은 모션 그래픽으로 설명하는 정적 사이트입니다. 키워드 하나에 페이지 하나를 쓰고, 모든 페이지를 영어, 한국어, 일본어로 함께 공개합니다. 개념은 먼저 범용으로 설명하고, 그다음에 .NET에서 어떤 모습인지 보여 줍니다.

## 기술 구성

- **Astro**로 정적 출력, 콘텐츠 컬렉션, 언어 접두사 라우팅을 처리합니다.
- **SVG와 GSAP**으로 장면을 만듭니다. 장면 하나는 1080×1520 캔버스 하나와 타임라인 하나로 이루어지며, 재생, 일시정지, 단계 이동, 스크럽 컨트롤을 제공합니다.
- **TypeScript**로 플레이어, 효과음, 테마 전환을 구현합니다. UI 프레임워크는 쓰지 않습니다.
- 페이지 본문은 Markdown 콘텐츠 컬렉션에 두고, 인터페이스 문자열은 타입이 붙은 TypeScript 모듈에 둡니다.
- 효과음은 Web Audio API로 합성하므로 오디오 파일을 배포하지 않습니다.

## 시작하기

```sh
npm install
npm run dev
```

| 명령 | 하는 일 |
| --- | --- |
| `npm install` | 의존 패키지를 설치합니다 |
| `npm run dev` | `http://localhost:4321`에서 개발 서버를 띄웁니다 |
| `npm run build` | 정적 사이트를 `dist/`에 빌드합니다 |
| `npm run preview` | 빌드 결과를 로컬에서 서비스합니다 |
| `npm run check` | `astro check`로 타입을 검사합니다 |
| `npm run verify` | 모든 장면이 타임라인 규약을 지키는지 검사합니다 |
| `npm run baseline` | 모든 장면의 프레임별 지문을 기록합니다 |
| `npm run baseline:compare` | 기록해 둔 지문과 장면을 비교합니다 |

## 설정

환경 변수 두 개로 게시 위치를 정합니다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:4321` | canonical과 `hreflang` URL에 쓰는 절대 주소 |
| `SITE_BASE` | `/` | 하위 경로에 게시할 때 쓰는 base path |

```sh
SITE_URL=https://example.com SITE_BASE=/tech-study/ npm run build
```

모든 내부 링크와 에셋이 base path를 거치므로, 도메인 루트와 하위 경로 사이를 오갈 때 소스를 고칠 필요가 없습니다.

## 프로젝트 구조

```
astro.config.mjs        사이트 주소, base path, 언어 라우팅
src/
  content.config.ts     concepts 컬렉션 스키마
  content/concepts/     키워드마다 언어별 마크다운 파일
  i18n/                 인터페이스 문자열, 영어가 키 집합을 정의
  layouts/              문서 골격: head, 폰트, 테마, 헤더, 푸터
  pages/                루트 리다이렉트, /{lang}/, /{lang}/{slug}
  components/           헤더, 언어 전환, 테마 전환, 장면 플레이어
  scenes/               무대 마크업, 무대 스타일, GSAP 타임라인
  scripts/              플레이어, 효과음, 테마 전환
  styles/               디자인 토큰, 전역 스타일, 공용 장면 위젯
```

## 장면 추가하기

장면 하나는 `src/scenes/<id>/` 폴더이고, 그 안에 모듈 두 개와 스타일시트 하나를 둡니다.

`stage.ts`는 페이지에 그대로 실리는 정적 SVG인 `stageMarkup`을 내보냅니다. `src/scenes/shared/stage.ts`의 공용 빌더로 조립하세요. `clientBox`, `nodeFrame`, `serviceBox`, `verticalLink`, `healthDot`, `slotRow`, `counterVariants`, `timerRing`, `trackAndFill`, `chip`, `requestsLayer`가 있습니다. 좌표는 전부 인자이므로 장면마다 자기 숫자를 그대로 쓰면서도 옆 장면과 같은 그림으로 읽힙니다. 좌표는 1080 × 1920 공간에 적지만 공용 `VIEWBOX`가 이 공간을 `0 400 1080 1520`으로 잘라냅니다. 따라서 `y` 0..400은 캔버스 밖이고, `y` 400..440은 첫 상자 위에 남겨 둔 프레임 여백입니다. 이 모듈은 서버에서 import되므로 GSAP을 끌어오면 안 되고, 플레이어가 실행 시점에 채우는 빈 `scene-requests` 레이어로 끝나야 합니다.

`scene.ts`는 기본 export로 `SceneModule`을 내보내며 타임라인을 만듭니다. 시작은 `src/scenes/shared/timeline.ts`의 `createSceneTimeline()`으로, 마무리는 `finishSceneTimeline(tl, SCENE_DURATION)`으로 합니다. 앞쪽은 정지 상태의 타임라인을 주고, 뒤쪽은 길이를 고정한 뒤 타임라인을 양방향으로 한 번씩 예열합니다. 그래야 한 번도 정방향으로 지나지 않은 상태 변화를 역방향으로 스크럽해도 제대로 되돌아갑니다. 완성한 장면은 `src/scenes/registry.ts`에 등록합니다.

상태는 속성으로 바꾸고, 콜백에서 바꾸지 않습니다. `src/scenes/shared/state.ts`의 `attr(tl, target, name, value, at)`가 길이 0짜리 tween으로 `data-*` 값을 쓰고, 그 속성을 보는 CSS가 모습을 결정합니다. 색을 보간하지 않기 때문에 스크럽 양방향과 두 테마가 모두 맞아떨어집니다.

`stage.css`에는 그 장면 하나의 규칙만 둡니다. 레지스트리가 이 파일을 텍스트로 읽어 장면을 그리는 페이지에 인라인하므로, 읽는 사람은 눈앞의 무대에 필요한 규칙만 내려받고 나머지 아흔 개는 받지 않습니다. 모든 무대가 함께 쓰는 것은 `src/styles/scene.css`에 남습니다. 상자, 연결선, 그리고 위젯 클래스인 `.scene-track`, `.scene-fill`, `.scene-ring`, `.scene-counter`, `.scene-flash`, `.scene-slot`, `.scene-chip`, `.scene-mono`, `.scene-health`가 여기에 있고, 이들을 장면 접두어 클래스 옆에 함께 적으면 됩니다. 그러면 장면 규칙에는 다른 점만 남는데, 보통 커스텀 속성(`--fill-color`, `--ring-color`, `--ring-width`, `--flash-color`) 하나와 글자 크기입니다. 공용 스타일시트는 head에서 링크로 걸리고 장면 스타일시트는 본문에 인라인되므로, 접두어 규칙은 옆에 나란히 적은 위젯 규칙을 여전히 덮어씁니다. 공용 클래스나 상태 속성만으로 적은 규칙은 어느 무대에나 닿을 수 있으므로, 장면 파일이 아니라 공용 스타일시트의 `Rules shared across stages` 절에 둡니다.

큐나 풀처럼 한 사건이 다음 사건을 부르는 장면은 일정을 먼저 계산하고 tween은 그다음에 깝니다. `src/scenes/shared/simulation.ts`의 `createScheduler()`는 예약된 사건을 이른 순서로 실행하고 실행 도중에 새 사건을 예약할 수 있게 해 줍니다. `collapseLast`와 `collapseAtInstant`는 같은 시각에 떨어지는 변화를 하나로 접어, 그 한 프레임이 읽는 사람의 스크럽 방향에 따라 달라지지 않게 합니다.

효과음은 `success`, `failure`, `state`, `trip` 네 가지입니다. 각각을 보는 사람이 그 일을 목격하는 순간에 겁니다. 캐시 미스는 시뮬레이션이 그렇게 정한 시각이 아니라 요청이 캐시에 닿는 순간에 울려야 합니다.

모든 장면은 같은 규약을 지킵니다. 길이 24초, `step-1`부터 `step-4`까지 오름차순 라벨 네 개, 그 라벨과 일치하는 `steps[]` 시각, 첫 프레임과 끝 프레임에 보이는 요청 없음, 10ms 간격으로 정방향과 역방향이 일치할 것. `npm run verify`가 이를 모두 검사하며, 미리 기록해 둔 자료가 없어도 됩니다. 장면을 완성한 뒤에는 `npm run baseline`으로 프레임을 기록하고, `npm run baseline:compare`로 이후 수정이 그 기록에서 벗어나지 않는지 확인합니다.

## 언어

영어가 정본이고, 한국어와 일본어는 영어에서 옮깁니다. 인터페이스 문자열은 `src/i18n`에 있으며, 영어 파일이 키 집합을 정의하고 나머지 두 파일은 그 키 집합에 맞는지 타입 검사를 받습니다. 페이지 본문은 콘텐츠 컬렉션에 언어별 마크다운 파일로 둡니다. README 세 개는 항상 같은 내용으로 맞춥니다.

## 접근성과 모션

장면은 페이지를 열면 자동으로 재생됩니다. 읽는 사람이 모션 최소화를 선택했다면 플레이어는 첫 프레임에서 멈춘 채 기다리고, 단계를 옮길 때도 그 단계의 시작 지점으로 이동한 뒤 정지 상태를 유지합니다. 현재 단계는 넓은 화면에서는 무대 옆에, 좁은 화면에서는 무대 위에 설명 카드로 보여 주므로 설명과 그림이 서로를 가리지 않고 함께 보입니다. 자막은 그림이 아니라 페이지 텍스트이고, 상태는 색과 함께 글자로도 표시하며, 결과는 체크와 엑스 기호로 구분하므로 색만으로 판단하게 두지 않습니다.

## 라이선스

MIT입니다. [LICENSE](LICENSE)를 참고하세요.
