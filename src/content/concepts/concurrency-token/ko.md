---
title: "Concurrency Token"
summary: "동시성 토큰은 데이터 접근 계층이 모든 갱신과 삭제의 WHERE 절에 얹는 속성이어서, 행이 읽었을 때의 값을 아직 들고 있을 때에만 쓰기가 반영됩니다. 조용히 사라지던 lost update를, 판단하는 데 걸린 시간 동안 잠금을 쥐고 있지 않은 채로, 애플리케이션이 답할 수 있는 예외로 바꿔 줍니다."
category: "트랜잭션과 동시성"
scene: isolation-level
sceneStep: 3
related:
  - label: Isolation Level
    slug: isolation-level
  - label: Row Version
    slug: row-version
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Change Tracking
    slug: change-tracking
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Local Transaction
    slug: local-transaction
  - label: Retry
    slug: retry
references:
  - title: Concurrency tokens (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: TimestampAttribute Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.componentmodel.dataannotations.timestampattribute
---

장면의 세 번째 단계에 나오는 행 버전이 데이터베이스 자신의 장부라면, 동시성 토큰은 애플리케이션이 그 장부로 하는 일입니다. 어떤 속성을 토큰으로 표시한다는 것은, 쓰기를 할 때에 한해 자기가 읽은 그 값도 행의 정체에 포함된다고 데이터 접근 계층에 알려 주는 일입니다. 그래서 만들어지는 갱신문은 더 이상 "키가 맞는 행의 이 열들을 이렇게 바꿔라"가 아니라 "키가 맞고 이 속성이 아직 내가 읽은 값을 들고 있는 행의 이 열들을 이렇게 바꿔라"가 됩니다. 행은 맞거나 맞지 않거나 둘 중 하나이고, 데이터베이스는 숫자로 답합니다. 영향받은 행이 몇 개인가. 0이면 누군가 먼저 다녀간 것입니다.

그 숫자가 장치의 전부이고, 그것을 알면 나머지가 전부 설명됩니다. EF Core는 `SaveChanges` 묶음 안의 각 문장이 보고한 행 수를 세어 자기가 기대한 수와 견주고, 어긋나면 `DbUpdateConcurrencyException`을 던집니다. 무엇이 바뀌었는지는 알려 줄 수 없습니다. 갱신문이 돌려준 것은 개수뿐이기 때문입니다. 알려 줄 수 있는 것은 자기가 붙들고 있던 행이 낡았다는 사실뿐입니다. 그래서 정직한 처리기는 전부 데이터베이스로 돌아가는 것에서 시작합니다.

어떤 속성을 표시할지는 실제 결과가 따라오는 설계 결정입니다. 데이터베이스가 만들어 주는 행 버전은 넓은 답입니다. 행에 대한 어떤 변경이든 동시에 진행되던 쓰기를 무효로 만들므로 안전하고, 쓰기 경로 쪽에 아무 규율도 요구하지 않으며, 원리상 공존할 수 있었을 편집들 사이에도 충돌을 만들어 냅니다. 업무 열 하나를 토큰으로 표시하는 것은 좁은 답입니다. 서로 다른 것을 고치는 두 사용자는 더 이상 충돌하지 않지만, 지켜지는 것은 표시한 열뿐이고 나머지 모든 열은 이제 언제든 터질 lost update가 됩니다. 넓은 답이 올바른 기본값이고, 좁은 답은 충돌이 잦고 필드들이 정말로 서로 독립일 때에만 값어치가 있습니다.

어려움의 대부분은 처리기에 있고, 그 모양은 누구의 값이 이겨야 하는가에 따라 달라집니다. 저장소 우선은 엔트리를 다시 읽고 시도했던 변경을 버리는 것으로, 사용자가 무언가를 확인만 하고 있었다면 이쪽이 맞습니다. 클라이언트 우선은 엔트리를 다시 읽고 데이터베이스의 현재 값을 원본 값으로 복사해 다음 쓰기가 맞도록 만든 뒤 다시 저장하는 것으로, 변경이 "취소로 표시" 같은 무조건적인 명령이라면 이쪽이 맞습니다. 진짜 병합은 두 버전을 보여 주고 묻는 것으로, 사람이 타이핑한 무언가라면 이쪽이 맞습니다. 어느 쪽이든 토큰 자체가 다시 읽기의 일부로 갱신되어야 합니다. 그러지 않으면 재시도는 첫 시도와 똑같은 이유로 실패합니다.

이름 붙여 둘 만큼 흔한 실수가 둘 있습니다. 첫째는 실패한 문장 하나만 재시도하는 것입니다. 그 문장이 속해 있던 트랜잭션은 롤백되었으므로, 이미 없는 트랜잭션에 쓰기 하나를 다시 밀어 넣으면 실패하거나, 더 나쁘게는 원래 속했어야 할 작업 단위 바깥에서 성공합니다. 재시도는 작업 전체를 다시 돌려야 하고, 블록 전체를 넘겨주면 실행 전략이 해 주는 일이 정확히 그것입니다. 둘째는 클라이언트를 거쳐 왕복하면서 불투명한 값으로 다뤄지지 않은 토큰을 믿는 것입니다. 브라우저가 숫자로 바꿔 놓은 `byte[]` 행 버전이나 직렬화기가 밀리초로 반올림한 `DateTime` 토큰은 자기 자신과도 같지 않아서, 저장할 때마다 충돌을 만들어 냅니다.

분명히 말해 둘 경계가 하나 있습니다. 토큰은 해결하지 못하는 문제를 해결하려고 집어 드는 경우가 많기 때문입니다. 토큰은 한 행을 같은 행에 대한 동시 쓰기로부터 지킵니다. 여러 행에 걸친 규칙에 대해서는 아무것도 하지 않고, 쿼리가 돌던 시점에 없던 행에 대해서도 아무것도 하지 않으며, 다른 데이터베이스에서 두 번째 서비스가 하고 있는 일에 대해서도 아무것도 하지 않습니다. 그런 것들에는 범위를 덮는 격리 수준이나 데이터베이스가 강제할 수 있는 제약, 또는 불변 조건이 한 행 안에 사는 설계가 필요합니다. 토큰의 일은 좁고, 대신 아무도 기다리게 하지 않으면서 그 일을 해냅니다. 가지고 있을 값어치가 있는 이유가 정확히 그것입니다.
