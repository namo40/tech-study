---
title: "Heartbeat"
summary: "中身といえば届いたという事実だけの周期信号です。ハートビートが語ることは情報ではなく、情報は来なかったハートビートの側にあります。だからどの検知器も、実は沈黙の長さを選んでいます。"
category: "データ分散と整合性"
scene: failover
sceneStep: 2
related:
  - label: Failover
    slug: failover
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Primary-Replica
    slug: primary-replica
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Flexible automatic failover policy for an availability group"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/configure-flexible-automatic-failover-policy
  - title: "Windows Server Failover Clustering with SQL Server"
    url: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/windows/windows-server-failover-clustering-wsfc-with-sql-server
  - title: "Health Endpoint Monitoring pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring
---

シーンの 2 番目のステップは、中身をまったく運ばない信号を軸に組み立てられています。ハートビートは、届いたということ以外に何も言いません。読む価値のある本文も、状態のフィールドも、マシンの調子の要約もありません。モニターへ落ちていく 2 つの点は毎回まったく同じ姿で、そこがまさに要点です。モニターが知るのは鼓動の中身ではありません。期待した時刻に鼓動が届いたという事実です。

ここから、多くの人が痛い目で学ぶ帰結が 1 つ出てきます。ハートビートが運ぶ情報は否定形しかない、ということです。A が止まる瞬間に何が起きるかを見てください。何も起きません。エラーも出ず、メッセージも飛ばず、ランプも瞬きません。止まったマシンは、自分が止まったと誰にも言えないからです。意味を持つ出来事は不在であり、不在はすでに何かを待っていた側にしか気づけません。モニターが何かを知る前にまず周期を知っていなければならない理由も、ランプが故障のその瞬間ではなく少し後に消える理由も、ここにあります。

そこから 2 番目のステップの字幕の 1 文が出てきます。モニターは死と遅さを区別できません。長いガベージコレクションで止まったプロセス、ディスクが飽和したマシン、チェックポイントの最中のデータベース、片方向だけパケットを落とし始めたネットワークは、モニターの側から見ればどれも電源を抜かれたマシンと見分けがつきません。どれも沈黙に見えるからです。検知器を設計している人は、死を検知しているのではありません。死として扱うと決めた沈黙の長さを選んでおり、しかもその違いをついに確かめられないまま選んでいます。

そのためタイムアウトは設計全体でいちばん結果の大きい数字になり、しかも両側に代償のついた数字になります。短くすれば、ふつうの停止が障害として読まれます。要りもしなかった昇格、理由のない接続の切断、最悪の場合は、まだ元気に書き込みを受けているマシンに下される死亡宣告がついてきます。長くすれば、ユーザーが失敗するリクエストを眺めているあいだ、席がちょうどその分だけ空いたままになります。両方を避ける設定はなく、危険をどちら側に置きたいかを決める設定があるだけです。

シーンのランプが、消えた状態を 1 つではなく 2 つ持っている理由がこれです。鼓動を一度取りこぼすとモニターは A を疑い、二度取りこぼすともう数に入れません。2 つの間隔はわざと空けてあります。2 つの状態の値段がまったく違うからです。疑いは無料で、誰にも気づかれずに取り下げられるので、安く早くてかまいません。構成員を数から外すことは昇格の錠を開ける行為であり、昇格は無料でも取り下げ可能でもないので、遅く高くあるべきです。疑いは安く、確信は高くです。

どんな調整よりも値打ちのある実務上の指針が 2 つあります。第 1 に、ハートビートは本物の仕事が通る経路を通り、本物の仕事をするものが作り出すべきです。本スレッドがデッドロックしているのに予備のスレッドが答えた鼓動や、データ用のネットワークが死んでいるのに管理用のネットワークで送った鼓動は、鼓動がまったくないより悪いことになります。ありもしない健全さを積極的に報告するからです。第 2 に、頻繁に送れるほど安く、何かを証明できるほどには高くあるべきです。プロセスがまだ動いていることしか証明しないエンドポイントは、その後ろのすべてのクエリがタイムアウトしているあいだも、きちんと鼓動を打ち続けます。
