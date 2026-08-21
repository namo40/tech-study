---
title: "Closed State"
summary: "Closed は Circuit Breaker の通常の状態です。呼び出しはそのまま依存先に届き、Circuit Breaker はそのうち何件が失敗したかを数えます。"
category: "回復性と障害対応"
scene: circuit-breaker
sceneStep: 1
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Open State
    slug: open-state
  - label: Half-Open State
    slug: half-open-state
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Closed は Circuit Breaker の通常の状態です。すべての呼び出しがそのまま依存先に届き、Circuit Breaker はその呼び出しが成功したか失敗したかを記録します。

記録こそが要点です。Closed は単に通すだけの状態ではなく、標本区間の中で失敗の比率を更新し続ける状態です。その比率が区間内でしきい値を超えると Open に変わります。

標本区間には最小スループットもあわせて決めます。それがないと、3 件中 2 件の失敗が 67% と読まれ、統計的に意味のない標本で Circuit Breaker が開いてしまいます。
