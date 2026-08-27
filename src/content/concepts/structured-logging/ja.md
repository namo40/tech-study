---
title: "Structured Logging"
summary: "構造化ログは、ログの 1 行を出来上がった文ではなく、メッセージテンプレートと名前付きの値として書きます。だから保存先が `OrderId` や `CorrelationId` を索引の張れるフィールドとして持てます。ログ検索を部分文字列の走査からクエリに変えるのが、これです。"
category: "可観測性と運用"
scene: correlation-id
sceneStep: 2
related:
  - label: Correlation ID
    slug: correlation-id
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Sampling
    slug: sampling
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Message ID
    slug: message-id
references:
  - title: "Logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging
  - title: "High-performance logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/high-performance-logging
  - title: "Compile-time logging source generation"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logger-message-generator
  - title: "Message Templates"
    url: https://messagetemplates.org/
---

シーンの二つ目のステップは、id が考えであることをやめ、システムが実際に扱えるものになる場所です。そうなれるのは、ログの行が構造化されているからです。一つの流れの新しい行ごとにチップが付くのは、id がその行の名前付きプロパティであり、メッセージの中ではなく隣に座っているからです。もし id を文の中に書き込んでいたら、パネルに見せることはできても、四つ目のステップは何も動きません。文を相手にしたフィルターは部分文字列の検索であり、部分文字列の検索はフィールドと偶然の区別がつきません。

違いはソースの上では小さく、その外側のあらゆる場所では大きくなります。`logger.LogInformation("charge failed for {CorrelationId}", id)` は `logger.LogInformation($"charge failed for {id}")` とほとんど同じに見えますし、コンソールに出る文字も同じです。前者はログのプロバイダーに二つのものを渡します。テンプレートと、`CorrelationId` という名前に結び付いた値で、プロバイダーは両方を書きます。後者は出来上がった文字列を一つだけ渡し、プロバイダーが見る前に構造を捨てます。grep の先にあることはすべて、どちらを書いたかにかかっています。

保存先が得るのは、ログの 1 行をレコードとして扱える能力です。`CorrelationId` が列になるので、それに掛けるフィルターは走査ではなく索引の参照になり、しかも正確です。文の中で `7f3a` を探すと、たまたまその文字を含む注文番号まで当たりますが、フィールドを探せばそうはなりません。フィールドは数えられ、まとめられるので、「この一時間でこのテナントの決済は何回失敗したか」は、誰かが忘れずに足す指標ではなく、すでに書いていた行に対するクエリになります。そしてテンプレート自体が一つの値として残るので、「charge failed for {CorrelationId}」という行は、そこを通った id がいくつであっても一つのまとまりに属します。ある種類の行が急に増えたことが見えるのは、そのおかげです。

これには守るべき作法が付いてきて、その多くは名前の話です。プロパティは、どこでも同じ意味であるか、何の意味も持たないかのどちらかです。あるサービスが `CorrelationId`、別のサービスが `correlation_id`、さらに別のサービスが `corrId` を残せば、フィールドは三度存在し、そのあいだは何もつながりません。カーディナリティも大事ですが、向きは指標と逆です。id のように値の種類が多いものは、むしろログのプロパティに向いています。ログは指標のラベルのようには集計されないからです。向かないのは秘密や個人の情報です。構造化されたフィールドは、元になった文より短命で見つけにくいのではなく、長持ちして見つけやすくなります。

作法のもう半分はスコープで、シーンが実際に描いているのもそれです。呼び出しごとに id を書く方法でも動きますが、壊れやすくなります。誰かが急いで足したその一行が id のない行になり、たいていその行こそ必要な行です。リクエストごとに一度開くスコープは、その中で書かれるすべての行にプロパティを付けます。あなたの id を聞いたこともないライブラリが書いた行も含めてです。だから、どこまで付くかが誰かの記憶に頼らなくなります。

.NET で使う部品は、`ILogger` のメッセージテンプレート、周囲のプロパティを付ける `BeginScope`、そして割り当てまで気にするほど熱い行のための `[LoggerMessage]` です。`LogInformation("charge failed for {CorrelationId}", id)` はすでに構造化されていて、静かにそうなっていない補間文字列を捕まえるために CA2254 というアナライザーの規則があります。`logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id })` が周囲のプロパティの形で、プロバイダーは設定されているときだけその値を先へ流します。コンソールと OpenTelemetry のエクスポーターでは `IncludeScopes` は既定でオフで、確かにあるはずのスコープが下流のどこにも現れない、よくある理由がこれです。`[LoggerMessage(Level = LogLevel.Information, Message = "charge failed for {CorrelationId}")]` は、テンプレートをコンパイル時に検査し、呼び出しごとのボックス化もせずに同じ行を作るので、速い道と構造化された道が同じ道になります。
