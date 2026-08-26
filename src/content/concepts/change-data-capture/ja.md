---
title: "Change Data Capture"
summary: "Change Data Capture は、データベースが自身の復旧のためにすでに書いているログを読み、コミットされた行の変更を一つずつイベントに変えます。テーブルをポーリングすることも、同じ内容を二度書くこともありません。変更そのものがメッセージであり、パイプラインはデータベースが置いた場所からそれを読み取ります。"
category: "分散トランザクションとメッセージ一貫性"
scene: transactional-outbox
sceneStep: 4
related:
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Replication
    slug: replication
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
  - label: Projection
    slug: projection
  - label: Event Sourcing
    slug: event-sourcing
  - label: Message ID
    slug: message-id
references:
  - title: About change data capture (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/about-change-data-capture-sql-server
  - title: Track data changes (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/track-data-changes-sql-server
  - title: Outbox event router (Debezium)
    url: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
---

outbox をポーリングするリレーは、たいてい答えの返らない問いを繰り返しています。起きるたびに問い合わせが一回かかり、間隔が遅延の下限を決め、間隔を縮めても費用がこちらの欄からあちらの欄へ移るだけです。Change Data Capture はその問い自体をなくします。コミットされた変更はすでにデータベース自身の write-ahead log の中にあります。そうでなければデータベースは突然の停止から復帰できず、レプリカも歩調を合わせられないからです。キャプチャのプロセスはそのログを読み、行の変更ごとにイベントを一つ出します。何が起きたかを決めるのは相変わらずトランザクションで、パイプラインは尋ねるのをやめて聞き始めるだけです。

出てくるものは outbox の行が抱えていたものより一段低い層のものです。それが引き換えです。outbox の行はあなたが設計したメッセージです。名前があり、版があり、あなたが選んだ本文があります。キャプチャのフィードが渡すのはテーブル一行の変更前と変更後の姿で、つまりコンシューマーがあなたのスキーマを見るということです。カラム名の変更、新しく増えた nullable のフィールド、二つに割ったテーブル。その全部が下流へ届きます。よくある解決は outbox テーブルをそのまま置き、それだけをキャプチャすることです。トランザクションはあなたが意図したメッセージを書き、ログの読み手がそれを運びます。Debezium の outbox event router がまさにこの構成で、特殊な事例ではなく既定として理解しておく価値があります。

保証はシーンの四つ目のステップが終わる地点と同じです。キャプチャのプロセスはログをどこまで読んだかを記録し、落ちたあとは最後に記録できた位置から読み直します。そのため、その位置と停止の間の変更は二度読まれます。配送は少なくとも一回であり、コンシューマーには相変わらず message id と、何を処理したかの記憶が要ります。ただし順序はふつう outbox より良くなります。ログが一本の並びなので変更がコミット順に出てくるのは無料で、テーブル単位やキー単位で分ければ、必要なところではその順序を保ちながら残りを並行で流せます。

運用の面では、仕事がサービスの外へ、データベースとパイプラインの側へ移ります。SQL Server の change data capture は変更テーブルに書き込むので、整理のジョブと専用のディスクが要ります。PostgreSQL の logical decoding は、すべてのレプリケーションスロットが消費し終えるまで write-ahead log の断片を抱え続けるため、止まったコンシューマーが遅延のグラフではなくプライマリのディスク枯渇の障害になります。どちらもアプリケーションの中からではなく、それが動いている場所で監視しなければなりません。選択の本当の形はそこです。outbox のリレーはあなたが所有しデバッグできるコードで、change data capture はあなたが設定し見張らなければならないインフラです。
