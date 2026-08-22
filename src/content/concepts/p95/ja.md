---
title: "p95"
summary: "p95 は 20 回のうちいちばん遅い 1 回が経験する遅延です。警告として役に立つほど早く動き、ぶれないだけの標本に支えられているので、アラートの基準はふつうここに置きます。"
category: "要件と品質特性"
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
references:
  - title: Built-in metrics in ASP.NET Core
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/built-in-metrics-aspnetcore
---

p95 がアラートの基準になるのは、1 つの数字に求めたい 2 つのこと、感度と安定性のあいだに位置しているからです。p99 はほんの数本のリクエストに反応し、その分だけ一緒に揺れます。p50 はほとんど反応しません。p95 はトラフィックのまとまった割合が遅くなったときに動き、しかも p99 より先に動きます。

hedge を設定するときの基準になる数字でもあります。p95 のぶん待ってから 2 通目を送れば、20 回のうち 19 回は複製が出ていきません。追加の負荷が引き合うくらい小さく収まるのは、これがあるからです。

p95 は単独ではなく、p50 との比で読みます。p95 が p50 の 2 倍なら、ありふれた広がりです。p95 が p50 の 10 倍なら、そこには 2 つの集団があるということで、面白い問いは何がその 2 つを分けたのかです。キャッシュミス、新しく開く接続、別のシャードあたりがよくある答えです。
