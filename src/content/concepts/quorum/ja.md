---
title: "Quorum"
summary: "二度は存在できない、いちばん小さな集まりです。何かを決める前に過半数を求めるのは形式ではなく、primary が同時に二つになることを不可能にする算数です。その代わり、過半数に届かないときは止まるという代償がつきます。"
category: "データ分散と一貫性"
scene: failover
sceneStep: 3
related:
  - label: Failover
    slug: failover
  - label: Split Brain
    slug: split-brain
  - label: Leader Election
    slug: leader-election
  - label: Heartbeat
    slug: heartbeat
  - label: Lease TTL
    slug: lease-ttl
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
  - title: "Configure and manage quorum (Failover Clustering)"
    url: https://learn.microsoft.com/en-us/windows-server/failover-clustering/manage-cluster-quorum
  - title: "Windows Server Failover Clustering with SQL Server"
    url: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/windows/windows-server-failover-clustering-wsfc-with-sql-server
  - title: "Overview of Always On availability groups"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/overview-of-always-on-availability-groups-sql-server
---

シーンの 3 段階目は、帳簿づけのように見えて、実は設計全体の安全性そのものである数字を軸に回ります。モニターが `votes 2/3` と書き、そこではじめて何かが動きます。三つのうち二つは、すでに下された決定の前で行う儀式ではありません。二度は存在できない、いちばん小さな集まりです。構成員の集合をどう割っても、半分を超える片割れは一つしかありません。この一文が、フェイルオーバーを自動で回してよい理由のすべてです。

意見が一つでは足りない理由は、モニターに単独で昇格を決める権限を与えたと想像すれば見えてきます。その状態で、A はまったく健全でアプリに答え続けているのに、モニターと A のあいだのネットワークだけを切ってみます。モニターの立つ場所から見れば、これはシーンの 2 段階目とそっくりです。鼓動が止まりました。モニターは B を昇格させ、接続が移り、A はまだ自分に届けられるすべてのクライアントから書き込みを受け続けます。primary が二つ、分かれた歴史が二つ、そしてそれを知っている場所はどこにもありません。観測者一人の判定はその人に見えているものについての判定であり、見えているものは真であるものと同じではありません。

過半数がこれを防ぐのは、賢いからではなく算数によってです。構成員三つを割れば、片側はせいぜい一つしか得られません。一つは過半数ではないので、その側は何を信じていようと動けません。感心すべきはここです。孤立した構成員は、自分が孤立していると割り出す必要がありません。正直である必要も、慎重である必要も、よく実装されている必要もありません。ただしきい値に届かないだけです。世界の状態についてまったく誤った信念を持つ構成員に対しても規則は安全なままで、ネットワーク分断が生み出すのは、まさにそういう構成員です。

定足数の構成員を序列ではなく頭数で数える理由、そしてその数が奇数であってほしい理由がこれです。二つの集まりには、使える過半数がそもそもありません。二つの過半数は二つなので、どちらかが消えれば全部が止まり、結局何も買えていないことになります。ペアを一度の喪失に耐えるものへ変えるのは三つ目の票であり、三つ目の票が三つ目のデータベースである必要はありません。監視役、調停役、ファイルサーバー上の共有、別のゾーンにある小さなプロセスで足ります。はいと言えることと、ほかの二つとは別に壊れられることが条件です。

同じ算数が代償もはっきり告げます。過半数を求めるシステムは、過半数を得られないときに止まります。三つのうち二つを失えば、処理能力を失っただけではなく、何かを決める能力そのものを、誰が席を継ぐべきかを決める能力まで含めて失っています。primary が二つになることは決してないという保証と引き換えに可用性を手放したということであり、この話は障害の最中ではなく前に、声に出しておいたほうがよいものです。正しく動くことを拒んだクラスターは壊れたクラスターとまったく同じに見えますし、午前三時に呼び出された人がその違いを原理から辿って突き止めるのは楽しい作業ではありません。

実務的な話が二つ続きます。票はそれぞれ別々に壊れなければなりません。同じラック、同じハイパーバイザー、同じ電源系統の後ろにいる構成員三つは、一度の故障が衣装を三着着ているだけで、そこに成り立つ過半数は想像の産物です。そして票はつねに生きているかどうかについてのものであり、データについてのものではありません。A は死んだと決めることと、生き残った replica のうちどれがいちばん先まで進んでいて昇格すべきかを決めることは別の問いです。前者だけに答えて後者を忘れた設計は、選べるなかでいちばん短い歴史しか持たないマシンを、平然と昇格させます。
