---
title: "Key Ring"
summary: "キーリングは、ASP.NET Core のデータ保護が Cookie や偽造防止トークン、寿命の短いペイロードを保護するときに使う、回転する鍵の束です。ひとつが現在の鍵で、古い鍵は復号のために残り、アプリケーションのすべてのインスタンスが同じリングを見ている必要があります。"
category: "アプリケーションセキュリティ"
related:
  - label: Key Rotation
    slug: key-rotation
  - label: Signature
    slug: signature
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
references:
  - title: ASP.NET Core Data Protection Overview
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-10.0
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
---

## いつ使うか

- アプリケーションが初めてロードバランサーの後ろに入る時点で、意図して設定します。Cookie 認証も偽造防止トークンも TempData も保護されたペイロードであり、あるインスタンスが保護したペイロードは、別のリングを持つインスタンスには読めません。リングを共有しないレプリカ二台とは、二回に一回のリクエストが未認証に見えるということです。
- 症状が「一台では動くのにスケールアウトすると全員ログアウトする」ときにこのページを見ます。認証のバグであることはほとんどなく、たいていはキーリングがコンテナーのファイルシステムやポッドごとのボリューム、あるいはメモリーにある場合です。アプリケーションにひとつであるべきリングが、インスタンスごとにひとつになっています。
- デプロイが再起動をまたいで生き延びなければならないなら、明示的に指定します。起動のたびに作り直されるリングは、前のプロセスが発行した Cookie をすべて無効にします。ローリング更新は転がりながら利用者を追い出し、クラッシュループはそれを繰り返します。
- 複数のアプリケーションが正当に同じ保護データを読む必要があるなら、同じリングを指させます。同じ保護ペイロードを読むウェブフロントエンドとバックグラウンドのサイトは、ストレージもアプリケーション名も同じでなければなりません。名前そのものが保護に結び付けられているからです。

## 注意点

- コンテナーの既定は一時的なリングで、誰も警告してくれません。永続化を設定しなければ、鍵は書き込み可能なレイヤーの中のディレクトリーかメモリーに置かれます。再起動のたびに失われ、レプリカ間で共有されることもありません。アプリケーションはきちんと起動し、誰も読まない警告を残し、開発者の一台のマシンでは完璧に動きます。
- リングの保管場所そのものが最上級のシークレットです。BLOB コンテナーに暗号化なしで置かれた鍵は、認証システム全体がファイルひとつに入っているのと同じです。だから永続化と保護は別々の決定です。リングを長持ちして共有される場所に置き、そのうえで鍵管理サービスで保存時に暗号化して、BLOB を読むことと鍵を握ることが同じにならないようにします。
- データ保護は一時的なペイロードのためのもので、長期保管の暗号化用ではありません。鍵は期限が切れ、やがて取り除かれ、期限切れの鍵で暗号化したデータもその鍵と一緒に読めなくなります。三年後にも復号できる必要のあるフィールドは、寿命を自分たちで管理する別の暗号化の仕組みに置くべきです。
- 回転は勝手に起こり、古い鍵が残っているのには理由があります。既定の寿命は 90 日で、そのあとは新しい鍵が新しいペイロードを担当します。以前の鍵は、既存の Cookie が期限切れになるまで動き続けられるようリングに残ります。片付けるつもりで古い鍵を消すことが、ふつうの回転を全員ログアウトに変える行為です。

## .NET では

- リングをインスタンスの外に保存し、その場所で暗号化します。このふたつの呼び出しが本番設定のすべてで、アプリケーション名が、ふたつめのアプリケーションにも同じペイロードを読ませる部分です。

```csharp
builder.Services.AddDataProtection()
    // Shared and durable: every replica reads the same ring.
    .PersistKeysToAzureBlobStorage(blobUri, credential)
    // Encrypted at rest: reading the blob is not the same as holding the keys.
    .ProtectKeysWithAzureKeyVault(keyIdentifier, credential)
    // Part of the protection binding; changing it invalidates existing payloads.
    .SetApplicationName("contoso-web");
```

- アプリケーションが動く場所に合う保管先を選びます。共有ボリューム上の `PersistKeysToFileSystem` はオンプレミスの答え、BLOB ストレージはクラウドの答えで、すでにあるなら Redis やデータベースを使う保管先も合います。大事なのは、その場所がインスタンスより長く生き、すべてのインスタンスから見えることです。
- `SetApplicationName` は定型の一行ではなく、意図した結び付けです。指定しないとコンテンツルートのパスから名前が導かれますが、この値はローカル実行とコンテナーとで変わります。ペイロードを共有すべきふたつのアプリケーションは、同じ文字列を与えられるまで静かに失敗し続けます。
- `SetDefaultKeyLifetime` が変えるのは回転の間隔だけです。短くすれば鍵はより頻繁に作られ、期限切れの鍵はこれまでどおり復号用に残ります。だから厳しめの方針が要るときに安全に回せるつまみは寿命であって、手で鍵を消す側ではありません。
