---
title: "Jitter"
summary: "Jitter はバックオフの待ち時間ごとにランダムなずれを加え、多くのクライアントの再試行が同じ瞬間に届かないようにします。"
category: "回復性と障害対応"
scene: retry
sceneStep: 2
related:
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Retry Storm
    slug: retry-storm
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Jitter はバックオフの待ち時間ごとにランダムなずれを加えます。ちょうど 1 秒後に再試行するのではなく、0.5 秒から 1.5 秒のあいだのどこかで再試行します。

必要な理由は、クライアントが同時に失敗するからです。依存先が止まると呼び出す側はすべて一緒に失敗し、その後は全員が同じ瞬間に同じバックオフ計画を始めます。ジッターがないと、再試行は 1 つの山として届き、それが繰り返されます。

Full Jitter を勧めます。0 から現在のバックオフ上限までを一様に選ぶ方式です。固定値に小さなゆらぎを足すだけの方式より負荷が均等に散ります。Polly の `UseJitter` はこれとは違います。指数バックオフには decorrelated jitter の式を、固定または線形のバックオフには ±25% を適用するので、Full Jitter が欲しければ自前の `DelayGenerator` が要ります。
