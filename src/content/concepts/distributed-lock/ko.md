---
title: "Distributed Lock"
summary: "분산 잠금은 한 번에 한 인스턴스만 어떤 일을 하도록 만드는 장치입니다. 실제로는 만료 시간이 붙은 lease라서 보유자가 모르는 사이에 잠금을 잃을 수 있고, 옛 보유자의 쓰기를 자원이 직접 거부하게 만드는 것은 fencing token뿐입니다."
category: "분산 조정"
scene: distributed-lock
steps:
  - title: "인스턴스 둘, 작업 하나"
    text: "야간 작업이 두 인스턴스에서 동시에 발화해 둘 다 같은 보고서에 쓰고, 쓰기가 뒤섞입니다. 둘 다 자기는 성공했다고 믿습니다."
  - title: "잠금이 아니라 lease"
    text: "먼저 온 인스턴스가 만료 시간을 붙여 키를 차지하고 일하는 동안 계속 갱신합니다. 둘째는 거부되어 기다립니다. 보유자가 놓으면 대기자가 이어받습니다. TTL은 죽은 보유자가 모두를 영원히 막지 못하게 하려고 있습니다."
  - title: "만료는 묻지 않는다"
    text: "보유자가 긴 GC나 네트워크 끊김으로 멈추고, 그 사이 lease가 만료됩니다. 대기자가 잠금을 잡고 씁니다. 그다음 옛 보유자가 깨어나 여전히 자기가 잠금을 쥐고 있다고 믿은 채 씁니다."
  - title: "Fencing"
    text: "획득할 때마다 커지기만 하는 토큰을 받고, 자원은 자기가 본 가장 큰 값을 기억합니다. 옛 보유자의 쓰기는 더 작은 토큰을 달고 오므로 저장소 자체가 거부합니다. 잠금에 손을 대기 전에 파티셔닝, unique 제약, 반복해도 결과가 같은 연산(idempotent)을 먼저 고려합니다."
related:
  - label: Distributed Lease
    slug: distributed-lease
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Singleton Worker
    slug: singleton-worker
  - label: Partitioning
    slug: partitioning
  - label: Idempotency
    slug: idempotency
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
references:
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

## 언제 쓰나

- 더 싼 답을 모두 지운 뒤에만 씁니다. 키로 작업을 나눠 두 인스턴스가 같은 대상을 건드릴 수 없게 하거나, 데이터베이스의 unique 제약이 둘째 쓰기를 거부하게 하거나, 조건부 갱신으로 낡은 쓰기가 들어오지 못하게 하거나, 핸들러를 여러 번 실행해도 결과가 같게 만드는 방법이 먼저입니다.
- 단일 실행 워커, 두 번 돌면 안 되는 예약 작업, 한 번만 일어나야 하는 마이그레이션 단계. 작업을 키로 쪼갤 수도 없고 반복할 수도 없을 때가 잠금이 필요한 자리입니다.
- 트랜잭션 대신 쓰지는 않습니다. 분산 잠금은 프로세스끼리 순서를 맞춰 줄 뿐이고, 두 쓰기를 원자적으로 묶어 주지도, 보유자가 중간에 죽었을 때 되돌려 주지도 않습니다.

## 주의점

- 분산 잠금은 lease입니다. 보유자가 일을 끝냈든 잠시 멈춰 있든 상관없이 만료되므로, 보유자가 자기 상태를 잘못 알고 있을 수 있다고 전제해야 합니다. "내가 잠금을 쥐고 있으니 아무도 쓰지 않는다"는 가정은 긴 GC 정지 앞에서 무너집니다.
- 모든 쓰기에 획득할 때 받은 토큰을 달고, 자원이 더 작은 토큰을 거부하게 만듭니다. 그렇게 하지 않으면 잠금은 저장소가 듣지 못하는 권고에 그칩니다. 토큰 검사가 있으면 배타성을 강제하는 쪽은 저장소가 되고, 잠금은 최적화 장치로 내려갑니다.
- TTL은 작업의 p99보다 넉넉히 잡고, 만료 전에 충분한 여유를 두고 갱신하며, 갱신이 실패하는 순간 작업을 멈춥니다. 갱신 실패는 lease가 이미 사라졌을 수도 있다는 뜻이므로, 옳은 대응은 더 세게 시도하는 것이 아니라 작업을 포기하는 것입니다.
- 획득 실패, 갱신 실패, 보유 시간을 지표로 남깁니다. 몇 분씩 잡고 있는 잠금은 설계가 잘못됐다는 신호입니다. 임계 구역 안으로 HTTP 호출이나 큐 전송, 보고서 렌더링처럼 밖에 있어야 할 일이 들어왔다는 뜻입니다.
- 잠금 서비스의 시계를 진실의 근거로 삼지 않습니다. Redis의 만료, 프로세스의 시계, 자원 쪽 시계는 모두 어긋나며, fencing token은 정확성이 그 어느 시계에도 기대지 않게 하려고 있습니다.
- Kubernetes에서 leader election이 필요하면 직접 만들지 말고 Lease 객체를 씁니다. 리더가 바뀌는 순간에는 잠시 겹칠 수 있으니, 새 리더가 시작할 때 옛 리더가 아직 돌고 있을 수 있다고 보고 설계합니다.

## .NET에서는

Redis 위의 lease는 연산 셋으로 이뤄집니다. 키가 없을 때만 차지하고, 아직 우리 것일 때만 갱신하고, 아직 우리 것일 때만 놓습니다. 뒤의 두 연산에 들어간 비교 후 갱신이 이미 남의 손에 넘어간 lease를 우리가 연장하거나 지워 버리는 일을 막아 줍니다.

```csharp
public sealed record Lease(string Key, string Owner, long Token, TimeSpan Ttl);

public sealed class RedisLease(IDatabase redis)
{
    public async Task<Lease?> TryAcquireAsync(string key, TimeSpan ttl)
    {
        var token = await redis.StringIncrementAsync($"{key}:fence");        // monotonic fencing token
        var owner = Guid.NewGuid().ToString("N");
        var ok = await redis.StringSetAsync(key, $"{owner}:{token}", ttl, When.NotExists);
        return ok ? new Lease(key, owner, token, ttl) : null;
    }

    // Renew only if we still own it (compare-and-set in Lua).
    private const string RenewScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0";

    public async Task<bool> RenewAsync(Lease lease) =>
        (long)await redis.ScriptEvaluateAsync(RenewScript, [lease.Key],
            [$"{lease.Owner}:{lease.Token}", (long)lease.Ttl.TotalMilliseconds]) == 1;

    private const string ReleaseScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

    public Task ReleaseAsync(Lease lease) =>
        redis.ScriptEvaluateAsync(ReleaseScript, [lease.Key], [$"{lease.Owner}:{lease.Token}"]);
}

// The resource side: refuse anything older than the highest token seen.
// UPDATE reports SET body = @body, last_token = @token WHERE id = @id AND last_token < @token;
```

잠금을 안전하게 만드는 부분은 마지막 줄뿐인데, 보통 빠져 있는 것도 그 줄입니다. 자원이 토큰 열을 들고 있을 수 없다면 fencing도 할 수 없고, 그때 잠금이 할 수 있는 최선은 충돌을 불가능하게 만드는 것이 아니라 드물게 만드는 것입니다.

Kubernetes에서 단일 실행 워커가 필요하면 Lease 객체로 leader election을 하고 상태 관리는 플랫폼에 맡깁니다. 리더 교체 순간에는 여전히 짧게 겹치므로, 작업은 두 번 실행돼도 문제가 없게 짜고 그 작업이 만드는 쓰기에는 계속 토큰을 답니다.
