---
title: "OpenTelemetry"
summary: "OpenTelemetry は、トレースとメトリックとログのためのベンダー中立な標準です。API もひとつ、転送形式もひとつ、伝搬される文脈もひとつなので、計装は一度書けばよく、それを保管するバックエンドはデプロイ時の選択のまま残ります。"
category: "可観測性と運用"
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: Baggage
    slug: baggage
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: ActivitySource
    slug: activitysource
references:
  - title: OpenTelemetry Documentation
    url: https://opentelemetry.io/docs/
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
---

## いつ使うか

- 計装がベンダーより長く残ってほしいときに採用します。バックエンドが変わっても、コードが出すスパンとメトリックはそのままで、動くのはエクスポーターの設定だけです。これが約束のすべてで、契約更新の最中ではなくその前に用意しておく価値があります。
- トレースとメトリックとログがそろってひとつの問いに答える必要があるときに持ち出します。三つとも同じトレース ID を持っているので、遅いリクエストひとつをスパンの木として開き、それが含まれる遅延のヒストグラムと突き合わせ、同じリクエストが書いたログ行までつなげられます。手でタイムスタンプを合わせる必要はありません。
- リクエストが別々の言語で書かれたサービスをまたぐときに使います。伝搬の形式がどこでも同じなので、.NET のゲートウェイが Python のワーカーを呼び、そのワーカーが Java のサービスを呼んでも、出てくるのはひとつのトレースです。無関係な三つのトレースにはなりません。社内の計装ライブラリのほうが安い、という話が止まるのがここです。
- 複数のチームが同じものを違う名前で呼んでいるなら、標準として揃えます。セマンティック規約は HTTP とデータベースとメッセージングの操作に属性名を与えてくれますし、名前が共有されて初めてダッシュボードを別のサービスへ持ち運べます。

## 注意点

- 仕様と SDK であって、データを置く場所ではありません。OpenTelemetry がやるのは信号を作って送り出すところまでで、どこに保管するか、どれだけ残すか、クエリがいくらかかるかは今も自分たちが決めます。バックエンドを遅く選べば、保管の請求も遅れて知ることになります。
- カーディナリティは相変わらず自分たちの問題です。SDK はユーザー ID や完全な URL がタグとして付いたメトリックも文句なく記録し、その費用はトラフィックとともに増える時系列の本数としてバックエンドに現れます。属性の値は範囲の決まった集合に保ち、範囲の開いた識別子は本来の居場所であるスパンに付けます。
- ダッシュボードが依存するセマンティック規約のバージョンは固定しておきます。リリースをまたいで属性名が変わったことがあり、タグ名を変えるアップグレードはエラーではなく空の時系列を返して、静かにクエリを壊します。
- 送り出しはバッチで行い、ホットパスはそこから外しておきます。バッチプロセッサーはスパンをバックグラウンドのエクスポーターに渡し、リクエストのスレッドがコレクターを待たないようにします。単純なプロセッサーはその場で送るので、テストでくらいが適当です。コレクターに届かないときに悪くなるのは捨てられるテレメトリーであって、詰まるリクエストであってはいけません。

## .NET では

- 計装の API は基底クラスライブラリで、OpenTelemetry は送り出す経路です。`ActivitySource` がスパンを作り、`Activity` がスパンそのもので、`Meter` が計器を作ります。どれもパッケージ参照なしに存在する `System.Diagnostics` の型です。OpenTelemetry はそれらを購読し、出てきたものを運びます。ライブラリを計装しても、そのライブラリが OpenTelemetry に依存しない理由がこれです。
- 登録はビルダーひとつに枝がふたつで、エクスポーターは両方に同じ名前で付きます。

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService("checkout"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        // Your own spans: the ActivitySource name, not a package.
        .AddSource("Contoso.Checkout")
        .AddOtlpExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());
```

- 組み込みの計装が、こちらが何かを書く前に境界を覆ってくれます。ASP.NET Core はサーバー側のスパンと `http.server.request.duration` のヒストグラムを作り、`HttpClient` はサービスとサービスをつなぐクライアント側のスパンを作り、ランタイムのパッケージがガベージコレクションとスレッドプールのメトリックを足します。だから役に立つ最初のトレースは設定だけで出てきます。
- ログは `ILogger` を通して同じパイプラインに合流します。OpenTelemetry のログプロバイダーを足すと、すべてのログレコードに現在のトレース ID とスパン ID が刻まれ、それが構造化ログを別の保管庫から同じリクエストのもうひとつの見え方へと変えます。
