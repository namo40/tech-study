---
title: "Cache Key"
summary: "キャッシュキーは何を同じ問いと見なすかを決めます。異なるキーの一つ一つが同じ空間を奪い合う別々の項目なので、カーディナリティこそ追い出し圧力であり、それを設計する場所がキーです。"
category: "キャッシュ"
scene: eviction
sceneStep: 3
related:
  - label: Eviction
    slug: eviction
  - label: LRU
    slug: lru
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Version
    slug: cache-version
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: TTL
    slug: ttl
  - label: Cache Stampede
    slug: cache-stampede
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Output Cache
    slug: output-cache
  - label: HybridCache
    slug: hybridcache
references:
  - title: "Cache in-memory in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

キャッシュキーは、書き下された同値関係です。キーを選ぶとき私たちは、どの要求が同じ答えを受け取るべきかを宣言していて、あとはそのひとつの主張から出てきます。キーを粗くしすぎれば異なる二つの問いが衝突し、誰かが別の誰かのために計算された応答を受け取ります。キーから抜けていたものがテナントや利用者だった場合、この失敗の形はキャッシュをセキュリティ事故に変えます。逆に細かくしすぎれば何も衝突しません。安全に見えますが、それがシーンの中の失敗です。ひとつの問いの三つの綴りが三つの項目になり、それぞれ同じバイトを持ち、それぞれ本物の読者がいる項目の欲しかった枠を占めます。

効いてくる数字はカーディナリティで、それは和ではなく積です。varying の対象にする次元の一つ一つが、項目数にその次元の取る値の数を掛けます。ページ番号と並び順なら二十通りほどでしょう。そこにロケールを足せば四百通りです。利用者の識別子まで足せば利用者の数だけになり、それは作業集合が利用者ごとに割れて、誰も他人のためにキャッシュを温めてくれないという意味です。このどれもコードの上では見えません。文字列を連結して作ったキーは、次元が三つでも六つでも同じ見た目だからです。代わりに、キャッシュをどれだけ大きくしても上がらないヒット率として現れます。それは買おうとしている空間よりキー空間のほうが速く育っているという署名です。

正規化はこの仕事の安いほうの半分で、シーンの三段目がしているのがそれです。同じ答えには綴りがちょうど一つであるべきなので、キーは呼び出し側が打った文字ではなく、解析された正規の値から組み立てます。クエリパラメータを並べ替え、応答を変えないものを落とし、大文字小文字を区別しない値は小文字にそろえ、タイムスタンプは実際に提供している粒度に丸め、ロケールは翻訳のある小さな集合に解決します。呼び出し地点ではなく、型のある引数を受け取って文字列を返す関数ひとつの中で組み立て、構成要素の中に現れない区切り文字を使って、`user:1` と `2` が `user` と `1:2` と同じキーに綴られないようにします。形を表す短い接頭辞とバージョンの区間を入れておくとよいでしょう。バージョンの入ったキーは、TTL を待たずに引退させられるキーだからです。

もう半分は、そもそもキーに入れてはいけないものを見分ける作業です。リクエスト識別子、トレース識別子、解析タグが付けるキャッシュ回避のパラメータ、精度そのままの `DateTime`。どれもミスを保証したうえで、二度と読まれない項目を残します。枠の使い道として最も悪いものです。出力キャッシュの vary-by の選択も同じ目で見る必要があります。クライアントが自由に決めるヘッダーで varying するポリシーは、キー空間を呼び出す側に渡してしまうからです。そして答えにはないのにキーにだけあるものが問題なら、逆向きの間違いもあります。応答がテナントによって変わるならテナントは必ずキーになければならず、それを落とした状況はキャッシュのサイズでは決して救われません。
