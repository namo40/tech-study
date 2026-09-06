---
title: "Authorization"
summary: "Authorization is the question after login: authentication proves who is calling, roles bundle what they may do, policies decide against the resource itself, and the safe default is that silence means no."
category: "Authentication and authorization"
tags: ["oauth"]
level: 4
scene: authorization
steps:
  - title: "Logging in opens the door, not every drawer"
    text: "With no authorization stage, any signed-in user can touch anything — the ghost shows B writing to A's document, successfully. Authentication answers \"who is this\"; authorization answers \"may they do this\". The second is where safety lives."
  - title: "A role is a bundle of permissions with a name"
    text: "The gate checks the badge: editor may write, viewer may read — and the viewer's write is denied without any document being touched. Roles keep a thousand users manageable, because you grant the bundle, not the person-by-person list."
  - title: "\"Editor\" cannot say \"only your own\""
    text: "A is an editor, so the role happily lets A edit B's document — the bundle knows verbs, not ownership. A policy asks a question at decision time: is the caller the owner of this resource? Same request, same badge, different answer — because now the resource is part of the decision."
  - title: "Deny by default, grant the minimum"
    text: "A request no rule explicitly allows is refused — silence means no. Each identity holds the least it needs, so a stolen badge opens as little as possible. Authorization is not a wall at the entrance; it is a decision at every door, made fresh each time."
related:
  - label: Authentication
    slug: authentication
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Policy
    slug: policy
  - label: Least Privilege
    slug: least-privilege
  - label: Default Deny
    slug: default-deny
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Role
    slug: role
  - label: Claims
    slug: claims
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
references:
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

## When to use

- On every endpoint that does anything, as the second question. Authentication has already told you who is calling; authorization decides what that caller may do, to which thing, and it has to be answered again for each request rather than once at the front door.
- For coarse capability, use roles. Admin areas, editor tools, a support console: these are whole regions of an application that either belong to a kind of user or do not, and a named bundle of permissions is the cheapest correct way to say so.
- For anything whose answer depends on the data, use a policy against the resource. Ownership, tenancy, workflow state, a document that is locked while somebody else has it open: none of these can be settled by looking at the caller alone, because the same caller gets a different answer for two different rows.
- On service-to-service calls too. A valid token proves which service is calling; it never says what that service may do. A background worker with a machine identity needs its permissions decided as deliberately as a person's, and usually needs fewer of them.
- Wherever a request can arrive without matching any rule you wrote. An unmapped route, an endpoint somebody forgot to attribute, a new action added to an existing controller: the interesting question is not what those requests are allowed to do but what happens when nothing has an opinion, and the answer has to be refusal.

## Cautions

- A successful login is not a permission. Treating it as one is broken access control, which is consistently near the top of every list of real-world web vulnerabilities, and it is exactly the first step of the scene: the request passes because the caller is signed in, and nothing ever asks whether this caller should be touching this document.
- Roles stop working the moment they try to encode resources. `editor-of-project-x` is a role that has swallowed a resource identifier, and once one exists there will be thousands, created and deleted by application code, unauditable and impossible to reason about. That naming pressure is the signal to move the decision into a policy that reads the resource instead.
- Check on the server, for every request. Hiding a button is a courtesy to the user, not a control: the endpoint behind it is still there, and it is what an attacker calls. A UI that hides what the server would have refused is fine; a UI that hides what the server would have allowed is the whole of your security.
- Fail closed. An unmatched route, a controller nobody attributed, an authorization handler that returns without deciding: each of these should end in a refusal rather than in a shrug. Default deny is what makes the set of things your system permits equal to the set of things you wrote down.
- Least privilege is not only about people. The access token your service holds, the service account your job runs as, the database user your connection string names: each of them should be able to do the smallest set of things that lets the work happen, because each of them is what an attacker inherits when something leaks.
- Log denials, and watch them. A refusal is either a bug in your own client or somebody trying doors, and both are worth knowing about. A denial rate that jumps on one endpoint is one of the earliest signals you get, and it is free.
- Decide once, in one place. Authorization logic scattered through controllers drifts, and the copy somebody forgot to update is the hole. Put the rule behind a policy name, use the name everywhere, and the rule becomes a thing you can read, test and change on its own.

## In .NET

ASP.NET Core splits the two questions the same way the scene does. Authentication produces a `ClaimsPrincipal`; authorization takes that principal, plus optionally the resource, and returns a decision. `[Authorize]` with no arguments only asks the first question, which is why it is rarely the whole answer.

Roles are the coarse case, and they are a claim like any other.

```csharp
// A named bundle of permissions. Nothing here knows about documents.
app.MapPost("/documents/{id}", CreateRevision).RequireAuthorization("CanEdit");

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("CanEdit", policy => policy.RequireRole("editor"))
    .AddPolicy("CanRead", policy => policy.RequireRole("editor", "viewer"));
```

Once the answer depends on the resource, a role cannot express it and a policy can. A requirement is a marker for the question; a handler answers it, and the two-generic form of `AuthorizationHandler` is the one that receives the resource.

```csharp
public sealed record OwnerRequirement : IAuthorizationRequirement;

public sealed class OwnerHandler : AuthorizationHandler<OwnerRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, OwnerRequirement requirement, Document document)
    {
        var caller = context.User.FindFirstValue(ClaimTypes.NameIdentifier);

        // Succeed explicitly, and say nothing otherwise. A handler that does not
        // call Succeed has not allowed anything, which is the default deny.
        if (caller is not null && document.OwnerId == caller) context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```

The handler cannot run until something hands it the resource, so the endpoint loads the document first and then asks. That ordering is the point: the decision is made against the row, at the moment of the call.

```csharp
static async Task<IResult> CreateRevision(
    string id, RevisionInput input, ClaimsPrincipal user,
    IAuthorizationService authorization, DocumentStore store)
{
    var document = await store.FindAsync(id);
    if (document is null) return Results.NotFound();

    var result = await authorization.AuthorizeAsync(user, document, "OwnerOnly");
    if (!result.Succeeded) return Results.Forbid();

    await store.AppendAsync(document, input);
    return Results.NoContent();
}
```

Register the requirement as a named policy so the rule has one spelling, and add the handler as a singleton — which is safe here because it takes no dependencies. A handler that injects a `DbContext` or anything else scoped has to be registered scoped instead, which is what the Resource-Based Authorization page does.

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("OwnerOnly", policy => policy.AddRequirements(new OwnerRequirement()));

builder.Services.AddSingleton<IAuthorizationHandler, OwnerHandler>();
```

Default deny is one line, and it is the line that decides what an endpoint nobody attributed does. `FallbackPolicy` applies wherever no other authorization is specified, so a new controller is protected before anybody remembers to protect it. `[AllowAnonymous]` is then the deliberate exception, written where it is meant.

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
```

Two smaller habits are worth having. Prefer permission-shaped claims over role names in the policy — `RequireClaim("permission", "documents.write")` survives a reorganisation that renames every role, and it keeps the bundle definition in one place rather than spread across attributes. And return `403` rather than `404` when a caller is authenticated but not permitted, unless you have decided that the existence of the resource is itself a secret; `Results.Forbid()` and `Results.Challenge()` mean different things, and mixing them up is how a signed-in user ends up in a login loop. `Forbid` defers to the scheme, so what a caller actually receives depends on which one answered: the JWT bearer handler writes a `403`, while the cookie handler redirects to `AccessDeniedPath` unless you override `OnRedirectToAccessDenied`.
