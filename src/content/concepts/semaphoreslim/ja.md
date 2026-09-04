---
title: "SemaphoreSlim"
summary: "SemaphoreSlim は非同期の世界の同時実行の門です。WaitAsync はスレッドを握らずに待つので、一度に始める作業の数を縛って波を列に変えながら、いま節約したばかりのスレッドを返してしまうことがありません。"
category: "プールとリソース管理"
scene: io-completion-port
sceneStep: 4
related:
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Async/Await
    slug: async-await
  - label: Worker Thread
    slug: worker-thread
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: SemaphoreSlim Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.semaphoreslim
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

セマフォは通行証の数です。`new SemaphoreSlim(20)` は同時に二十人まで中にいてよいという意味で、二十一人目は誰かが出るまで戸口で待ちます。古典的な `Semaphore` も同じ考えを持っていて、面白いのは古典の側にないメソッドがひとつあることです。`WaitAsync` です。門の前で待つことも待ちであり、列に並ぶあいだその門がプールスレッドを握っているなら、門は自分が防ぐはずだった問題そのものになってしまいます。`WaitAsync` は代わりにタスクを返すので、戸口に並んだ呼び出し元が使うのは続きのコードひとかけらであってスレッドではありません。非同期の作業の前に立てる門がこれであり、`lock` や `Semaphore` ではない理由がここにあります。

そもそも門が要るのは、完了ポートが渡されたものを何でも受け取るからです。一万件を開始一万回に変えるのは文法上まったく正しいプログラムです。開始はほぼただ、待ちは本当にただで、ランタイムの中の何ものも押し返しません。押し返すのは下流の全部です。ソケットが決まった数しかない接続プール、働き手が決まった数しかないデータベース、これから知ることになる流量制限を持つリモートサービス、そして完了一万件が波になって落ちてくるパケットキューです。開始の数を縛れば、その波はそろった列になります。ここで選ぶ数字は、自分のプロセスについてではなく、自分の後ろにいるいちばん遅いものについての言明です。

シーンの 4 段目が描く形で使ってください。通行証を取り、仕事をし、`finally` で返します。この `finally` は飾りではありません。例外で漏れた通行証はプロセスが生きているあいだ失われたままで、二十から十九へ、十八へと静かに縮む門は、年を取るほど遅くなるサービスとまったく同じに見えます。成功した待ちひとつにつき正確に一度だけ返し、当て推量で先に返さないでください。取った経路とは別の経路から返すのもやめてください。待ちを取り消せるようにするなら、トークンを `WaitAsync` に渡して、取り消された呼び出し元が使いもしない通行証を持っていかないようにします。取り消された待ちは値を返す代わりに例外を投げるので、返却は取得の横ではなく取得の下に置く必要があります。

二つの習慣がこの門を正直に保ちます。フレームワークがすでに持っている上限があるなら、そちらを先に使ってください。`MaxDegreeOfParallelism` を与えた `Parallel.ForEachAsync`、容量を決めたチャネル、`HttpClient` 自身の接続数の上限がそれです。ライブラリが強制する上限は漏れようがありません。そして門は守る相手のそばに置き、アプリケーション全体にひとつではなく依存先ごとにひとつ置きます。全体にひとつだけ置くと、遅いレポートひとつがログイン画面まで締めつけることになり、それこそ Bulkhead パターンが避けようとしている壊れ方です。`SemaphoreSlim(1)` は別に名前を付けておく値打ちがあります。これは非同期の相互排他で、本物の `lock` は `await` をまたいで持ち続けられないため、一度にひとりだけ書かせたい場面で役に立ちます。再入は許さないので、同じ流れが二度取ると自分自身を永遠に待ちます。
