---
title: "ActivitySource"
summary: "ActivitySource はスパンを作る .NET のオブジェクトです。一度だけ作って静的フィールドに置く名前付きの工場であり、その名前が収集側の購読する文字列になります。購読する側がいなければ StartActivity は null を返すので、コードに残した計測はほとんど無料です。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: OpenTelemetry
    slug: opentelemetry
  - label: Context Propagation
    slug: context-propagation
references:
  - title: "Add distributed tracing instrumentation"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
---

シーンの二番目の段階では、ホップごとに自分の開始と終了を持つ span を記録します。.NET ではその span が `Activity` であり、それを作り出すのが `ActivitySource` です。名前の付いた工場で、一度だけ作って静的な読み取り専用フィールドに置き、プロセスが生きているあいだそのままにします。リクエストごとに作るものではなく、いくつも持つように作られてもいません。ふつうはライブラリひとつ、あるいはコンポーネントひとつにソースをひとつ置き、それが入っているアセンブリの名前をそのまま付けます。その名前が、ほかのすべてが基準にする単位だからです。

`new ActivitySource("Contoso.Orders")` はその文字列で発行し、隣にバージョンを添えることもできます。収集する側は同じ文字列を名指しして計測を有効にします。OpenTelemetry では `AddSource("Contoso.Orders")` であり、一族をまとめて拾いたいときは `AddSource("Contoso.*")` です。この一枚の間接が設計のすべてです。ライブラリはどのトレース SDK も参照せず、データがどこへ行くかについての意見も持たないまま計測だけを同梱し、どのソースを聞くかはアプリケーションが起動時に決めます。そのため、トレースで最もよくある失敗は綴りの間違いです。trace には出てくるのに自分の span がひとつもないサービスは、たいていソース名を登録し忘れており、どこもエラーを報告しません。

`StartActivity` は `Activity?` を返しますが、null はエラー経路ではありません。聞いている側が誰もいないときの正常な動作です。オブジェクトも割り当てず、タイムスタンプも取りません。例のたびに出てくる `activity?.SetTag(...)` は、無効なときの経路をほぼ無料にするための書き方です。サンプリングを決める場所も聞いている側です。`ActivityListener` は候補ごとに問われ、どこまで記録するかを答えます。まったく記録しない側から、完全に記録してサンプルにも入れる側まで幅があります。だから購読はされていてもサンプルから外れたソースは、やはり安いままです。span を豊かにするためだけに存在する高価な処理を飛ばしたいときは、`ActivitySource.HasListeners()` がその問いに直接答えます。

いくつかの習慣がこの構造をきれいに保ちます。ソースは静的に作り、リクエストごとには作りません。作るたびにランタイムへ登録され、呼び出しより長く生きるように設計されているからです。コンポーネントにバージョンがあるなら、コンストラクターに一緒に渡します。名前とバージョンは計測スコープとしてすべての span に付いて回り、バックエンドはそれで自分たちの span と HTTP クライアントの span を見分けます。そして名前は公開 API として扱います。名前を変えると、古い文字列で設定された収集側が静かに購読から外れます。購読の向こう側の配線、つまりエクスポート先やリソース属性、聞き取った activity を実際の span として送り出す SDK は OpenTelemetry の話です。ActivitySource は、自分のコードが握っている管の端でしかありません。
