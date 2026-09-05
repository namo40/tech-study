---
title: "Task"
summary: "Task はまだ終わっていない仕事についての約束のオブジェクトです。状態と、結果または例外、そして終わるのを待つ継続を持ちます。スレッドではなくハンドルであり、Task を返すという事実だけではスレッドが占有されているかどうかは分かりません。"
category: "プールとリソース管理"
scene: async-await
sceneStep: 1
related:
  - label: Async/Await
    slug: async-await
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Bounded Concurrency
    slug: bounded-concurrency
references:
  - title: "The Task asynchronous programming model"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model
  - title: "Task-based Asynchronous Pattern (TAP)"
    url: https://learn.microsoft.com/en-us/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap
---

シーンの最初のステップは、メソッドが未完了の `Task` を呼び出し元に返すところで終わります。このページが扱うのはそのオブジェクトです。Task はまだ終わっていない仕事についての約束です。実行中か、成功か、失敗か、キャンセルかという状態、結果が出ていればその結果、例外があればその例外、そして決着したときに走らせる継続 (continuation) の一覧を持っています。スレッドではなく、仕事そのものでもありません。その仕事をしていない側が、仕事の終わりを知るためのハンドルです。

ふつうのオブジェクトなので、握っておくことも、フィールドに入れることも、別のメソッドに渡すことも、好きな時点で await することもできます。2 回 await してもよく、そのときはやり直すのではなく同じ結果をそのまま返します。決着した Task は 1 つの値だからです。仕事はすでに始まっています。始めたのは呼び出しのほうで、await は知らせを受け取る時点を決めるだけです。

```csharp
Task<Order> pending = GetOrderAsync(id);   // ここから走っています
var summary = BuildSummary();              // 関係のない仕事で、待ちはありません
Order order = await pending;               // 同じオブジェクトを、あとで回収します
```

型を見ただけでは、スレッドが関わっているかどうかは分かりません。`Task.Run` はデリゲートをスレッドプールに予約します。いまのスレッドからどかしたい CPU 処理には正しい道具で、I/O には正しくない道具です。I/O では、OS がすでに自分で扱っているものを待つために、プールのスレッドを 1 本立たせておくことになります。最後まで非同期でつながるメソッドは、そのあいだスレッドを 1 本も占有しないまま Task を返します。どちらも同じ型を返すので、シグネチャは証拠になりません。ブロックする呼び出しを包んで名前に `Async` を付けただけのものは、詰まったスレッドをなくしたのではなく移しただけで、どちらにせよ代金はプールが払います。

Task が値打ちを見せるのは組み合わせの道具で、それぞれに知っておくべき角があります。`Task.WhenAll` は複数をまとめて待ち、await すると最初の例外を投げ直し、残りは返された Task に留まります。だから await が投げたものだけを記録するハンドラーは、ほかを静かに落としています。`Task.WhenAny` は最初に決着したものを渡し、負けたほうは走り続けるので、あとで失敗したときの行き先を用意しておく必要があります。`Task.CompletedTask` と `Task.FromResult` は予約なしにすでに終わったものを返し、`ValueTask` はたいてい同期で終わるホットパスのためにあり、その代わり await できるのは 1 回だけです。いちばん鋭い角は、誰も await しない Task です。投げっぱなしの呼び出しは結果もろとも例外を捨て、最初の await より前にまとめて始めた Task の一覧は、選んだつもりのないまま選んでしまった同時実行の水準です。
