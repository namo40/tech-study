---
title: "Exponential Backoff"
summary: "Exponential Backoff は試行の間隔を倍数で延ばし、苦しんでいる依存先が再試行のたびに長い余裕を得られるようにします。"
category: "回復性と障害対応"
scene: retry
sceneStep: 2
related:
  - label: Retry
    slug: retry
  - label: Jitter
    slug: jitter
  - label: Retry Storm
    slug: retry-storm
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Exponential Backoff は試行の間隔を通常 2 倍ずつ延ばします。最初の再試行が 500 ms 後なら、次は 1 秒、2 秒、4 秒となります。依存先は毎回より長い余裕を得ます。

この方式が解決するのは固定間隔の再試行です。200 ms ごとに送り直すと、遅くなった依存先がさらに負荷を受ける状態になります。処理がはけないまま仕事が積み上がるからです。間隔を 2 倍にすれば、たまった処理がはける余地が生まれます。

上限を設けます。際限なく延びるとだれも待てないほどの待ち時間になるので、倍率とあわせて最大遅延と全体の Deadline を決めます。Polly では、再試行オプションの `MaxDelay` (既定では未設定) と、再試行より前に追加して外側に入れ子になるようにした Timeout 戦略がそれにあたります。
