---
title: "Distributed Transaction"
summary: "複数のストアにまたがってコミットかロールバックのどちらかでなければならない、一つの作業単位です。望み自体はありふれていますが、難しいのは、どのストアも単独では結果を決められないという点です。"
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
  - title: "Distributed data in cloud-native applications"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

場面の最初のステップは、誰もが望むものと、それを難しくしているものを同じ絵の中に収めています。Orders と Payments は二つのストアです。注文と請求は一つの業務上の事実です。ほんの一瞬、この図はその二つを別々にコミットしたときに起きることを見せます。Orders は `committed` と言い、Payments は `aborted` と言い、顧客は誰も代金を受け取っていない注文を手にします。あのゴーストが問題設定のすべてです。

ローカルトランザクションは、一つのストアの中でこれを完全に解決します。データベースにはログが一つ、ロックマネージャーが一つ、コミットレコードが書かれる瞬間が一つあるので、原子性はプロトコルではなく機械の性質です。同じ保証を二台の機械に求めると、それを書き込むための共有された瞬間がありません。それぞれは自分の分をコミットできます。どちらも相手について何も約束できません。互いのことをネットワーク越しに知るしかなく、そのネットワークは遅くてもよく、落ちていてもよく、決定が下されたあとでメッセージを届けてもよいからです。

残るのは、純粋に局所的な答えのない調整の問題です。誰かがストアの集合全体のために結果を握らなければならず、すべてのストアはその誰かの言うことに縛られると同意しなければなりません。自分で決める権利を手放し、用意したものを告げられるまで保持し続けるという同意です。二相コミットが文書として書き留めた取り決めがそれであり、このプロトコルの高くつくところはすべてここから出ます。約束を集める追加の往復、約束しているあいだ各ストアが保持するロック、そして約束はしたのにその約束が何のためだったかをまだ聞けない窓です。

ここでの「分散」が何を指すかは、正確に押さえておく価値があります。関わる機械の台数の話ではないからです。同じ物理サーバー上のデータベース二つも、依然としてリソースマネージャー二つでありプロトコルが要ります。一つのデータベースの中のテーブル十個は一つのトランザクションで、何も要りません。トランザクションを分けるのはホストの数ではなくコミットを所有するものの数であり、偶然できあがる分散トランザクションはまさにここから生まれます。接続二つを包んだ `TransactionScope` は、コードの上では一つのトランザクションに見え、デモでも一つのトランザクションです。二つ目の接続が参加するとランタイムがそれを昇格させ、誰も決めていないのにその物の形が変わります。

つまり設計の大半は、プロトコルを選ぶ前に終わっています。分散トランザクションに見えるものの一部は、間違った理由で分けられたストアであり、戻すのが答えです。一部は、変更を知らせるメッセージとだけ原子的であればよい書き込みで、それはトランザクショナルアウトボックスがローカルトランザクション一つ、コーディネーターなしで片づけます。一部は本当に所有者をまたいでおり、そのときの選択肢は二つです。決定がつくあいだネットワーク越しにロックを握るか、各部分を進めながらコミットして、あとの部分が失敗したら終わったものを取り消すか。前者が二相コミットで、誰も中途半端な状態を観測しないという保証を買います。後者がサーガで、誰かはそれを見ると受け入れます。

決して選択肢にならない答えが一つあります。場面のゴーストが見せているものです。独立したコミット二回と、二回目もうまくいくだろうという期待。すべてのテストで通ります。テストでは両方成功するからです。その方法に欠けているのは二つのコミットのあいだの区間についての話であり、実際のシステムはまさにその区間で暮らしています。
