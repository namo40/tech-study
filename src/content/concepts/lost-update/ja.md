---
title: "Lost Update"
summary: "Lost Update は、2 つのトランザクションが同じ行を読み、それぞれ読んだ値から新しい値を計算し、2 つ目の書き込みが 1 つ目を静かに上書きしてしまうことです。エラーもログも出ず、最初の変更だけが消えます。"
category: "トランザクションと同時実行"
scene: deadlock
sceneStep: 4
related:
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Isolation Level
    slug: isolation-level
references:
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

形はいつも同じです。値を読み、アプリケーションのコードでその値から新しい値を組み立て、それを書き戻します。2 つのリクエストが同時にこれをやると、どちらも 10 を読み、片方が 11 を、もう片方が 12 を書き、行は 12 で終わります。2 回の加算のうち 1 回が消えたわけです。誰もエラーを受け取らないので、残る手掛かりは、起きたはずの出来事と合わない合計だけです。

この問題がよく隠れるのは、書き込みの既定の振る舞いが「最後に書いた側が勝つ」であり、ほかのほとんどの場面ではその振る舞いこそ望ましいからです。read committed でも防げません。2 つの読み取りはどちらもコミット済みのデータを読み、2 つの書き込みはどちらも正当でした。問題になる区間は読み取りと書き込みのあいだの隙間だけなので、テストではめったに再現せず、負荷がかかると当たり前のように起きます。ユーザーが編集画面に長く留まれるほど悪化するのも同じ理由です。

対処は 3 つあり、それぞれ向いている仕事が違います。新しい値が古い値の関数なら、計算をデータベース側で行い、読み取りを丸ごと省きます。`UPDATE Accounts SET Balance = Balance + @delta WHERE Id = @id` は 1 つの文なので、失うものがありません。値がアプリケーションの判断に依存するなら、そのあいだロックを取るか、行にバージョンを付けて更新をそのバージョンに条件付けます。画面を経由する処理なら、たいていはバージョン検査が既定として妥当です。ユーザーが考えているあいだ何も握らず、静かな上書きを、こちらで扱える競合に変えてくれます。

どれを選ぶにせよ、どの行が守られているのかは書き留めておきます。バージョン列が直す数え間違いは目に見える側にすぎず、在庫がマイナスに落ちる、状態が逆戻りする、監査記録から 1 段階抜ける、といった不具合も同じ形から生まれます。
