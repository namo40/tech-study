---
title: "Trace"
summary: "trace は、1 つのリクエストが引き起こしたすべてを 1 つの id のもとに集めたものです。根が 1 つの span のツリーであり、時計の上に描くと、時間がどのホップに入ったのかを示す waterfall になります。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Sampling
    slug: sampling
  - label: OpenTelemetry
    slug: opentelemetry
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "OpenTelemetry: traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
---

シーンの 2 番目のステップは、trace が目の前で組み上がっていく様子です。gateway がリクエストを受け取り、id を発行し、root span を開きます。orders はその下に子を開き、payments はさらにその下に子を開きます。パネルに 3 本の棒が現れ、それぞれ自分のホップが始まった位置で始まり、答えた位置で止まります。その形が trace です。

これが無関係な 3 つの記録ではなく 1 つの trace になるのは、3 つとも同じ id を持ち、それぞれが自分の親を名乗るからです。id は、3 つの別プロセスから、ときには数秒ずれて順不同で届いた span をバックエンドが集める手がかりになり、親はその山をツリーに変えます。ツリーそのものは送られません。各 span は自分自身と親が誰かだけを報告し、形は受け取る側で組み直されます。

waterfall はそのツリーを時計の上に描いただけですが、何を示しているのかは正確に述べておく価値があります。子の棒が親の中に完全に収まっていれば、親はそれを待っていたということであり、親の幅から子を引いた残りが親自身の作業に使った時間です。シーンでは root がおよそ 1,167 ms、そのうち 800 ms が `charge`、残りはネットワーク区間と各サービスの数ミリ秒です。この読み方こそが trace を持つ理由のすべてです。ヒントではなく答えだからです。

trace には親を持たない span、つまり root がちょうど 1 つあり、その中の最後の span が終わったときに trace も終わります。この時点はたいてい思うより遅くなります。キューから取り出された非同期のコンシューマーは同じ trace に属しますが、リクエストが戻ったずっとあとに始まります。シーンがそれを入れ子にせず link でつなぐ理由であり、ビューアーが示す trace の「所要時間」が呼び出し側の待った時間ではなくツリー全体の幅である理由でもあります。

実際上の限界も知っておく価値があります。trace の範囲は伝播が決めます。コンテキストが届くところまでちょうど届き、ヘッダーを落とす最初のホップで途切れます。サンプリングも範囲を決めますが、これは span ではなく trace 単位の判断です。既定である親に従うサンプラーでは、決定は根で一度だけ下され、以降のすべてのホップがそれに従います。だから trace は丸ごと残るか丸ごと残らないかで、何も答えない半分の trace が保存されずに済みます。半分の trace はその保証が破れたときに生まれます。裸の比率サンプラーでさいころを振り直すサービス、誰も計装しなかったホップ、別々の率で動く 2 つのサービスです。
