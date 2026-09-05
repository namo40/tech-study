---
title: "Sidecar"
summary: "사이드카는 애플리케이션 옆에 함께 탑니다. 같은 파드, 같은 수명, 그러나 별개의 컨테이너입니다. 모든 서비스에 필요한 것(TLS, 로그, 재시도)을 대신 맡아, 앱이 어떤 언어로 쓰였든 그중 무엇도 코드에 두지 않게 합니다."
category: "애플리케이션 아키텍처"
scene: sidecar
steps:
  - title: "모든 서비스에 필요한 것을 모든 서비스가 다시 짭니다"
    text: "고스트는 앱 안에서 자라는 TLS, 로깅, 재시도를 보여 줍니다. 옆 앱에도 같은 덩어리들이, 다른 언어로, 패치 때마다 서로 어긋나며 다시 자랍니다. 어느 것도 앱의 일이 아니라 플랫폼의 일입니다. 해법은 파드의 둘째 자리입니다."
  - title: "같은 파드, 다른 컨테이너, 하나의 수명입니다"
    text: "사이드카는 파드의 네트워크와 운명을 나눌 만큼 가까이 앉습니다. 앱과 함께 시작하고, 함께 죽고, 함께 늘어납니다. 그러면서도 별개의 컨테이너입니다. 자기 이미지, 자기 릴리스 주기, 자기 언어를 가집니다. 가까움이 투명함을 만들고, 분리가 재사용을 만듭니다."
  - title: "앱은 localhost의 평문만 압니다"
    text: "사이드카가 TLS를 종료하고, 파드의 루프백 너머로 요청을 건네고, 로그를 뒤로 실어 냅니다. 인증서가 교체되고 로그 형식이 바뀌어도 앱의 코드는 그중 무엇도 듣지 못합니다. 내일 다른 언어로 된 서비스에 같은 사이드카를 붙일 수 있고, 그것이 이 패턴의 제안 전부입니다."
  - title: "나가는 길에는 ambassador가 섭니다"
    text: "앱은 로컬 서비스라고 믿는 곳을 부르고, 바깥을 향한 사이드카인 ambassador가 그 호출을 진짜 백엔드로 날라 재시도하고 깨끗한 답을 돌려줍니다. 타임아웃, 라우팅, 페일오버는 외교관의 몫이고 앱에는 보이지 않습니다. 들어올 때도 나갈 때도 둘째 자리가 플랫폼의 말을 대신합니다."
related:
  - label: Ambassador
    slug: ambassador
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Secret Injection
    slug: secret-injection
  - label: Workload Identity
    slug: workload-identity
  - label: Retry
    slug: retry
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Adapter
    slug: adapter
  - label: Facade
    slug: facade
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
references:
  - title: "Sidecar pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar
  - title: "Ambassador pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador
  - title: "Sidecar Containers"
    url: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
---

## 언제 쓰나

- 서비스 전체에 같은 것이 필요하고, 그중 아무도 그것에 관심이 없을 때 씁니다. TLS 종료와 mTLS, 로그와 메트릭 적재, 설정 갱신, 인증서 교체, 아웃바운드 재시도와 타임아웃이 그렇습니다. 이것들은 플랫폼의 동작인데, 놓을 곳이 없어서 애플리케이션 저장소로 계속 흘러들어 옵니다. 사이드카가 그 놓을 곳입니다. 무엇이 여기에 속하는지 가리는 기준은 간단합니다. 비즈니스 규칙을 하나도 언급하지 않고 그 변경을 설명할 수 있다면 사이드카의 몫입니다.
- 서비스 전체가 한 가지 언어만 쓰지 않을 때 씁니다. 라이브러리는 런타임이 하나일 때 가장 싼 답이고 다섯일 때 가장 비싼 답입니다. 구현 다섯 개는 반드시 어긋나기 때문입니다. Go 쪽에 새 헤더가 들어가고, Node 쪽은 세 스프린트 뒤에 따라오고, Python 쪽은 애초에 그 헤더가 없었다는 사실이 나중에 발견됩니다. 모든 파드에 붙는 컨테이너 이미지 하나는 구현 하나이고, 한 번만 배포하면 됩니다.
- 바꿀 수 없는 것에 플랫폼 동작을 나중에 얹어야 할 때 씁니다. 벤더가 준 이미지, 담당 팀이 해체된 서비스, 빌드가 더는 돌지 않는 바이너리는 어느 것도 다시 컴파일할 수 없습니다. 그러나 어느 것이든 옆에 컨테이너를 하나 세울 수는 있습니다. 앱은 이미 열어 둔 포트에서 평문 HTTP를 계속 듣고, 파드 바깥 세상은 그래도 mTLS를 받습니다.
- 서비스 메시를 이미 쓰고 있거나 곧 쓰게 될 때 씁니다. 메시는 이 패턴을 서비스 전체 규모로 키운 것입니다. 모든 파드에 프록시 사이드카가 주입되고, 컨트롤 플레인이 그 전부를 한꺼번에 설정합니다. 사이드카 하나를 이해하면 메시가 파드 천 개에 무엇을 하는지 이해한 것입니다. 메시의 청구서는 이 홉들의 합이므로, 도입 전에 이해해 두는 편이 좋습니다.
- 서비스 하나, 언어 하나, 팀 하나라면 **쓰지 않습니다**. 배포 대상이 하나이고 그것이 팀이 쓰는 언어로 되어 있다면, 라이브러리가 같은 결과를 더 적은 장치로 냅니다. 크기를 잡을 컨테이너도, 재야 할 홉도, 배포할 이미지도 늘지 않습니다. 이 패턴은 같은 문제를 두 번 이상 풀어야 할 때 제값을 합니다. 서비스가 하나뿐인 곳은 그 문제를 한 번만 풉니다.

## 주의점

- 홉 하나하나가 지연이고, 새로 생긴 고장 지점입니다. 예전에는 앱에 바로 닿던 요청이 이제 사이드카에 닿고, 루프백을 건너고, 그다음에야 앱에 도착합니다. 응답도 같은 길을 되짚어 옵니다. 파드 자신의 네트워크 위에서는 싼 값이지만 공짜는 아닙니다. 게다가 앱은 멀쩡한데 사이드카만 굶거나, 교착에 빠지거나, 메모리가 모자랄 수 있습니다. 늘어난 홉을 잡음이라고 넘기지 말고 실제로 재야 합니다. 그리고 어느 컨테이너가 아픈지 헬스 체크가 말해 줄 수 있게 만들어 두어야 합니다.
- 사이드카의 리소스는 파드의 리소스에서 나옵니다. 스케줄러가 파드를 배치할 때 사이드카의 CPU와 메모리 request는 앱의 request에 더해집니다. 그래서 서비스 전체에 붙는 사이드카가 넉넉한 request를 들고 있으면 노드 하나에 들어가는 파드 수가 조용히 달라집니다. 두 컨테이너의 크기는 모두 의도적으로 잡아야 합니다. 로그 적재가 몰릴 때 정작 모두가 기다리는 쪽을 굶길지 말지는 사이드카의 limit이 결정합니다.
- 이 패턴이 실제로 발목을 잡는 곳은 수명 순서입니다. 앱이 첫 요청을 받기 전에 사이드카가 준비되어 있어야 합니다. 그러지 않으면 초기 트래픽이 아직 듣지 않는 프록시 앞에서 실패합니다. 그리고 앱이 멈춘 뒤에 사이드카가 남은 요청을 다 흘려보내야 합니다. 그러지 않으면 마지막으로 날아가던 요청들이 자기를 나르던 것을 잃습니다. Kubernetes의 네이티브 사이드카 컨테이너, 즉 `restartPolicy: Always`를 붙인 init 컨테이너가 바로 이 때문에 있습니다. 메인 컨테이너보다 먼저 시작하고 나중에 종료됩니다. `preStop` 훅에 sleep을 넣기 전에 이쪽을 먼저 씁니다.
- 이것은 플랫폼 구성 요소이므로 그렇게 버전을 관리해야 합니다. 사이드카는 이제 모든 서비스의 요청 경로 위에 있습니다. 잘못된 이미지 하나가 서비스 하나의 나쁜 오후가 아니라 서비스 전체의 장애가 됩니다. `latest`를 따라다니지 말고 워크로드마다 버전을 고정하고, 로드 밸런서 설정을 배포하듯 굴리고, 애플리케이션 배포를 하나도 건드리지 않고 되돌릴 수 있는 상태를 유지합니다.
- 비즈니스 로직이 들어오게 두지 않습니다. 사이드카가 주문이 무엇인지 아는 순간 그것은 두 번째 애플리케이션이 됩니다. 두 번째 애플리케이션이 갖춰야 할 테스트는 하나도 없이 말입니다. 그리고 그 배포는 매번 도메인의 배포가 됩니다. 선은 어느 서비스든 원할 수 있는 동작까지입니다. 또한 하나씩 맡은 사이드카 다섯보다 다섯 가지 일을 하는 사이드카 하나가 낫습니다. 사이드카 하나는 프로세스 하나이고, 파드에 대한 request 한 몫이고, 앱이 서비스를 시작하기 전에 준비되어야 할 것 하나입니다.

## .NET에서는

눈에 보이는 결과는 뺄셈입니다. 앱이 플랫폼의 일을 그만두므로, 흥미로운 차이는 `Program.cs`에서 무엇이 빠지는가입니다.

```csharp
// 전: 앱이 TLS와 로그 적재, 그리고 모든 아웃바운드 호출의 재시도 정책을 소유한다.
// 셋 다 플랫폼의 일인데 앱의 저장소 안에 들어 있다.
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(443, l => l.UseHttps(LoadCertificate())));
builder.Logging.AddOpenTelemetry(o => o.AddOtlpExporter(e => e.Endpoint = CollectorUri));
builder.Services.AddHttpClient<PricingClient>(c => c.BaseAddress = new Uri("https://pricing.internal"))
    .AddStandardResilienceHandler();
```

```csharp
// 후: 루프백 위의 평문 HTTP, stdout으로 나가는 로그, 그리고 바로 이 파드의
// 포트인 기준 주소. 인증서 코드도, 익스포터도, 재시도도 없다.
builder.WebHost.ConfigureKestrel(o =>
{
    o.ListenLocalhost(8080);      // 트래픽: 사이드카만 여기에 닿는다
    o.ListenAnyIP(8081);          // 헬스: kubelet은 파드 IP를 두드린다
});
builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
builder.Services.AddHttpClient<PricingClient>(c => c.BaseAddress = new Uri("http://localhost:3500"));
```

Kestrel이 `ListenLocalhost`로 듣는다는 점은 분명히 말해 둘 만합니다. 이제 트래픽 포트는 파드 바깥에서 아예 닿을 수 없고, 그 포트를 부를 수 있는 것은 파드의 네트워크 네임스페이스를 공유하는 프로세스뿐입니다. 그것이 사이드카입니다. 평문이 루프백을 벗어나지 않는다면, TLS를 다른 곳에서 종료하는 일은 격을 낮추는 것이 아닙니다.

kubelet은 그런 프로세스가 아니고, 그래서 두 번째 리스너가 있습니다. `httpGet`이나 `tcpSocket` 프로브는 `host` 필드가 달리 말하지 않는 한 파드 IP로 붙으므로, 루프백에서만 듣는 리스너를 향한 프로브는 영영 답을 받지 못하고 readiness는 계속 실패합니다. 길은 셋입니다. 위처럼 파드 IP에서 듣되 헬스 엔드포인트만 싣는 리스너를 두거나, 프로브를 사이드카의 포트로 향하게 하고 사이드카가 앱으로 넘기게 하거나, 컨테이너 안에서 실행되어 루프백을 쓸 수 있는 `exec` 프로브를 쓰는 것입니다.

둘째 자리와 공유되는 수명은 매니페스트에서 선언됩니다. 네이티브 사이드카는 끝나지 않는 init 컨테이너이고, 그 덕분에 먼저 시작하고 나중에 멈추는 순서를 얻습니다.

```yaml
spec:
  initContainers:
    - name: sidecar
      image: registry.internal/platform/edge:2.14.0
      restartPolicy: Always          # init 단계가 아니라 사이드카로 만드는 부분
      ports: [{ containerPort: 443 }]
      resources:
        requests: { cpu: 50m, memory: 64Mi }
        limits:   { cpu: 500m, memory: 128Mi }
  containers:
    - name: app
      image: registry.internal/shop/api:9.3.1
      readinessProbe:
        httpGet: { path: /healthz/ready, port: 8081 }   # 루프백이 아니라 파드 IP
      env:
        - name: PRICING_BASE_URL
          value: http://localhost:3500      # 진짜 호스트가 아니라 ambassador
```

그러면 헬스 체크는 어느 컨테이너에게 묻는 것인지 정직해야 합니다. 앱의 readiness 프로브는 앞에 무엇이 서 있든 앱에 대해 답해야 하고, 사이드카는 자기 것을 따로 내놓습니다.

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<ShopDbContext>("db")
    .AddCheck("self", () => HealthCheckResult.Healthy());

// 헬스 리스너에 묶어, 트래픽 포트에서는 아무것도 이것을 서빙하지 않게 한다.
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = _ => true })
   .RequireHost("*:8081");
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = c => c.Name == "self" })
   .RequireHost("*:8081");
```

Dapr는 .NET을 위한 기성품 형태입니다. 부품이 이미 만들어진 채로 같은 그림을 주기 때문에 이름을 적어 둘 만합니다. 파드마다 하나씩 붙는 사이드카가 서비스 호출, 발행 구독, 상태, 시크릿을 맡고, SDK의 호출은 나가는 길에 `http://localhost:3500`으로 풀립니다.

```csharp
builder.Services.AddDaprClient();

// 앱은 호스트가 아니라 서비스 이름을 부른다. 디스커버리와 mTLS, 재시도와
// 타임아웃은 사이드카의 문제이고, 위 코드는 그 차이를 알아채지 못한다.
app.MapPost("/orders", async (Order order, DaprClient dapr, CancellationToken ct) =>
{
    var quote = await dapr.InvokeMethodAsync<Basket, Quote>(
        HttpMethod.Post, "pricing", "quote", order.Basket, ct);
    return Results.Ok(quote);
});
```

다른 클러스터로 옮기는 일, 인증 기관을 교체하는 일, 로그 형식을 바꾸는 일이 사이드카 이미지만 바꾸면 끝나는 변경이라면 경계가 제자리에 있습니다. 그중 하나라도 애플리케이션 솔루션을 열어야 한다면, 무언가가 선을 넘어 다시 안으로 들어온 것입니다.
