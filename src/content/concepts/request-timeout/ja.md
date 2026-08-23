---
title: "Request Timeout"
summary: "request timeout は、呼び出し側がリモート呼び出しに設ける上限です。上限がなければ止まった依存先が呼び出し側を永遠に捕まえたままにし、上限があれば呼び出し側は速く失敗し、残りの予算を下に渡し、もう必要のない仕事を取り消します。"
category: "回復性と障害対応"
scene: request-timeout
steps:
  - title: "タイムアウトがないと"
    text: "依存先が止まれば呼び出しも止まり、その後ろのスレッドと接続も止まります。ユーザーは 5 秒で諦めますが、サーバーはまだ待っています。"
  - title: "上限は 1 つではない"
    text: "接続、1 回の試行、リクエスト全体は、それぞれ別の 3 つの制限です。それぞれを決めておけば、遅い応答は速いエラーになり、スレッドは仕事に戻ります。"
  - title: "残りの予算を下に渡す"
    text: "リクエスト 1 件に 800 ms。データベースが 300 を使ったので、次の呼び出しは自分専用の新しいタイムアウトではなく、残りの 500 をもらいます。予算が入れ子にならずに足し算されると、deadline を超えます。"
  - title: "待つのをやめた仕事は取り消す"
    text: "取り消しのないタイムアウトは、依存先に誰も受け取らない ghost work を残します。CancellationToken を最後まで流してこそ、打ち切りが本物になります。"
related:
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Idle Timeout
    slug: idle-timeout
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Hedging
    slug: hedging
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Cancellation in managed threads
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
---

## いつ使うか

- 例外なくすべてのリモート呼び出しに。HTTP、gRPC、データベース、キャッシュ、メッセージブローカーのいずれもです。
- 複数の依存先へ枝分かれするリクエストごとに。リクエスト 1 件に deadline を 1 つ与え、各呼び出しのタイムアウトは残った予算から導きます。
- 待っている間に希少なものを握り続ける場所すべてに。スレッド、プールから借りた接続、ソケットがそれにあたります。

## 注意点

- 接続タイムアウト、試行ごとのタイムアウト、リクエスト全体のタイムアウト、アイドルタイムアウトは、それぞれ別の 4 つの設定です。どれか 1 つが他を兼ねると決めつけず、呼び出しごとに必要なものを設定します。
- タイムアウトはリトライ方針ではありません。その呼び出しを再試行してよいか、するならどの予算の中でするかは別に決めます。
- すべての非同期呼び出しに `CancellationToken` を渡します。取り消さないタイムアウトは、無駄を呼び出し側から依存先へ移すだけです。
- 短すぎるタイムアウトは、ごく普通のばらつきだけで健全な呼び出しを失敗させます。正常な依存先の p99 から始めて、余裕を足します。
- 「タイムアウトなし」も、数値を決めるのと同じく 1 つの決定です。多くのクライアントには既定値があるので、頼る前にその値が実際にいくつなのかを確認します。

## .NET では

リクエスト全体に deadline を 1 つ置き、その下のすべての呼び出しは自分専用の新しい上限ではなく残りの予算で縛ります。

```csharp
// One deadline for the whole request (ASP.NET Core request timeouts middleware).
builder.Services.AddRequestTimeouts(options =>
    options.DefaultPolicy = new RequestTimeoutPolicy { Timeout = TimeSpan.FromMilliseconds(800) });
app.UseRequestTimeouts();

app.MapGet("/checkout/{id:int}", async (int id, ShopDbContext db, HttpClient pricing, HttpContext http) =>
{
    var ct = http.RequestAborted;                        // cancelled on timeout or client disconnect
    var started = Stopwatch.GetTimestamp();

    var order = await db.Orders.FindAsync([id], ct);     // token flows into the database call

    var left = TimeSpan.FromMilliseconds(800) - Stopwatch.GetElapsedTime(started);
    using var pricingCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
    pricingCts.CancelAfter(left);                        // what is left, not a fresh 800

    var price = await pricing.GetFromJsonAsync<Price>($"/prices/{order!.Sku}", pricingCts.Token);
    return Results.Ok(new { order.Id, price });
});
```

`HttpClient` 側の上限はさらに別の設定です。`AddStandardResilienceHandler()` はパイプラインにリクエスト全体のタイムアウトと試行ごとのタイムアウトの両方を与え、接続を開く上限はそのどちらでもなく `SocketsHttpHandler.ConnectTimeout` が担います。3 つとも決めておいて初めて、「呼び出しに時間がかかりすぎた」が肩をすくめる言葉ではなく、どの段階の話なのかを示す言葉になります。
