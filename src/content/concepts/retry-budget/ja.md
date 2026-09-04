---
title: "Retry Budget"
summary: "Retry Budget は全体のトラフィックのうち再試行が占められる割合を制限し、すでに苦しんでいる依存先が普段の何倍もの負荷を受けないようにします。"
category: "回復性と障害対応"
scene: retry
sceneStep: 4
related:
  - label: Retry
    slug: retry
  - label: Retry Storm
    slug: retry-storm
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Timeout
    slug: timeout
references:
  - title: "Handling Overload (Google SRE Book)"
    url: https://sre.google/sre-book/handling-overload/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Retry Budget は再試行を通常のトラフィックに対する割合で制限します。たとえば 10% と決めます。その枠を使い切ると、以降の失敗は再試行せずに呼び出し元へそのまま返します。

呼び出しごとの制限だけでは足りません。1 件あたり 3 回は控えめに見えますが、すべての呼び出しが失敗した瞬間、依存先は普段の 3 倍を受け取ります。しかも最も余力がないときにです。Budget は 1 件の呼び出しではなく、システム全体に置く制限です。

Budget は呼び出す側の忍耐ではなく依存先の余力を基準に決め、使用率をメトリクスとして残します。エラー率より先に飽和するからです。
