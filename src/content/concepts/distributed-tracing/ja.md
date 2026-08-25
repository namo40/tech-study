---
title: "Distributed Tracing"
summary: "Distributed tracing は、1 つのリクエストが通ったすべてのサービスを追いかけます。trace id がリクエストとともに移動し、各ホップが自分の開始と終了を持つ span を記録し、その span が集まって時間が実際にどこで使われたかを示すタイムラインになります。"
category: "可観測性と運用"
scene: distributed-tracing
steps:
  - title: "ログは 3 つ、答えはなし"
    text: "リクエストがサービス 3 つを経て遅く戻ってきます。各サービスは何かを記録しましたが、3 行を結びつけるものがなく、どのホップが時間を使ったのか誰も言えません。"
  - title: "id は 1 つ、span は複数"
    text: "gateway が trace id を発行し、ヘッダーに載せて渡します。各ホップは自分の開始と終了を持つ span を記録します。時間順に並べると、800 ms が payments の中にあることが見えます。"
  - title: "メッセージを越えて"
    text: "コンテキストは HTTP ヘッダーだけでなくメッセージヘッダーにも乗るので、あとでジョブを取り出す worker も同じ trace に属します。入れ子ではなく link でつながります。baggage はテナントのようなキーと値をいくつか、最後まで運びます。"
  - title: "サンプリング"
    text: "すべての trace を残すと、監視対象のシステムより費用がかかります。head サンプリングは開始時に決めるので安価ですが、たった 1 件の遅いリクエストを捨ててしまうことがあります。tail サンプリングは終了時に決め、エラーと外れ値を残します。"
related:
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: OpenTelemetry
    slug: opentelemetry
  - label: ActivitySource
    slug: activitysource
  - label: Correlation ID
    slug: correlation-id
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: Tail Latency
    slug: tail-latency
  - label: Competing Consumers
    slug: competing-consumers
references:
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## いつ使うか

- プロセス境界を越えるリクエストすべてに使います。gateway からサービスへ、サービスからサービスへ、キューを経て worker へ、といった経路です。1 つのログファイルが話の全体を持てなくなった時点から、それを組み立て直す仕事が tracing です。
- レイテンシーの調査に使います。waterfall は「どのホップか」に数秒で答えますが、ログファイル 3 つと共通のタイムスタンプでは半日かかり、しかも精度が出ません。
- 呼び出し連鎖をまたぐエラーの原因特定に使います。失敗を報告したサービスが失敗を起こしたサービスであることはまれです。
- 依存関係の地図とサービスレベル目標を作るときに使います。どちらもすでに記録している span からそのまま得られるので、専用の計装は要りません。

## 注意点

- W3C の `traceparent` ヘッダーは、`baggage` を使うならそれも含めて、すべての外部呼び出しと発行するすべてのメッセージに載せてください。落とすホップが 1 つあるだけで trace は無関係な 2 つに切れ、その切れ目は探しに行くまで見えません。
- span はログではありません。span には属性をいくつかだけ置き、詳細は trace id で相関付けたログに置いてください。属性 50 個の span は、リクエストごとに、そしてこの先ずっと費用を生みます。
- サンプリングは意図をもって決めてください。エッジの head サンプリングは量を抑えますが、そのリクエストが興味深いかを知る前に決めます。コレクターの tail サンプリングはバッファの費用がかかる代わりに、エラーと遅い呼び出しを残します。多くのシステムは両方を必要とします。
- baggage はコンテキストが行く先すべてに付いていきます。呼び出す先の第三者も含まれます。短いキーをいくつかに抑え、秘密や個人情報は決して入れないでください。
- 独自の span を書く前に、組み込みの計装を使ってください。ASP.NET Core、`HttpClient`、EF Core、主要なメッセージングライブラリは、親が正しく付いた適切な名前の span をすでに作っており、手書きの span はたいていそれを重複させるだけです。
- キューを越えた trace は親子ではなく link です。コンシューマーは発行側の span が閉じたずっとあとに始まることが多く、無理に入れ子にすると何時間も続くように見える span ができます。

## .NET では

.NET は tracing を基底クラスライブラリに置いています。`System.Diagnostics` の `Activity` と `ActivitySource` が API で、OpenTelemetry はその上に載る構成とエクスポートの層です。そのため BCL しか参照しないライブラリも、そのまま trace に現れます。

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("orders"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSource("Shop.Orders")
        .AddOtlpExporter());

// A custom span inside the built-in request span.
private static readonly ActivitySource Source = new("Shop.Orders");

public async Task PlaceAsync(Order order, CancellationToken ct)
{
    using var activity = Source.StartActivity("place order");
    activity?.SetTag("order.id", order.Id);
    Baggage.SetBaggage("tenant", order.TenantId);

    // Carry the context on the message so the consumer continues the same trace.
    var headers = new Dictionary<string, string>();
    Propagators.DefaultTextMapPropagator.Inject(
        new PropagationContext(activity!.Context, Baggage.Current), headers,
        (carrier, key, value) => carrier[key] = value);
    await bus.PublishAsync(new OrderPlaced(order.Id), headers, ct);
}
```

`AddAspNetCoreInstrumentation` は入ってくるリクエストから `traceparent` を読み、リクエスト span を送り元の子にします。`AddHttpClientInstrumentation` は出ていくすべての呼び出しにそのヘッダーを書き戻します。したがって HTTP だけでつながった連鎖には、伝播のコードはまったく要りません。`AddSource` に渡す `ActivitySource` の名前はコードが作る名前と一致していなければならず、違えば独自の span は作られた直後に捨てられます。

メッセージを受け取る側では `Propagators.DefaultTextMapPropagator.Extract` でヘッダーを読み戻し、`ActivityKind.Consumer` で activity を開始します。その処理がキューに入れたリクエストから本当に切り離されているなら、取り出したコンテキストは親ではなく link として渡してください。MassTransit や Azure Service Bus SDK のようなライブラリは inject と extract を自分で行うので、残る仕事は独自のエンベロープ形式でヘッダーを飲み込まないことだけです。

サンプリングはエクスポーターの設定の隣で決めます。`SetSampler(new TraceIdRatioBasedSampler(0.1))` はプロセス内で行う head サンプリングで、エラーと外れ値を残すという判断は OpenTelemetry Collector の tail サンプリングプロセッサーが担う場所です。trace の全体を見たのはコレクターだけだからです。
