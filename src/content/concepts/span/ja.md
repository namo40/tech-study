---
title: "Span"
summary: "span は trace の中の作業単位 1 つです。名前、開始、終了、自分を呼んだ span、そしていくつかの属性からなります。サービスが実際に記録するのはこれだけで、trace ビューアーが見せるものはすべてここから組み立てられます。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Trace ID
    slug: trace-id
  - label: Span ID
    slug: span-id
  - label: ActivitySource
    slug: activitysource
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
references:
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "OpenTelemetry: traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
  - title: "System.Diagnostics.Activity"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.activity
---

シーンの 2 番目のステップで棒を 1 本見てください。リクエストがサービスに届いた瞬間に現れ、そのサービスがリクエストを抱えているあいだちょうどその分だけ伸び、答えが出ていくときに止まります。それが span であり、棒はその挿絵ではありません。開始と終了が span を作る 2 つの事実であり、長さはその引き算です。

この 2 つのタイムスタンプの周りに、span は名前、種類、自分の id、親の id、状態、属性を持ちます。名前はインスタンスではなく操作を指すべきなので、`GET /orders/4197` ではなく `GET /orders/{id}` にします。id が埋め込まれた名前は、決して集約できない 100 万種類の操作を生むからです。種類は、これが呼び出しを処理したサーバーなのか、呼び出したクライアントなのか、プロデューサーかコンシューマーか、あるいは内部の作業かを示し、ビューアーが 1 つのネットワークホップの両端を見分けられるのもこの値のおかげです。

使いすぎがちなのは属性です。よく選んだキーをいくつか置く分には元が取れます。ルートテンプレート、ステータスコード、データベースの種類とクエリの形、キュー名、テナントなどです。値の範囲が閉じていないものはここに置くべきではありません。属性はサンプリングされたすべての span に記録され、インデックスまで作られるからです。詳細が必要なら trace id を付けてログに残し、量はログストアに引き受けさせてください。形は span、詳細はログというこの分担が、トレーシングを払える費用に保ちます。

span はエラーがあればそれも持ちます。状態をエラーにして例外を記録しておくことが、失敗したホップをあとから見つけられるようにし、tail サンプリングがこの trace は残す価値があると判断するときの信号にもなります。例外を飲み込んで代替の応答を返した span でも、そのことは残すべきです。さもないと trace はすべて問題なかったと主張します。

.NET では span は `Activity` です。`ActivitySource.StartActivity` が 1 つ返し、聞き手がいなければ null を返します。どの例も `activity?.SetTag(...)` と書くのはこのためです。activity を dispose することが止めることなので `using` が終了のタイムスタンプになり、dispose を忘れた span は決して終わらず、エクスポートもされず、trace からただ消えます。親は同じ非同期フローの `Activity.Current` から拾われ、リクエストハンドラー内の子 span が何も教えられずに入れ子になるのはこの仕組みによります。
