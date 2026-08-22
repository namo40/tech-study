---
title: "Cache Version"
summary: "Cache Version はキーに番号を入れ、書き込み時にその番号を上げます。古いエントリは二度と読まれず、削除される代わりに自分で期限切れになります。"
category: "キャッシュ"
scene: cache-invalidation
sceneStep: 4
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Tag
    slug: cache-tag
  - label: Cache Key
    slug: cache-key
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
---

キーは `catalog` ではなく `catalog@7` になります。書き込みがバージョンを 8 に上げると、その後にキーを組み立てる読み取りはすべて `catalog@8` を求めます。まだ誰もキャッシュしていないキーです。古いエントリはそのまま残っていますが、たどり着けません。

これで無効化の難しい 2 つの部分がなくなります。すべてのインスタンスへ配る削除がないので、失われるメッセージも、届くまでの隙間もありません。読んでから書く競合もありません。遅い読み取りが `catalog@7` を書き込んでも、`catalog@8` を求める誰にも渡らないからです。

代償はメモリです。持ち主を失ったエントリが TTL の切れるまでキャッシュを占めます。その TTL は長くしすぎず、バージョンはすべてのインスタンスが安く読める場所に置きます。タグは粗い粒度のいとこにあたり、1 回の削除でひとまとまりを消します。変わったのがキーではなくその集まりであるときに、より合っています。
