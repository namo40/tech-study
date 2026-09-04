---
title: "Correlation ID"
summary: "correlation id は、1 つの業務フローが触れるすべて、つまりすべてのログ行、すべてのメッセージ、すべてのホップに押される 1 つの値です。だから検索 1 回で物語全体が順番どおりに返ってきます。トレーシングはサンプリングで消えることがありますが、ログの中の id はいつでも残ります。"
category: "可観測性と運用"
scene: correlation-id
steps:
  - title: "サービスは三つ、物語は一つ、糸はなし"
    text: "1 つのリクエストがウェブ、注文、決済を順に通り、それぞれが自分のログを同じ流れに書きます。ほかのみんなのログと混ざり合ったままです。そのどこかで決済が一つ失敗しました。誰のでしょうか。"
  - title: "エッジで生まれ、すべての行に押されます"
    text: "システムが最初にするのは、この流れの id を一つ作ることです。それ以降、id は文章ではなく、すべての構造化ログ行の名前付きプロパティになり、混ざり合う二つの流れはもう似て見えません。"
  - title: "id は伝送路に乗って行きます"
    text: "サービスの間ではヘッダーとして、キューを渡るときはメッセージのプロパティとして運ばれます。リクエストのコンテキストが切れる非同期の隙間をまっすぐ通ります。失敗した決済のログ行は、すでに糸を握って到着します。"
  - title: "フィルター一つで物語全体"
    text: "id で検索すると流れが上から下へ順に読め、失敗が文脈の中に置かれます。トレーシングはサンプリングされるので、忙しい日にはこの流れのトレースが最初から作られていないかもしれません。ログの中の id は、いつでも持ちこたえる床です。"
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: Trace ID
    slug: trace-id
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Message ID
    slug: message-id
  - label: Saga
    slug: saga
references:
  - title: "Logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/overview
  - title: "Logging in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/logging/
  - title: ".NET distributed tracing concepts"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## いつ使うか

- プロセスを二つ以上またぐフローには必ず使います。サービス二つが二つのログの流れに書き始めた瞬間、その行を一つの順番に戻せるのは、両方が一緒に運ぶ 1 つの値だけです。
- 非同期の境界をまたぐフローにも使います。キュー、バックグラウンド処理、予約された再試行では、仕事が実際に動くころには、それを始めたリクエストはとっくにいなくなっています。その隙間を渡るのが id です。
- オンコールの仕事にも使います。呼び出しを受けた担当者がログ検索に最初に打ち込むものが id であるべきなので、アラートにも、エラー応答にも、サポートのチケットにも id が入っている必要があります。
- 利用者に見える失敗にも使います。そのまま読み上げてもらえる短い id を渡せば、「今朝うまくいきませんでした」が検索 1 回に変わります。
- あとから組み立て直すかもしれないフローにも使います。トレースは期限で消え、サンプリングでふるい落とされますが、ログはたいていもっと長く、もっと丸ごと残ります。だから同じリクエストでも、ログの中の id のほうがトレースより長く生きます。

## 注意点

- id はエッジで、一か所で、ほかの何よりも先に付けます。途中で作った id は物語の半分しか覆わず、部品が二つそれぞれ自分の id を作れば、決して出会わない半分の物語が二つできます。
- 入ってくる id は、信頼できる呼び出し元からだけ受け取ります。ヘッダーに入ってきたものをそのまま返す公開エンドポイントは、誰でもログ検索を汚したり、わざと他人のフローに割り込んだりできる通り道になります。
- correlation id は trace id ではありません。trace id は 1 つのトレースのもので、そのトレースとともに終わります。correlation id は業務フローのものなので、複数のトレース、何度かの再試行、キューで過ごした一晩を越えて生き延びます。両方を記録し、片方をもう片方のふりをさせるのではなく、二つの関係を記録します。
- 文章の中に溶かし込まず、構造化されたプロパティとして残します。`"order {OrderId} failed for {CorrelationId}"` を文字列として先に組み立ててしまうと、ログの保存先が索引を張れない値になり、検索は全体をなめる部分文字列の走査に変わります。
- バックグラウンドの処理には id を明示的に載せて送ります。`ILogger` のスコープと `Activity` は 1 つのリクエストの非同期の流れを追いますが、キューに渡したメッセージは新しい流れを始めます。だから id をメッセージに書き、受け取る側で読み戻す必要があります。
- 値は短く、意味を持たせず、目で読める形にしておきます。チケットに引用され、電話で読み上げられ、検索欄に貼り付けられる値なので、波かっこまで付いた GUID より短い 16 進の文字列のほうが向いています。
- 意味のある情報を id の中に入れないでください。顧客番号を含む id は、すべてのログ行、すべてのメッセージヘッダー、そして呼び出すすべての外部サービスに個人の識別子を流すことになります。

## .NET では

仕事は二つの仕掛けで分担します。id が何かを決めるミドルウェアと、リクエストの中で書かれるすべての行が、呼び出し側で id に触れなくても id を付けて出ていくようにするログのスコープです。

```csharp
public sealed class CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
{
    private const string Header = "X-Correlation-ID";

    public async Task InvokeAsync(HttpContext context)
    {
        // Trust an inbound id only from callers inside the boundary.
        var inbound = context.Request.Headers[Header].ToString();
        var id = context.User.Identity?.IsAuthenticated == true && !string.IsNullOrEmpty(inbound)
            ? inbound
            : Activity.Current?.TraceId.ToString()[..8] ?? Guid.NewGuid().ToString("n")[..8];

        context.Response.Headers[Header] = id;
        Activity.Current?.SetBaggage("correlation.id", id);

        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
        {
            await next(context);
        }
    }
}
```

肝心なのは、辞書を渡した `BeginScope` です。構造化ログを理解するプロバイダーなら、スコープのキーと値をその中で書かれたすべての行に付けてくれるので、`CorrelationId` はクエリで絞り込める本物の列になり、リクエストの中のどの `ILogger` 呼び出しも id に触れる必要がなくなります。代わりに組み立て済みの文字列を `BeginScope` に渡すと、何も索引を張れないスコープが残ります。目には見えるのに検索できない id ができる、いちばんよくある経路がこれです。

トレーシングとの関係は意識して決めておく価値があります。`Activity.Current.TraceId` は値の出どころとして十分ですし、ここから派生させておけば、ログの 1 行とトレーシングのバックエンドの span を並べられます。それでも同じ識別子ではありません。トレースはリクエストが終われば終わりますが、フローは再試行を三度はさんでさらに二時間走るかもしれません。`TraceId` と `CorrelationId` の両方を残せば、片方が片方の代わりをしなくても、二つの視点はつながったままです。

キューを渡るときは、id をメッセージに書く必要があります。`Activity.Current` はそのホップを越えられないからです。Azure Service Bus には `ServiceBusMessage.CorrelationId` という定位置があり、ほかに運びたいものは `ApplicationProperties` が受け取ります。RabbitMQ には `IBasicProperties.CorrelationId` とヘッダーのテーブルがあります。コンシューマー側では、それを読み戻してハンドラーが動く前に同じ種類のスコープを開きます。そうすれば、ワーカーが夜中の三時に書いた行が、その仕事をキューに入れたリクエストと同じ検索結果に入ります。

```csharp
var message = new ServiceBusMessage(body) { CorrelationId = id };
message.ApplicationProperties["correlation.id"] = id;
```

Serilog、NLog、OpenTelemetry のログエクスポーターはどれも `ILogger` のスコープを読むので、上のミドルウェアはプロバイダーを選びません。違うのは補強のしかたです。Serilog は `LogContext` で明示的なスコープなしに同じプロパティを押し込めますし、`AddOpenTelemetry(o => o.IncludeScopes = true)` は、スコープの値が出ていく途中で捨てられずに OTLP のコレクターまで届くようにする設定です。
