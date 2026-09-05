---
title: "Endpoint Routing"
summary: "Endpoint Routing はルーティングを 2 つに分けます。`UseRouting` がどのエンドポイントを実行するかを決めてそのメタデータをリクエストに付け、エンドポイント自体はパイプラインの最後で実行されます。"
category: ".NET ランタイムとホスティング"
scene: middleware-pipeline
sceneStep: 1
related:
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0
---

ルーティングは 1 か所ではなく 2 か所で起こります。`UseRouting` はリクエストをルートテーブルと照合し、最終的に実行されるエンドポイントを選び、そのエンドポイントに宣言されたすべてと一緒にリクエストへ結び付けます。エンドポイントはそこでは実行されません。`MapGet` などが置いた場所、つまり最後で実行されます。

この 2 点のあいだの隔たりが、この設計を有用にしています。`UseRouting` より後ろに登録されたミドルウェアはすべて、どのエンドポイントが選ばれたかを尋ね、そのメタデータを読めます。おかげで Authorization はどのポリシーが適用されるかを知り、レート制限はどの名前の制限を使うかを知り、CORS はそのエンドポイントが宣言したポリシーを知ります。選ぶことと実行することが同じ 1 段階なら、どれも不可能でした。

順序が好みの問題ではなく決まっている理由も、ここにあります。`UseRouting` はエンドポイントのメタデータを読むすべてより前になければならず、エンドポイント自体は、リクエストを拒否しうるすべてのミドルウェアが順番を終えたあと、最後に来なければなりません。この順序を誤ると、エンドポイントに Authorization のメタデータが付いているのにそれを支えるミドルウェアが見つからない、と訴える `InvalidOperationException` として現れます。`WebApplication` は `UseRouting`、`UseAuthentication`、`UseAuthorization` を一度も呼ばなければ代わりに差し込んでくれるので、順序が自分の責任になるのは、自前のミドルウェアを置き始めてからです。
