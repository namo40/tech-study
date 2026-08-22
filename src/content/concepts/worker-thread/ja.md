---
title: "Worker Thread"
summary: "Worker Thread はキューにたまった作業項目を実行する、プールの汎用スレッドです。I/O 完了スレッドはそれとは別の集まりで、オペレーティングシステムが終えた処理を引き継ぎます。"
category: "プールとリソース管理"
scene: thread-pool
sceneStep: 1
related:
  - label: Thread Pool
    slug: thread-pool
  - label: I/O Completion Port
    slug: io-completion-port
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

プールは 2 種類のスレッドを持ちます。Worker Thread はキューに入ったものを実行します。`Task.Run` の中身、タイマーのコールバック、リクエストハンドラーの同期部分などです。I/O 完了スレッドは、オペレーティングシステムが終えた処理を引き継ぐために存在します。おかげで `await` のあとの継続を動かす場所ができ、そのあいだワーカースレッドが遊んで待つ必要がありません。どちらにも独自の最小値と最大値があり、`ThreadPool.SetMinThreads` は両方をまとめて設定します。

最小値は、プールがためらわずに用意するスレッドの本数です。それを超えると新しいスレッドはゆっくり、おおよそ 1 秒に 1 本のペースで増えます。この速度のせいで starvation はなだらかな坂ではなく崖のように感じられ、だからこそ最小値を上げることが解決に見えます。解決ではありません。最小値を上げても、同じ壁にぶつかるまでに耐えられるバーストが大きくなるだけなので、想定できる起動直後のスパイクをしのぐためだけに使い、ブロックしている呼び出しを覆い隠すためには使いません。
