---
title: "Retry Storm"
summary: "Retry Storm は、同じタイミングで集中した再試行が、回復し始めた依存先を再び倒してしまう現象です。"
category: "回復性と障害対応"
scene: retry
sceneStep: 3
related:
  - label: Retry
    slug: retry
  - label: Jitter
    slug: jitter
  - label: Retry Budget
    slug: retry-budget
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Retry Storm は、多くのクライアントが同じ計画で再試行するときに起きる現象です。依存先が失敗すると、呼び出す側はすべて同じ間隔だけ待ち、同じ瞬間に戻ってきます。その集中が、まだ回復しきっていない依存先を再び倒します。

被害は自分で作ったものです。最初の障害は短かったかもしれませんが、再試行の方針がそれを、依存先を倒し続ける繰り返しの波に変えます。層ごとに再試行を置くと掛け算になります。3 つの層がそれぞれ 3 回なら、1 件の呼び出しが 27 件になります。

最初の対策は Jitter、次が Retry Budget、最後の備えが Circuit Breaker です。3 つがそろって同じタイミングを崩し、量を抑え、回復が見込めないあいだは確認そのものを止めます。
