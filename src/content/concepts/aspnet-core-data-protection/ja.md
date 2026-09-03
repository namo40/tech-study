---
title: "ASP.NET Core Data Protection"
summary: "Data Protection は、フレームワーク自身がクッキーや偽造防止トークンや TempData を守るときに使う暗号の API です。`IDataProtector` がペイロードを暗号化して改ざんを検出できるようにし、目的の文字列が利用者どうしを隔て、その下でキーリングが鍵を供給します。"
category: "アプリケーションセキュリティ"
related:
  - label: Key Ring
    slug: key-ring
  - label: Key Rotation
    slug: key-rotation
  - label: Signature
    slug: signature
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Secret Store
    slug: secret-store
  - label: Distributed Session
    slug: distributed-session
references:
  - title: ASP.NET Core Data Protection Overview
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-10.0
  - title: Consumer APIs overview for ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/consumer-apis/overview?view=aspnetcore-10.0
---

## いつ使うか

- すでに使っているので知っておきます。クッキー認証も偽造防止トークンも TempData も、誰かが設定したかどうかに関わらずこの層を通してペイロードを守ります。ですから、複製をまたいで認証の不具合のように見える問いは、たいていこの API の鍵についての問いです。自分たちが設定するのはその鍵をどこへ置きどう守るかで、その決定が住む場所は Key Ring のページです。
- 自分たちのコードが短命な値を外へ出してそのまま受け取り直す必要があるとき `IDataProtector` を持ち出します。メール確認のトークン、配信停止のリンク、リダイレクトを往復する state のパラメーターといったものです。出るときに保護し、入るときに解けば、手を加えられた値は静かに別の何かへ復号されるのではなく、解くこと自体に失敗します。
- 利用者どうしが互いのペイロードを読めないようにするには目的の文字列を使います。`CreateProtector("Contoso.EmailConfirmation")` は同じリングから別の鍵を導きます。ですからメール確認のために作られたトークンは、同じアプリケーションで同じ鍵を使うパスワード再設定の保護器では解けません。この隔ては無料ですし、これを飛ばすと、ある機能のトークンが別の機能への偽造された入力になります。
- ペイロードが自分で期限切れになってほしいときは時間制限のある変種を使います。`ToTimeLimitedDataProtector` は保護された値の中に期限を埋め込みます。ですから期限の切れたトークンは、照らし合わせる保管先を自分で持たなくても、解く段階で失敗します。パスワード再設定のリンクがちょうどこの形です。

## 注意点

- これは長期の保管のための暗号化ではなく、そう思って使うとデータを失います。鍵は決められた周期で入れ替わり、古いものはやがて取り除かれます。ですから今日守ったペイロードが、一年後にはこちらに落ち度がなくても読めなくなることがあります。その鍵の一生を握っているのは自分たちではなくフレームワークです。入れ替えの周期を越えても復号できなければならないものは、一生を自分たちが握る別の暗号の仕組みに置きます。
- 保護は暗号化に完全性を足したものであって、公開の署名ではありません。キーリングを持たない側からペイロードは読めませんし改ざんも分かりますが、確かめられるのもそのリングを持つ側だけなので、第三者に作成者を示すことはできません。自分たちの鍵なしに別の相手が値を確かめる必要があるなら、それは保護の問題ではなく署名の問題です。
- 目的の文字列は契約で、変えれば既存のペイロードがすべて無効になります。`"EmailConfirmation"` を `"Email.Confirmation"` へ名前を変えるだけで、すでに利用者の受信箱にあるリンクはひとつも解けなくなります。文字列は意識して選び、その場の直書きではなく定数として置き、ひとつを変えることは片付けではなく移行として扱ってください。
- インスタンスが複数あるなら、以上のすべてが成り立つ前にキーリングの共有が要ります。ある複製が守ったペイロードは、別のリングを持つ複製にとっては意味のないバイト列ですし、コンテナーでの既定はプロセスと一緒に死ぬリングです。永続化とアプリケーション名を設定することが上のすべての前提で、その方法は Key Ring のページが扱います。

## .NET では

- `IDataProtectionProvider` を注入してもらい、目的を付けて保護器を作り、ふたつの呼び出しを対称に保ちます。`Unprotect` は改ざんされたペイロードや期限の切れたペイロードに対して例外を投げるので、この catch は守りのための雑音ではなく API の一部です。

```csharp
public sealed class EmailConfirmationTokens(IDataProtectionProvider provider)
{
    // The purpose is a contract: change this string and every issued token dies.
    private readonly ITimeLimitedDataProtector protector =
        provider.CreateProtector("Contoso.Web.EmailConfirmation").ToTimeLimitedDataProtector();

    // The expiry travels inside the payload; there is no table to check.
    public string Issue(Guid userId) =>
        protector.Protect(userId.ToString(), TimeSpan.FromHours(24));

    public bool TryRead(string token, out Guid userId)
    {
        userId = default;
        try
        {
            // Tampered, expired, or protected for a different purpose: all throw here.
            return Guid.TryParse(protector.Unprotect(token), out userId);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }
}
```

- フレームワークの中の利用者もまさにこうしています。クッキー認証は自分の目的の連なりで保護器を作り、それでチケットを守ります。保管先は同じでもアプリケーション名が違うふたつのアプリケーションの間で、一方が発行したクッキーをもう一方が読めない理由がそれです。
- 目的はより細かく隔てるために重ねられます。`CreateProtector("Contoso.Web.EmailConfirmation", tenantId)` は同じリングからテナントごとに違う鍵を導きます。ですから二つ目の鍵の保管先も二つ目の設定もなしに、あるテナントのトークンは別のテナントでは解けません。
- `IPersistedDataProtector` は、自分が何を求めているか分かっているときにだけ使います。失効した鍵や期限の切れた鍵でも解けるようにするもので、これは特定の移行のための復旧の道具であって、上の注意点を回り込む道ではありません。これをいつも持ち出しているなら、そのペイロードはそもそも短命な値ではなかったということです。
