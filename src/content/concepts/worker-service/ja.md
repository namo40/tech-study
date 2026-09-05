---
title: "Worker Service"
summary: "ワーカーサービスは同じバックグラウンドループを自分のプロセスへ移したものです。自分の予定でデプロイされ、ウェブトラフィックではなくキューの深さでスケールし、もともと住んでいたアプリが再起動している間も回り続けます。"
category: "スケジュールされた作業とワークフロー"
scene: background-service
sceneStep: 3
related:
  - label: Background Service
    slug: background-service
  - label: IHostedService
    slug: ihostedservice
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Poison Message
    slug: poison-message
references:
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

シーンの 3 番目のステップは、ループそのものはほとんど変えず、ループが何に付いているかを全部変えます。`service` のカプセルが自分のプロセス境界をまとい、その瞬間からこのステップの 2 つの再起動が別のものとして読めます。アプリが暗くなってもループは作業を取り続け、今度はループが消えるとキューがただ深くなり、やがてループが戻ってきます。どちらも誰かが足した機能ではありません。寿命が 1 つではなく 2 つあるという事実が、そう見えているだけです。

コードの上では移動は小さいものです。`dotnet new worker` は `WebApplication` の代わりに `Host` を与え、同じ `BackgroundService` の派生クラスを与え、HTTP パイプラインは一切与えません。ホスティングモデルがウェブアプリに与えていたもの、つまり構成、ログ、依存関係の注入、オプション、プロセス自体の状態はそのままあります。もともと下にあったのが汎用ホストで、ウェブの部分がその上に重ねられていたからです。ループがすでに API の中にホステッドサービスとして住んでいたなら、移動はたいてい、クラス 1 つと登録 1 行を新しいプロジェクトへ写して古いほうから消す程度です。

得られるのは、これまで 1 つに溶けていた 3 つの分離です。1 つ目はデプロイです。ワーカーはワーカーが変わったときに出ていき、レポート生成器を直したからといって顧客に応答する層をローリング再起動する理由はなくなります。2 つ目はスケールです。ウェブのレプリカは秒あたりのリクエスト数を追い、ワーカーのレプリカはキューの深さを追いますが、この 2 つは無関係な数字です。片方をもう片方の信号で回すと、トラフィックの山で遊んでいるワーカーができるか、誰も容量を足してくれない滞留が積み上がります。3 つ目は障害です。メモリーを食ってプロセスを再利用させる作業が、いまや誰も待っていないプロセスを再利用させるだけになり、API のリクエストパイプラインを道連れにしません。

代価は、ワーカーが分散コンポーネントになったことで、そこから 2 つが付いてきます。キューは本物でなければなりません。メモリーの中の `Channel<T>` ではなくブローカーかテーブルです。プロデューサーとコンシューマーがもう同じプロセスにおらず、メモリーのチャネルを置く共有の場所がないからです。そしてレプリカが 1 つを超えると、何かが止めない限り 2 つが同じ項目に手を伸ばします。ブローカーが与えるメッセージ単位のロック、自分で取って更新するリース、あるいはレプリカごとにキー空間の一部を持つ分割方式が、その何かです。これがシーンの 4 番目のステップであり、ワーカーを増やすことがレプリカ数を書き換えることと違う理由です。

運用の細部として、意図して決めておきたい値が 2 つあります。1 つ目は終了です。コンテナープラットフォームは SIGTERM を送って待つので、`HostOptions.ShutdownTimeout` はプラットフォームの猶予期間より短くなければなりません。そうでないと、プロセスはまだ作業を終えている最中だと信じたまま殺されます。2 つ目はヘルスチェックです。HTTP エンドポイントを持たないワーカーにはプローブが呼ぶ相手がないので、最小限のヘルスエンドポイントを置くか、プラットフォームが読めるファイルや指標に触れて生きていることを知らせます。ループが静かに止まったワーカーは、やることがないワーカーとまったく同じに見えます。その 2 つを見分けられるほうがよいのです。

ワーカーが適した形でなくなるのは、仕事を消費するだけでなく調整しなければならなくなったときです。分かれてまた合流する流れ、途中で死んでも続きから進めなければならない段階、間に挟まる人の承認、後の段階が失敗したときの補償処理などは、実行ごとに残る状態と、それを所有する何かを求めます。ワーカーサービスはループとキューであり、それだけでも十分に多くをこなしますが、ワークフローエンジンではありません。`ExecuteAsync` の中にそれを建て始めると、100 行のコンシューマーが持ち主のいないオーケストレーターに育ちます。
