---
title: "Cross-Site Scripting"
summary: "Cross-site scripting is user text rendered as code: a stored comment carrying a script runs in every reader's browser, with that reader's session. The fix is to encode every value for the context it lands in, keep the raw-output hatches shut, and hang a content security policy under both."
category: "Application security"
tags: []
scene: cross-site-scripting
steps:
  - title: "In the reader's browser, with the reader's power"
    text: "The ghost stores a comment that carries a script and renders it untouched, and the page runs it as every reader, with every reader's cookies and session. The author typed it once; the site serves it to everyone. It is the confusion SQL injection had: text from a user, executed as code — by the browser."
  - title: "Encoded, the same characters become display"
    text: "The comment in the store is unchanged; on the way out, the markup characters become their harmless spellings, and the page shows the script as text instead of running it. Encode at output, not at storage: the original stays intact, ready to be encoded differently for each place it appears. It was demoted, not filtered."
  - title: "The destination decides the encoding"
    text: "HTML body, attribute, URL — each context has its own escape rules, and the wrong set leaves a gap: body-encoding inside an unquoted attribute still breaks out. The question at every output is not \"did we encode?\" but \"encoded for where it lands?\" Templating engines answer that correctly by default, which is their value."
  - title: "Lock the escape hatches; hang a second net"
    text: "Every template engine has a raw-output door for \"trusted\" HTML. Keep it shut unless the value is provably yours: one raw call undoes every encoder upstream. Below it hangs the policy net, a browser told which scripts are legitimate refusing the injected ones. Encoding is the defense; the net catches the day the door opens."
related:
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
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
  - title: "Cross Site Scripting (XSS)"
    url: https://owasp.org/www-community/attacks/xss/
  - title: "Cross Site Scripting Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - title: "Prevent Cross-Site Scripting (XSS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cross-site-scripting
---

## When to use

There is no situation in which you decide against these defenses. What varies is how much of the work your tools have already done, and how carefully you avoid undoing it.

- Encode every value you did not write yourself, for the context it lands in. Razor does this for `@value` by default, React does it for `{value}`, and the discipline is not defeating them. Reach for an explicit encoder only where you are assembling output by hand, and then reach for the one that matches the destination.
- Treat everything as untrusted, not just form fields. A display name from your own database was typed by somebody. So was a product description synced from a partner feed, a filename in an upload listing, an error message echoed from a third-party API, and a value your own service wrote last year. "Untrusted" means "not authored by this codebase", and that is almost everything on the page.
- Know the three faces, because they share one confusion. Stored XSS lives in your database and is served to everyone who loads the page. Reflected XSS lives in a link and runs for whoever follows it. DOM-based XSS never reaches your server at all: the value goes from `location.hash` into `innerHTML` inside the browser, and server-side encoding cannot see it happen. All three are text becoming code at an output point.
- Put the defense at the output, not at the input. The same comment is safe in one place and dangerous in another, so the decision belongs where you know the destination. Encoding on the way in also destroys the original, which is the value your users will later want to edit, export, and search.
- Add input validation as a second layer, not as the answer. Rejecting a `Guid` that is not a `Guid` and a page size outside 1 to 100 keeps nonsense out of the system, and it is worth doing for its own reasons. But input validation is a filter on shape, and a script-bearing comment can be a perfectly well-formed comment, so it will never be the thing that stops a string from being rendered into an attribute.
- Deploy a content security policy as the net. A browser told which script sources are legitimate refuses the ones you did not name, so a single missed encoder becomes a report instead of a breach. It is the last layer in this list because it is the last layer in practice.

## Cautions

- `Html.Raw`, `innerHTML` and `dangerouslySetInnerHTML` are the vulnerability surface. Each of them says "this string is already HTML, hand it to the parser", which turns off every encoder upstream of it. Every use needs a justification you could defend in review: the value is a constant you wrote, or it came out of a sanitizer, or it was assembled from encoded parts. "It looked fine in testing" is not one.
- Sanitizing rich HTML is a specialist's job. If your product genuinely needs users to submit formatting, use a maintained sanitizer library with an allow-list of elements and attributes, and update it the way you update any security dependency. Never write the filter yourself, and never write it with regular expressions: HTML is not a regular language, and the bypasses are a decades-long list somebody else has already fixed.
- The contexts break in different ways. A value dropped into an unquoted attribute needs no angle bracket to escape it, only a space. A URL that a user controls can carry a scheme you did not expect, so validate that it starts with `https:` or `/` rather than encoding it and hoping. Inside a `<script>` block you are in a third grammar, where HTML encoding does nothing useful at all.
- Keep untrusted values out of inline script entirely. Put them in a `data-` attribute where the HTML encoder can do its job, read them from `dataset` in JavaScript, and write them to the page with `textContent` rather than `innerHTML`. This removes a whole context from your codebase instead of teaching everybody to escape for it.
- Cookies carrying a session need `HttpOnly`, plus `Secure` and `SameSite`. `HttpOnly` takes the stolen-cookie demonstration off the table, which is worth having, but be honest about what it does not do: a script running in your page can still act as the reader through the page itself. It removes a prize, not the problem.
- A content security policy is a net, not the defense. Start it in report-only mode and read the reports for a week, because the first version always breaks something you forgot you were doing. Then enforce it. A policy full of `unsafe-inline` to make the site work again is a policy that catches nothing, so budget the time to remove inline handlers instead.

## In .NET

- Razor HTML-encodes `@value` on the way out, everywhere, without being asked. `@Html.Raw(value)` is the one construct that does not, so treat every occurrence of it as a review checkpoint. A repository-wide search for `Html.Raw` is a two-minute audit worth running before every release.
- The three encoders live in `System.Text.Encodings.Web`: `HtmlEncoder`, `UrlEncoder` and `JavaScriptEncoder`. They are not interchangeable, and picking the wrong one is exactly the mistake the third step of the scene is about.

```csharp
using System.Text.Encodings.Web;

var body = HtmlEncoder.Default.Encode(comment);      // between tags
var query = UrlEncoder.Default.Encode(searchTerm);   // inside a URL
var script = JavaScriptEncoder.Default.Encode(name); // inside a script literal
```

- Send a policy from middleware so every response carries it, and start in report-only mode.

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers["Content-Security-Policy-Report-Only"] =
        "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'";
    await next();
});
```

- Set the session cookie's flags where the scheme is configured, rather than trusting a default to stay what it is.

```csharp
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });
```

- Pass values to client script through the markup, not through generated JavaScript. `<div id="board" data-board-name="@board.Name"></div>` puts the value in an HTML attribute, where Razor encodes it correctly, and `document.getElementById("board").dataset.boardName` reads it back without a parser ever seeing it as code.
- For rich text, add a maintained sanitizer package rather than a helper of your own, run it at the output point, and keep the original in the database. Storing the sanitized form means every future change to the allow-list has nothing to re-apply itself to.
