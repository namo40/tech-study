---
title: "Open State"
summary: "Open は Circuit Breaker が呼び出しを即座に拒否する状態です。失敗している依存先に回復する時間を与えます。"
category: "回復性と障害対応"
scene: circuit-breaker
sceneStep: 2
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Closed State
    slug: closed-state
  - label: Half-Open State
    slug: half-open-state
  - label: Retry
    slug: retry
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Open は Circuit Breaker が依存先をまったく呼び出さない状態です。すべての呼び出しは Circuit Breaker で拒否され、ネットワークの往復なしにすぐ返ります。

素早く失敗すること自体が、呼び出す側への利点です。そうしなければ、すでに止まっているとわかっている依存先に対してスレッドがタイムアウトを待つことになり、待つスレッドがたまれば呼び出す側まで止まります。

正しく決めるべき数値は遮断時間の 1 つです。短すぎれば回復していない依存先を叩き続けます。長すぎれば回復したあとも正常なトラフィックが止まったままになります。
