---
title: "Baggage"
summary: "baggage は trace コンテキストと一緒に運ばれる小さなキーと値の集まりです。エッジで一度入れておけば下流のどこでも読めるので、メソッドのシグネチャーに値を足して回る必要がありません。便利ですが、呼び出す先すべてに配られるため、ごく小さく保つべきものです。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 3
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Context Propagation
    slug: context-propagation
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "W3C Baggage"
    url: https://www.w3.org/TR/baggage/
  - title: "OpenTelemetry: baggage"
    url: https://opentelemetry.io/docs/concepts/signals/baggage/
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
---

シーンの 3 番目のステップで、リクエストが持つプレートには `tp + baggage` と書かれ、キューを越えても、そのあと worker が行う呼び出しでも同じ文字が残ります。その呼び出しが届くと、payments は自分のログに `tenant=acme` と書きます。誰もテナントを引数として下ろしていません。エッジで一度入れただけで、以降のすべてのサービスが読めました。

機能としてはそれがすべてです。baggage はコンテキストに付く短いキーと値の集まりで、`traceparent` の隣の `baggage` ヘッダーに載って運ばれます。代表的な用途はシーンが見せているものです。共有サービスが作業の持ち主を判別できるようにするテナント、負荷試験のリクエストを本物と区別するための合成トラフィックの印、下流の判断が上流の判断とずれないようにする機能フラグや実験群といった値です。

代償は、baggage が宛先を指定した配送ではなく放送だという点にあります。コンテキストが届くすべてのホップがそれを見ます。他のチームが持つサービスも、外部呼び出しにまで伝播させるなら第三者も含まれます。項目 1 つ 1 つがその trace のすべてのリクエストでバイトを占め、標準は全体の大きさにあえて控えめな上限を置いています。したがって守るべき規則は短いものです。キーは 2 つか 3 つに抑え、値は小さく範囲の閉じたものにし、秘密や個人情報は決して入れず、自分のシステムが終わる境界で取り除いてください。

baggage が自動で span に載るわけでもありません。値を読めることと値が記録されていることは別で、何かがそれを属性として span に写さない限り、ビューアーは baggage の項目を見せません。その値で検索する価値がある span にだけ意図的に写すほうが、すべてをすべてに複製するプロセッサーよりも優れています。後者こそ、小さな便利さが大きな請求書に変わる道筋です。

.NET では `Baggage.SetBaggage("tenant", value)` と `Baggage.GetBaggage("tenant")` が API で、項目は `Activity.Current` と同じように非同期コンテキストを流れます。回線上の伝播は複合プロパゲーターが担い、baggage を trace コンテキストと一緒に運ぶので、HTTP のホップにコードは要らず、メッセージのホップには他のコンテキストと同じ inject と extract が要ります。`Activity` にも `AddBaggage` があり、これは同じ考えを BCL の水準で先に書いた綴りで、互いにかみ合って動きます。

面倒を避けるための目安はこうです。baggage は、どこにいても振る舞いに影響するか振る舞いを説明する値のためのものであり、データを渡す手段ではありません。下流のサービスが仕事をするためにその値を必要とするなら、リクエストに入れてください。全員が知って得をし、誰も見られて困らない値なら、baggage が正しい置き場所です。
