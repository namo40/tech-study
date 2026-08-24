---
title: "Pivot Transaction"
summary: "pivot は、そこを過ぎると戻れなくなる saga のステップです。pivot の前で失敗したら逆順に補償し、pivot の後で失敗したら残りのステップが成功するまで前向きに再試行します。"
category: "分散トランザクションとメッセージ一貫性"
scene: saga
sceneStep: 4
related:
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Orchestration
    slug: orchestration
  - label: Idempotency Key
    slug: idempotency-key
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

どの saga にも、取り消せないステップ、あるいは取り消さないと決めたステップがあります。確定した決済、送ってしまったメール、すでに出荷された箱がそうです。それが pivot であり、saga を二つに切り分けます。手前は元に戻せるので、失敗には逆順の補償で答えます。その先は戻せないので、残りのステップが終わるまで試し続けることだけが誠実な答えになります。

そのため pivot より後のステップは、性質の違うコードになります。回数を区切った再試行とその間の待機が要り、通り過ぎる失敗と恒久的な失敗を区別する必要があり、もう一度実行しても安全でなければなりません。二重に課金する再試行は、直そうとした失敗より悪いからです。タイムアウトやロックされた行のような通り過ぎる失敗こそ再試行の対象です。どの倉庫にも在庫がないような恒久的な失敗は違います。何度試しても在庫は生まれないので、すでに約束したお金を黙って返すのではなく、人に引き継ぐか、前に進む別の経路を取ります。

pivot をやり過ごす最良の方法は、pivot を動かすことです。戻せるステップを前に、戻せないステップをできるだけ後ろに置きます。決済を確定する前に在庫を確保すれば、確保に失敗しても解放ひとつで済みます。先に課金すれば決済がうっかり pivot になり、注文の三分の一を返金するシステムはそうして生まれます。戻せないステップが二つあるなら、繰り返しやすいほうを後ろに置きます。

pivot はコメントではなくコードに記します。ステートマシンなら名前の付いた遷移になり、その先の状態の失敗分岐は再試行だけを送り、補償は送れなくなります。試行回数は saga インスタンスに数え、すべてのメッセージを saga id でキー付けして `Reserve` の三度目の配達が一度目と同じ結果になるようにし、あきらめの経路は人の目に触れる場所へ送ります。pivot を過ぎた場所で止まった saga はパターンの欠陥ではなく、この件には判断が要るとパターンが告げている合図です。
