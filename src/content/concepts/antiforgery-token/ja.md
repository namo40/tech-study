---
title: "Antiforgery Token"
summary: "Antiforgery token は、サーバーがページの中に置き、次の状態を変えるリクエストと一緒に返ってくることを期待する値で、専用の cookie に入るもう半分と一組になっています。偽造されたページはブラウザーに cookie を送らせることはできても、あなたのページを読めないので、一致させるべき半分を返せません。"
category: "アプリケーションセキュリティ"
scene: cookie-authentication
sceneStep: 4
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Origin Validation
    slug: origin-validation
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Access Token
    slug: access-token
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "IAntiforgery Interface"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.antiforgery.iantiforgery
  - title: "Authentication and authorization in minimal APIs"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/security?view=aspnetcore-10.0
---

シーンの四番目のステップは、フォームにチップを一つ入れ、サーバーにゲートを一つ立てます。それ以降、自分のページからの送信は通り、偽造されたほうは `400` で拒まれます。どちらのリクエストも同じセッション cookie を持って到着するのに、サーバーは二つを見分けます。ここは正確に押さえておく価値があります。SameSite だけではできないのが、まさにこれだからです。

トークンは一つの値ではなく一組です。サーバーは関連する二つの半分を作り、片方は専用の cookie に書き、もう片方はページの中に描きます。ふつうは隠しフォームフィールドとして入れ、ときにはリクエストヘッダーに載せるようスクリプトへ渡します。正しい送信は両方を返し、検証は二つが一致したときだけ通ります。ブラウザーは cookie のほうの半分を、セッション cookie とまったく同じように求める相手すべてへ自動で送るので、その半分だけでは何も証明できません。もう半分はページから読み取らなければならず、他のサイトのページがあなたのページを読むのを止めているのが same-origin policy です。この非対称性が仕組みのすべてです。cookie は宛先を基準に付き、ページの中身はオリジンを基準にしか読めず、トークンは両方を要求します。

この形から出てくる性質が二つあり、覚えておく値打ちがあります。トークンはセッションではなくユーザーに結び付けられていなければなりません。そうでないと、匿名の訪問者に発行されたトークンがログイン後も有効なまま残り、fixation に似た攻撃が横の扉から戻ってきます。ASP.NET Core がトークンを認証済みユーザーの識別子に結び付けているのはこのためで、ログイン前に描かれたトークンがログイン後に効かなくなる理由でもあります。そしてトークンは予測できないものでなければなりません。つまり、セッション ID やユーザー ID や時計から導いた値ではなく、フレームワークが出す暗号学的に無作為な値を使います。

失敗の型は退屈でありふれていて、だからこそ並べておく価値があります。キャッシュされたページは古いトークンを抱えるので、ユーザーが再読み込みするまで送信がすべて失敗します。フォームを載せたページには `no-store` が要ります。フォームをまったく描かないシングルページアプリは、トークンを取得してヘッダーに載せる必要があり、そのヘッダー名はサーバーが読むよう設定したものと同じでなければなりません。セッションが切れたあとに送られたフォームは、ログインへリダイレクトされるのではなく検証で失敗するので、antiforgery の例外を見分けて素の `400` ではなく妥当な場所へユーザーを送るハンドラーが必要です。そして、あるサーバーで描かれたトークンを別のサーバーで検証すると、data protection のキーリングを共有していないかぎり失敗します。このキーリングは認証 cookie が頼っているのと同じもので、ロードバランサーの後ろでは断続的な失敗として現れます。

トークンがむしろ間違った道具になる場合もあり、そこで手を伸ばすと防ぐ以上の面倒を招きます。bearer トークンで認証する API には、そもそも解くべき偽造の問題がありません。ブラウザーは `Authorization` ヘッダーを自分では付けないので、他のサイトのページが認証済みのリクエストを起こす手立てがないからです。そうしたエンドポイントに antiforgery を足しても得るものはなく、ブラウザーでないクライアントがすべて壊れます。規則は、資格情報が自動で付く場所にこそ antiforgery が要る、ということで、実際にはそれは cookie を指します。

ASP.NET Core で要る部品は小さなものです。`AddAntiforgery` が cookie とヘッダー名を設定し、form タグヘルパーが POST メソッドのフォームごとに隠しフィールドを書き込みます。`[ValidateAntiForgeryToken]` はアクションを一つ検証し、全体に掛けた `[AutoValidateAntiforgeryToken]` は安全でないメソッドすべてを検証します。このページを読んでいない人が新しいエンドポイントを足しても生き残る形は後者です。Minimal API は `UseAntiforgery` から同じものを受け取り、トークンをログイン中のユーザーへ結び付けられるよう認証のあとに置きます。自前で組むなら、`IAntiforgery.GetAndStoreTokens` が組を作り、`ValidateRequestAsync` がそれを検査します。このメソッドは false を返すのではなく例外を投げるので、`await` を忘れたせいでリクエストが黙って通ってしまうことはありません。

最後に、層の関係をはっきりさせておきます。`SameSite=Lax` は偽造リクエストの大半をブラウザーから出る前に止め、antiforgery トークンは SameSite の規則がまだ許すものを捕まえ、オリジン検査はどちらも取りこぼしたものを捕まえます。トークンは真ん中の層であり、完全に自分のアプリケーションの中だけで動く唯一の層でもあるので、確実に配備されていると言い切れる層でもあります。
