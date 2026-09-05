---
title: "Output Encoding"
summary: "出力エンコードは、パーサーに対して何かを意味する文字を、自分自身だけを意味する文字に変える作業です。値を書き出すその瞬間に起き、何をどう変えるかは値が置かれる場所が決めます。HTML 本文、属性、URL、スクリプトはそれぞれ別の規則を持ちます。"
category: "アプリケーションセキュリティ"
scene: cross-site-scripting
sceneStep: 3
related:
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Deserialization Security
    slug: deserialization-security
references:
  - title: "Cross Site Scripting Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - title: "Prevent Cross-Site Scripting (XSS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cross-site-scripting
  - title: "Cross Site Scripting (XSS)"
    url: https://owasp.org/www-community/attacks/xss/
---

エンコードは値と文法のあいだの翻訳です。ページを読むブラウザーはパーサーを走らせており、ごく少数の文字はそのパーサーにとって内容ではなく命令です。エンコードはまさにその文字だけを、自分自身を意味する綴りに書き換えます。開き山括弧 1 つが、開き山括弧を描く 4 文字になるという具合です。そのためパーサーはそれを実行する代わりに画面に載せます。何も削られず、何も判定されません。値はそのまま残り、変わるのはパーサーとの関係だけです。テキストがコードと取り違えられる問題への一次防御がエンコードである理由がここにあり、文字を捨てるフィルターリングがその代わりにならない理由も同じです。

規則は値のものではなく行き先のものであり、チームが間違えるのはまさにここです。タグの間で問題になるのは、タグやエンティティを始められる文字です。属性の中では、その属性を閉じる引用符が何よりも重要で、引用符のない属性ではただの空白 1 つで新しい属性へ抜け出せます。本文用のエンコーダーを引用符のない属性に当てると動く隙間が残るのはそのためです。URL では予約文字の集合がまた違います。エンコードした値をパスに足すことは、スキームを一度も確かめていない値については何もしてくれません。スクリプトブロックの中は 3 つ目の文法であり、そこでは HTML エンコードは何も達成しません。その場で安全な一手はより良いエンコーダーではなく、値をスクリプトの外へ完全に出すことです。HTML エンコーダーが扱える `data-` 属性に入れ、`dataset` で読み戻し、`textContent` でページに書きます。

エンコードが入力ではなく出力に属する理由は 2 つあり、どちらも同じ事実から来ます。1 つ目は、値が届く時点では行き先が分からないことです。同じコメントがページにも、検索インデックスにも、メールにも、CSV の書き出しにも、ログの 1 行にも現れ、それぞれ望む扱いが違うか、まったく要らないかです。2 つ目は、入ってくるときにエンコードすると原文が壊れることです。ユーザーが読み戻す値は彼らが入力した値ではなくなり、編集のたびに二重エンコードされたテキストが溜まり始め、書いた言葉で検索しても見つからなくなります。書かれたものを保存してください。どう綴るかは、どこへ行くのかが分かった瞬間に決めます。

実務ではこの大半がすでに済んでおり、規律はそれを台無しにしないことです。Razor は `@value` を HTML の文脈に合わせて自動でエンコードし、React は `{value}` をエンコードします。どちらも使われる場所で既定のまま正しいです。`System.Text.Encodings.Web` は、出力を手で組み立てるときのために `HtmlEncoder`、`UrlEncoder`、`JavaScriptEncoder` を用意しています。3 つの別の型である理由は、3 つの別の仕事だからです。見張るべき失敗は脱出口です。`Html.Raw`、`innerHTML`、`dangerouslySetInnerHTML` は文字列をパーサーへ直接渡し、上流のすべてのエンコーダーを無効にします。そしてもう 1 つ、すでに安全に綴られた値がエンコーダーをもう一度通り、自分のマークアップを着たままページに現れる二重エンコードもあります。境界で一度、その向こう側の文法に合わせてエンコードします。
