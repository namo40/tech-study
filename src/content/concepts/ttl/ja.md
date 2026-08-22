---
title: "TTL"
summary: "TTL はキャッシュされたエントリが事実と食い違ってよい最長の時間であり、取りこぼした無効化をすべて直してくれる最後の砦です。"
category: "キャッシュ"
scene: cache-invalidation
sceneStep: 1
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Stampede
    slug: cache-stampede
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

TTL は失敗しえない唯一の無効化です。メッセージは失われますし、配信の途中でプロセスが再起動することもあり、書き込み経路が削除の呼び出しを忘れることもあります。そのどれも TTL より長くは問題になりません。エントリが自分で期限切れになり、次の読み取りが事実を取ってくるからです。

長さは、読む側がどれだけ古い値まで許せるかから決めます。元のデータを読む費用から決めるのではありません。価格が 5 分まで古くてよいなら TTL は 5 分です。データベース呼び出しを節約するために 1 時間へ延ばすのは、何も言わずに正しさを費用と引き換えることです。

TTL にはランダムなばらつきを与えます。一緒に書かれたエントリは一緒に期限切れになり、ひとまとまりが同時に切れると miss の波が元のデータに押し寄せます。期限ごとに数パーセントの jitter を入れれば、その同時性はただで崩れます。
