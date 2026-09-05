---
title: "Load Test"
summary: "Load Test は現実的なトラフィックをシステムに流し込み、最初にどこがたわむかを見る作業です。求める数字は最大スループットではなく、レイテンシとエラーがまだ目標を満たす最大の負荷です。"
category: "テストと検証"
scene: load-test
steps:
  - title: "ランプ"
    text: "まずウォームアップし、負荷を段階的に上げて各段階を維持します。仮想ユーザー 100 でサービスは毎秒 475 件を処理し、p95 は 40 ms、エラーはありません。スループットが直線で上がりレイテンシが平らなあいだは、まだシステムはボトルネックではありません。"
  - title: "膝"
    text: "ユーザー 300 あたりを過ぎると、負荷を増やしてもスループットは増えず、待ち行列だけが増えます。p95 は 540 ms まで上がり、timeout が始まります。依存関係のメーターが、何が最初に飽和したかを教えてくれます。CPU は 60% なのにコネクションプールは満杯で 180 件が接続を待っており、直すか大きさを決めるべきはプールです。"
  - title: "持続可能な点、それから soak"
    text: "目標をなお満たす最大の負荷まで下げます。ここでは p95 180 ms で毎秒 890 件であり、ピークの 1,060 ではなくその数字が容量です。それから維持します。ヒープは 40% から 65% へ上がり、短いテストでは見えないリークです。"
  - title: "現実に近づける"
    text: "ホットな id が 1 つだけだと、すべてのリクエストがキャッシュヒットになり、同じサービスが毎秒 1,121 件、p95 24 ms と報告します。id を 1 万件にして命中率が 60% になると 886 件、189 ms です。固定の到着率でも測りましょう。行儀よく待つユーザーは、遅いサーバーが自分のテストを自ら絞るのを許してしまいます。"
related:
  - label: Stress Test
    slug: stress-test
  - label: Spike Test
    slug: spike-test
  - label: Capacity Test
    slug: capacity-test
  - label: Soak Test
    slug: soak-test
  - label: Throughput
    slug: throughput
  - label: Tail Latency
    slug: tail-latency
  - label: SLO
    slug: slo
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Rate Limiter
    slug: rate-limiter
  - label: USE Method
    slug: use-method
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: NBomber documentation
    url: https://nbomber.com/docs/getting-started/overview/
---

## いつ使うか

- リリース前、トラフィックイベント前、容量を決める前に使います。データ層やプールサイズ、ランタイム設定を変えたあとにも使います。
- どのリソースが最初に飽和するかを見つけるために使います。そうすればスケールやチューニングが、増やしやすい側ではなく本当のボトルネックを狙えます。

## 注意点

- ピークではなく、目標を満たす持続可能なスループットを報告します。ピークはすでに失敗していた点であり、その数字を口にした時点でサービスが支えられない値を約束することになります。
- ウォームアップと計測を分けます。JIT もキャッシュもコネクションプールも冷えた状態から始まるため、最初の 1 分はシステムではなく起動処理を測っています。
- データのカーディナリティ、ペイロードサイズ、keep-alive、HTTP バージョンを本番に近づけます。ホットなキーが 1 つあるだけで、すべてのリクエストがキャッシュヒットになり、すべての数字が誰も運用していないシステムについての主張になります。
- ユーザーに面するサービスなら、固定の到着率を使う open model を選びます。think time のある closed model はサーバーが遅くなると負荷を減らすので、見つけるべき遅さをかえって隠します。
- テストが走っているあいだ、依存関係も一緒に見ます。プールの待ち、スレッドプールのキュー長、GC の停止、キューの深さ、下流の rate limit が対象です。サービスは健全に見えても、崩れたのはデータベースかもしれません。
- soak テストは、リークやプールのドリフト、断片化が現れるだけの長さで回します。1 時間きれいだったことは、8 時間目について何も語りません。
- 計測したいネットワーク経路の外から負荷をかけ、負荷生成側自体がボトルネックになっていないか確認します。

## .NET では

```csharp
// open モデルのシナリオ: 固定の到着率、現実的な id、本番に近いクライアント。
var http = new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) })
{
    BaseAddress = new Uri("https://shop.internal"),
    DefaultRequestVersion = HttpVersion.Version20,
};
var ids = await File.ReadAllLinesAsync("order-ids.txt");   // ホットなキー 1 つではなく、実在する id を 1 万件

var scenario = Scenario.Create("get_order", async ctx =>
    {
        var id = ids[Random.Shared.Next(ids.Length)];
        using var response = await http.GetAsync($"/orders/{id}", ctx.ScenarioCancellationToken);
        return response.IsSuccessStatusCode ? Response.Ok() : Response.Fail();
    })
    .WithWarmUpDuration(TimeSpan.FromSeconds(30))
    .WithLoadSimulations(
        Simulation.RampingInject(rate: 900, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromMinutes(2)),
        Simulation.Inject(rate: 900, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromHours(2)));   // soak

NBomberRunner.RegisterScenarios(scenario).Run();
```

```text
# テスト中はクライアントだけでなくサーバーも見る:
dotnet-counters monitor --process-id <pid> \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting,Microsoft.Data.SqlClient.EventSource
```

`Simulation.Inject` が open model です。サービスがどう反応しようと決まった速度で入れ続けるため、遅さは静かに縮んだテストではなく、伸びるキューと上がるレイテンシとして現れます。上のシナリオが体現する 3 つの原則は、k6 を含めどのツールを使っても変わりません。到着率は open に保つ、ホットなキー 1 つではなく現実的な id に負荷を散らす、本番に近いクライアントで駆動する、の 3 つです。最も抜けやすいのは 4 つ目の原則で、クライアントの外にあります。クライアント側の数値だけではサーバーのどのリソースが飽和したかは分からないため、テストが走るあいだサービスとその依存関係のカウンターを集め続けます。
