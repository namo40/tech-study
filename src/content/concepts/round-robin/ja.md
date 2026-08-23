---
title: "Round Robin"
summary: "ラウンドロビンは決められた順番に従って次のサーバーへリクエストを渡します。カーソル 1 つ以外に状態を持たず、何も測定しないため、リクエストのコストがほぼ同じ場面ではちょうどよい既定値になります。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: load-balancer
sceneStep: 1
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Weighted Round Robin
  - label: Layer 7 Load Balancing
  - label: Reverse Proxy
  - label: YARP
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: Kubernetes Service and kube-proxy
    url: https://kubernetes.io/docs/reference/networking/virtual-ips/
---

## いつ使うか

- 同じ大きさのインスタンスが同じくらいのコストの仕事をしているとき。すべてのエンドポイントが数ミリ秒で終わるステートレスな HTTP API がこれにあたります。
- コストが偏っているという証拠がまだない最初の設定。ラウンドロビンは十分に安いので、調整する対象というより後で別のものに切り替える出発点です。
- ロードバランサーがリクエストの所要時間を見られない場所。パケットを転送するだけで応答のコストを最後まで知らない L4 ロードバランサーの多くがそうです。

## 注意点

- 順番は先を見ません。遅いリクエストを 3 件まだ抱えているサーバーにも順番はそのまま回ってきます。シーンのステップ 2 が見せているのはその失敗です。
- 大きさの違うインスタンスには重みが必要です。加重ラウンドロビンはメモリが 2 倍のサーバーに順番を 2 倍与えますが、土台は同じ順番のままで、重みは名前が回ってくる頻度だけを変えます。
- 順番はロードバランサーごとに別々に回ります。複数のインスタンスがそれぞれのカーソルを回すと、結果は順番というより無作為に近づきます。負荷分散としては問題ありませんが、1 つのインスタンスのログだけを読むと混乱します。
- 長く保たれる接続の前では完全に崩れます。リクエストではなく接続をルーティングすると、ラウンドロビンの 1 回の判断がその接続のすべてのリクエストを処理することになり、WebSocket や gRPC のチャネル 1 本がサーバー 1 台を何時間も占有します。
- 新しいサーバーは順番に入った瞬間から最初の一巡でまるごとの分け前を受け取ります。冷えたまま 4 分の 1 のトラフィックを受けさせず、温めてから入れる理由がこれです。

## .NET では

`RoundRobin` が YARP の既定のポリシーで、分散をあえてしたくない場合は `FirstAlphabetical` を使います。重みは宛先のメタデータとして持たせ、重みを使うポリシーがそれを読みます。

```csharp
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            LoadBalancingPolicy = LoadBalancingPolicies.RoundRobin,
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
                ["s3"] = new() { Address = "http://api-3:8080/" },
            },
        },
    ]);
```

同じポリシーは別の名前でどこにでもあります。iptables モードの `kube-proxy` は接続ごとにバックエンドを無作為に選びますが、平均するとラウンドロビンになり、IPVS モードでは `rr` が文字どおりのアルゴリズムです。Nginx は指定がなければ加重ラウンドロビンを使い、Azure Load Balancer は 5 タプルをハッシュしてカーソルなしで接続を均等に散らします。どれでも注意点は同じで、この順番は回数において公平なだけで、仕事の量において公平ではありません。
