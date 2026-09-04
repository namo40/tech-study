---
title: "CAP Theorem"
summary: "CAP 정리는 네트워크 단절이 복제본들을 갈라놓았을 때 둘 중 하나를 골라야 한다고 말합니다. 최신이 아닐 수도 있는 값으로 계속 답하거나, 합의가 돌아올 때까지 답을 거부하는 것입니다. PACELC는 여기에 일상의 절반을 더합니다. 어디에도 단절이 없어도 모든 읽기에서 지연과 일관성을 맞바꾸고 있기 때문입니다."
category: "데이터 분산과 일관성"
scene: cap-theorem
steps:
  - title: "단절은 일어나고, 고르지 않으면 둘로 갈라집니다"
    text: "고스트는 link를 끊고 두 복제본이 계속 답하게 둡니다. 둘의 값이 서로 멀어지고, 같은 질문에 이제 정직한 답이 둘입니다. 그것이 이 정리의 실제 내용입니다. 네트워크 단절은 선택 사항이 아니므로, 단절이 오면 일관성과 가용성 중 하나를 붙듭니다. 고르지 않는 것은 두 답을 한꺼번에 고르는 것입니다."
  - title: "일관을 고르면 일부는 기다립니다"
    text: "단절 아래에서 합의에 닿지 못하는 쪽은 거부합니다. 틀린 답보다 무응답이 낫다는 것입니다. 내어 준 답은 전부 하나뿐인 참값이고, 값은 네트워크가 아물 때까지 시스템 일부가 어두워지는 것입니다. 은행과 재고가 이 줄을 삽니다. 거절의 비용은 재시도 한 번이지만, 낡은 잔고의 비용은 진짜 돈이니까요."
  - title: "가용을 고르면 어제의 답을 듣습니다"
    text: "같은 단절 아래에서 양쪽 다 계속 답합니다. 끊긴 쪽은 마지막으로 알던 것을 내어 줄 뿐이고, 이 장면에서는 그 정직함이 보이도록 stale 표시를 달았습니다. 네트워크가 아물면 복제본들은 수렴합니다. 피드와 장바구니와 카운터가 이 줄을 삽니다. 조금 낡은 답이, 완벽하게 최신인 로딩 표시보다 나으니까요."
  - title: "어디에도 단절이 없어도 거래는 계속됩니다"
    text: "강한 일관 읽기는 말하기 전에 복제본들과 상의해야 하고, 그 합의는 왕복이며, 계량기가 그것을 보여 줍니다. 느슨한 읽기는 가장 가까운 사본에서 빠르게, 이따금 낡게 답합니다. 그것이 PACELC가 더한 절반입니다. 단절이면 가용 대 일관, 아니면 지연 대 일관. 당신은 이 선 위의 한 점을 이미 골랐습니다. 오늘, 당신의 기본값 안에서요."
related:
  - label: Strong Consistency
    slug: strong-consistency
  - label: PACELC
    slug: pacelc
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Linearizability
    slug: linearizability
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Session Consistency
    slug: session-consistency
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Failover
    slug: failover
  - label: Conflict Resolution
    slug: conflict-resolution
references:
  - title: Relational vs. NoSQL data
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/relational-vs-nosql-data
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
---

## 언제 쓰나

- 시스템 단위가 아니라 데이터 집합 단위로 적용합니다. 주문 원장과 상품 피드는 같은 제품 안에 살면서 정반대의 답을 원합니다. 원장은 거짓말하느니 거부하고, 피드는 가진 것을 내어 줍니다. 시스템이 CP이거나 AP인 것이 아니라, 그 안의 데이터 집합 하나하나가 그렇습니다.
- 단절 상황 대응 문서를 쓸 때 꺼냅니다. 그 문서가 곧 이 정리를 구체적으로 옮긴 것이기 때문입니다. 어떤 호출이 거부하는지, 어떤 호출이 더 오래된 값을 내어 주는지, 클라이언트는 거부를 받으면 무엇을 해야 하는지, 네트워크가 돌아온 뒤 무엇이 조정되는지를 적게 됩니다.
- 관리형 저장소에서 일관성 수준을 고를 때 꺼냅니다. Cosmos DB의 다섯 단계는 이름이 붙은 이 다이얼이고, 하나를 고르는 일은 "모든 읽기가 최신 쓰기를 본다"와 "모든 읽기가 빠르다" 사이의 한 점을 고르는 일입니다.
- 벤더의 주장을 읽을 때 꺼냅니다. "CAP을 넘어섰다"는 말은 언제나 "선 위의 한 점을 고르고 이름을 붙였다"는 뜻입니다. 단절이 났을 때 소수 쪽의 읽기가 어떻게 되는지 물으면, 진짜 답이 한 문장으로 돌아옵니다.
- 증명이 아니라 틀로 씁니다. 이 정리의 값어치는 설계를 혼자 결정해 준다는 데 있지 않고, 두 사람이 서로 다른 교환을 가정한 채 이어 가던 대화를 멈춰 세운다는 데 있습니다.

## 주의점

- CAP의 C는 선형화 가능성입니다. 사본이 하나뿐인 것처럼, 모든 읽기가 가장 최근에 끝난 쓰기를 본다는 뜻입니다. ACID를 이야기할 때 말하는 C, 곧 트랜잭션 안에서 제약이 유지된다는 뜻보다 훨씬 강합니다. 둘을 섞으면 "ACID를 지킨다"는 데이터베이스가 이미 이 질문에 답한 것처럼 들리게 됩니다.
- 가용성은 한꺼번에 사라지지 않고 조금씩 깎입니다. CP 저장소가 단절을 만나면 정족수를 쥔 쪽은 계속 답하고 소수 쪽만 거부합니다. "우리는 일관성을 골랐다"는 말은 제품이 멈춘다는 뜻이 아니라, 제품의 일부가 일부 호출자에게 단절이 이어지는 동안 멈춘다는 뜻입니다.
- 단절은 끊긴 케이블만이 아닙니다. 긴 GC 멈춤, 패킷 손실, 과부하가 걸린 회선, 제한 시간 안에 답하기에는 그저 너무 느린 노드가 바깥에서는 똑같아 보입니다. 제때 합의하지 못하는 복제본들입니다. 굴착기를 만나는 일보다 이쪽을 만나는 일이 훨씬 잦으니, 일반적인 경우를 기준으로 설계합니다.
- AP를 내보내기 전에 수렴 이야기를 먼저 만듭니다. 마지막 쓰기 우선은 조용히 쓰기를 잃는 기본값입니다. 편집이 둘, 시계가 하나, 살아남는 것도 하나이고, 오류는 어디에도 없습니다. 데이터에 진짜 충돌이 있다면 버전 벡터나 필드별 병합, CRDT를 쓰고, 마지막 쓰기 우선을 유지한다면 어떤 쓰기를 버릴 각오인지 소리 내어 밝히세요.
- PACELC는 매일 체감하는 절반입니다. 대부분의 날에는 단절이 없고, 실제로 하고 있는 교환은 모든 읽기에서의 지연 대 일관성입니다. 시스템의 진짜 성격은 Else 쪽 가지에 있고, 그래서 CP만 말하는 것보다 PC/EL(단절이면 일관, 아니면 빠름)이 실제 배포를 훨씬 많이 설명합니다.
- 어느 쪽도 유행을 따라 고르지 마세요. 거짓말해서는 안 되는 데이터에 AP를 얹으면 몇 달 뒤 문의로 드러나는 조용한 손상이 쌓이고, 아무도 다시 읽지 않는 데이터에 CP를 얹으면 겪지 않아도 될 장애를 겪습니다.

## .NET에서는

이 다이얼은 대개 아키텍처가 아니라 클라이언트 설정입니다. Cosmos DB에서는 `ConsistencyLevel`이고, 계정에 기본값을 두고 클라이언트나 요청 단위로 좁힙니다. 계정 기본값보다 아래에 있는 단계일수록 더 싸고 빠릅니다.

```csharp
// 계정에 기본값이 있고, 클라이언트나 요청 하나는 그것을 느슨하게만 할 수 있다. 더 강하게는 못 한다.
var client = new CosmosClient(endpoint, credential, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,   // 평상시 기본값
    ApplicationRegion = Regions.WestEurope,        // "가장 가까운 사본"은 실제 설정이다
});

// 결정에 쓰이는 원장 읽기는 합의의 값을 치른다.
var balance = await accounts.ReadItemAsync<Account>(
    id, new PartitionKey(customerId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });

// 피드 읽기는 치르지 않고, 그렇다고 적어 둔다.
var feed = await articles.ReadItemAsync<Article>(
    id, new PartitionKey(feedId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Eventual });
```

같은 다이얼이 다른 이름으로도 나타납니다. SQL Server에서는 `ApplicationIntent=ReadOnly`가 연결을 읽기 가능한 보조 복제본으로 보내고, 동기 커밋 가용성 그룹이 CP 설정입니다. 보조 복제본이 확인을 멈추면 주 복제본의 커밋도 멈출 수 있기 때문입니다. MongoDB에서는 `readConcern`과 `writeConcern`이 짝을 이루고, 둘 다 `majority`로 두면 선형화 가능한 끝에 닿습니다.

애플리케이션 코드에서는 이 선택이 두 가지 모양으로 나타납니다. CP 모양은 거부를 재시도할 조건으로 다룹니다. 제한 시간 초과나 "복제본이 모자란다"는 오류를 잡아 물러났다가 다시 시도합니다. 네트워크가 아물면 답은 존재하게 되기 때문입니다. AP 모양은 낡은 답을 정상적인 답으로 다룹니다. 있는 것을 읽고, 알고 있는 신선도와 함께 보여 주고, 조정 과정을 사용자가 볼 수 있는 곳에 둡니다. 두 모양 모두 쓰기는 어렵지 않습니다. 비싼 것은 새벽 세 시에 그 엔드포인트가 잘못된 모양으로 쓰였다는 사실을 알게 되는 쪽입니다.
