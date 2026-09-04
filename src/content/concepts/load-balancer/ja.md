---
title: "Load Balancer"
summary: "ロードバランサーはリクエストを複数のサーバーに振り分けます。次のリクエストをどのサーバーが受けるかはポリシーが決め、コストが均一ならラウンドロビン、そうでなければ least connections を使い、どちらの場合もヘルスチェックを通ったサーバーにしか送りません。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: load-balancer
steps:
  - title: "ラウンドロビン"
    text: "リクエストは順番に次のサーバーへ行きます。リクエストごとのコストがほぼ同じなら、それだけで十分です。"
  - title: "偏った仕事"
    text: "ラウンドロビンは Server 2 がまだ遅いリクエスト 3 件を抱えていることを知らずに送り続けます。least connections は処理中の数を見て、余裕のあるところへ次のリクエストを送ります。"
  - title: "ヘルスチェック"
    text: "probe が 2 回失敗したサーバーはローテーションから外し、2 回成功したら戻します。故障から 2 回目の probe までのあいだはいくつかのリクエストがまだ失敗するので、probe の間隔が重要です。"
  - title: "スケールアウト"
    text: "新しいサーバーは probe を通過すると参加し、キャッシュと JIT が温まるあいだに受け持つトラフィックの割合が徐々に増えます。どのサーバーでもどのリクエストにも答えられるからこそ成り立つので、1 台にしか存在しない状態があってはいけません。"
related:
  - label: Round Robin
    slug: round-robin
  - label: Weighted Round Robin
    slug: weighted-round-robin
  - label: Least Connections
    slug: least-connections
  - label: Power of Two Choices
    slug: power-of-two-choices
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Health Check
    slug: health-check
  - label: Layer 4 Load Balancing
    slug: layer-4-load-balancing
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: Sticky Session
    slug: sticky-session
  - label: Readiness Probe
    slug: readiness-probe
references:
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: YARP destination health checks
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/dests-health-checks
---

## いつ使うか

- リクエストに答えるものが 2 つ以上あるとき。Web サーバー、HTTP API、gRPC サービスのいずれもあてはまります。
- 無停止デプロイとスケーリング。どちらもインスタンスが誰にも気づかれずに増減できることが前提で、それを可能にするのがロードバランサーです。
- 1 台のマシンが落ちてもトラフィックを保たなければならないとき。壊れたインスタンスをローテーションから外すだけで復旧が済む構成にできます。

## 注意点

- ラウンドロビンは仕事が均一であることを前提にしています。長く保たれる接続や遅いエンドポイントがあるなら least connections や power of two choices を使います。すでに忙しいサーバーにも順番は同じように回ってくるからです。
- ヘルスチェックはポートではなくアプリケーションを確認しなければなりません。トラフィックを受けるのに必要な依存関係まで確認する readiness エンドポイントが正直な信号で、probe の間隔が障害の続く長さを決めます。1 秒間隔で 2 回なら、リクエストは 2 秒間失敗します。
- プロキシの背後では forwarded ヘッダーを設定し、アプリが本当のクライアント IP とスキームを見られるようにします。設定しないとすべてのリクエストがロードバランサーから来たように見え、HTTPS のサイトなのにリダイレクトが `http` で返ります。
- スティッキーセッションは応急処置です。セッション状態を外に出してどのサーバーでもどのリクエストも受けられるようにし、どうしても動かせないものだけにアフィニティを残します。
- L4 ロードバランサーはパケットをそのまま転送するので速く、プロトコルを選びません。L7 ロードバランサーはリクエストを読むため、パス、ホスト、ヘッダーでルーティングし、TLS を終端し、繰り返しても安全な呼び出しを再送できますが、その分リクエストごとの仕事が増えます。
- 外す作業は入れる作業と同じくらい重要です。降ろすインスタンスにはまず新しい仕事を送るのをやめ、抱えているものを終わらせるのは後にします。そうしないとデプロイがエラーの山に変わります。

## .NET では

YARP は自分で書くのではなく設定するリバースプロキシです。クラスターが宛先を並べ、ポリシーが次のリクエストを受ける宛先を決め、アクティブヘルスチェックが壊れた宛先をローテーションの外に置きます。

```json
{
  "ReverseProxy": {
    "Routes": { "api": { "ClusterId": "api", "Match": { "Path": "/{**catch-all}" } } },
    "Clusters": {
      "api": {
        "LoadBalancingPolicy": "LeastRequests",
        "HealthCheck": {
          "Active": { "Enabled": true, "Interval": "00:00:01", "Timeout": "00:00:01",
                      "Policy": "ConsecutiveFailures", "Path": "/healthz/ready" }
        },
        "Metadata": { "ConsecutiveFailuresHealthPolicy.Threshold": "2" },
        "Destinations": {
          "s1": { "Address": "http://api-1:8080/" },
          "s2": { "Address": "http://api-2:8080/" },
          "s3": { "Address": "http://api-3:8080/" }
        }
      }
    }
  }
}
```

残りの半分はアプリケーション側にあり、抜け落ちやすいのもこちらです。アプリが必要とする依存関係まで答える readiness probe と、アプリが本当の相手を知るための forwarded ヘッダーです。

```csharp
// The app side: a readiness probe that checks what the app needs to serve traffic.
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("shop")!, tags: ["ready"]);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);

var app = builder.Build();
app.UseForwardedHeaders();
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`LeastRequests` が YARP の least connections で、しきい値 2 の `ConsecutiveFailures` はシーンが描いている規則そのものです。probe の 1 回の失敗はノイズ、連続 2 回は判断です。Azure Load Balancer や Application Gateway のようなクラウドのロードバランサーも、Kubernetes の Service や Ingress も、同じ 3 つの部品で設定します。宛先を選ぶポリシー、宛先の一覧を決めるヘルスチェック、そして背後のアプリが元のリクエストを見られるようにする転送ヘッダーです。
