---
title: "Distributed Transaction"
summary: "複数のストアにまたがってコミットかロールバックのどちらかでなければならない、1 つの作業単位です。望み自体はありふれていますが、難しいのは、どのストアも単独では結果を決められないという点です。"
category: "トランザクションと同時実行"
scene: two-phase-commit
sceneStep: 1
related:
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Local Transaction
    slug: local-transaction
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Isolation Level
    slug: isolation-level
  - label: Idempotency Key
    slug: idempotency-key
  - label: Distributed Lock
    slug: distributed-lock
  - label: Deadlock
    slug: deadlock
references:
  - title: "Transaction Fundamentals"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/transactions/transaction-fundamentals
  - title: "Enlisting Resources as Participants in a Transaction"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/transactions/enlisting-resources-as-participants-in-a-transaction
  - title: "TransactionManager.ImplicitDistributedTransactions Property"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionmanager.implicitdistributedtransactions
  - title: "Distributed data in cloud-native applications"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

シーンの最初のステップは、誰もが望むものと、それを難しくしているものを同じ絵の中に収めています。Orders と Payments は 2 つのストアです。注文と請求は 1 つの業務上の事実です。ほんの一瞬、この図はその 2 つを別々にコミットしたときに起きることを見せます。Orders は `committed` と言い、Payments は `aborted` と言い、顧客は誰も代金を受け取っていない注文を手にします。あのゴーストが問題設定のすべてです。

ローカルトランザクションは、1 つのストアの中でこれを完全に解決します。データベースにはログが 1 つ、ロックマネージャーが 1 つ、コミットレコードが書かれる瞬間が 1 つあるので、原子性はプロトコルではなく機械の性質です。同じ保証を 2 台の機械に求めると、それを書き込むための共有された瞬間がありません。それぞれは自分の分をコミットできます。どちらも相手について何も約束できません。互いのことをネットワーク越しに知るしかなく、そのネットワークは遅くてもよく、落ちていてもよく、決定が下されたあとでメッセージを届けてもよいからです。

残るのは、純粋に局所的な答えのない調整の問題です。誰かがストアの集合全体のために結果を握らなければならず、すべてのストアはその誰かの言うことに縛られると同意しなければなりません。自分で決める権利を手放し、用意したものを告げられるまで保持し続けるという同意です。Two-phase commit (2PC) が文書として書き留めた取り決めがそれであり、このプロトコルの高くつくところはすべてここから出ます。約束を集める追加の往復、約束しているあいだ各ストアが保持するロック、そして約束はしたのにその約束が何のためだったかをまだ聞けない窓です。

ここでの「分散」が何を指すかは、正確に押さえておく価値があります。関わる機械の台数の話ではないからです。同じサーバー上のデータベース 2 つに向けたものであっても、接続 2 つはリソースマネージャー 2 つであり、依然としてプロトコルが要ります。1 本の接続で触るテーブル 10 個は 1 つのトランザクションで、何も要りません。トランザクションを分けるのはホストの数ではなくコミットを所有するものの数であり、偶然できあがる分散トランザクションはまさにここから生まれます。接続 2 つを包んだ `TransactionScope` は、コードの上では 1 つのトランザクションに見え、デモでも 1 つのトランザクションです。2 つ目の接続が参加するとランタイムがそれを昇格させ、誰も決めていないのにその物の形が変わります。

つまり設計の大半は、プロトコルを選ぶ前に終わっています。分散トランザクションに見えるものの一部は、間違った理由で分けられたストアであり、戻すのが答えです。一部は、変更を知らせるメッセージとだけ原子的であればよい書き込みで、それは transactional outbox がローカルトランザクション 1 つ、コーディネーターなしで片づけます。一部は本当に所有者をまたいでおり、そのときの選択肢は 2 つです。決定がつくあいだネットワーク越しにロックを握るか、各部分を進めながらコミットして、あとの部分が失敗したら終わったものを取り消すかです。前者が Two-phase commit で、誰も中途半端な状態を観測しないという保証を買います。後者が saga で、誰かはそれを見ると受け入れます。

決して選択肢にならない答えが 1 つあります。シーンのゴーストが見せているものです。独立したコミット 2 回と、2 回目もうまくいくだろうという期待です。すべてのテストで通ります。テストでは両方成功するからです。その方法に欠けているのは 2 つのコミットのあいだの区間についての話であり、実際のシステムはまさにその区間で暮らしています。
