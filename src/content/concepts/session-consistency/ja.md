---
title: "Session Consistency"
summary: "Session consistency は、1 つのセッションがデータを筋の通った 1 つの視点で見るという保証です。自分の書き込みは必ず見え、すでに見た値より古いものへ戻ることもありません。多くのアプリケーションが実際に欲しがる水準であり、ユーザーが報告するあのバグをいちばん安く消す方法でもあります。"
category: "データ分散と一貫性"
scene: eventual-consistency
sceneStep: 3
related:
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-consistency
---

最終的な一貫性はシステム全体について 1 つ約束し、個々の読み手には何も約束しません。だから最初に見える失敗はやけに個人的です。ユーザーが何かを保存し、まだその変更を適用していない replica から画面が描き直され、自分がいま加えた編集が消えています。セッション一貫性は、その約束の範囲をクライアント 1 つに狭めます。そのセッションの中では、セッションが行ったすべての書き込みが読み取りに見え、すでに見た値より後ろへは戻りません。セッションの外にいる他人の変更は依然として抜けていることがあり、それこそがこの水準を安く保っている理由です。

実現の仕方は 2 つあり、何を支払うかが違います。1 つ目は固定です。このセッションがどのコピーに書いたかを覚えておき、それが意味を持つ間はセッションの読み取りをそちらへ送ります。クッキーや分散キャッシュの項目 1 つで作れて、負担を減らすはずだったそのコピーが読み取りの一部を引き受けることになり、そのコピーがローテーションから外れてセッションが黙ってもっと遅れた場所へ移ると、音もなく壊れます。2 つ目はトークンです。書き込みが与えられた位置を目印として返し、クライアントが以降のリクエストにその目印を載せ、読み取りはそこまで追いついたコピーだけが答えます。primary に余分な負荷は乗らず、代償は読み取りの待ち時間に移り、目印は書き込みと読み取りの間のすべての区間を生き延びなければなりません。

実務でこの保証が保たれるかどうかは、この最後の条件で決まります。静的フィールドやプロセス 1 つのキャッシュ、サーバー 1 台の変数に置いたセッショントークンはセッショントークンではありません。次のリクエストは別のインスタンスへ行き、トークンを持たずに届き、リクエストが分散するほど混み合ったまさにそのときに保証が消えます。トークンはクッキーやクレーム、ヘッダーに置き、ユーザーの代わりに動くバックグラウンド処理まで引き渡します。そうしないと、その処理はユーザーがすでに通り過ぎた状態を読みます。

Azure Cosmos DB はこれを既定の一貫性レベルとしてそのまま実装しているので、参照設計として読む価値があります。すべての応答がセッショントークンを運び、SDK は 1 つのクライアントインスタンスの中でそれを再利用し、インスタンスをまたいで同じ保証が要るクライアントは自分でトークンを渡します。リレーショナルな構成では、書き込みが得た位置を保持し、replica の位置と比べて読み取りをルーティングし、replica がまだ遅れていれば primary に回すことで同じ効果を得ます。どちらにしても形は同じで、壊れ方も同じです。トークンを一緒に運び忘れれば、気づかないまま最終的な一貫性に戻ります。
