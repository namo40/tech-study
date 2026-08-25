---
title: "Spike Test"
summary: "Spike Test は負荷をゆるやかに上げる代わりに一段で跳ね上げます。マーケティングメールも、破棄されたキャッシュも、フェイルオーバーも、みなその形で来るからです。"
category: "テストと検証"
scene: load-test
sceneStep: 2
related:
  - label: Load Test
    slug: load-test
  - label: Stress Test
    slug: stress-test
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Cache Stampede
    slug: cache-stampede
  - label: Rate Limiter
    slug: rate-limiter
  - label: Backpressure
    slug: backpressure
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: Horizontal Pod Autoscaler
    url: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
---

ランプは行儀がよく、実際のトラフィックはそうではありません。Spike Test は平常の負荷から一気に数倍へ跳び、そのまま維持します。キャンペーンメールが送られたとき、キャッシュが空にされたとき、サーバーの半分が残りの半分へ寄せられたときに起きることです。欲しい数字は新しい水準での定常状態ではありません。それはすでに Load Test が測っています。大事なのは、そのあいだの数分がいくらかかるかです。

急増を吸収する仕組みにはどれも遅れがあります。オートスケーラーはウィンドウ単位で指標を読み、新しいインスタンスが準備状態のプローブを通るまで待ちます。コネクションプールは接続を 1 本ずつ開き、1 本ごとに handshake の費用がかかります。空にされたばかりのキャッシュは、今まさにシステムを押し流しているそのトラフィックで埋め直すしかなく、リクエストをまとめなければミス 1 件ごとが個別のクエリになります。その遅れが終わったあとではなく、遅れが続いているあいだの遅延とエラーを測ります。

直すべきは多くの場合、上限ではなく遅れのほうです。最初の数秒でスケールアウトが要らないだけの余裕を持ち、必要になる前にインスタンスを温め、キューの長さを制限して急増をゆっくり吸収する代わりに素早く断り、まったくスケールできない依存関係の前に rate limiter を置きます。
