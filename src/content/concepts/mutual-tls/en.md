---
title: "Mutual TLS"
summary: "Mutual TLS makes the proof go both ways: each end presents a certificate signed by an authority the other trusts, so the connection itself carries the identity and no secret ever crosses the wire."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authentication
sceneStep: 4
related:
  - label: Authentication
    slug: authentication
  - label: API Key
    slug: api-key
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Authorization
    slug: authorization
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "Configure certificate authentication in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth
  - title: "Set Up TLS Mutual Authentication in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/app-service-web-configure-tls-mutual-auth
  - title: "The Transport Layer Security (TLS) Protocol Version 1.3 (RFC 8446)"
    url: https://www.rfc-editor.org/rfc/rfc8446
---

Watch the fourth step of the scene and notice which side of the picture changes. For three steps the callers proved themselves and the Verifier did not: whatever the door asked for, nobody ever asked the door anything back. In the fourth step a certificate appears inside the Verifier, and both capsules show one too, before any call sets off. That ordering is the point. The handshake is not part of a request; it is what has to finish before there is anything to make a request over.

Ordinary TLS already proves one direction. Your browser checks that the certificate the server presents was signed by an authority it trusts and that the name on it matches the host it dialled, which is how it knows it is talking to the bank rather than to whoever answered. Mutual TLS turns that check around as well: the server asks for a certificate from the client, checks the chain and the revocation state the same way, and refuses the handshake if it does not like the answer. Two proofs, same machinery, and neither of them involves sending a secret.

That last part is what makes it different in kind from a password or an API key. A certificate is a public document. What proves possession is not the certificate but the private key, which never leaves the machine holding it: during the handshake that key signs something both sides just agreed on, and the signature is what the other end verifies. Nothing an eavesdropper records can be replayed, because the thing signed was specific to that handshake. Impersonating either end therefore requires stealing a private key off a host, which is a very different class of attack from reading a header off a wire.

The identity you get is the certificate's subject, and it is worth deciding early what that subject means. In a service mesh it is usually a workload identity, issued automatically, valid for hours rather than years, and rotated by the platform without anybody's involvement. In a partner integration it is more often a long-lived certificate held by one organisation. Both work; the operational cost is entirely different, and the difference is the reason the mesh case has become the common one. Short-lived certificates that rotate on their own turn expiry from an outage into a non-event.

Expiry is where mutual TLS most often goes wrong in practice, and it goes wrong on both ends. A client certificate that quietly expired takes out a caller with an error message that looks nothing like an authentication failure; a certificate authority that expired takes out everybody at once. Neither is subtle in hindsight and both are invisible until the day. Monitor the remaining lifetime of every certificate that participates, alert on it well before it is due, and prefer an issuer that renews automatically over a calendar reminder.

In ASP.NET Core the server side is a Kestrel setting plus a scheme. Requiring a client certificate is a transport decision, so it is configured where the connection is accepted rather than in the pipeline.

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.ConfigureHttpsDefaults(https =>
    {
        // Ask for a certificate during the handshake. A connection that cannot
        // produce one never becomes a request.
        https.ClientCertificateMode = ClientCertificateMode.RequireCertificate;
    });
});

builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
    .AddCertificate(options =>
    {
        options.AllowedCertificateTypes = CertificateTypes.Chained;
        options.RevocationMode = X509RevocationMode.Online;
    });
```

The client side is a certificate attached to the handler the `HttpClient` uses, which is why a typed client is the natural place for it: the handler is built once and shared, and the key it holds never appears anywhere else.

```csharp
builder.Services.AddHttpClient("ledger")
    .ConfigurePrimaryHttpMessageHandler(() =>
    {
        var handler = new SocketsHttpHandler();
        handler.SslOptions.ClientCertificates = new X509Certificate2Collection(
            X509CertificateLoader.LoadPkcs12FromFile("ledger-client.pfx", password: null));
        return handler;
    });
```

Two habits keep this honest. A valid certificate is still only an identity, so the authorization question remains open: check the subject or thumbprint against the list of callers you actually meant to serve, rather than accepting everything your certificate authority ever signed. And where the connection terminates before your code — a load balancer, an ingress, an API gateway — the proof is consumed there and your application receives an ordinary request with a header describing what happened. That header is trustworthy only if nothing else can reach your application and set it, which is a network property rather than a code one, and it is worth confirming rather than assuming.
