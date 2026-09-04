---
title: "Sampling"
summary: "サンプリングは、トレースの一部だけを残して残りを捨てるという決定です。すべてのリクエストを記録する費用が、見張っているシステムより高くつくからです。head サンプリングは始めに決めるので安く、tail サンプリングは終わりに決めるので面白いものが残ります。"
category: "可観測性と運用"
scene: correlation-id
sceneStep: 4
related:
  - label: Correlation ID
    slug: correlation-id
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Structured Logging
    slug: structured-logging
  - label: Trace ID
    slug: trace-id
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Context Propagation
    slug: context-propagation
references:
  - title: "OpenTelemetry sampling"
    url: https://opentelemetry.io/docs/concepts/sampling/
  - title: "Sampling in OpenTelemetry .NET"
    url: https://opentelemetry.io/docs/languages/dotnet/sampling/
  - title: ".NET distributed tracing concepts"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "Tail sampling processor"
    url: https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor
---

シーンの最後のステップでは、`sampling 10%` のチップが現れ、`trace` のチップがばつ印を付けて薄くなるあいだ、ログの行はあった場所にそのまま残っています。一つのコマに主張のすべてが入っています。サンプリングは故障でも設定の間違いでもありません。負荷のかかったトレーシングのシステムにとって普通で正しい状態であり、ログの中の correlation id がそれ自体で持つ価値の理由です。忙しい日には、いま調べているその流れにそもそもトレースがなかったかもしれず、トレーシングの画面をいくら押しても、あとから作られることはありません。

なくてはならない理由は算数です。トレース一つは多くの span であり、span ごとに属性とイベントとリンクが付きます。毎秒数千件をさばくサービスは、業務のデータより多くのトレースのデータを作ります。それを全部残せば、保存領域とネットワークが要り、目立たないところで、見られている側のプロセスの CPU も要ります。だからサンプラーは、量を事故ではなく決定にするために存在し、本当の問いは、その決定をどこで下すかだけです。

head サンプリングは、何も起きる前の先頭で決めます。比率に基づくサンプラーは trace id をハッシュして決まった割合だけを残し、その決定が `traceparent` の sampled フラグに乗って行くので、下流のすべてのサービスが同じ選択をします。トレースは丸ごと残るか丸ごと捨てられるかで、半分のトレースがバックエンドを埋めないのはそのためです。安く、読みやすく、そして目が見えません。8 秒かかったリクエストも例外を投げたリクエストも、残る確率はほかのすべてとまったく同じです。主な使いみちが、8 秒かかって例外を投げたリクエストを調べることである道具にしては、妙な性質です。

tail サンプリングは、トレース全体をバッファに持ったコレクターで、終わりに決めます。ここまで来れば、実際に起きたことを見て決められます。エラーのあるものは全部、しきい値より遅いものは全部、いま調査中のテナントのものは全部残し、基準線のために残りから少しだけ残します。head サンプリングへの反論にちょうど答えますが、費用として、進行中のトレースを終わるまでメモリに抱える部品が一つ増えます。しかもその大きさは平均ではなく最大に合わせます。気にするシステムはたいてい両方を持つことになります。コレクターが見るものが足りるように head を多めに取り、何が生き残るかは tail の方針が決めます。

一つ目の決定と分けておきたい二つ目の決定があります。サンプラーは記録するかどうかを選び、フィルターは計測するかどうかを選びます。ヘルスチェックや静的ファイルの span を元で落とすのはサンプリングではなく、そのリクエストは初めから面白くなかったと決めることです。`ActivityListener` や計測のフィルターでやれば費用はまったくかかりません。データがすでにネットワークを渡ったあとに、コレクターで決めるのとは違います。

これらすべてを越えて残るのがログです。ログはたいてい丸ごと、より長く保たれ、トレースよりずっと控えめにしか間引かれません。そして、自分のトレースより長く生きた流れを収める唯一の記録です。キューで一晩過ごしたメッセージ、翌朝に再試行された仕事、三日走った saga のようなものです。四つ目のステップが描く分担がこれです。トレースは、たまたま残したリクエストについて「時間はどこへ行ったか」に答えます。ログの中の correlation id は、サンプラーが捨てたものも含めたすべてのリクエストについて「この一件に何が起きたか」に答えます。

.NET では、head の決定はトレーサープロバイダーに付けるサンプラーです。`.SetSampler(new TraceIdRatioBasedSampler(0.1))` は 10% を残し、`ParentBasedSampler` は、上流の呼び出し元がすでに下した決定を振り直してトレースを半分に裂く代わりに、そのまま尊重させます。`traceparent` ヘッダーの sampled フラグがその決定を運び、自分のコードでは `Activity.Recorded` で読めます。これが大事なのは、記録されない activity もやはり存在し、やはり伝わるからです。何も送り出していないあいだも id はそこにあり、ログに残せます。tail サンプリングはライブラリの設定ではなく OpenTelemetry のコレクターのプロセッサーで、ステータスコードや待ち時間や属性に対する方針で設定します。バッファリングと最大メモリがどこに住むかを変える、という点は覚えておく価値があります。
