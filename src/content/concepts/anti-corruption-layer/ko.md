---
title: "Anti-Corruption Layer"
summary: "anti-corruption layer는 새 시스템이 아직 읽어야 하는 옛 모델과 자기 자신 사이에 두는 번역 계층입니다. 옛 모델이 경계에서 멈추고, 그것을 대체하려던 코드 안으로 번지지 않게 합니다."
category: "애플리케이션 아키텍처"
scene: strangler-fig
sceneStep: 2
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: Adapter
    slug: adapter
  - label: Bounded Context
    slug: bounded-context
  - label: Database per Service
    slug: database-per-service
  - label: Modular Monolith
    slug: modular-monolith
references:
  - title: Anti-Corruption Layer pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Domain analysis for microservices
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
---

마이그레이션이 절반쯤 왔을 때 새 코드는 아직 자기 것이 아닌 무언가를 필요로 합니다. customers는 옮겨 왔지만 orders는 그대로인데, 고객 화면에는 최근 주문 세 건이 나와야 합니다. 방법은 둘입니다. 하나는 옛 테이블을 직접 읽고 그 행을 새 코드가 원하는 모양으로 옮겨 담고 넘어가는 것입니다. 첫날 오후에는 잘 돌아가고, 마이그레이션을 잃는 가장 확실한 방법이기도 합니다. 한 달이면 옛 스키마의 nullable 컬럼, 상태 코드, "2016년 이전에 만든 계정에서는 이 필드의 뜻이 다르다" 같은 규칙이 모두 새 시스템 안에서 뼈대가 되어 있고, 새 시스템은 서식만 나아진 옛 시스템의 사본이 됩니다. 다른 하나는 두 언어를 다 할 줄 알되 어느 쪽도 통과시키지 않는 계층을 두는 것입니다.

실제 모습은 새 시스템 쪽에 있는 작고 지루하고 주인이 분명한 모듈입니다. 새 시스템의 어휘로 쓴 인터페이스 하나, 옛 시스템을 호출하는 구현 하나, 그리고 격리되어 있으니 못생겨도 되는 매핑입니다. 옛 시스템은 이미 나 있는 문으로 부릅니다. API든, 저장 프로시저든, 읽기 복제본이든, 야간 추출이든 상관없습니다. 그리고 그 호출은 다른 네트워크 의존과 똑같이 다룹니다. 타임아웃을 두고, 재시도 횟수를 제한하고, 답이 없을 때 물러설 자리를 만듭니다. 옛 시스템이 세 가지로 표기하는 상태를 읽어 새 시스템이 이해하는 하나로 돌려주는 것처럼, 달리 둘 곳이 없는 보정도 여기가 자연스러운 자리입니다.

마지막 성질을 사람들이 자주 잊습니다. anti-corruption layer는 죽으라고 만든 것입니다. 어떤 기능의 데이터가 아직 옮겨 오지 않았기 때문에 존재하고, 그 데이터가 옮겨 오는 날 지워져야 합니다. 각각에 주인을 두고 언제 없앨지 적어 두고, 그곳을 지나는 트래픽을 지켜봅니다. 호출량이 도무지 줄지 않는 계층은 멈춰 선 마이그레이션입니다. 지울 수 있게 해 주는 것은 소유권을 분명히 해 두는 일이므로, 기능을 옮기기 전에 그 데이터를 이후 어느 시스템이 소유할지 정합니다. 양쪽이 여전히 쓸 수 있다면 그것은 두 시스템 사이의 번역이 아니라 공유 데이터베이스 하나에 애플리케이션 둘이 얹힌 것이고, 이 패턴이 약속한 것은 하나도 남지 않습니다.
