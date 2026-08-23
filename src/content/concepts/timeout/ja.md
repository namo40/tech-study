---
title: "Timeout"
summary: "timeout は、呼び出し側が応答を待つのをやめてその呼び出しを失敗と判断する瞬間であり、遅い依存先と二度と立ち直れない呼び出し側との間に立っている唯一のものです。"
category: "回復性と障害対応"
scene: request-timeout
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Deadline
    slug: deadline
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: p99
    slug: p99
  - label: Thread Pool Starvation
    slug: threadpool-starvation
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: Timeout resilience strategy
    url: https://www.pollydocs.org/strategies/timeout.html
---

timeout はエラーハンドラーではありません。応答がまだ受け取る価値のある時間はどこまでかを、あらかじめ決めておいた判断です。この区別が効いてくるのは、timeout が防ぐ障害が遅い呼び出しそのものではなく、その後ろに詰まったすべてだからです。依存先を待っている呼び出し側はスレッドを 1 本握り、たいていはプールから借りた接続を、しばしばソケットとメモリのひとかたまりまで握っています。そして依存先が 2 ミリ秒で答えようと、最後まで答えまいと、握ったままです。上限がなければ、止まった依存先 1 つがスレッドプールの枯渇と接続プールの枯渇に変わり、それ自体はまったく健全なサービスの障害になります。

数値を選ぶところは誰もが避けたがる部分で、大きくて安全そうな値を選びたくなります。大きいことは安全ではありません。普段 20 ミリ秒で答える依存先に 10 秒の timeout を置くのは、実質的に timeout がないのと同じです。それが発動するころには、後ろにあったものはすでに詰まりきっています。使える出発点は、正常な依存先の p99 に、普通のばらつきでは引っかからない程度の余裕を足した値です。そのうえで、呼び出し側が実際に払える時間を見ます。呼び出し側のユーザーが 1 秒より長くは待たないなら、依存先がどれだけ望んでも下流の呼び出しに 2 秒を渡すことはできません。

いちばん長く生き残る誤解は、timeout を完成した答えだと思うことです。半分しかありません。timeout は呼び出し側に待つのをやめろと告げるだけで、依存先に働くのをやめろとは告げず、次に何をすべきかも言いません。残りの半分は、実際に仕事まで届く取り消しと、その失敗をどうするかという判断です。予算の中で再試行するのか、より安い代替に退くのか、リクエストをそのまま失敗させるのかを決めます。その判断のない timeout は、遅いリクエストを速いエラーに置き換えるだけで、呼び出し側が到着する速さのままそれを繰り返します。
