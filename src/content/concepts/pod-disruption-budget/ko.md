---
title: "Pod Disruption Budget"
summary: "pod disruption budget은 자발적으로 한 번에 내릴 수 있는 파드 수를 제한합니다. 그리고 실제로 내려가는 파드는 preStop, SIGTERM, 유예 시간이라는 의식을 거쳐 나가기 때문에, 계획된 유지보수가 장애처럼 보이지 않습니다."
category: "컨테이너와 오케스트레이션"
scene: pod-disruption-budget
steps:
  - title: '예산은 "내려라"를 "한 번에 하나씩"으로 바꿉니다'
    text: "드레인은 파드 둘을 내리고 싶어 하고, 예산은 둘이 준비 상태여야 한다고 요구합니다. 그래서 퇴거는 정확히 하나만 진행되고 다른 하나는 기다립니다. 거절이 아니라 보류입니다. 유지보수가 장애 대신 줄서기가 됩니다."
  - title: "퇴장은 의식이지 단전이 아닙니다"
    text: "먼저 preStop 훅이 돕니다. 새 일을 받지 않고 연결을 비웁니다. 그다음이 SIGTERM입니다. 처형이 아니라 요청이고, 앱은 쥐고 있던 것을 마무리합니다. 모든 단계는 어떤 요청도 비행 중에 죽지 않게 하려고 있습니다."
  - title: "유예 시간은 기한이 있는 인내입니다"
    text: "앱이 제때 끝냈으므로 종료는 정상으로 남았습니다. 기한을 넘겨 꾸물거렸다면 SIGKILL이 대화를 끝냅니다. 플러시도 작별 인사도 없습니다. 유예는 희망 섞인 기본값이 아니라 가장 긴 정직한 종료 시간에 맞춰 두는 값입니다."
  - title: "예산이 실제로 사 준 것입니다"
    text: "교대 파드가 올라와 준비 수가 셋으로 돌아오고, 그제야 두 번째 퇴거가 시작됩니다. 드레인 전 과정에서 ready는 둘 아래로 내려간 적이 없고 SLO 램프는 한 번도 깜빡이지 않았습니다. 그것이 제품의 전부입니다. 사용자가 감지할 수 없는 계획 작업."
related:
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Rolling Update
    slug: rolling-update
  - label: Readiness Probe
    slug: readiness-probe
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Health Check
    slug: health-check
references:
  - title: "Disruptions"
    url: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
  - title: "Specifying a Disruption Budget for your Application"
    url: https://kubernetes.io/docs/tasks/run-application/configure-pdb/
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

## 언제 쓰나

- 레플리카 수가 처리량이 아니라 가용성을 위해 존재하는 Deployment라면 씁니다. 하나를 잃어도 견디려고 사본을 셋 두었다면, 플랫폼이 셋을 한꺼번에 가져가는 것을 막아 주는 것은 예산뿐입니다. 쿠버네티스의 다른 어떤 것도 그 파드 셋이 같은 약속의 사본 셋이라는 사실을 알지 못합니다.
- 사람들이 서비스를 쓰는 동안 처음으로 노드를 드레인하기 전에 씁니다. 드레인, 클러스터 업그레이드, 노드 풀 교체, 오토스케일러의 노드 통합은 워크로드 입장에서 모두 같은 사건입니다. 애플리케이션 바깥의 무언가가 파드를 옮겨야 한다고 결정한 것입니다. 예산은 그 결정을 새벽 세 시가 아니라 오후 두 시에 내려도 안전하게 만들어 줍니다.
- 드레인하는 주체가 사람이 아니라 컨트롤러일 때 씁니다. Cluster Autoscaler, Karpenter, 관리형 노드 업그레이드, descheduler는 모두 eviction API를 거치고 모두 예산을 지키며, 어느 것도 먼저 물어보지 않습니다. 예산은 그들이 읽는 유일한 지시문입니다.
- `minAvailable`이 SLO로 쓸 수 있는 숫자여야 할 때 씁니다. 셋 중 둘이라는 값은 플랫폼 팀이 지어낸 숫자가 아니라, 서비스가 지연 목표 안에서 응답하면서 잃을 수 있는 용량이 얼마인지에 대한 진술입니다. 예산은 레플리카 수가 아니라 그 숫자에서 씁니다.
- 한 노드에 여러 워크로드가 있고 저마다 다르게 무너질 때 씁니다. 드레인은 노드 위의 모든 것을 한꺼번에 옮기므로, 가장 예민한 워크로드의 예산이 그 노드의 속도를 정합니다. 예산이 아예 없는 워크로드는 아무 속도도 정하지 못합니다.

## 주의점

- 예산은 자발적 중단만 지킵니다. 커널 패닉, 고장 난 디스크, 전원이 나간 노드, OOM 종료는 eviction API에 허락을 구하지 않고 예산을 쓰지도 않습니다. `minAvailable: 2`는 항상 파드 둘이 준비 상태라는 뜻이 아닙니다. 둘 미만이 되는 원인이 플랫폼은 아니라는 뜻입니다. 훨씬 작은 약속이지만 그래도 가질 가치가 있는 약속입니다.
- `minAvailable`을 레플리카 수와 같게 두면 모든 드레인이 교착됩니다. 레플리카 셋에 `minAvailable: 3`이면 허용되는 중단은 영원히 0이므로, 클러스터 업그레이드를 시작한 노드 드레인이 막히고 재시도하고 다시 막히면서 업그레이드가 끝나지 않습니다. 고장은 조용합니다. 아무것도 죽지 않고 드레인이 그저 돌아오지 않을 뿐입니다. `maxUnavailable: 0`은 같은 실수를 반대로 쓴 것입니다.
- 예산은 준비 상태 개수에 대한 산술이고, 준비 상태가 거짓말을 하면 그 산술은 쓸모가 없습니다. 연결을 거부하면서도 준비 프로브에 200을 돌려주는 파드는 `minAvailable`에 포함되지만 누구에게도 아무 도움이 되지 않습니다. 예산이 지키는 모든 것은 프로브가 "이 파드가 지금 요청을 처리할 수 있는가"에 정직하게 답한다는 전제 위에 서 있습니다.
- 준비 상태는 종료가 시작될 때, 연결을 비우기 전에 내려가야 합니다. 이 파드를 지목하는 엔드포인트 목록은 클러스터의 모든 노드에 사본으로 존재하므로, "나는 종료 중이다"와 "이제 아무도 나에게 라우팅하지 않는다" 사이에는 시차가 생깁니다. preStop 훅은 바로 그 시차에 앉아 있으라고 있습니다. 이 훅을 건너뛰면 트래픽이 아직 도착하는 동안 파드가 수신을 멈추고, 그것은 정상 종료로 포장한 502입니다.
- 유예 시간은 권고가 아니라 기한입니다. 시간이 다하면 프로세스는 그대로 죽으므로, 끝내지 못한 종료는 절반만 쓰인 상태를 남긴 채 크래시가 됩니다. 연결 비우기와 마지막 느린 요청까지 포함해 가장 긴 정직한 종료 시간을 재고, 유예를 그보다 크게 잡습니다. 평균으로 잡으면 배포할 때마다 요청 1000건 중 하나가 실패하고 아무도 재현하지 못하는 상태가 됩니다.
- 레플리카가 하나인 워크로드에 예산을 붙여 두고 도움이 되기를 기대하지는 마세요. 레플리카 하나에 `minAvailable: 1`이면 모든 드레인이 막히고, 하나에 `maxUnavailable: 1`이면 존재하는 유일한 중단을 허용합니다. 예산은 레플리카 수가 갖지 못한 가용성을 만들어 내지 못하며, 그런 척하면 장애가 파드에서 업그레이드로 옮겨 갈 뿐입니다.
- 예산은 중단을 배급할 뿐 중단을 안전하게 만들지는 않습니다. 파드가 제대로 나갈 시간을 벌어 줄 뿐이고, 그 시간을 쓸지 말지는 애플리케이션의 몫입니다. SIGTERM을 무시하는 애플리케이션은 예산이 있으나 없으나 똑같은 비율로 요청을 떨어뜨립니다. 두 쪽은 함께여야만 작동합니다.

## .NET에서는

호스트가 이미 의식의 대부분을 구현하고 있습니다. `IHost.RunAsync`는 SIGTERM 핸들러를 등록하고, 신호가 오면 서버가 새 연결을 받지 않게 하고, 진행 중인 요청을 기다리고, 모든 `IHostedService.StopAsync`를 돌린 뒤 종료합니다. 우리가 설정하는 것은 얼마나 오래 기다려 줄지입니다.

```csharp
builder.Services.Configure<HostOptions>(options =>
{
    // terminationGracePeriodSeconds보다 반드시 작게 잡습니다. 애플리케이션은
    // 몇 초를 남기고 스스로 정리를 끝내야 하고, 정리하는 도중에 플랫폼에게
    // 끊겨서는 안 됩니다.
    options.ShutdownTimeout = TimeSpan.FromSeconds(25);
});
```

호스트가 모르는 것이 하나 있는데, 준비 상태 엔드포인트입니다. 그리고 예산이 읽는 것이 바로 그 부분입니다. 종료가 시작되는 순간 준비 상태를 실패시켜서, 이미 받은 요청을 처리하는 동안에도 엔드포인트 목록이 이 파드를 빼기 시작하게 합니다.

```csharp
// 준비 프로브가 찌를 대상으로 등록합니다. 이 엔드포인트는 "나에게 라우팅해도
// 되는가"에 답하며, 그것은 "살아 있는가"와 다른 질문입니다. 마지막 요청을
// 마무리하는 중인 파드는 건강하지만 라우팅 대상이 되어서는 안 됩니다.
var shuttingDown = new CancellationTokenSource();
app.Lifetime.ApplicationStopping.Register(() => shuttingDown.Cancel());

app.MapGet("/healthz/ready", () =>
    shuttingDown.IsCancellationRequested ? Results.StatusCode(503) : Results.Ok());
```

`ApplicationStopping`은 SIGTERM이 도착한 시점, 그리고 서버가 수신을 멈추기 전에 발생합니다. 이 검사가 있어야 할 곳은 거기뿐입니다. `ApplicationStopped`는 모든 것이 끝난 뒤에 발생하며, 아무도 다시 묻지 않을 것을 비워 내는 자리입니다.

```csharp
public sealed class OutboxPump(IHostApplicationLifetime lifetime) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        while (!stopping.IsCancellationRequested)
        {
            // 이 토큰은 SIGTERM에서 호스트가 취소합니다. 토큰을 무시하는 루프는
            // 유예 시간이 결국 쓰기 도중에 죽여 버리는 루프입니다.
            await PumpOnceAsync(stopping);
            await Task.Delay(TimeSpan.FromSeconds(1), stopping);
        }

        // `stopping`을 넘기지 않습니다. 그것은 이미 취소되었습니다. 손에 든 것을
        // 마무리하는 것이 유예 시간이 있는 이유입니다.
        await DrainAsync(CancellationToken.None);
    }
}
```

플랫폼 쪽에서 예산은 네 줄이고, 의식의 시간 값이 정해지는 곳은 파드 스펙입니다. preStop의 sleep은 꼼수가 아닙니다. 준비 상태가 이미 실패로 바뀐 뒤 엔드포인트 목록이 그 사실을 따라잡는 시차 구간입니다.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2          # 레플리카 셋 중 둘, 그래서 한 번에 하나씩 퇴거
  selector:
    matchLabels:
      app: api
---
spec:
  template:
    spec:
      # preStop의 sleep, 진행 중인 요청, 호스트의 종료 타임아웃을 모두 덮고도
      # 여유가 남는 값입니다.
      terminationGracePeriodSeconds: 45
      containers:
        - name: api
          lifecycle:
            preStop:
              exec:
                # 준비 상태는 이미 실패하기 시작했습니다. 이 멈춤은 리스너를
                # 닫기 전에 모든 라우팅 테이블이 그 사실을 듣게 하는 시간이고,
                # 그 안에서 다른 일은 아무것도 일어나지 않습니다.
                command: ["/bin/sleep", "10"]
          readinessProbe:
            httpGet: { path: /healthz/ready, port: 8080 }
            periodSeconds: 2
            failureThreshold: 2
```

세 숫자는 함께 읽어야 합니다. 훅이 시작되고 4초쯤 안에 준비 상태가 실패하고, 훅이 파드를 10초 붙잡고, 호스트가 최대 25초 동안 마무리하고, 플랫폼은 45초까지 기다립니다. 하나를 바꾸면 나머지 둘을 확인하세요. 잘못 잡았을 때의 유일한 증상은 배포 중에만 실패하고 다른 어디에서도 실패하지 않는 소수의 요청이기 때문입니다.

마지막으로, 예산을 믿기 전에 예산을 확인합니다. `kubectl get pdb`는 클러스터가 지금 믿고 있는 값을 보여 주며, 겉보기에 멀쩡한 서비스에 `ALLOWED DISRUPTIONS: 0`이 떠 있다면 그것이 바로 위에서 말한 교착이 누군가 업그레이드를 시작하기를 기다리고 있는 모습입니다.

```bash
# ALLOWED DISRUPTIONS가 핵심 숫자입니다. `currentHealthy`에서 `desiredHealthy`를
# 뺀 값이고 계속 다시 계산되며, 퇴거하는 컨트롤러가 무언가를 가져가기 전에
# 읽는 값입니다.
kubectl get pdb api -o wide
```
