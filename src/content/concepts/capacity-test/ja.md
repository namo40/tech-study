---
title: "Capacity Test"
summary: "Capacity Test は 1 つの問いに答えます。サービスがなお目標を満たす最大の負荷はいくつか。ピークではなくその数字が、約束できる値です。"
category: "テストと検証"
scene: load-test
sceneStep: 3
related:
  - label: Load Test
    slug: load-test
  - label: Soak Test
    slug: soak-test
  - label: SLO
    slug: slo
  - label: Throughput
    slug: throughput
  - label: Tail Latency
    slug: tail-latency
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
---

Capacity Test は Load Test を逆から読む作業です。p95 かエラー率が目標を越えるまで負荷を上げます。先に崩れるほうが基準で、崩れるのはエラーのほうであることが多いです。そのあと両方が目標の内側にあった最後の段階まで戻し、その水準が偶然ではなく安定していると確信できるだけ維持します。上がる途中で見たピークのスループットは答えではありません。誰も合意していないレイテンシで測った値だからです。

答えは 3 つの部分からなる数字です。スループット、それを測る基準になった目標、そしてそのとき使ったリクエストの構成とデータです。後ろの 2 つを欠いた報告はうわさにすぎません。同じサービスでも、ホットなキーを読むだけの構成ならはるかに大きな数字を返し、書き込みと冷たい読み取りが相応の比率で混ざればはるかに小さな数字を返すからです。

余裕を残します。温まって邪魔の入らないシステムで測った容量は目標ではなく天井であり、デプロイもガベージコレクションも、うるさい隣人も、故障したレプリカ 1 台も、その天井を削っていきます。測った数字より十分に低い目標を選び、そこへ届く前にスケールが始まるようオートスケーラーを設定し、データ層やプールサイズ、インスタンス種別を変えるたびに測り直します。
