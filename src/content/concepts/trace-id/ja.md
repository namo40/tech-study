---
title: "Trace ID"
summary: "trace id は、1 つの trace に属するすべての span が持つ 16 バイトの値です。別々のプロセスが記録した span を 1 つのリクエストに集め直すためのもので、W3C の `traceparent` ヘッダーに載って移動し、そのリクエストが残すすべてのログ行にも入れるべき値です。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Span ID
    slug: span-id
  - label: Correlation ID
    slug: correlation-id
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "Logging in .NET: log scopes"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/overview
---

シーンの 2 番目のステップでは、gateway がリクエストを受け取るまでパネルは空で `no trace id` と書かれています。受け取った瞬間に id が現れ、3 本の棒がはじめて成り立ちます。この順序が大事です。id は trace にあとから貼るラベルではなく、trace を存在させるもの自体です。id ができる前には別々のファイルに書き込むサービスが 3 つあるだけで、できたあとには部分が 3 つあるリクエストが 1 つあります。

値そのものはランダムな 16 バイトで、32 桁の 16 進数として書きます。リクエストが最初に出会う計装済みのコンポーネントが一度だけ発行し、以後はすべての下流の span にそのまま複製されます。ランダム性が設計の核心です。発行を調整する主体がいないので、一意性は登録簿ではなく空間の広さから来なければならず、この幅での衝突は備える対象ではありません。

この値は `traceparent` に載って移動し、このヘッダー 1 つに 4 つの情報が詰まります。バージョン、trace id、送る側の span の id、そしてこの trace がサンプリングされているかを最下位ビットで示すフラグ 1 バイトです。この最後のビットのおかげで、head サンプリングは一度決めれば下流全員がそのまま従う判断になります。サンプルフラグが下りた `traceparent` を受け取ったサービスはその span を記録しないので、誰も二度尋ねる必要がありません。

trace id の見返りが最も大きいのは tracing の外側です。リクエストが残すすべてのログ行に入れておけば、ログストアをリクエスト単位で検索できます。クエリ 1 つで、すべてのサービスが順番に出てきます。ASP.NET Core では `Activity.Current?.TraceId` としてすでに値があり、既定のログ構成がそれをスコープに書くので、構造化ロガーはコードなしで拾います。応答ヘッダーで呼び出し側に返せば、問い合わせ対応が組み立て直しではなく検索 1 回になります。

2 つは区別しておいてください。trace id はあなたが考案する correlation id ではありません。業務上の correlation id がすでにあるなら、trace id を置き換えるのではなく root span の属性として付けてください。2 つは別の問いに答えます。そして trace id は秘密ではありませんが強力な結合キーなので、認可トークンとして使ったり、クライアントが選んでよい値にしたりしてはいけません。
