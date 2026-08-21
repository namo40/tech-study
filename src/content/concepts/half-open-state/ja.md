---
title: "Half-Open State"
summary: "Half-Open は Circuit Breaker の試験の状態です。遮断時間が過ぎると呼び出しを 1 件だけ通し、依存先が回復したかどうかを確かめます。"
category: "回復性と障害対応"
scene: circuit-breaker
sceneStep: 3
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Open State
    slug: open-state
  - label: Closed State
    slug: closed-state
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Half-Open は試験の状態です。遮断時間が終わると、Circuit Breaker は少数の呼び出し、通常は 1 件だけを通し、その試験が進んでいるあいだはほかをすべて拒否します。

この状態があるのは、ほかに知る方法がないからです。依存先が回復したと教えてくれるものはないので、自分で尋ねるしかありません。しかも一気に開くのではなく、できるだけ小さな標本で尋ねます。

試験の結果がすべてを決めます。成功すれば Closed に戻り、失敗すれば遮断時間のあいだ再び Open になります。このとき試験は実際の呼び出しであるべきです。本来使うエンドポイントが失敗しているのに成功してしまうヘルスチェックでは意味がありません。
