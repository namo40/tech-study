---
title: "Stale-While-Revalidate"
summary: "stale-while-revalidate は、エントリが期限切れになった直後に届いたリクエストに古い値を返し、誰も待たせずに裏でエントリを更新します。遅延のスパイクを限られた古さの窓に置き換える方法であり、その窓の長さが決定のすべてです。"
category: "キャッシュ"
scene: cache-stampede
sceneStep: 3
related:
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Version
    slug: cache-version
  - label: Negative Cache
    slug: negative-cache
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Spike Test
    slug: spike-test
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content"
    url: https://www.rfc-editor.org/rfc/rfc5861
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
---

シーンの三番目のステップは、リクエスト一つだけをオリジンへ下ろし、残りには期限切れになったばかりの値を手渡します。何が変わったのかは正確に押さえておく価値があります。これがなければ、期限切れのエントリはミスであり、ミスは待ちです。運悪くそのミリ秒に着いた読み手が再計算の費用を丸ごと払い、それが走っている間に着いた全員も一緒に払います。これがあれば、期限切れは読み手が感じ取れる出来事ではなくなります。古い値がすぐ出ていき、裏で走る更新一つがそれを置き換え、次の読み手が新しい値を受け取ります。誰も待たず、オリジンは群衆ではなく呼び出し一つを見ました。

名前は HTTP から来ていて、そこでは数字一つではなく二つで書かれています。`Cache-Control: max-age=60, stale-while-revalidate=30` は、この値が 60 秒は新鮮で、裏で更新が走る間さらに 30 秒配ってよい、という意味です。RFC 5861 には知っておくとよい兄弟がもう一つあります。`stale-if-error` は失敗について同じことを言います。オリジンが答えないなら、この長さの間は古い写しを配り続けよ、ということです。どちらも、データの持ち主がどれだけの古さを売る用意があるかを応答そのものに書いてキャッシュに伝える仕組みです。

人が飛ばしがちなのはここです。stale-while-revalidate は代償のない性能の小技ではなく、期間として書かれた結果整合性の決定です。60 秒キャッシュに 30 秒の更新窓を付けた価格は、データベースより最大 90 秒遅れることがあり、その窓の中で起きた変更は窓が終わるまで見えません。値を決めるときにその数字を口に出し、業務がそれに耐えられるか確かめます。商品説明なら 90 秒は何でもありません。振込ボタンの隣に出る残高なら問い合わせチケットです。

コードではこのパターンは期限が一つではなく二つになります。エントリは、新鮮でなくなる時点であるソフト期限と、存在しなくなる時点であるハード期限を併せ持ちます。ソフト期限を過ぎた読み取りは値を返して更新を予約し、ハード期限を過ぎた読み取りは以前どおり待つことになります。`HybridCache` は `Expiration` でハード側を与えるので、ソフト側はたいていキャッシュしたオブジェクトの中に入れたタイムスタンプになり、読む側がそれを `TimeProvider.GetUtcNow()` と比べます。更新を何で走らせるにせよ、リクエストの `CancellationToken` の上では走らせないでください。読み手の応答はもう出ていく途中で、トークンはまもなく取り消され、起動したつもりの更新がそれと一緒に死にます。

最後の注意がスタンピードへ戻ってきます。バックグラウンドの更新も single flight でまとめる必要があります。ソフト期限を過ぎた読み手がそれぞれ自分の更新を始めるなら、群衆をなくしたのではなく常設にしただけです。更新窓の間ずっとエントリは古いままで、その中のすべてのリクエストが呼び出しを一つずつ立ち上げるからです。キー単位で更新をまとめるか、その周りに短いロックを掛けて、シーンが見せる絵をそのまま保ちます。見ている読み手が何人でも、オリジンへ行くリクエストは一つです。
