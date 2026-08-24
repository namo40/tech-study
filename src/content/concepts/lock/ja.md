---
title: "Lock"
summary: "ロックは、データベースが同時に走る文に順番を付ける仕組みです。共有ロックは読み手を一緒に通し、排他ロックはほかのすべてを締め出し、衝突するロックを求めた側は握っているトランザクションが終わるまで待ちます。"
category: "トランザクションと同時実行"
scene: deadlock
sceneStep: 1
related:
  - label: Deadlock
    slug: deadlock
  - label: Isolation Level
    slug: isolation-level
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

アプリケーションが目にするロックは、2 つのモードでほぼ説明が付きます。共有ロックは読み取りが取るロックで、同じ行に複数の読み取りが同時に取れます。排他ロックは書き込みが取るロックで、何とも同居できません。排他ロックがかかっているあいだ、ほかのトランザクションはその行を共有ロックで読むことも、書くこともできません。「2 つ目の書き込みが待つ」という言い方の中身がこれです。

意外に思われるのは、ロックをどれだけ長く握るかという点です。排他ロックは文が終わったときではなく、トランザクションが終わったときに解放されます。トランザクションが書いたものはすべて、commit か rollback までロックされたまま残ります。外部呼び出しをまたいで開いたままのトランザクションが、その呼び出しにかかる時間ちょうどのあいだ他の書き込みを止めてしまうのは、このためです。

ロックには大きさもあります。データベースは 1 行をロックすることも、ページをロックすることも、テーブル全体をロックすることもでき、1 つの文がテーブルを十分に多く触ると、小さなロックの束を 1 つの大きなロックへ昇格させます。支えるインデックスのない更新はテーブルを走査し、通り道の行にロックを取っていき、実際に変更した行よりはるかに広い範囲を握ることになります。足りないインデックスが、遅いクエリではなくブロッキングの問題として現れる理由です。

ロックを待つこと自体は正常で、たいていは短時間です。正常でないのは 2 つのトランザクションが互いを待っている状態で、その待ちには終わりがありません。デッドロックであり、データベースがどちらかを殺さないと解けません。ロック待ち時間はそれ自体を見るべき指標として扱い、それぞれのトランザクションの後ろに並ぶ待ちも短く保てるよう、トランザクションを短く書きます。
