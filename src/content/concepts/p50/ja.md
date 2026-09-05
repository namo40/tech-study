---
title: "p50"
summary: "p50 は中央値です。リクエストの半分はこれより速く、半分はこれより遅くなります。典型的なリクエストがどうかは教えてくれますが、遅いリクエストについては何も教えてくれません。"
category: "要件と品質特性"
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
references:
  - title: Creating metrics in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
---

中央値は、平均がそのふりをしている値です。20 個の標本のなかの 400 ms のリクエスト 1 本は、平均を 18 ms 押し上げても、中央値はもとの場所に置いたままにします。平均で作ったダッシュボードが穏やかに見えるのに、20 回に 1 回のリクエストが不満をかかえている、という状況はこうして生まれます。

p50 は、容量の見積もりと正常な経路の形を見るのに適した数字です。変わったことが何も起きていないときにコードがいくらかかるかを教えてくれるからです。p50 が動いたなら、全員にとって何かが変わっています。クエリの実行計画、リリース、以前より多くの仕事をするようになったマシンが代表的です。

p50 にできないのは、テールを見ることです。100 回に 1 回が 400 ms かかっているあいだも、サービスは何か月も p50 を 44 ms に保てますし、p50 だけを見ている人がそれに気づくことはありません。p50 は単独ではなく、p95 と p99 の隣で読みます。
