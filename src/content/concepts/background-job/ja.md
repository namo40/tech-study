---
title: "Background Job"
summary: "Background Job は、それを依頼したリクエストの外側で動く処理です。処理が終わる前に応答が返り、呼び出した側は受付証を受け取ってから結果を別途確認します。"
category: "アプリケーションアーキテクチャ"
scene: web-queue-worker
sceneStep: 2
related:
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Background Service
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Graceful Shutdown
    slug: graceful-shutdown
references:
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0
  - title: Generic Host lifetime and shutdown
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

Background Job は、前半だけを済ませたリクエストの後半にあたります。エンドポイントは何を依頼されたかを記録し、識別子を返して終わります。処理そのものはそのあとに始まり、きっかけはエンドポイントがキューに残したメッセージだったり、スケジュールだったりします。そのあいだユーザーは接続を握って待ってはいません。30 秒かかる処理を機能として出せる理由はここにあります。

.NET では、この処理は `BackgroundService` の中で動きます。長く生きる `IHostedService` のための基底クラスです。Web アプリケーションにそのまま登録するのがいちばん小さな一歩で、軽くて失われても構わない処理ならそれが正解です。ただしその場合、処理はサイトとすべてを共有します。プロセス、メモリ、デプロイ、スケーリングの基準まで同じになります。Worker Service プロジェクトは、同じクラスを自前のホストに置き、単独でデプロイし、リクエスト数ではなくキューの深さで増やします。この切り離しこそがパターンの要点で、処理がリクエストと CPU を奪い合うほど重くなった時点で移す価値があります。

処理はリクエストより長く生きるため、リクエストが持っていたものを借りることはできません。スコープ付きサービスをコンストラクターで抱え込まず、ジョブごとに新しい DI スコープを作って使い、`HttpContext` は決して保持しません。ホストが渡す `CancellationToken` を守り、シャットダウン時には再開できる地点で止まるようにしたうえで、それでも処理の途中で止められる前提で設計します。メッセージは戻ってくるので、ハンドラーは何度実行されても安全、つまり冪等でなければなりません。そして結末をクライアントに伝える手段は依然として必要です。状態エンドポイント、webhook、通知のいずれかで十分ですが、`202 Accepted` が言っていたのは、そもそも処理を受け付けたということだけだからです。
