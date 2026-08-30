---
title: "Signature"
summary: "署名は偽造できない出自の証明です。特定の鍵がまさにこのバイト列を作り、それ以来何も変わっていないと言います。kid ヘッダーがどの鍵かを指すので、検証者は鍵のリングを持つことができ、ローテーションはすでに飛んでいるものを無効にしません。"
category: "認証と認可"
scene: key-rotation
sceneStep: 3
related:
  - label: Key Rotation
    slug: key-rotation
  - label: JSON Web Token
    slug: json-web-token
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Mutual TLS
    slug: mutual-tls
  - label: Workload Identity
    slug: workload-identity
  - label: Authentication
    slug: authentication
references:
  - title: Configure cryptographic key auto-rotation in Azure Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Rotation tutorial for resources with two sets of credentials
    url: https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation-dual
---

署名は暗号化ではありません。署名されたトークンのペイロードは、たいてい手にした人なら誰でも読めます。署名が付け加えるのは、ほかの誰にもできない主張です。特定の鍵がまさにこのバイト列を作り、それ以来一文字も変わっていない、という主張です。ペイロードの文字を一つ書き換えるだけで検証は失敗します。署名がペイロードの上で計算されたのに、もう二つが一致しないからです。証明するのはそれだけですが、自分が制御していないネットワークの向こうへアイデンティティを運ぶにはそれで十分です。偽造できない主張は、信じるしかない通り道より価値があります。

形は二種類あり、その違いが誰が何を持てるかを決めます。共有シークレットの上の HMAC である対称署名は安くて小さいのですが、作る鍵と確かめる鍵が同じなので、検証者はみな潜在的な偽造者でもあります。非対称署名は秘密鍵で作り、対になる公開鍵で確かめます。だから一度も会ったことのないサービスが検証者になっても出自を確信できます。そのサービスは、こちらが何かに署名したことを見分けられますが、自分では何も署名できません。公開されるトークン形式が非対称なのはこの非対称性ゆえで、公開側の半分が誰でも取得してよい公開 URL に置かれていられる理由でもあります。

ヘッダーは kid を運んでいて、この小さなフィールドがローテーションを耐えられるものにします。署名は自分を作った鍵の名を明かすので、検証者は推測する必要も、ちょうど一つだけを持つ必要もありません。最近の公開鍵のリングを保ち、トークンが指した鍵を引き、それで確かめます。新しいトークンは新しい鍵が切られた瞬間から最新の鍵で署名され、昨日署名されたトークンは自分の予定どおり期限が切れるまで検証され続けます。寿命の途中で無効になるものはなく、認証をやり直せと伝えられる呼び出し側もなく、鍵の引退は、もう誰もその名を呼べなくなってからリングの項目が一つ減る静かな出来事としてだけ現れます。

署名が言わないことは、言うことと同じくらい大切です。署名は、誰がこれを作ったか、そして変わっていないことを言います。その主張が今も真かどうかは言いません。期限、対象、発行者、失効は別々の検査で、「署名は有効だ」で止まる検証者は、別のサービス向けに発行されたトークンや、一時間前にセッションが終わったトークンを喜んで受け入れます。同じ用心から規則がもう二つ出てきます。トークンに自分のアルゴリズムを選ばせてはいけません。`alg: none` と、RS256 を HMAC として確かめさせる取り違えは、どちらもヘッダーの言葉をそのまま信じた検証者を狙う攻撃です。そして初めて見る kid を、それが指す URL を取得して受け入れてはいけません。アルゴリズムは固定し、kid は自分が制御するリングの中で引き、ヘッダーの残りは指示ではなくヒントとして扱います。
