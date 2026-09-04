---
title: "I/O Completion Port"
summary: "完了ポートを使うと、待つことにスレッドがかかりません。OS が I/O を進め、終わると完了パケットをポートに置き、そのときプールスレッドがひとつ続きを拾います。だから少ないスレッドで進行中の作業を数千件さばけます。ポートが解放したものをコードが握り直さないかぎりは、です。"
category: "プールとリソース管理"
scene: io-completion-port
steps:
  - title: "待つことがスレッドを食います"
    text: "ゴーストはブロッキング I/O を見せます。リクエストひとつがディスクの答えまでスレッドひとつを立たせ、四つなら四つ全部が立ち、プールは何もしない働き手でいっぱいです。遊んでいる筋肉の後ろでキューが育ちます。スレッドはコードを回すためにあるものです。ただ待った瞬間、やかんの番をさせるために働き手へ賃金を払っているのです。"
  - title: "完了はポートに届き、スレッドはそのときに来ます"
    text: "I/O を始め、登録し、スレッドはすぐ返します。OS はスレッドなしで作業を進め、終わると完了パケットがポートに落ち、そのとき空いているプールスレッドが続きを拾います。始まりと終わりの間には本当に回すものがありません。だから何も回らないのです。"
  - title: "進行中の I/O の数とスレッドの数は別の数字です"
    text: "作業六つが同時に走り、スレッド二つが全部を受け持ちます。開始はほぼただで、待ちは完全にただで、終わった仕事はスレッドが空くまでパケットとして並びます。ひとつのプロセスがスレッド千本なしで開いたソケット数千を抱える方法がこれです。ポートは二つの数字を互いに独立にしてくれる待ち合わせ場所です。"
  - title: "ポートが与えたものを、コードが取り戻してしまえます"
    text: "タスクを待つためにプールスレッドを立たせれば、ゴーストを一階上に建て直したことになり、すべての作業を一斉に始めればパケットが波になって積もります。ポートが解くのは待ちであって規律ではありません。続きのコードは塞がないようにし、開始の数は縛ってください。前に立てた小さな門が、自由になったスレッドを自由なままにしておくのです。"
related:
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Async/Await
    slug: async-await
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Worker Thread
    slug: worker-thread
  - label: SemaphoreSlim
    slug: semaphoreslim
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
  - title: I/O Completion Ports
    url: https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports
---

## いつ使うか

- これは選んで持ち出す道具ではなく、すでに足で踏んでいる床です。Windows では、.NET の本物の非同期 I/O に付くすべての `await` が完了ポートの上を通ります。ソケット、非同期用に開いたファイル、名前付きパイプがそうです。Linux と macOS には同じものではなく兄弟がいます(ランタイムが持つイベントループの下の epoll と kqueue)。三つのどれでも話の形は同じです。待ちはカーネルのものであって、スレッドのものではありません。
- 非同期サーバーがなぜ伸びるのかを説明するときに読むとよい話です。スレッド数はコアに沿い、進行中の I/O 数は需要に沿います。プールの外にある何かが待ちを代わりに抱えているから、この二つが別の数字になります。ここが腑に落ちると、容量の議論はたいてい短くなります。
- I/O で遅いときに「スレッドを増やそう」という処方を受け入れる前に読んでください。スレッドが働かずに待っているなら、プールを大きくしても増えるのは待ちだけです。直し方は、スレッドの上で待つこと自体をやめることです。
- スループットが平らになった状態で、スタックトレースにプールスレッドが `WaitOne` や `Monitor.Wait`、タスクの `.Result` に座っているなら、この文書が要ります。その絵の原因はひとつで、4 段目がそれを描きます。
- API としてではなく、頭の中の模型として使ってください。`CreateIoCompletionPort` を自分で呼ぶことはほとんどありません。`await` と書けば、結び付けはランタイムがやります。この模型が与えてくれるのは、自分のコードが何を使っているかという感覚です。その感覚が、待っている間に本当に何もかからない非同期メソッドと、そう見えるだけのメソッドとを分けます。

## 注意点

- 非同期の上に同期で待つと、ポートが解放したまさにそのスレッドが握り直されます。まだ終わっていないタスクに `.Result`、`.Wait()`、`GetAwaiter().GetResult()` を使うと、作業が終わるまでプールスレッドがひとつ縛られます。ゴーストを一階上に建て直したのと同じです。負荷が上がるほど悪くなります。自分を解放してくれる続きのコードにもプールスレッドが要るのに、塞がった呼び出し元がそれを一本ずつ奪っていったからです。
- 偽の非同期はブロックを移すだけで、なくしはしません。塞がる呼び出しを `Task.Run(() => stream.Read(...))` で包んでも、待つ間ずっとスレッドが一本縛られることは変わらず、変わったのはどのスレッドかだけです。本物の非同期形を持たない API なら、それを包むのは変換ではなく、代価を払うスケジューリングの判断です。
- 上限のないファンアウトは下流の全部を水没させます。一万件に `items.Select(x => DoAsync(x))` を掛けて `WhenAll` でまとめると、開始が一万回登録され、リモートサービスとパケットキューが同時にそれを感じます。ポートはいくらでも受け取りますが、ソケットプールもデータベースもテールレイテンシーもそうではありません。開始の数を縛ってください。
- 続きのコードの中で塞ぐと、後ろに並んだパケットが全部遅れます。`await` のない区間をまたぐロック、長い計算、同期のログ書き込み、どれでも同じです。それは、ほかの完了が列を作っているプールスレッドの上で回っています。続きのコードは短く、塞がないものにしてください。重い CPU 作業は、完了処理を飢えさせない場所へ移します。
- 続きのコードは、作業を始めたそのスレッドでは回りません。そのとき空いているプールスレッドで回ります。同期化コンテキストが特定の場所へ戻す場合だけが例外です。`await` をはさんでスレッドが同じだと仮定するコード、たとえばスレッドローカルの状態や、前で取って後ろで放すロックは、うまく回っているように見えるときでも間違っています。
- スレッド注入の遅れは症状であって病気ではありません。プールが飢えるとスレッドをゆっくり慎重に足すので、キューが育つ間、スループットは何秒もかけて這って戻ります。`ThreadPool.SetMinThreads` を上げれば症状はしばらく隠れますが、原因になった塞がる呼び出しはそのまま残ります。その側の話は Thread Pool Starvation の文書が受け持ちます。

## .NET では

端から端まで非同期 API を使えば、この仕掛けは目に見えません。意識して書く価値があるのは、ファンアウトの前に立てる門と、プールスレッドを決して塞がないという決めごとです。

```csharp
// 本物の非同期 I/O。await の地点でスレッドを返し、続きのコードは
// パケットが落ちた時点で空いているプールスレッドから再開します。
await using var stream = new FileStream(
    path, FileMode.Open, FileAccess.Read, FileShare.Read,
    bufferSize: 4096, useAsync: true);          // useAsync: true がポートを使います
var buffer = new byte[4096];
int read = await stream.ReadAsync(buffer);

// 開始を縛る門。一万件が開始一万回にならないようにします。
var gate = new SemaphoreSlim(20);
await Task.WhenAll(items.Select(async item =>
{
    await gate.WaitAsync();                     // スレッドを握らずに待ちます
    try { await ProcessAsync(item); }
    finally { gate.Release(); }
}));

// 同じ上限を、手で組む代わりにフレームワークへ預けた形です。
await Parallel.ForEachAsync(
    items,
    new ParallelOptions { MaxDegreeOfParallelism = 20 },
    async (item, token) => await ProcessAsync(item, token));
```

違いを目に見えるものにするものが二つあります。`useAsync: true` なしで開いた `FileStream` はポートを使いません。だからその上の `ReadAsync` は、非同期の署名をまとってプールスレッドで回るブロッキング読み取りです。一方でソケットと `HttpClient` はきちんと非同期で、実際の規模で両者があれほど違って動く理由がここにあります。そして `SemaphoreSlim.WaitAsync` が非同期形なのには理由があります。門の前で待つ間もスレッドがかからないようにしなければ、その門こそが飢えの原因になります。

勘ではなく数字で見てください。`ThreadPool.ThreadCount` が上がる間に `ThreadPool.PendingWorkItemCount` が高いまま留まるなら飢えが進行中で、`System.Runtime` のイベントカウンターがデバッガーなしで両方を見せてくれます。覚えておく値打ちのある目安はこれです。プールスレッドが待っているなら、間違っているのはプールの大きさではなくコードです。
