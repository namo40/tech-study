---
title: "External Configuration"
summary: "외부 설정은 빌드가 지고 다니지 않는 모든 것입니다. 산출물 바깥에서 시작할 때 들어오는 값이라, 같은 이미지가 환경마다 다르게 행동합니다. 그림자 배포가 다른 빌드가 되지 않은 채로 케이지에 갇힐 수 있는 이유이기도 합니다."
category: "컨테이너와 오케스트레이션"
scene: shadow-deployment
sceneStep: 3
related:
  - label: Shadow Deployment
    slug: shadow-deployment
  - label: Secret Injection
    slug: secret-injection
  - label: Environment Variable
    slug: environment-variable
  - label: Feature Flag
    slug: feature-flag
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Configuration
    slug: configuration
references:
  - title: External Configuration Store pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/external-configuration-store
  - title: Configuration in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration
  - title: The Twelve-Factor App - Config
    url: https://12factor.net/config
---

외부 설정은 값이 어디에서 와도 되는지에 대한 규칙입니다. 연결 문자열, 엔드포인트, 타임아웃, 플래그, 이 인스턴스가 읽어야 할 큐 이름처럼 환경마다 달라지는 것은 산출물에 컴파일해 넣지 않고, 산출물 안에 담아 보내지도 않습니다. 시작할 때 바깥에서 공급받습니다. 환경 변수, 마운트된 파일, 설정 서비스, 플랫폼이 주는 무엇이든 될 수 있고, 산출물은 그중 무엇이었는지 신경 쓰지 않는 하나의 인터페이스로 그 값을 읽습니다.

여기서 나오는 실질적인 결과가 이 장면이 딛고 선 자리입니다. 설정이 바깥에 있으면 같은 이미지를 서로 다른 값 묶음으로 두 번 띄울 수 있고, 두 프로세스는 같은 빌드인 채로 다르게 행동합니다. 그림자 배포에 필요한 것이 정확히 그것입니다. 테스트 대상 사본은 승격할 산출물이어야 하고, 아니면 승격할 대상에 대해서는 아무것도 증명하지 못합니다. 그러면서도 아무 데도 쓰지 않고, 아무에게도 청구하지 않고, 메일도 보내지 않아야 합니다. 이 두 요구가 함께 성립하는 것은, 케이지에 갇힌 인스턴스와 응답하는 인스턴스의 차이가 코드의 분기가 아니라 값의 묶음이기 때문입니다.

변경이 어떻게 이루어지는지도 여기서 갈립니다. 빌드 바깥에 있는 값을 고치는 것은 설정 변경입니다. 컴파일도 없고, 새 산출물도 없고, 줄 서 있는 풀 리퀘스트도 없으며, 배포가 아니라 재시작이나 다시 읽기로 반영됩니다. 구워 넣은 값을 고치는 것은 코드 변경이고 거기 딸린 모든 것이 따라옵니다. 이 선은 일부러 그어 둘 값어치가 있습니다. "1분이면 낮출 수 있다"와 "빌드가 끝나면 낮출 수 있다"를 가르는 선이기 때문입니다.

저장 위치만큼 인터페이스도 중요합니다. .NET에서는 겹겹이 쌓인 `IConfiguration`이 그 방식입니다. 빌드와 함께 다니는 기본값은 `appsettings.json`, 환경별 덮어쓰기는 `appsettings.{Environment}.json`, 그 위에 환경 변수, 맨 위에 명령줄 인수가 오고, 위층은 아래층의 키를 대체합니다. 클래스는 그중 무엇도 직접 읽지 않습니다. 생성자로 `IOptions<T>`를 받아 바인딩된 객체를 얻고, 그래서 설정은 테스트에서 갈아 끼울 수 있는 것으로 남고 공급자 사슬은 코드가 아니라 배포의 관심사로 남습니다. `IOptionsSnapshot<T>`은 스코프마다 새로 바인딩하고 `IOptionsMonitor<T>`는 변경을 알려 주므로, 아무것도 재시작하지 않고 값을 다시 읽는 일이 가능해집니다.

다만 다시 읽기는 끝에서 끝까지 지켜야 하는 약속입니다. 원본을 지켜보는 공급자, 다시 바인딩하는 바인더, 처음 본 값을 캐싱하지 않고 모니터로 읽는 소비자는 서로 다른 세 가지 조건이고, 시작할 때 싱글턴에 한 번 주입된 값은 공급자가 무엇을 하든 절대 바뀌지 않습니다. 설정마다 시작할 때만 읽는 값인지 살아 있는 값인지 정하고, 그 점을 솔직하게 적어 두는 것이 좋습니다. 실제로는 한 번만 읽으면서 "실시간으로 바뀐다"고 적힌 타임아웃은, 재시작이 필요하다고 모두가 아는 값보다 나쁩니다.

이 패턴이 스스로 문제가 되지 않도록 지켜 주는 경계가 둘 있습니다. 하나는 비밀입니다. 비밀번호, 키, 토큰도 바깥에서 온다는 점에서는 외부 설정이지만, 암호화하고 읽기를 감사하고 주기적으로 교체해 주는 저장소가 필요하므로 페이지 크기와 같은 파일이 아니라 비밀 관리자에 두어야 합니다. 다른 하나는 검증입니다. 이 값들은 실행 시점에 도착하므로 컴파일러가 확인해 줄 수 없습니다. 타입이 있는 옵션 클래스에 바인딩하고, 데이터 어노테이션이나 검증 대리자로 시작할 때 확인하고, 어긋나면 즉시 실패하게 합니다. 잘못 설정된 프로세스가 아예 뜨지 않는 것은 좋은 결말입니다. 뜬 다음에 케이지에 갇혀 있어야 할 인스턴스를 프라이머리 데이터베이스로 향하게 하는 것이야말로 이 패턴 전체가 막으려는 결말입니다.
