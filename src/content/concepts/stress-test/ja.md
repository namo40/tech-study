---
title: "Stress Test"
summary: "Stress Test はスループットが伸びなくなる点を越えてなお負荷を上げ続け、システムがいつではなくどのように壊れるかを確かめるテストです。"
category: "テストと検証"
scene: load-test
sceneStep: 2
related:
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Load Shedding
    slug: load-shedding
  - label: Bulkhead
    slug: bulkhead
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Rate Limiter
    slug: rate-limiter
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: NBomber documentation
    url: https://nbomber.com/docs/getting-started/overview/
---

Stress Test は Load Test が終わる地点から始まります。膝を過ぎると負荷を増やしてもスループットは増えないため、増えた分はすべて待ち行列に変わります。遅延が上がり、クライアントの timeout がリクエストを切り始め、最初に飽和したリソースが失敗の形を決めます。目的は大きな数字を見つけることではなく、実際のトラフィックイベントが見せてくれる前に失敗を先に見ることです。

見るべきは失敗の仕方です。負荷を捨てるサービスは生き残り、より少ない割合のリクエストを正しく返します。すべてをキューに積むサービスは最終的に 1 件も返せません。先頭に届くころにはどれも timeout しているからです。長さを制限したキュー、同時実行数の制限、短い接続 timeout が崩壊を性能低下に変えてくれます。それが本当に働くかを確かめる方法が Stress Test です。

そのあと負荷を取り除き、回復を見守ります。p95 が通常に戻るまでの時間、コネクションプールとスレッドプールが自力で空になるか、再起動が必要だったものはないかを記録します。障害が実際に評価されるのはまさにその区間であり、午前 3 時に学ぶより意図して測るほうがずっと安く済みます。
