---
title: "Output Cache"
summary: "出力キャッシュは応答まるごとをサーバーに置き、ミドルウェアから流し直します。当たればエンドポイントにはそもそも届きません。データではなくバイトをキャッシュするので、キーの空間はリクエストの変化の軸になり、既定の相手は匿名の呼び出し元です。"
category: "キャッシュ"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Tag
    slug: cache-tag
  - label: HybridCache
    slug: hybridcache
  - label: Cache Key
    slug: cache-key
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: REST
    slug: rest
references:
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## いつ使うか

- エンドポイントが出す答えまるごとが、多くの呼び出し元に対して同じであるときに使います。公開のカタログの一覧、宣伝のページ、公開済みの記事、在庫状況のフィードがそれです。毎回する仕事が同じで、見る側は匿名なので、置いておく自然な単位は裏にある行ではなく応答です。
- クエリだけでなく全部を飛ばしたいときに使います。これが cache-aside と分かれる軸です。cache-aside はデータをキャッシュし、ヒットのたびにルーティングとモデルバインドと認可とハンドラーとシリアライズをそれでも回します。出力キャッシュはミドルウェアで答えるので、ヒット 1 回の代金はキーの参照とソケットへの書き込みであり、節約されるものの中には、クエリより大きいことも多いシリアライズが入っています。
- 変種を数えられるときに使います。応答のキャッシュは同じキーが戻ってきてこそ役に立つので、エンドポイントは小さく閉じたものだけで変わらなければなりません。ページ番号、並び順、ロケール、テナントがそれです。変化の軸が分かっていて数が少なければ、ヒット率が高く、メモリーも縛られます。
- 無効化が粗くて速くあるべきときに使います。影響した先をすべて引き下がらせなければならない公開の操作には、キーを名指す方法がありません。エンドポイントの応答にタグを付けておけば、そこで作られたすべての変種へ届くハンドルが 1 つ手に入ります。タグが何であり、どこまで広く取るべきかは cache-tag のページの持ち物です。

## 注意点

- 大事な失敗は個人化された応答で、既定値がそこを守ってくれます。ミドルウェアは認証を伴うリクエストをキャッシュしませんし、Cookie を設定する応答もキャッシュしません。あるユーザーに描いたページを別のユーザーへ差し出すことは、古いデータの不具合ではなくデータの漏えいだからです。その条件を覆すことはできますが、ID を実際に含む vary のキーを土台にした、名前の付いた判断であるべきです。
- 変化の軸は 1 つ増えるごとにキーの空間を掛け算します。クエリパラメーター 2 つとロケールのヘッダー 1 つとルートの値 1 つで変わるなら、その積が置かれうるエントリの数であり、値に際限のない軸、たとえば任意のクエリ文字列や呼び出し元が渡す識別子は、一度もヒットしないまま育つだけのキャッシュを作ります。クエリ文字列まるごとで変えるのではなく、軸を 1 つずつ名前で書いてください。
- 既定のストアはプロセスのメモリーに住みます。ロードバランサーの後ろのインスタンス 10 個は、互いに独立したキャッシュを 10 個抱えるので、インスタンスごとに最初のリクエストがミスになり、デプロイ 1 回が 10 個を同時に空にし、片方での追い出しは残りの 9 個には見えません。期限が短ければ受け入れられますし、高く付く応答には受け入れがたく、共有のストアがあるのはそのためです。
- これは HTTP のキャッシュではなく、2 つを混ぜると両方向で驚くことになります。出力キャッシュはサーバーが取り仕切り、クライアントが送る `Cache-Control` は無視しますが、そのクライアントの条件付きリクエストには 304 で答えます。ヘッダーに従うのは response caching のミドルウェアのほうで、そちらは `Cache-Control` を尊重するので、`no-cache` を送るクライアントには無力です。CDN やブラウザーに取り直させないことが目的ならそれはヘッダーの話であり、自分のサーバーに同じ仕事を二度させないことが目的ならこちらの話です。

## .NET では

- 出力キャッシュは ASP.NET Core に組み込まれています。`AddOutputCache` で登録し、`UseOutputCache` を `UseCors`、`UseRouting`、`UseAuthentication`、`UseAuthorization` のあと、エンドポイントの前に置きます。リクエストが認証済みかどうかを知ったうえで飛ばす必要があるからです。エンドポイントは `CacheOutput()` か `[OutputCache]` 属性で参加します。参加するものがなければ何もキャッシュされません。

```csharp
builder.Services.AddOutputCache(options =>
{
    // ポリシーの名前を挙げずに参加したすべてのエンドポイントに適用されます。
    options.AddBasePolicy(policy => policy.Expire(TimeSpan.FromSeconds(30)));

    // 名前付きのポリシーは、自分の寿命と自分のキーの空間と自分のタグを宣言します。
    options.AddPolicy("catalog", policy => policy
        .Expire(TimeSpan.FromMinutes(5))
        // キーはこれらだけで変わるので、空間は数えられる大きさのままです。
        .SetVaryByQuery("page", "sort")
        .Tag("catalog"));
});

var app = builder.Build();
app.UseOutputCache();

// 匿名の GET だけが入ります。認証されたリクエストは既定で飛ばされます。
app.MapGet("/catalog", (int page, string sort) => catalogue.Query(page, sort))
   .CacheOutput("catalog");
```

- ある領域を引き下がらせるのは、内容が変わったことを知る管理の操作やメッセージのハンドラーから呼ぶ `IOutputCacheStore.EvictByTagAsync("catalog", ct)` です。タグに何を入れるべきか、削除 1 回にどこまで壊させてよいかは cache-tag が扱います。このページにしかない話は、タグがエントリではなくポリシーに宣言される点だけです。エントリが自分で書いたオブジェクトではなく、ミドルウェアが作り出した応答だからです。
- 分散のストアを登録すればキャッシュは共有になります。`AddStackExchangeRedisOutputCache` はエントリをプロセスの外へ移すので、インスタンスどうしが互いの充填を使え、デプロイのあとも冷えた状態から始まりません。代わりにヒットのたびにネットワークを 1 ホップとシリアライズを払います。
- ここでの期限は素朴な TTL です。裏で回る更新はありませんが、ないと思われがちなもののうち 2 つは既定で有効です。同じキーへの同時のミスは直列に処理され (`SetLocking(false)` で切れます)、条件付きリクエストには何も設定しなくてもキャッシュ済みのエントリから 304 で答えます。手に入らないのは stale-while-revalidate なので、期限切れのエントリはそれを埋め直す 1 つのリクエストにとってはミスです。埋め直しが珍しくなる程度に寿命を長めに取り、高く付く部分を 1 つに畳む値打ちがあるなら、データの層で HybridCache を手に取ってください。
