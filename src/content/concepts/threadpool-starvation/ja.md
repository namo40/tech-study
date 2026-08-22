---
title: "Thread Pool Starvation"
summary: "Thread Pool Starvation は、スレッドはあるのにすべてブロックされて働けない状態です。CPU は空いているのにキューはたまり、遅延は階段状に跳ね上がります。"
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

症状には特徴があります。遅延はなめらかに上がらず、階段状に跳ねます。プールがスレッドをゆっくり足し、足すたびに一瞬だけキューが軽くなるからです。キューの長さは伸び続け、そのあいだ CPU は低いままです。リクエストが Timeout で落ちているのにマシンがほとんど働いていないなら、容量不足であることはまずありません。

原因はほとんどつねに、同期と非同期を混ぜたコードです。リクエスト経路のどこかにある `.Result`、`.Wait()`、`GetAwaiter().GetResult()`、同期のデータベース呼び出しや HTTP 呼び出しです。その一つひとつが待ちの終わるまでプールのスレッドを押さえ、リクエスト数がスレッド数を超えた瞬間から、新しいリクエストは何もせず待つだけの作業のうしろに並びます。

診断は `dotnet-counters monitor --counters System.Runtime` で行います。`ThreadPool Queue Length` が伸びるあいだ `ThreadPool Thread Count` が 1 秒に 1 本ほどのペースでじりじり上がり、CPU 使用率が平らなままなら starvation です。対処は最小スレッド数を上げることではなく、ブロックしている呼び出しを見つけることです。
