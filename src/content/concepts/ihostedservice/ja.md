---
title: "IHostedService"
summary: "IHostedService は長く回る仕事をホストの寿命に結ぶ契約です。ホストは立ち上がるときに StartAsync を、降りるときに StopAsync を呼び、優雅な終了という言葉の全部は、サービスが渡されたトークンをどう扱うかです。"
category: "スケジュールされた作業とワークフロー"
scene: background-service
sceneStep: 2
related:
  - label: Background Service
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Cancellation Token
    slug: cancellation-token
  - label: Work Queue
    slug: work-queue
  - label: Background Job
    slug: background-job
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: At-Least-Once
    slug: at-least-once
references:
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
---

シーンの 2 番目のステップは 4 つの言葉が付いたランプで、面白いのは 3 つ目です。`start` はホストがサービスを立ち上げる瞬間、`running` はループがキューから作業を取っている状態、`stopped` はプロセスが消えた状態です。`stopping` はその間の状態で、終了が出来事ではなく依頼だから存在します。サービスは告げられ、新しい仕事はもう取らず、それでも手には作業が 1 つ残っています。その作業が完了の帯に降りるまでランプは `stopped` に届きません。それが終了と強制終了の違いのすべてです。

`IHostedService` はメソッド 2 つのインターフェイスです。アプリケーションが立ち上がるとき、ホストは登録されたすべてのサービスの `StartAsync` を既定では登録順に（`HostOptions.ServicesStartConcurrently` で変えられます）呼び、1 つを待ってから次へ進みます。終了時には、すでに時間を数えているトークンとともに逆順で `StopAsync` を呼びます。長い仕事が `StartAsync` に入ってはいけない理由がその順序です。ホストはそこで止まっており、起動に 40 秒かかるアプリケーションは、コンテナープラットフォームの目には起動に失敗したアプリケーションに見えます。ループを始めて戻り、ホストが立ち上がったあとで働かせます。

`BackgroundService` は、ほとんどの場合インターフェイスを直接実装する代わりに使えばよい基底クラスです。`StartAsync` を `ExecuteAsync` の呼び出しとして実装し、最初の未完了の await より先は待ちません。自分で書くはめになっていた「ループを始めて戻る」がまさにその挙動です。`StopAsync` は渡したトークンを取り消してそのタスクの完了を待つ形で実装され、その待ちは既定が 30 秒の `HostOptions.ShutdownTimeout` で区切られます。ですからトークンは参考ではありません。ホストが頼む手段がトークンで、こちらの `Task` が完了することがその返事です。

そうなると引数 1 つが契約の全部を背負います。`stoppingToken` はループの中のすべての await に届かなければなりません。受信、HTTP 呼び出し、データベース呼び出し、遅延まで全部です。反復の先頭で `IsCancellationRequested` を見るだけのループは、終了が来たときにまだ 30 秒のポーリングの中に座っています。作業の途中で取り消しが届いたとき、たいてい正直な選択は `OperationCanceledException` を飲み込まずに上へ伝えることです。作業は終わっておらず、メッセージは確認されておらず、キューがその作業を別の誰かに渡すからです。それを飲み込んで成功と報告することこそ、仕事が消える手順です。

契約の残り半分は、サービスが倒れたときにホストが何をするかです。`ExecuteAsync` が例外を投げるとタスクは失敗状態になり、.NET 6 以降の既定である `BackgroundServiceExceptionBehavior.StopHost` がアプリケーションを一緒に落とします。大きな音ですが、たいてい正しい判断です。働いていないワーカーがヘルスチェックを通ってはいけないからです。もう一方の `Ignore` は以前の挙動で、より危険です。登録されているのに静かにもう回っていないサービスが残り、最初の例外のあとログには何もなく、どのプローブも緑のままです。失敗の意味を判断できる場所ではループの中で捕まえ、扱えない例外は抜けさせます。

サービスがシングルトンであることから、さらに 2 つが続きます。スコープ付きの依存関係はコンストラクターに注入できません。生成の時点でスコープがなく、たまたま 1 つ受け取れてもそのコンテキストがプロセスと同じだけ生きてしまうからです。代わりに `IServiceScopeFactory` で反復ごとにスコープを作ります。そして `IHostApplicationLifetime` は、終了に反応するだけでなく終了について語るための通路です。`ApplicationStopping` はトークンが取り消される前に発火し、`StopApplication()` は、もう続けられないと判断したワーカーが例外を投げて運に任せる代わりに、ホストへきれいに降りてほしいと頼む方法です。
