---
title: "Hedging"
summary: "Hedging は、遅い呼び出しの 2 通目を少し待ってから別のレプリカへ送り、先に返ってきた答えを使うやり方です。"
category: "要件と品質特性"
scene: tail-latency
sceneStep: 3
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: p99
    slug: p99
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

hedging を安くしているのは、待つ時間です。待ち時間を p95 あたりに置けば、複製が出ていくのは 20 回に 1 回だけなので、追加の負荷は数パーセントにとどまります。そのうえで、テールに向かっていた呼び出しには 2 度目の機会が与えられ、その機会はたいていずっと速く終わります。

条件は 2 つあります。1 つは、2 回送っても差し支えない呼び出しであることです。使う答えは 1 つでも、両方の複製が最後まで実行されることがあるからです。もう 1 つは、hedge に予算を持たせることです。トラフィックの一定割合をクライアント全体で守らせておけば、どこでも遅くなったバックエンドが、いちばん受け止めにくい瞬間に 2 倍のトラフィックを受け取ることはありません。

.NET では、レジリエンスパイプラインの `AddHedging` が `MaxHedgedAttempts` と `Delay` を受け取り、どちらかが答えた時点で負けたほうを取り消します。`Delay` を 0 にすると別のパターンになります。最初からすべての呼び出しを並列に出すので、1 通目が遅かったかどうかに関係なく負荷が 2 倍になります。
