---
title: "Span ID"
summary: "span id は span 1 つにつく 8 バイトの名前です。trace id と組になれば操作 1 つを指す住所になり、子の親の欄へ写されれば木の枝 1 本になり、ログの 1 行に載ればリクエストのどの部分がその行を書いたかを教えてくれます。"
category: "可観測性と運用"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace ID
    slug: trace-id
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: Structured Logging
    slug: structured-logging
  - label: ActivitySource
    slug: activitysource
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
---

シーンの 2 番目のステップでは各ホップが span を記録しますが、その span たちには、ほかの何かが指し示せる名前が必要です。span id がその名前です。無作為な 8 バイトを 16 進数 16 文字で書いた値で、span を始めた側が発行し、その span の外では何の意味も持ちません。trace id の半分の幅なのはわざとで、理由は節約ではなく範囲の違いです。trace id はバックエンドがこれから保存するすべてにわたって一意である必要があるので、それに合わせて大きさが決まります。span id は trace 1 つの中の span どうしで一意ならよく、その集合はせいぜい数十から数百なので、16 文字あれば十分に余ります。値は連番ではなく無作為で、操作やサービスから導かれることはなく、すべて 0 の span id は値ではなく「なし」の表記です。

範囲が狭い代わりに、span id 単体では何も指せません。住所は組のほうです。trace id がどのリクエストかを言い、span id がその中のどの操作かを言い、ビューアーや問い合わせが 1 本の棒に降り立つには両方が要ります。この id が果たす 2 つ目の仕事は、構造を作ることです。各 span は自分の id の隣に、自分がどの span の下で始まったかも記録し、親子関係の全部がその 1 つの欄です。木を送るものは何もなく、リクエストが回っているあいだ木を知っている者もなく、関わったサービスたちは互いの形を見たことがありません。バックエンドは、それぞれが別の span 1 つを名指しする span の山を受け取り、id を突き合わせて木を組み直します。親の欄が空の span が根であり、だから trace のてっぺんは知らされるものではなく見分けるものです。

線の上ではこの id は `traceparent` ヘッダーの 3 番目の欄に載り、その欄の意味はホップのどちら側に立つかで変わります。サービスがそこへ載せて送るのはいま送っている span の id で、次のサービスがそこから読むのは、これから始める span の親です。そのあと、その新しい span 用の span id を新しく発行し、自分が送り出すヘッダーには自分の値を入れます。ですから同じ 16 文字が、出るときは ID であり、入るときは親への連結です。.NET ではこの 2 つの役が同じオブジェクトの 2 つのプロパティ、`Activity.Current?.SpanId` と `ParentSpanId` で、写す仕事はプロパゲーターが引き受けるので、計装のコードがヘッダーそのものに触れることはほとんどありません。触れる唯一の場面は、`traceparent` を運ばない境界です。キューのメッセージや一括の受け渡しのようなところでは、id を人の手でどこかに入れておく必要があり、そうしなければ鎖はそこで切れ、次のサービスが新しい根になります。

日々の見返りはログにあります。ログの 1 行にある trace id は検索を 1 つのリクエストまで絞ってくれて、それだけでも価値の大半です。そこに span id が、そのリクエストの中の操作 1 つまでさらに絞り込みを足します。リクエストが同じサービスを 2 回呼んだとき、あるホップを再試行したとき、3 つを並べて走らせてそのうち 1 つだけが遅かったときに要るのがそれです。両方が行に載っていれば、trace ビューアーの 1 本の棒とログの数行は同じものを 2 方向から見たものになり、構造化ログがそれを grep する文字列ではなく絞り込める項目にしてくれます。2 つの習慣がこれをきれいに保ちます。trace id だけでなく組で残してください。span id のない trace id は 2 回の試みを区別できません。そして、この値をほかの用途に貸さないでください。試み単位で、再試行すれば変わります。存在しないこともあり、その起き方は 2 つあって区別しておく価値があります。誰も聞いていないときは `StartActivity` が null を返し、span は作られず、ログに残す id もありません。trace が標本から外れただけのときは activity は存在し span id も持っていて、エクスポートされないだけです。どちらにせよ、冪等キー (idempotency key) や業務上の correlation id は別のところから来なければなりません。
