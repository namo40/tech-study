---
title: "Async/Await"
summary: "`await` はメソッドがスレッドを返す地点です。そこで I/O が始まり、メソッドは未完了の Task を呼び出し元に返し、メソッドの残りは I/O が終わったときに空いているどのスレッドでも実行されるようキューに入ります。"
category: "プールとリソース管理"
scene: async-await
steps:
  - title: "await がすること"
    text: "メソッドは await に出会うまで実行されます。その瞬間に I/O が始まり、メソッドは未完了の Task を呼び出し元に返し、スレッドは解放されます。I/O が終わるとメソッドの残りがキューに入り、空いているどのスレッドでも実行されます。同じスレッドである必要はありません。"
  - title: "順番に、それとも同時に"
    text: "呼び出しを 1 つ待ってから次を待つと、時間は足し算になります。両方を先に始めてから一緒に待てば、いちばん長い 1 つぶんで済みます。同じスレッド、同じ I/O で、await の順序だけが変わりました。"
  - title: "2 つの間違い"
    text: ".Result で塞ぐとスレッドは何もしないまま忙しく、シングルスレッドのコンテキストでは continuation の実行場所がなくデッドロックになります。async void メソッドは待つべき Task を返さないので、例外の行き場がありません。最後まで async で通し、Task を返しましょう。"
  - title: "キャンセルとエラーは同じ道を通る"
    text: "トークンを I/O まで渡せば、キャンセルは作業を放置する代わりに止めます。キャンセルでも失敗でも、Task を await するとその await の場所で再スローされ、ふつうの catch で処理できます。"
related:
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Cancellation Token
    slug: cancellation-token
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Task
    slug: task
  - label: Batching
    slug: batching
references:
  - title: "Asynchronous programming with async and await (C#)"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/
  - title: "The Task asynchronous programming model"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model
  - title: "ASP.NET Core best practices"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/best-practices?view=aspnetcore-10.0
---

## いつ使うか

- すべての I/O に使います。データベースの往復、HTTP 呼び出し、ファイル読み取り、ブローカーへ送るメッセージがそれにあたります。API が async メソッドを提供しているならそれを使い、途中のどの層も塞がないように呼び出し連鎖全体を async のまま保ちます。
- 1 回の呼び出しのレイテンシーよりスループットが大事な場所に使います。async はリクエスト 1 つを速くはしません。待っていたスレッドを他の誰かが使えるようにするだけで、負荷のかかったサーバーが応答し続けられるのはそのおかげです。
- 互いに独立した呼び出しを同時に走らせられるときに使います。まとめて始めてまとめて待つのは、たいていのサービスにとっていちばん安いレイテンシー改善です。

CPU を使う仕事は別の問題です。`await` は計算を速くしませんし、`Task.Run` はその仕事を別のプールスレッドに移すだけなので、走っているあいだスレッド 1 本はやはり必要です。async は働き方ではなく待ち方の話です。

## 注意点

- リクエストの経路で Task を塞いで待たないでください。`.Result`、`.Wait()`、`GetAwaiter().GetResult()` は何もしないプールスレッドを掴んだままにし、戻る先のスレッドが 1 本しかないコンテキストではそのままデッドロックになります。
- イベントハンドラー以外で `async void` は書かないでください。待つべきものを返さないので、いつ終わったのかも何を投げたのかも誰にも分からず、処理されない例外はプロセスを落とします。代わりに `Task` を返しましょう。
- 独立した呼び出しは先に始めておき、`Task.WhenAll` でまとめて待ちます。1 つずつ順に待つと、理由もなく待ち時間が足し合わされます。
- `CancellationToken` はすべての層を通して I/O そのものまで渡します。スタックの上のほうで止まるトークンは何もキャンセルしません。動き続ける仕事を待つのをやめるだけです。ASP.NET Core で渡すべきトークンは `HttpContext.RequestAborted` です。
- `ConfigureAwait(false)` は、呼び出し元がどのコンテキストにいるか分からないライブラリコードで使います。同期化コンテキストを持たない ASP.NET Core では何も変わりません。
- 投げっぱなしは例外と寿命の両方を失います。誰も掴んでいない Task はホストの終了時に途中で捨てられることがあり、失敗しても誰も見ません。バックグラウンドサービスか永続的なキューを使いましょう。
- 何も await しない async メソッドでも状態マシンは作られますし、コンパイル時に警告が出ます。何かを await するか、同期メソッドにするかのどちらかにしてください。

## .NET では

下の 2 つの形の違いは await の順序だけですが、両方の呼び出しをするリクエストごとに 300 ms の価値があります。

```csharp
// Sequential: 600 ms.
var a = await catalog.GetAsync(id, ct);
var b = await pricing.GetAsync(id, ct);

// Concurrent: 300 ms. Start both, then await both.
var aTask = catalog.GetAsync(id, ct);
var bTask = pricing.GetAsync(id, ct);
await Task.WhenAll(aTask, bTask);
var (item, price) = (aTask.Result, bTask.Result);   // safe here: both are already complete
```

`WhenAll` のあとで `.Result` を読むのは安全です。2 つの Task はすでに完了していて、何も塞がないからです。完了していない Task から読むことが、シーンの 3 番目のステップが扱う間違いです。

```csharp
// Wrong: blocks a pool thread and can deadlock in a single-threaded context.
var blocked = catalog.GetAsync(id, ct).Result;

// Wrong: nothing to await, exceptions are lost.
async void Fire() => await catalog.GetAsync(id, ct);
```

キャンセルは下へ流れ、例外は上へ流れ、どちらも await を通ります。だからトークンは実際に待つ呼び出しまで届く必要があり、呼び出し元のふつうの `catch` 1 つで返ってきたものを処理できます。

```csharp
try
{
    var item = await catalog.GetAsync(id, http.RequestAborted);
}
catch (OperationCanceledException) { /* client went away */ }
catch (HttpRequestException ex)    { /* dependency failed */ }
```

`ValueTask` は、たいてい同期的に完了する hot path で、測ったうえでだけ手を伸ばす価値があります。一般に速くするためではなく、割り当てを 1 つ避けるためのものです。しかも await はちょうど 1 回だけにする必要があるので、保存しておく値ではなくその場で消費する値として扱ってください。
