---
title: "Health-Based Routing"
summary: "ヘルスベースルーティングは、probe の結果と実際に転送したリクエストの結末から、どの宛先がまだ生きているかをロードバランサーが判断することです。壊れたマシンを失敗するリクエストの割合ではなく、短くなったローテーションに変えてくれます。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: load-balancer
sceneStep: 3
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Round Robin
    slug: round-robin
  - label: Health Check
  - label: Readiness
  - label: Liveness
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Graceful Shutdown
  - label: YARP
references:
  - title: YARP destination health checks
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/dests-health-checks
  - title: Health checks in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-10.0
  - title: Configure liveness, readiness and startup probes
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
---

## いつ使うか

- メンバーが 2 つ以上あるプールすべて。ヘルスチェックのないロードバランサーは、誰も気づかないあいだ壊れたインスタンス 1 台を失敗するリクエストの一定割合に変えてしまいます。
- ローリングデプロイ。インスタンスは止める前にローテーションから外し、本当に応答できるようになってから戻す必要があります。
- 自分だけで壊れうる依存関係があるとき。データベース接続を失ったインスタンスは生きてはいても応答できず、その違いはデータベースまで確認する readiness チェックだけが見分けられます。

## 注意点

- アクティブチェックは決まった間隔で probe を送り、パッシブチェックは実際のトラフィックの結果を読みます。アクティブチェックは空いているインスタンスの故障に気づき、パッシブチェックは probe のエンドポイントでは再現しない失敗に気づきます。できるなら両方動かします。
- しきい値と間隔は 1 つの判断です。1 秒間隔で連続 2 回なら、死んだインスタンスへ向かうリクエストが最大 2 秒ぶん生まれます。シーンのステップ 3 が描いているのはまさにその隙間です。間隔を縮めれば隙間は狭まり、probe のコストは増えます。
- 1 回の失敗はノイズです。probe の 1 回に反応するとローテーションが揺れ、揺れるローテーションはどのインスタンスも温まる間がないほど速く負荷を動かします。
- ポートではなくアプリケーションを確認します。TCP 接続テストは何かが待ち受けていることしか証明せず、無条件に 200 を返す `/healthz` はそれ以下のことしか証明しません。
- liveness と readiness は分けます。readiness は「トラフィックを受けてよいか」に、liveness は「再起動すべきか」に答えます。依存関係の確認を liveness に入れると、データベースの障害が全台の再起動ループに変わります。
- readiness チェックを先に落とすことは、きれいな終了の始まりでもあります。新しい仕事を受けるのをやめ、抱えているものを終わらせ、それから出ていきます。

## .NET では

ロードバランサー側の半分は連続失敗のポリシーを使うアクティブチェック、アプリケーション側の半分は依存関係まで答える readiness エンドポイントです。どちらか片方だけでは役に立ちません。

```csharp
// The balancer: probe /healthz/ready once a second, two strikes and out.
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            LoadBalancingPolicy = LoadBalancingPolicies.LeastRequests,
            HealthCheck = new HealthCheckConfig
            {
                Active = new ActiveHealthCheckConfig
                {
                    Enabled = true,
                    Interval = TimeSpan.FromSeconds(1),
                    Timeout = TimeSpan.FromSeconds(1),
                    Policy = HealthCheckConstants.ActivePolicy.ConsecutiveFailures,
                    Path = "/healthz/ready",
                },
                Passive = new PassiveHealthCheckConfig
                {
                    Enabled = true,
                    Policy = HealthCheckConstants.PassivePolicy.TransportFailureRate,
                    ReactivationPeriod = TimeSpan.FromSeconds(10),
                },
            },
            Metadata = new Dictionary<string, string> { ["ConsecutiveFailuresHealthPolicy.Threshold"] = "2" },
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
            },
        },
    ]);
```

```csharp
// The application: liveness says nothing about dependencies, readiness says everything.
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("shop")!, tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`Predicate = _ => false` が liveness エンドポイントの要点です。チェックを 1 つも走らせないので、プロセスが何かに答えられるかぎり 200 を返し、データベースの障害が全台を再起動させることはありません。Kubernetes も同じ 2 つのエンドポイントを `readinessProbe` と `livenessProbe` として読み、`failureThreshold` と `periodSeconds` が上のしきい値と間隔の役を果たします。その手前に `startupProbe` を置けば、起動の遅いインスタンスが温まりきる前に落とされることも防げます。
