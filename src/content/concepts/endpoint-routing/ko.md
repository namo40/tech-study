---
title: "Endpoint Routing"
summary: "Endpoint Routing은 라우팅을 둘로 나눕니다. `UseRouting`이 어떤 엔드포인트를 실행할지 정하고 그 메타데이터를 요청에 붙이며, 엔드포인트 자체는 파이프라인 맨 끝에서 실행됩니다."
category: ".NET 런타임과 호스팅"
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

라우팅은 한 곳이 아니라 두 곳에서 일어납니다. `UseRouting`은 요청을 라우트 테이블과 맞춰 보고, 결국 실행될 엔드포인트를 고르고, 그 엔드포인트에 선언된 모든 것과 함께 요청에 붙여 둡니다. 엔드포인트는 거기서 실행되지 않습니다. `MapGet` 같은 호출이 놓아 둔 자리, 즉 맨 끝에서 실행됩니다.

이 두 지점 사이의 간격이 이 설계를 쓸모 있게 만듭니다. `UseRouting` 뒤에 등록된 모든 미들웨어는 어떤 엔드포인트가 선택되었는지 물어보고 그 메타데이터를 읽을 수 있습니다. 덕분에 Authorization은 어떤 정책이 적용되는지 알고, rate limiter는 어떤 이름의 제한을 쓸지 알고, CORS는 그 엔드포인트가 선언한 정책을 압니다. 고르는 일과 실행하는 일이 한 단계였다면 어느 것도 불가능했을 것입니다.

순서가 취향의 문제가 아니라 정해진 것인 이유도 여기에 있습니다. `UseRouting`은 엔드포인트 메타데이터를 읽는 모든 것보다 앞에 와야 하고, 엔드포인트 자체는 요청을 거절할 수 있는 모든 미들웨어가 차례를 마친 뒤 맨 끝에 와야 합니다. 이 순서를 어기면 엔드포인트에 권한 부여 메타데이터가 있는데 권한 부여를 지원하는 미들웨어를 찾을 수 없다고 알리는 `InvalidOperationException`으로 드러납니다. `WebApplication`은 `UseRouting`, `UseAuthentication`, `UseAuthorization`을 한 번도 부르지 않으면 대신 끼워 넣어 주므로, 순서가 우리 몫이 되는 것은 미들웨어를 직접 배치하기 시작한 뒤부터입니다.
