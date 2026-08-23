---
title: "Deadline"
summary: "deadline はリクエスト全体を測る基準となる 1 つの時刻であり、そのおかげでその下のすべての呼び出しは自分専用の新しいタイムアウトではなく残り時間を受け取ります。"
category: "回復性と障害対応"
scene: request-timeout
sceneStep: 3
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Retry
    slug: retry
  - label: Retry Budget
    slug: retry-budget
  - label: Tail Latency
    slug: tail-latency
  - label: p99
    slug: p99
references:
  - title: gRPC deadlines
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: CancellationTokenSource.CancelAfter
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.cancelafter
---

timeout は期間で、deadline は時刻です。この違いこそが要点です。リクエストが到着した時点で deadline を 1 つ与えれば、その後このリクエストが行うすべての呼び出しは「自分はどれだけ使ってよいか」という問いへの答えを持ち、その答えはリクエストが進むにつれて縮んでいきます。代わりに呼び出しごとに期間を与えると、合計を誰も測っていないので、呼び出し側が持っているつもりだった保証は経路上のすべての上限の合計になります。それは常に、個々の上限のどれよりもずっと大きい値です。800 ms を約束したリクエストの下で 500 ms の呼び出しが 2 回起きるのは、どの設定にも違反していません。ただ、誰も守っていなかった約束だというだけです。

計算は一度自分でしてみる価値があります。800 ms を持つリクエストがデータベースに 300 を使えば、次に行う HTTP 呼び出しは 500 を受け取り、その呼び出しが接続から開かねばならないなら、その接続時間も無料ではなく同じ 500 から出ていきます。予算は入れ子になるのであって、足し算にはなりません。だからこそ、再試行するかどうかを判断する土台になるのも deadline だけです。2 回目の試行は、それを終えられるだけの予算が残っているときにだけ意味があり、そうでなければ純粋な無駄なのですが、呼び出しごとのタイムアウトではこの問いを立てることすらできません。

deadline をプロセス境界の向こうへ渡すことが、これを 1 つのサービスではなくシステムとして機能させます。gRPC にはこれが組み込まれていて、クライアントが設定した deadline がそのまま伝わり、サーバー側では `context.CancellationToken` として現れます。おかげでサーバーは、クライアントがすでに諦めた仕事を止められます。素の HTTP には標準のヘッダーがないので、規約を 1 つ決めて守る必要があります。1 つのプロセスの中では、`CancellationTokenSource.CreateLinkedTokenSource` に `CancelAfter(remaining)` を組み合わせた形が答えです。こうして作ったトークンは、入ってきたリクエストが中断されたときにも取り消され、リクエスト自身の時計が切れたときにも発火します。
