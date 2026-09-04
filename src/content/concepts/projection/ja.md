---
title: "Projection"
summary: "Projection は書き込み側の変更を 1 つずつ受け取り、read model を最新に保つコードです。書き込みの後ろで動くので遅れが生まれ、何もない状態から再生し直せる必要があります。"
category: "アプリケーションアーキテクチャ"
scene: command-query-responsibility-segregation
sceneStep: 3
related:
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Read Model
    slug: read-model
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Change Data Capture
    slug: change-data-capture
  - label: Event Sourcing
    slug: event-sourcing
  - label: Replication Lag
    slug: replication-lag
  - label: Background Service
    slug: background-service
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Transactional Outbox pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
---

Projection は書き込み側がしたことを読み、それについての問いに答える read model を書きます。入力は順序のある変更の流れです。業務データと同じトランザクションで書かれた outbox テーブルの行、データベース自身が出す変更フィード、書き込み側が Event Sourcing ならイベントストリーム、といったものです。出力は read model のある 1 行を更新することです。その read model に書き込むのはこれだけであり、だからこそ安心して消せます。

書き込みが着地した時点と projection が追いついた時点の差が遅延 (lag) であり、計測すべき数値はこれです。いま適用した変更がどれだけ古いかを出力し、そこにアラートを設定してください。そのうえで、画面をこの差に合わせて設計します。書き込み直後はクエリ側に問い直さず、Command がすでに返した結果を見せる、あるいは書いたバージョンが現れるまでポーリングする、といった方法です。Projection が少し後ろで走っているのは正常です。遅延が上がる一方で下がってこないなら、プロジェクターが止まっているか、書き込み速度に追いつけていないかのどちらかで、それを見分けられるのは指標だけです。

Projection を長く保つには 2 つの性質が要ります。1 つは、同じ変更を 2 回適用しても安全であること、つまり冪等であることです。配送は最低 1 回であり、再生はすべてをもう一度なぞるからです。更新する行と、移る先のバージョンをまとめてキーにしておけば、2 回目の適用は合計を二重に足す処理ではなく、何も変えない処理になります。もう 1 つは、空の状態から再生できることです。read model の形を変えられるようにしているのは、まさにこの性質だからです。テーブルを空にし、最初の変更からプロジェクターを走らせれば、新しい形が埋まります。それをそのまま行うコマンドをプロジェクターに用意し、試しておいてください。それが必要になる日は、本番ですでに形が狂っている日です。
