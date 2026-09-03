---
title: "Read-Through"
summary: "read-through は、キャッシュを埋める仕事をキャッシュ側へ移します。アプリケーションはキーを尋ねて値を受け取るだけで、その値がメモリから来たのか通り道のデータベースから来たのかは、呼び出し側ではなくキャッシュ層の仕事です。"
category: "キャッシュ"
scene: cache-aside
sceneStep: 1
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: HybridCache
    slug: hybridcache
  - label: IDistributedCache
    slug: idistributedcache
  - label: Write-Through
    slug: write-through
  - label: Cache Stampede
    slug: cache-stampede
references:
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

シーンの最初のステップは、miss が埋められる場面です。キャッシュが空なのでアプリケーションがデータベースを読み、戻る途中でその結果を保存します。read-through がこの絵で変えるのはたった一つ、順序ではなく主体です。アプリケーションはもう miss に気づきません。キーを持ってキャッシュを呼べば値が返るだけで、保存されたものがないと気づき、あらかじめ渡されたローダーを呼び、その答えを保管して返すのはキャッシュのほうです。cache-aside と read-through は同じデータを同じ順序でキャッシュに入れます。分かれるのは、埋めるコードを誰が持っているかです。

そのコードを移した結果は、呼び出し側が整うこと以上の値打ちがあります。すべての miss を読み手のそれぞれではなく一つの構成要素が埋めるなら、miss の経路は判断を下せる一か所になります。同じキーへ同時に届いた miss をそこで一つにまとめられるので、そろって来た 10 人の読み手がデータベース呼び出しを 10 回ではなく 1 回だけ作ります。手書きの miss 分岐なら意図して入れなければならず、たいていは入っていない stampede への備えが、まさにこれです。期限の方針もキーの組み立ても直列化も同じ場所に住むので、バッチ処理が書いたエントリとリクエスト処理が書いたエントリの形がそろいます。cache-aside が招く間違いの多くは、30 か所ある呼び出しのうち 1 か所で抜け落ちる種類のものです。忘れられた保存、そこだけ違う TTL、区切り文字をわずかに変えて組み立てられたキーです。

.NET でこの形をくれるのが `HybridCache.GetOrCreateAsync` で、名前より形を正確に見ておくほうが役に立ちます。キーと、値を作り出せるファクトリーを預ければ、探す仕事も、何もなかったという判断も、読み込みも、書き戻しも、すべてその 1 回の呼び出しの中で起こります。その呼び出しの向こうに何があるかは hybridcache のページが扱います。なかなか出会えないのは、キャッシュサーバー自身が read-through を実装した形、つまり Redis がデータベースへの接続を持って自分で行を読みに行く形です。`IDistributedCache` はそうしたフックを意図して置いていないので、.NET の read-through は保存先の機能ではなく、保存先を包んだライブラリの形として現れます。この区別は何かが失敗したときに効いてきます。ローダーは自分のプロセスで、自分のスレッドの上で、自分のキャンセルトークンのもとで走り、そこから出た例外は解釈すべきキャッシュのエラーではなく自分の例外です。

この配置が払う代金は、キャッシュがこれまでより深く読み取り経路の上に載ることです。cache-aside なら、キャッシュが使えないと気づいた読み手がその呼び出し地点でデータベースへ下りると決められますが、read-through ではその迂回路も層の持ち物で、層が用意していなければその失敗をそのまま引き継ぎます。もう一つ見ておきたいのは、このパターンの幅がどれだけ狭いかです。read-through は miss を誰が埋めるかを決めるだけで、値が変わったとき何が起きるかについては一言も述べません。書き込みが記録の原本とキャッシュの両方に届かなければならないシーンの 4 番目のステップは別の判断であり、write-through と write-behind が違う答えを出します。
