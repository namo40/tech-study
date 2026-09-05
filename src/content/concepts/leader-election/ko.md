---
title: "Leader Election"
summary: "리더 선출은 똑같이 생긴 여러 인스턴스 가운데 정확히 하나만 골라 이름 붙은 역할을 맡깁니다. 설정으로 정해 두는 것이 아니라 갱신하지 않으면 만료되는 리스를 두고 경쟁해서 정하기 때문에, 그 역할은 어느 한 기계가 죽어도 살아남습니다."
category: "분산 조정"
scene: leader-election
steps:
  - title: "셋이 시작하고, 하나가 이끕니다"
    text: "똑같은 인스턴스 셋이 떠서 같은 리스 저장소에 하나뿐인 리스를 요청합니다. 저장소는 정확히 하나에게만 내어 주고, 이긴 쪽이 리더가 되어 일을 시작하며 나머지는 팔로워로 대기합니다."
  - title: "리더십은 직함이 아니라 리스입니다"
    text: "리더는 TTL이 다하기 전에 갱신을 계속하는 동안에만 자리를 지킵니다. 장애든 긴 멈춤이든 네트워크 단절이든, 갱신이 멈추면 자리는 그대로 만료됩니다. 만료는 죽은 보유자에게서 자리를 되찾아 오고, 안전은 에포크가 지킵니다."
  - title: "리더가 죽어도 리더는 하나입니다"
    text: "리스가 만료되면 다음에 확인한 팔로워가 자리를 얻고 그다음 팔로워는 거절되며, 에포크가 하나 올라갑니다. 돌아온 옛 리더가 갱신을 시도해도 낡은 에포크는 마찬가지로 거절됩니다. 이 장치가 막는 단 하나가 스플릿 브레인입니다."
  - title: "이 모든 것은 작업을 한 곳에서만 돌리기 위해 있습니다"
    text: "작업 스트립을 보면 기동과 죽음과 재선출을 지나는 동안에도 틱은 끊기지 않은 한 줄로 이어지고, 중복 카운터는 움직이지 않습니다. 자리는 잠깐 빌 수는 있어도 결코 둘이 나눠 앉지 않습니다."
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Split Brain
    slug: split-brain
  - label: Singleton Worker
    slug: singleton-worker
  - label: Health Check
    slug: health-check
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Failover
    slug: failover
references:
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
---

## 언제 쓰나

- 레플리카가 여러 개여도 딱 한 번만 일어나야 하는 배경 작업. 예약 작업, 아웃박스 발송기, 큐 펌프, 캐시 예열기, 야간 대사 작업이 모두 여기에 해당합니다.
- 애플리케이션이 수평 확장되면서 "복사본 하나만 돌리면 된다"는 전제가 무너지고, 두 번째 복사본이 첫 번째와 같은 일을 하기 시작한 순간.
- 일정이 아니라 주인이 필요한 역할. 파티션을 쥔 인스턴스, 마이그레이션을 진행하는 인스턴스, 쓰기 담당으로 응답하는 인스턴스가 그렇습니다.
- 페일오버를 호출기 알람이 아니라 초 단위로 재고 싶을 때. 자리는 배포를 다시 시작해서가 아니라 옛 보유자가 갱신을 멈춰서 저절로 옮겨 갑니다.

## 주의점

- 갱신은 작업과 무관하게 자기만의 루프에서 돌아야 합니다. 작업 단위 사이에 갱신을 끼워 넣는 리더는 단위 하나가 TTL보다 길어지는 순간 자리를 잃고, 몇 초짜리 가비지 컬렉션 멈춤만으로도 그렇게 됩니다.
- 작업은 단위마다 리더십을 다시 확인해야 하고, 갱신 루프가 리스를 잃었다고 알리면 즉시 멈춰야 합니다. 그러지 않으면 리더는 하던 배치가 끝날 때까지 계속 일합니다.
- 옛 리더가 리스를 잃은 시점과 그 사실을 알아채는 시점 사이에는 언제나 틈이 있습니다. 프로세스 안의 어떤 장치도 이 틈을 없애지 못하므로, 부수 효과가 있는 작업은 반드시 에포크를 실어 보내고 리소스 쪽에서 낡은 에포크를 거절하게 만들어야 합니다.
- TTL은 양쪽 끝에 대가가 붙은 다이얼입니다. 짧으면 페일오버가 빠른 대신 잠깐 멈춘 리더의 자리를 남이 가로챌 위험이 커지고, 길면 잘못된 탈취는 없는 대신 죽은 뒤 그만큼 자리가 비어 있습니다.
- 리스 하나는 그 리스의 범위 안에서만 리더 하나를 보장합니다. Kubernetes `Lease`는 한 클러스터의 네임스페이스에 묶여 있어서, 같은 배포를 돌리는 두 클러스터는 서로를 전혀 모르는 리더를 하나씩 뽑습니다.
- 리더 선출은 반복 실행에 안전한 작업 설계를 대신하지 못합니다. 중복 실행 구간을 인계 시점으로 좁혀 줄 뿐, 없애 주지는 않습니다.

## .NET에서는

기본 형태는 `BackgroundService` 하나입니다. 리스를 획득하고, 별도 타이머로 갱신하고, 리스를 잃는 순간 취소되는 토큰 아래에서 작업을 돌리고, 다시 대기 상태로 돌아갑니다.

```csharp
public sealed class LeaderLoop(ILeaseStore store, ILogger<LeaderLoop> log) : BackgroundService
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan RenewEvery = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan RetryEvery = TimeSpan.FromSeconds(2);

    private readonly string identity = $"{Environment.MachineName}:{Environment.ProcessId}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var lease = await store.TryAcquireAsync(identity, Ttl, stoppingToken);
            if (lease is null)
            {
                // 팔로워: 기다렸다가 다시 확인한다. 장면 속 watch가 이것이다.
                await Task.Delay(RetryEvery, stoppingToken);
                continue;
            }

            log.LogInformation("leading with epoch {Epoch}", lease.Epoch);
            await LeadAsync(lease, stoppingToken);
        }
    }

    private async Task LeadAsync(Lease lease, CancellationToken stoppingToken)
    {
        using var seat = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var work = RunWorkAsync(lease.Epoch, seat.Token);

        try
        {
            while (await store.TryRenewAsync(lease, Ttl, seat.Token))
            {
                await Task.Delay(RenewEvery, seat.Token);
            }
            log.LogWarning("lease {Epoch} lost, standing down", lease.Epoch);
        }
        catch (OperationCanceledException)
        {
            // 종료 중.
        }
        finally
        {
            await seat.CancelAsync();
            try
            {
                await work.WaitAsync(TimeSpan.FromSeconds(5), CancellationToken.None);
            }
            catch (OperationCanceledException)
            {
                // 취소된 작업이 끝나는 정상적인 경로.
            }
            catch (TimeoutException)
            {
                log.LogWarning("work did not stop within the grace period");
            }
            // 여기서 무엇이든 던지면 ExecuteAsync를 벗어나고,
            // 기본 BackgroundServiceExceptionBehavior가 호스트를 멈춘다.
        }
    }
}
```

이 루프에서 중요한 대목은 두 가지이고, 사실상 그 둘이 이 패턴의 전부입니다. 갱신이 작업 사이에 끼어드는 호출이 아니라 자기만의 `Task.Delay` 주기로 돌기 때문에 느린 작업 단위가 갱신을 늦출 수 없습니다. 그리고 갱신이 실패하는 즉시 `seat`이 취소되므로, 리스가 사라진 바로 그 신호로 작업도 함께 멈춥니다.

리스 원시 장치 자체는 이미 플랫폼에 있는 것을 쓰면 됩니다. Kubernetes에서는 `coordination.k8s.io`의 `Lease` 객체가 그것이고, .NET 클라이언트로 생성하고 갱신할 수 있으며 `spec.renewTime`과 `spec.leaseTransitions`가 장면 속 레코드 카드와 에포크에 대략 대응합니다. 다만 `leaseTransitions`는 서버가 발급하는 값이 아니라 자리를 차지한 클라이언트가 써넣는 값이라, 구조상 보장되는 에포크가 아니라 관례상의 에포크입니다. SQL Server에서는 리더가 열어 둔 세션 안에서 `sp_getapplock`을 잡으면 의존성을 늘리지 않고 배타성 절반을 얻습니다. 에포크는 여전히 위와 같은 행에서 나와야 합니다. Azure에서는 기간을 정해 둔 blob 리스가 가장 단순한 형태의 리스입니다.

```csharp
// SQL Server: 행 하나, 보유자 하나, 만료 시각 하나, 그리고 올라가기만 하는 숫자 하나.
const string acquire = """
    UPDATE leases
       SET holder = @identity,
           expires_at = DATEADD(SECOND, @ttlSeconds, SYSUTCDATETIME()),
           epoch = epoch + 1
    OUTPUT inserted.epoch
     WHERE name = @name
       AND (holder IS NULL OR expires_at <= SYSUTCDATETIME());
    """;
```

마지막으로 쓰기를 지킵니다. 리더는 자기가 받은 에포크를 들고 다니고 모든 쓰기에 그 값을 실어 보내므로, 자리를 잃은 줄 모르는 리더는 리소스 쪽에서 신뢰받는 대신 거절당합니다.

```csharp
// 더 새로운 리더가 더 높은 에포크로 이미 썼다면 거절된다.
const string commit = """
    UPDATE outbox_cursor
       SET position = @position, epoch = @epoch
     WHERE name = @name AND epoch <= @epoch;
    """;
```

마지막으로 짚어 둘 것은 시계입니다. 만료 판단은 저장소의 몫이거나, Kubernetes에서는 저장소의 레코드를 읽는 후보들의 몫입니다. 보유자 자신의 시계에 맡기는 일은 결코 없습니다. 두 기계의 시간은 자리를 맡길 만큼 정확히 일치하는 법이 없기 때문입니다. 리스가 아직 자기 것인지는 저장소에 물어보고, 대기 시간에는 `TimeProvider`를 씁니다. 남이 써 놓은 만료 시각을 자기 쪽 `DateTime.UtcNow`와 비교하지 않습니다.
