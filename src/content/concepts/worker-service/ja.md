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

シーンの第三段階は、ループそのものはほとんど変えず、ループが何に付いているかを全部変えます。`service` のカプセルが自分のプロセス境界をまとい、その瞬間からこの段階の二つの再起動が別のものとして読めます。アプリが暗くなってもループは作業を取り続け、今度はループが消えるとキューがただ深くなり、やがてループが戻ってきます。どちらも誰かが足した機能ではありません。寿命が一つではなく二つあるという事実が、そう見えているだけです。

コードの上では移動は小さいものです。`dotnet new worker` は `WebApplication` の代わりに `Host` を与え、同じ `BackgroundService` の派生クラスを与え、HTTP パイプラインは一切与えません。ホスティングモデルがウェブアプリに与えていたもの、つまり構成、ログ、依存関係の注入、オプション、プロセス自体の状態はそのままあります。もともと下にあったのが汎用ホストで、ウェブの部分がその上に重ねられていたからです。ループがすでに API の中にホステッドサービスとして住んでいたなら、移動はたいてい、クラス一つと登録一行を新しいプロジェクトへ写して古いほうから消す程度です。

得られるのは、これまで一つに溶けていた三つの分離です。デプロイ。ワーカーはワーカーが変わったときに出ていき、レポート生成器を直したからといって顧客に応答する層をローリング再起動する理由はなくなります。スケール。ウェブのレプリカは秒あたりのリクエスト数を追い、ワーカーのレプリカはキューの深さを追いますが、この二つは無関係な数字です。片方をもう片方の信号で回すと、トラフィックの山で遊んでいるワーカーができるか、誰も容量を足してくれない滞留が積み上がります。障害。メモリを食ってプロセスを再利用させる作業が、いまや誰も待っていないプロセスを再利用させるだけになり、API のリクエストパイプラインを道連れにしません。

代価は、ワーカーが分散コンポーネントになったことで、そこから二つが付いてきます。キューは本物でなければなりません。メモリの中の `Channel<T>` ではなくブローカーかテーブルです。生産者と消費者がもう同じプロセスにおらず、メモリのチャネルを置く共有の場所がないからです。そしてレプリカが一つを超えると、何かが止めない限り二つが同じ項目に手を伸ばします。ブローカーが与えるメッセージ単位のロック、自分で取って更新するリース、あるいはレプリカごとにキー空間の一部を持つ分割方式が、その何かです。これがシーンの第四段階であり、ワーカーを増やすことがレプリカ数を書き換えることと違う理由です。

運用の細部として、意図して決めておきたい値が二つあります。終了。コンテナープラットフォームは SIGTERM を送って待つので、`HostOptions.ShutdownTimeout` はプラットフォームの猶予時間より短くなければなりません。そうでないと、プロセスはまだ作業を終えている最中だと信じたまま殺されます。状態確認。HTTP エンドポイントを持たないワーカーにはプローブが呼ぶ相手がないので、最小限の状態エンドポイントを置くか、プラットフォームが読めるファイルや指標に触れて生きていることを知らせます。ループが静かに止まったワーカーは、やることがないワーカーとまったく同じに見えます。その二つを見分けられるほうがよいのです。

ワーカーが適した形でなくなるのは、仕事を消費するだけでなく調整しなければならなくなったときです。分かれてまた合流する流れ、途中で死んでも続きから進めなければならない段階、間に挟まる人の承認、後の段階が失敗したときの補償処理。こうしたものは実行ごとに残る状態と、それを所有する何かを求めます。ワーカーサービスはループとキューであり、それだけでも十分に多くをこなしますが、ワークフローエンジンではありません。`ExecuteAsync` の中にそれを建て始めると、百行の消費者が持ち主のいないオーケストレーターに育ちます。
