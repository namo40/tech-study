---
title: "Kestrel"
summary: "Kestrel is the cross-platform web server built into ASP.NET Core: it is the in-process gate every request reaches first, it is already running whether or not you configured it, and its endpoints, protocols and limits are settings rather than infrastructure you install."
category: ".NET runtime and hosting"
related:
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: HTTP/2
    slug: http-2
  - label: Request Timeout
    slug: request-timeout
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: Kestrel web server in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel?view=aspnetcore-10.0
  - title: Configure options for the ASP.NET Core Kestrel web server
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/options?view=aspnetcore-10.0
---

## When to use

- You are already using it, and that is the first thing worth knowing. `WebApplication.CreateBuilder` configures Kestrel as the server, so every request in a default ASP.NET Core application has already been parsed, decompressed and framed by it before the middleware pipeline sees a `HttpContext`. Tuning it is not adopting something new; it is adjusting the component that is already on the path.
- Serve with it directly in containers and behind a load balancer. A container that exposes one port and runs one process does not need another web server in the image, and an ingress controller or cloud load balancer in front supplies what an edge normally supplies.
- Let it terminate HTTP/2 and HTTP/3 when clients or gRPC need them. Protocol selection is per endpoint, HTTP/2 needs TLS with ALPN for browsers, and HTTP/3 needs the QUIC support present on the platform, so this is where those protocol decisions actually get made.
- Configure endpoints and certificates through configuration rather than code where you can. The `Kestrel` section of `appsettings.json` binds URLs, protocols, certificates and limits, which lets one image run with different endpoints per environment without a rebuild.

## Cautions

- The defaults are deliberate, not universal, and they are worth reviewing once per service. The maximum request body is 30,000,000 bytes, the total request header size is 32 KB with at most 100 headers, and the number of concurrent connections is unlimited unless you set it. An upload service and an internal webhook receiver do not want the same numbers, and neither one wants to discover them during an incident.
- Whether Kestrel faces the edge directly or sits behind a reverse proxy is a decision about who owns TLS, static files, compression and request buffering. A proxy that already terminates TLS, serves assets and buffers slow clients is doing work you then do not configure; going direct means those responsibilities come back to the application and to whatever the platform provides around it.
- Hosting models differ in ways that surface late. Behind IIS the in-process model changes which server implementation handles the request, under systemd the unit file and the socket setup own the port and the restart behaviour, and forwarded headers must be enabled explicitly for the original scheme and client IP to survive a proxy hop.
- Limit violations look like ordinary client errors in the log. A body over the limit comes back as `413`, headers over the limit as `431`, and a client that stops sending mid-request is cut off by the request-headers or keep-alive timeout. Look for these in the server log before assuming the caller is at fault, because the server refused before your code ran.

## In .NET

- The `Kestrel` configuration section is the usual place to declare endpoints and limits, and it binds without any code in `Program.cs`.

```json
{
  "Kestrel": {
    "Endpoints": {
      "Https": {
        "Url": "https://*:8443",
        "Protocols": "Http1AndHttp2",
        "Certificate": { "Path": "/certs/site.pfx", "Password": "<from a secret store>" }
      },
      "Http": {
        "Url": "http://*:8080",
        "Protocols": "Http1"
      }
    },
    "Limits": {
      "MaxRequestBodySize": 10485760,
      "MaxConcurrentConnections": 2000,
      "MaxRequestHeadersTotalSize": 16384,
      "KeepAliveTimeout": "00:02:10"
    }
  }
}
```

- Code configuration and this section describe the same options. `builder.WebHost.ConfigureKestrel(...)` sets the same `KestrelServerOptions`, and calling it after the configuration has bound will override what the file said, so pick one place per setting and keep it there.
- A limit can be relaxed for one endpoint rather than for the whole server. `IHttpMaxRequestBodySizeFeature` on the request, or the `[RequestSizeLimit]` attribute on an action, raises the ceiling for the upload route while the global default keeps protecting everything else.
- Timeouts belong to the server as well as to the middleware. Kestrel's `RequestHeadersTimeout` and `KeepAliveTimeout` govern connections that stall before a request is complete, while the request timeout middleware limits how long your own handler may run once it has started.
