---
title: "Feature Flag"
summary: "기능 플래그는 코드를 배포하는 일과 릴리스하는 일을 분리합니다. 누가 무엇을 보는지는 스위치가 정하고, 비율은 영향 범위를 다이얼로 바꾸며, kill switch는 지금까지 만들어진 가장 싼 롤백입니다. 그래서 항상 켜져 있는 플래그는 걷어내야 할 부채입니다."
category: "컨테이너와 오케스트레이션"
scene: feature-flag
steps:
  - title: "배포는 릴리스가 아닙니다"
    text: "플래그가 없으면 v2를 내보내는 일이 곧 릴리스입니다. 전원이 한꺼번에 받고, 되돌리려면 또 배포해야 합니다. 코드를 플래그 뒤에 두고 숨긴 채 내보내면 v2는 모든 서버에 있지만 켜기로 정하기 전까지 아무도 보지 못합니다. 결정하는 것은 배포가 아니라 스위치입니다."
  - title: "10%에게 열고, 지켜보고, 넓힙니다"
    text: "플래그는 사용자를 해시해 버킷에 넣으므로 같은 사람은 언제나 같은 쪽에 섭니다. 요청마다 던지는 동전이 아니라 일관된 경험입니다. 숫자가 괜찮아 보이면 10%가 50%가 됩니다. 영향 범위가 이제 받아들이는 사실이 아니라 돌리는 다이얼이 됩니다."
  - title: "kill switch는 지금까지 만들어진 가장 싼 롤백입니다"
    text: "v2가 절반의 사용자에게 오류를 던지기 시작합니다. 그리고 플래그 한 번 뒤집기가 몇 초 만에 전원을 v1으로 되돌립니다. 빌드도, 배포도, 롤백 창도 없습니다. 나쁜 코드는 여전히 서버에 있고, 닿을 수 없게 됐을 뿐입니다. 회복 속도가 플래그가 존재하는 이유의 전부입니다."
  - title: "항상 켜져 있는 플래그는 스위치 달린 부채입니다"
    text: "고치고 검증한 뒤 v2가 100%로 갑니다. 그다음에는 플래그를 걷어냅니다. 플래그 하나하나가 코드의 경로를 두 배로 만들기 때문입니다. 열고, 증명하고, 제거합니다. 스위치가 사라지고, 경로는 다시 조건 없는 길이 됩니다."
related:
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Traffic Splitting
    slug: traffic-splitting
  - label: OpenFeature
    slug: openfeature
  - label: Rollback
    slug: rollback
  - label: Shadow Deployment
    slug: shadow-deployment
  - label: External Configuration
    slug: external-configuration
  - label: Database Migration
    slug: database-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
references:
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
  - title: "OpenFeature Introduction"
    url: https://openfeature.dev/docs/reference/intro
---

## 언제 쓰나

- 아직 끝나지 않았는데 병합은 해야 하는 작업에 씁니다. 플래그가 있으면 미완성 기능이 main 브랜치에서 살고 매일 운영에 나가면서도 아무도 닿을 수 없습니다. 트렁크 기반 개발이 가능해지는 지점이 여기입니다. 길어지지 않는 브랜치란 결국 플래그 뒤에 있는 브랜치입니다.
- 조금씩 넓히고 싶은 릴리스에 씁니다. 10%, 그다음 50%, 그다음 전원. 각 단계 사이에서 오류율과 지연을 지켜봅니다. 그러면 실수의 크기가 나중에 알게 되는 숫자가 아니라 처음부터 고른 숫자가 됩니다.
- 급히 꺼야 할지도 모르는 모든 것에 씁니다. 새 의존성, 다시 쓴 알고리즘, 통제할 수 없는 서드파티 연동이 그렇습니다. 내보내기 전에 던질 질문은 "이게 잘 돌까"가 아니라 "어떻게 끄지"이고, 플래그가 가장 싼 대답입니다.
- 릴리스와 무관한 운영 토글에도 씁니다. 부하가 몰릴 때 비싼 추천 패널을 걷어내는 일, 월말에 데이터베이스를 두들기는 리포트를 잠그는 일, 상대 쪽이 죽어 있는 동안 외부 연동을 멈추는 일. 모두 같은 스위치를 다른 이유로 쓰는 것입니다.
- 실험에도 씁니다. A/B 테스트는 배정을 기록하고 결과를 측정하는 기능 플래그입니다. 플래그가 이미 있다면 실험의 대부분도 이미 갖춘 셈입니다.

## 주의점

- 플래그 검사는 요청 경로에서 일어나므로 로컬이어야 하고 빨라야 합니다. 백그라운드 갱신이 최신으로 유지하는 설정 스냅샷을 놓고 평가합니다. 검사할 때마다 네트워크를 호출하면 모든 플래그가 의존성이 되고, 공급자의 장애가 곧 우리 장애가 됩니다.
- 요청 단위가 아니라 안정된 식별자로 버킷을 나눕니다. 사용자나 계정, 테넌트를 해시해서 같은 호출자가 언제나 같은 쪽에 서게 합니다. 요청마다 동전을 던지면 새 결제 화면을 본 사용자가 새로 고침 한 번에 옛 화면을 보게 되고, 이건 버그처럼 읽힙니다. 실제로 버그이기도 합니다.
- 두 경로가 모두 운영에 있으므로 둘 다 우리 몫입니다. 둘 다 테스트하고, 둘 다 관측하고, 지표는 코호트별로 나눠서 봅니다. 플래그의 양쪽을 평균 낸 오류율은 플래그를 켠 이유였던 바로 그 차이를 가립니다.
- 플래그는 상태를 곱합니다. 두 개면 네 가지 조합이고 열 개면 영영 다 테스트하지 못할 만큼입니다. 그러니 오래 사는 플래그는 부채로 다룹니다. 주인을 정하고, 제거 날짜를 정하고, 완전히 켜진 채 얼마간 지나면 걷어냅니다. 롤아웃의 마지막 단계는 100%에 닿는 것이 아니라 분기를 지우는 것입니다.
- kill switch가 자기가 지키는 대상에 의존하면 안 됩니다. 플래그 설정이 지금 죽어 있는 서비스를 거쳐 전달되거나, 그 설정을 갱신하는 캐시가 내려간 데이터베이스를 필요로 한다면, 믿고 있던 스위치는 정작 필요한 순간에 닿지 않습니다. 마지막으로 확인된 값을 디스크에 남기고 그 값으로 떨어지게 합니다.
- 플래그 상태는 코드가 아니라 설정이고, 이 사실은 양쪽으로 작용합니다. 바꾸는 일이 빠른 것이 장점이지만, 동시에 리뷰도 빌드도 없는 운영 변경이기도 합니다. 누가 언제 무엇을 뒤집었는지 남기고, 감사 로그를 나중에 붙이는 것이 아니라 기능의 일부로 다룹니다.

## .NET에서는

`Microsoft.FeatureManagement`가 표준 구현입니다. 설정 섹션에 등록한 뒤 `IFeatureManager`에게 기능이 켜져 있는지 물어봅니다. 답은 호출이 아니라 설정 스냅샷에서 오므로 검사 비용은 잴 가치가 없을 만큼 작습니다.

```csharp
builder.Services.AddFeatureManagement();

// 요청 경로에서
if (await featureManager.IsEnabledAsync("NewCheckout"))
{
    return await newCheckout.PlaceAsync(order, ct);
}
return await legacyCheckout.PlaceAsync(order, ct);
```

비율과 코호트는 코드가 아니라 필터입니다. 타기팅 필터는 넘겨준 식별자를 해시하므로 같은 사용자가 요청이 바뀌어도 서버가 바뀌어도 같은 쪽에 남고, 공개 범위를 넓히는 일은 배포가 아니라 설정 수정이 됩니다. 아래는 `Microsoft.FeatureManagement` 4.x가 읽는 Microsoft Feature Management 스키마입니다. 3.x 이하는 모양이 다른 `FeatureManagement` 섹션을 썼으므로, 어느 쪽이든 복사하기 전에 확인해 둘 가치가 있습니다.

```json
{
  "feature_management": {
    "feature_flags": [
      {
        "id": "NewCheckout",
        "enabled": true,
        "conditions": {
          "client_filters": [
            {
              "name": "Microsoft.Targeting",
              "parameters": { "Audience": { "DefaultRolloutPercentage": 10 } }
            }
          ]
        }
      }
    ]
  }
}
```

Azure App Configuration에서는 플래그가 애플리케이션 바깥에 살므로, 포털에서 스위치를 뒤집으면 재시작 없이 갱신 주기 안에 모든 인스턴스에 닿습니다. `AddAzureAppConfiguration`에 `UseFeatureFlags`를 붙이면 이 배선이 끝나고, 플래그는 자기만의 갱신 주기를 갖습니다. 기본 30초이고 `UseFeatureFlags(o => o.SetRefreshInterval(...))`로 바꾸며, 일반 키-값의 갱신을 이끄는 센티널 키와는 별개입니다. 무엇을 해시할지는 `ITargetingContextAccessor`에서 정합니다. 사용자 단위 롤아웃이면 사용자 id, 고객사 전체가 함께 움직여야 하면 테넌트 id입니다.

애플리케이션 하나보다 큰 범위라면 OpenFeature가 공급자 중립 API입니다. 코드는 클라이언트에게 불리언 하나를 묻고 공급자가 답하므로, 코드베이스 곳곳에 흩어진 검사들이 특정 공급자를 이름으로 부르지 않게 되고, 어떤 서비스가 플래그를 평가할지는 언제든 바꿀 수 있는 결정으로 남습니다.
