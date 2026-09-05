---
title: "Thread Pool Starvation"
summary: "Thread Pool Starvation は、スレッドはあるのにすべてブロックされて働けない状態です。CPU は空いているのにキューはたまり、レイテンシは階段状に跳ね上がります。"
category: "プールとリソース管理"
scene: thread-pool
sceneStep: 2
related:
  - label: Thread Pool
    slug: thread-pool
  - label: Async/Await
    slug: async-await
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

症状には特徴があります。レイテンシはなめらかに上がらず、階段状に跳ねます。プールは最初の速い立ち上がりを過ぎるとスレッドを 1 秒に 1、2 本とゆっくり足し、足すたびに一瞬だけキューが軽くなるからです。キューの長さは伸び続け、そのあいだ CPU は低いままです。リクエストがタイムアウトで落ちているのにマシンがほとんど働いていないなら、容量不足であることはまずありません。

原因はほとんどつねに sync-over-async、つまり同期と非同期を混ぜたコードです。リクエスト経路のどこかにある `.Result`、`.Wait()`、`GetAwaiter().GetResult()`、同期のデータベース呼び出しや HTTP 呼び出しです。その一つひとつが待ちの終わるまでプールのスレッドを押さえ、リクエスト数がスレッド数を超えた瞬間から、新しいリクエストは何もせず待つだけの作業のうしろに並びます。

診断は `dotnet-counters monitor --counters System.Runtime` で行います。`dotnet.thread_pool.queue.length` が伸びるあいだ `dotnet.thread_pool.thread.count` が 1 秒に 1、2 本のペースでじりじり上がり、CPU 使用率が平らなままなら枯渇です。対処は最小スレッド数を上げることではなく、ブロックしている呼び出しを見つけることです。.NET 8 以前では、この 2 つは旧表示名の `ThreadPool Queue Length` と `ThreadPool Thread Count` で現れます。.NET 6 以降、プールは `Task.Wait` 型のブロックにより速く反応するので、上り坂は以前より短くなりましたが、なくなってはいません。
