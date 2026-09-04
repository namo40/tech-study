---
title: "Pagination"
summary: "ページネーションは大きな結果を切れ端に分けて渡します。offset は一番上から数えるので行が動くとずれ、cursor は実際に見た行を覚えるため深さに関係なく安定して安い代わりに前にしか進めません。結局はリストが何を約束するかの問題です。"
category: ".NET データアクセス"
scene: pagination
steps:
  - title: "テーブル全体が必要な人はいませんし、それを収められる携帯電話もありません"
    text: "クエリ一つが五万行を返せばペイロードは膨らみ、メモリは腫れ上がりますが、ユーザーは二十行を読みます。ページネーションはすべてのリストが結ぶ取引です。切れ端で渡し、位置を覚え、求められたら次の切れ端を渡します。本当の問いは一つだけです。位置をどう覚えるか。"
  - title: "offset は一番上から数えます。ところが一番上が動きます"
    text: "「3 ページ目」は「40 行飛ばせ」という意味なので、データベースは飛ばす分を全部歩いて通り過ぎ、深いページほど遅くなります。もっと悪いのは、読んでいる間に挿入された一行が、その後ろのすべての位置を押しずらすことです。4 ページ目が 3 ページ目で見たものを繰り返すか、誰も見ていない行を飛ばします。しおりは数字だったのに、本が変わりました。"
  - title: "cursor は数ではなく行を覚えます"
    text: "「キー 40 の次」はインデックスでその位置へまっすぐシークし、次の二十行を読みます。2 ページ目でも 2000 ページ目でも費用は同じです。上に行が挿入されても何も変わりません。しおりが実際に見たその行だからです。代価はこれです。次へは行けますが、57 ページ目へ飛ぶことはできません。cursor は住所ではなく場所です。"
  - title: "リストがする約束を見て選びます"
    text: "果てしなく続くフィードは飛びませんから、いつでも cursor です。ページ番号の付いた管理画面はランダムアクセスを約束するので offset で、ドリフトを受け入れ、深さに上限を置きます。API は cursor を不透明なトークンとして返し、形式を変える自由を残します。何を選んでも、並べ替えキーは一意でなければなりません。そうでないと境界の行が嘘をつきます。"
related:
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: Batching
    slug: batching
  - label: Backpressure
    slug: backpressure
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Pagination in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/cosmos-db/query/pagination
---

## いつ使うか

- API や画面が返すすべてのリストに使います。問いはページに分けるかどうかではなく、どう分けるかです。「全部返す」もひとつの選択であり、いちばん早く、いちばん大きく崩れる選択だからです。
- 小さくゆっくり変わる集合にページ番号を付けるなら offset が正解です。管理画面の表、設定の一覧、数千行の帳票がそれにあたります。読み手は 7 ページ目を求め、テーブルは数える費用が痛くなるほど深くなりません。
- フィード、無限スクロール、同期エンドポイント、エクスポート、生きたテーブルをなめるバッチ処理のように、深いか速く変わる場所には cursor を使います。下で書き込みが起きている間も持ちこたえる番地の付け方はこれだけです。
- URL を公開する前に決めます。ページのパラメーターは公開契約の一部なので、あとから `?page=3` を `?after=...` に替えると、その値を保存していた呼び出し側がすべて壊れます。

## 注意点

- `OFFSET` は飛ばす行を一行残らず歩いて通り過ぎます。飛ばすことは無料でも怠惰でもありません。ある順序で 5001 番目の行がどれかを知るには、5 千行を作り出して全部捨てる必要があります。深い offset はページの服を着た全件走査ですから、深さに上限を置き、その上限は遅い成功ではなく明示的なエラーとして扱ってください。
- 活発なテーブルでドリフトは例外ではなく通常の状態です。「この前に行が何本あるか」で行を指す仕組みは、何かが書き込まれた瞬間から不安定であり、生きたデータをなめるエクスポート処理でいちばん強く噛みます。
- cursor の並べ替えキーは一意で、かつ変わらないものにします。一意でなければ同じ境界を二度求めても違う行が返り得るので、主キーで同点を割り、二つをまとめて並べます。変わるなら、値が変わった行が cursor の下から抜け出し、再び現れるか消えるかします。
- cursor は生のキーではなく不透明なトークンとして返します。エンコードしたトークンなら中身をあとで変える自由が残り、呼び出し側が位置を偽造したり、他人の識別子を URL から読み取ったりすることも防げます。
- 「N / M ページ」のための `COUNT(*)` が、そのページ自体より高くつくことがあります。読み手に総数が本当に必要かをまず確かめてください。概数、「もっと見る」ボタン、ただの「次へ」のほうが、たいてい安くて同じくらい正直です。
- `updated_at` のような変わる列で作った cursor は、その列の不安定さをそのまま受け継ぎます。少なくとも主キーと組み合わせ、できれば誰も更新しない列を選びます。

## .NET では

```csharp
// Offset: 浅いうちは問題なく、深くなると罠です。EF Core は Skip/Take を
// OFFSET … FETCH NEXT に訳し、飛ばした分はデータベースが払います。
var page = await db.Orders
    .AsNoTracking()
    .OrderBy(o => o.Id)
    .Skip((pageNumber - 1) * PageSize)
    .Take(PageSize)
    .ToListAsync(ct);

// Keyset: 同じインデックスに、呼び出し側が実際に最後に見た行から入ります。
// 深さがいくつでも費用はページ一枚です。
var next = await db.Orders
    .AsNoTracking()
    .Where(o => o.Id > afterId)
    .OrderBy(o => o.Id)
    .Take(PageSize)
    .ToListAsync(ct);

// 一意でない並べ替え列にはキーを添えます。タプル比較で書けば、
// OR が連なる代わりにシーク一回で済みます。
var byDate = await db.Orders
    .AsNoTracking()
    .Where(o => ValueTuple.Create(o.CreatedAt, o.Id)
        > ValueTuple.Create(afterCreatedAt, afterId))
    .OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
    .Take(PageSize)
    .ToListAsync(ct);
```

並べ替えとインデックスは歩調を合わせます。`(CreatedAt, Id)` で並べるクエリには `(CreatedAt, Id)` のインデックスが要ります。そうでないと、シークのつもりで書いたものが避けたかった並べ替えに戻ります。呼び出し側にはキーそのものではなくトークンを渡し、入ってきたときに読み戻します。

```csharp
static string Encode(DateTime at, int id) =>
    WebEncoders.Base64UrlEncode(
        JsonSerializer.SerializeToUtf8Bytes(new Cursor(at, id)));

// ページより一行多く求めます。その一行が返れば次のページがあるという
// ことで、二本目のクエリも COUNT(*) もなしにそれが分かります。
var rows = await query.Take(PageSize + 1).ToListAsync(ct);
var hasMore = rows.Count > PageSize;
var items = rows.Take(PageSize).ToList();
```

`optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)` でクエリログを点け、データベースが実際に何を頼まれたのかを読んでください。深い `Skip` は実行計画にその正体である走査として現れます。それは願うことではなく、確かめられる事実です。
