---
title: "Cancellation Token"
summary: "cancellation token は、待つのをやめるという判断が仕事そのものへ届くための経路であり、タイムアウトを呼び出し側への通知で終わらせず、依存先にも見える打ち切りに変えます。"
category: "回復性と障害対応"
scene: request-timeout
sceneStep: 4
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Background Job
    slug: background-job
  - label: Hedging
    slug: hedging
  - label: Retry
    slug: retry
references:
  - title: Cancellation in managed threads
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
  - title: HttpContext.RequestAborted
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httpcontext.requestaborted
  - title: gRPC deadlines and cancellation
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
---

下流の誰にも伝わらないタイムアウトは、仕事を減らしません。移すだけです。呼び出し側は待つのをやめ、スレッドを解放し、エラーを返しますが、依存先は誰も読まないクエリとリクエストとレスポンスを抱えたまま走り続けます。負荷がかかった状況では、これは両方とも最悪です。呼び出し側は速く失敗し、依存先は捨てられる結果のために全力で回り続けるので、そもそもタイムアウトを起こした原因が回復する隙を得られません。cancellation token はその隙間を埋める経路であり、最初の段で受け取って捨てるのではなく、すべての段へ下ろしたときにだけ働きます。

ASP.NET Core で出発点になるトークンは `HttpContext.RequestAborted` です。クライアントが切断したときにも、リクエストタイムアウトのポリシーが発動したときにも取り消されます。ハンドラーが `await` するものはすべてこれを受け取るべきです。`FindAsync([id], ct)`、`GetFromJsonAsync(url, ct)`、`ReadAsync(buffer, ct)` のいずれもそうです。ある段階にリクエスト全体より狭い上限が必要なら、答えは別個のソースではなく連結したソースです。`CreateLinkedTokenSource(ct)` に `CancelAfter(remaining)` を足せば、止まるべき 2 つの理由が両方とも生きているからです。gRPC ではクライアントの deadline がサーバー側に取り消しとして届くので、サーバーがトークンを尊重することが、クライアントの deadline を向こう側で意味あるものにします。

これを飾りではなく本物にする習慣が 2 つあります。1 つめは、`CancellationToken` 型の引数を、無視してよいものではなく渡すべきものとして扱うことです。トークンを受け取りながら使わない `async` メソッドは、受け取らないメソッドより悪いものです。見た目が正しそうだからです。2 つめは、取り消されては困る仕事について意図を持つことです。すでに決済をコミットしたリクエストは、自分がしたことを最後まで書き切るべきなので、トークンはコミットより前の呼び出しに付け、それを記録する呼び出しには付けません。リクエストより長く生きる必要のある長い仕事は、リクエストのトークンを借りるのではなく、自分のトークンを持つバックグラウンドジョブに移します。
