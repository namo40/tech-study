---
title: "Web Application Firewall"
summary: "A web application firewall inspects HTTP traffic in front of the application and turns away requests that match known attack patterns. It is a defence you stand in front of the code rather than one you build into it, which is exactly why it is an extra layer and never a replacement for the defences inside."
category: "Application security"
related:
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Rate Limiter
    slug: rate-limiter
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
references:
  - title: "Introduction to Azure Web Application Firewall"
    url: https://learn.microsoft.com/en-us/azure/web-application-firewall/overview
  - title: "OWASP CRS Project"
    url: https://coreruleset.org/
---

## When to use

- On any public HTTP surface, as the extra layer you get without touching the application. The managed form is a policy attached to something already in the path — a WAF policy on Azure Front Door or on Application Gateway — so the decision is where the traffic already terminates rather than what to install. Adding it changes no code and removes no obligation from the code, which is the right way to read both its value and its limits.
- To filter the traffic that matches well-known attack shapes. A rule set such as the OWASP Core Rule Set encodes the patterns that show up in commodity attacks: the payloads scanners send, the strings that appear in automated injection attempts, the shapes of a path traversal. Most of what arrives at a public endpoint is not aimed at you specifically, and a generic rule set is a good answer to a generic attack.
- To buy time between a disclosure and a deployment. When a dependency turns out to be vulnerable and the fixed version is days away, a narrow rule that rejects the requests that reach the vulnerable path is a mitigation you can apply in minutes and remove when the real fix ships. Write the expiry into the rule's description, because a temporary rule nobody removes becomes a permanent piece of unexplained behaviour.
- For visibility. The log of what was matched, on which rule, from which address, against which route is a record of what is being tried against you, and it exists whether or not anything was blocked. That record is often the first honest picture a team has of its own attack surface, and it is worth having even in the mode where nothing is rejected.

## Cautions

- It is a layer in front, never a substitute for the defences inside. Parameterization is what makes a query safe, because the value travels on a channel the parser never reads as code; context-aware output encoding is what makes a value safe to write into a page; input validation narrows what the system will consider at all. None of those become optional because a filter sits upstream. A rule set recognises patterns it has been taught, and an application that depends on that recognition is an application whose safety is decided by somebody else's regular expressions.
- False-positive tuning is most of the operational work, and skipping it is how a WAF gets switched off. Real users send text that looks like an attack — a comment about SQL, a password with punctuation, a document upload full of markup — and a rule set in blocking mode from day one will reject some of them. Start in detection mode, watch the matches against real traffic for long enough to see the periodic jobs, then move to blocking with exclusions that are as narrow as you can make them: this rule, on this parameter, on this route.
- Bypasses exist, and the trust boundary is still the application. Filtering happens against a request as the filter parses it, and any difference between that reading and the application's reading is a gap; a rule set is also a moving target maintained against attacks that keep changing. Treat every request that gets through as untrusted in exactly the way you would have without the filter, and treat a blocked request as noise removed rather than as a vulnerability closed.
- Inspection needs plaintext, so the WAF lives where TLS terminates. That places it at the same point as the layer 7 load balancing and reverse proxy tier, and it means the connection from that tier onward is a second hop you are responsible for securing. It also means anything the filter can read is something that tier can log, so the rules about what may appear in a log apply there too.

## In .NET

- There is nothing to install in the application. This is a platform-tier control configured beside the application, not a package added to it, and the useful consequence is that it can be changed, tightened or rolled back without a deployment. The corresponding cost is that it lives in whatever configuration system owns your infrastructure, so it belongs in the same review as the rest of it rather than in the codebase.
- Treat the rule set version as a deployment decision. A managed rule set gets new versions, and a new version changes which requests are rejected — which is an application-visible change made by something outside the application. Pin the version, upgrade deliberately, and put the upgrade through the same detection-mode observation the first rollout got.
- A blocked request never reaches your application, so it will never appear in your application's logs. That asymmetry catches teams out during an incident: the user reports a failure, the traces show nothing, and the answer is one tier up. Export the platform diagnostics for the WAF into the same store as the application telemetry and correlate on the tracking id the platform puts in both the log and the error page, so one query can cover both sides of the boundary.
- Because the traffic now arrives through a proxy, the application sees the proxy's address unless you tell it otherwise. Configure forwarded headers so that the remote address and scheme reflect the original client — `UseForwardedHeaders`, with `ForwardedHeadersOptions.KnownProxies` or `KnownNetworks` set to the WAF tier's addresses rather than left as a blanket trust — since a request that can set its own forwarded header can also set its own identity for anything you built on top of it — rate limiting per client, audit records, geographic rules.
