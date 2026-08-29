---
title: "OpenFeature"
summary: "OpenFeature는 기능 플래그 평가를 위한 공급자 중립 API입니다. 코드는 클라이언트에게 값을 묻고 공급자가 답하므로, 코드베이스 곳곳에 흩어진 검사들이 플래그를 보관하는 쪽의 이름을 부르지 않게 됩니다."
category: "컨테이너와 오케스트레이션"
scene: feature-flag
sceneStep: 4
related:
  - label: Feature Flag
    slug: feature-flag
  - label: Traffic Splitting
    slug: traffic-splitting
  - label: Canary Release
    slug: canary-release
  - label: External Configuration
    slug: external-configuration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rollback
    slug: rollback
  - label: Fallback
    slug: fallback
  - label: Cache-Aside
    slug: cache-aside
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: "OpenFeature Introduction"
    url: https://openfeature.dev/docs/reference/intro
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
---

장면의 4단계는 스위치를 걷어내는 것으로 끝납니다. 플래그를 어떻게 평가할지 고를 때 떠올려야 할 순간이 바로 여기입니다. 새로 만드는 플래그 하나하나가 언젠가 찾아서 지워야 할 분기이고, 그 일이 쉬운지 어려운지는 거의 전적으로 모든 검사가 같은 모양인지에 달려 있습니다. 절반은 어느 공급자의 SDK를 부르고, 몇 개는 환경 변수를 읽고, 나머지는 직접 만든 데이터베이스 테이블에 묻는다면 플래그를 걷어내는 일은 발굴 작업이 됩니다. OpenFeature는 검사를 한 가지 모양으로 만들려고 있습니다.

그 모양은 작습니다. 코드는 플래그 키로 클라이언트에게 타입이 있는 값을 묻고, 기본값과 평가 컨텍스트를 함께 넘깁니다. 시작할 때 한 번 등록해 둔 공급자가 답합니다. 호출자가 보는 표면은 이것이 전부이고, 그래서 흥미로운 쪽은 감춰진 부분입니다. 어떤 서비스가 플래그를 보관하는지, 비율을 어떻게 계산하는지, 답이 캐시에서 왔는지 스트림에서 왔는지, 공급자에 닿지 못하면 무슨 일이 일어나는지. 이 중 어느 것도 호출 지점에 있을 이유가 없고, 호출 지점에서 빠지고 나면 코드를 건드리지 않고도 무엇이든 바꿀 수 있습니다.

호출마다 넘기는 기본값은 보기보다 많은 일을 합니다. 공급자가 없거나, 설정이 잘못됐거나, 느리거나, 그 키를 아예 모를 때 호출자가 받는 값이 기본값입니다. 다시 말해 kill switch를 믿고 있던 바로 그 사고 중에 돌아오는 답이기도 합니다. 새 상태가 아니라 안전한 상태를 기본값으로 고르세요. 공개 중인 기능이라면 `false`이고, 무언가를 지키는 스위치라면 다른 모든 것이 멈췄을 때 시스템을 계속 돌게 하는 쪽입니다. 기본값이 위험한 경로인 플래그는, 자기가 지키려던 대상의 강한 의존성으로 조용히 바뀌어 버린 플래그입니다.

평가 컨텍스트는 2단계의 비율이 실제로 나오는 자리입니다. 타기팅 키와 규칙이 읽어도 되는 속성들을 담고, 공급자가 타기팅 키를 해시해서 호출자를 버킷에 넣습니다. 요청에 이미 들어 있는 신원에서 높은 곳에서 한 번 만들어 아래로 넘기세요. 호출마다 다시 만들면 한 요청 안의 두 검사가 누가 호출했는지를 두고 서로 다른 말을 할 수 있습니다. 속성은 최소로 유지합니다. 어떤 페이로드든 최소로 유지하는 이유와 같습니다. 컨텍스트에 넣는 것은 전부 플래그 규칙이 의존하게 될 수 있는 것이고, 속성 여섯 개를 읽는 규칙은 아무도 감히 지우지 못합니다.

훅은 호출 지점마다 로그를 기억하지 않아도 플래그를 관측 가능하게 만들어 주는 부분입니다. 훅은 평가 전후로 돌기 때문에 한 번 등록하면 프로세스 안의 모든 검사에서 플래그 키, 돌려준 값, 그 값이 나온 이유, 변형을 얻습니다. 코호트별로 지표를 나누는 일이 가능해지는 지점이고, 플래그가 죽었다는 사실을 알려 주는 지점이기도 합니다. 몇 주 동안 모두에게 늘 같은 값을 돌려주는 키는 걷어내기를 기다리는 분기이고, 무언가가 지켜보고 있었기 때문에 그 사실을 알 수 있습니다.

.NET에서는 패키지가 `OpenFeature`이고 공급자는 따로 배포됩니다. `Microsoft.FeatureManagement` 위에 얹는 공급자도 있어서, 이미 그것을 쓰는 애플리케이션이라면 플래그가 사는 곳을 바꾸지 않고 중립 API로 옮겨 갈 수 있습니다. 시작할 때 공급자를 등록하고, 컨테이너에서 `IFeatureClient`를 받고, 호출 지점은 지루하게 유지합니다. 키 하나, 기본값 하나, 컨텍스트 하나. 그러면 공급자는 `Program.cs`의 한 줄이 되고, 이 모든 일의 목적이 바로 그것입니다.
