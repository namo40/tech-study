---
title: "Least Connections"
summary: "least connections は処理中のリクエストがいちばん少ないサーバーに次のリクエストを送ります。すべてのリクエストのコストが同じという前提を、ロードバランサーがすでに持っている測定値に置き換えるので、仕事が偏っている場面で選ぶポリシーになります。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: load-balancer
sceneStep: 2
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Power of Two Choices
    slug: power-of-two-choices
  - label: Tail Latency
    slug: tail-latency
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: YARP
    slug: yarp
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: The Power of Two Choices in Randomized Load Balancing
    url: https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
---

## いつ使うか

- リクエストのコストが桁違いに変わるとき。検索のエンドポイントとヘルスのエンドポイントが並んでいたり、レポートと単純な参照が混ざっていたりする場合です。
- 長く保たれる接続。ロードバランサーは接続を 1 度ルーティングするだけで、その後その接続がどんなトラフィックを運ぶかは分かりません。接続数を数えることが残された唯一の手がかりです。
- 速度の違うバックエンド。ハードウェアが違うからでも 1 台が不調だからでも、遅いサーバーには処理中のリクエストがたまり、その数がこれ以上足すなという合図になります。

## 注意点

- 数えているのは処理中のリクエストであって、待ち行列ではありません。即座に失敗するサーバーはいちばん空いているように見えるので、ヘルスチェックが気づくまで壊れたインスタンスのほうが健全なインスタンスより多くのトラフィックを引き寄せます。シーンのステップ 3 がその場面で、least connections とヘルスチェックが一緒でなければならない理由です。
- ロードバランサーは自分の接続しか数えません。インスタンスが複数あるとそれぞれ部分的な視界しか持たないため、局所的に最適な選択を足しても全体の最適にはなりません。
- バックエンドが増えると正確な数を保つこと自体にコストがかかります。power of two choices は宛先を 2 つ無作為に選んでキューの短いほうを取るもので、調整のコストなしに利点のほとんどを得られるため、規模の大きなシステムはたいていこちらを動かしています。
- 同点には規則が必要です。いつも先頭を取るのではなく順番を回して解くこと。そうしないと空いているプールですべてのリクエストが 1 台に集まります。
- これが揃えるのは同時実行数であって遅延ではありません。テールが問題なら、サーバーごとの同時実行上限とタイムアウトを組み合わせ、遅いサーバーが仕事を抱え込まずに手放すようにします。

## .NET では

YARP では `LeastRequests` と呼び、既定のポリシーが `PowerOfTwoChoices` なのも、帳簿を持たずに least connections を近似できるからです。

```csharp
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            // LeastRequests reads the exact in-flight count; PowerOfTwoChoices
            // samples two destinations and takes the smaller of the two.
            LoadBalancingPolicy = LoadBalancingPolicies.LeastRequests,
            HttpRequest = new ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromSeconds(10) },
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
                ["s3"] = new() { Address = "http://api-3:8080/" },
            },
        },
    ]);
```

上の `ActivityTimeout` は飾りではありません。least connections はリクエストがいつか数から抜けることで初めて成り立ち、永遠にぶら下がったリクエストは枠を永遠に占めます。ポリシーとタイムアウトは同じ仕組みを両端から見たものです。Nginx は `least_conn`、HAProxy は `leastconn` と綴り、Envoy の既定はサンプル数を設定できる power of two choices である `LEAST_REQUEST` です。
