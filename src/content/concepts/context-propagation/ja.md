---
title: "Context Propagation"
summary: "context propagation は、プロセスを出ていくものに trace コンテキストを載せる作業です。HTTP ヘッダー、gRPC のメタデータ、メッセージのプロパティがその場所です。trace がプロセス境界を越えて生き延びる理由はこれだけで、これを飛ばした最初のホップが trace を半分に切ります。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 3
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Trace ID
    slug: trace-id
  - label: Baggage
    slug: baggage
  - label: Competing Consumers
    slug: competing-consumers
  - label: OpenTelemetry
    slug: opentelemetry
  - label: ActivitySource
    slug: activitysource
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "OpenTelemetry: context propagation"
    url: https://opentelemetry.io/docs/concepts/context-propagation/
---

シーンの 3 番目のステップは、伝播を落としやすい唯一の場所を扱います。HTTP ではプレートがリクエストと一緒に運ばれ、誰もコードを書かなくても trace は途切れません。クライアント側の計装が出るときに `traceparent` を書き、サーバー側の計装が入るときに読むからです。そのあと orders がメッセージを発行し、それを生んだリクエストは戻っていきます。そのメッセージにあとから起きることが同じ trace の一部になるのは、コンテキストがメッセージ自体に書かれていた場合だけです。

仕組みはわざと地味です。伝播はキャリアを挟んだ inject と extract です。inject は現在のコンテキストをキーと値の組として、その転送手段が運べる場所に書きます。extract はそれを読み戻し、span を始めるためのコンテキストを返します。標準の名前は、id とサンプルフラグを持つ `traceparent`、ベンダー固有の追加を持つ `tracestate`、自分のキーと値を持つ `baggage` です。形式が W3C 標準なので、.NET のサービスから Go のサービスへ、さらにマネージドのゲートウェイへと渡るリクエストも、そのあいだずっと 1 つの trace id を保ちます。

実際に機能するかを決める細部は 2 つあります。1 つは、プロセス内の伝播が回線上の伝播とは別物だということです。プロセス内では `Activity.Current` が非同期の実行コンテキストに沿って流れるので、子 span は自分で親を見つけます。しかしリクエストの外のスレッドに仕事を渡すものは、その流れを断ちます。結果を待たないタスクや、バックグラウンドサービスが消費するチャネルがそれにあたります。もう 1 つは、メッセージのコンシューマーはたいてい発行側の span を親にすべきではないということです。コンシューマーはその span が閉じたあと、多くはリクエストが戻ったあとに始まるので、trace には link として属します。

この失敗は静かに起きるので、ステップを 1 つ割く価値があります。ホップがヘッダーを落としてもエラーにはなりません。trace は 1 つではなく 2 つになり、どちらも完結して見え、欠けたホップは赤い棒ではなく、気づいてはじめて見える空白として現れます。よくある原因は、リクエストを一から組み立てる手書きの HTTP クライアント、スキーマが知るフィールドだけを写すメッセージのエンベロープ、そしてペイロードをほどいて包み直すあらゆるコンポーネントです。

.NET では `AddHttpClientInstrumentation` が出ていく HTTP を、`AddAspNetCoreInstrumentation` が入ってくる HTTP を担うので、同期側の半分は無料です。メッセージングでは、inject と extract を代行してくれるライブラリを使うか、`Propagators.DefaultTextMapPropagator` で明示的に行い、得られた辞書を本文ではなく転送手段自身のヘッダーの集まりに載せてください。
