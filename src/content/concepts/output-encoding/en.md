---
title: "Output Encoding"
summary: "Output encoding turns characters that mean something to a parser into characters that only mean themselves. It happens at the moment a value is written out, and it is chosen by where the value lands: HTML body, attribute, URL and script each have their own rules."
category: "Application security"
tags: []
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

Encoding is a translation between a value and a grammar. A browser reading a page is running a parser, and a handful of characters are instructions to that parser rather than content for it. Encoding rewrites exactly those characters into spellings that mean themselves — a less-than sign becomes the four characters that draw a less-than sign — so the parser puts them on the screen instead of acting on them. Nothing is removed and nothing is judged. The value survives intact; only its relationship to the parser changes. That is why encoding is the primary defense against text being taken for code, and why filtering, which throws characters away, is not a substitute for it.

The rules belong to the destination, not to the value, and that is the part teams get wrong. Between tags, the characters that matter are the ones that could start a tag or an entity. Inside an attribute, the quote that closes the attribute matters more than anything else, and in an unquoted attribute a plain space is enough to escape into a new attribute — which is why an HTML-body encoder applied to an unquoted attribute leaves a working gap. In a URL the reserved characters are a different set again, and appending an encoded value to a path does nothing about a value whose scheme you never checked. Inside a script block you are in a third grammar, where HTML encoding accomplishes nothing at all: the safe move there is not a better encoder but getting the value out of the script entirely, into a `data-` attribute the HTML encoder can handle, read back with `dataset` and written to the page with `textContent`.

Encoding belongs at the output, not at the input, for two reasons that both come from the same fact. The first is that the destination is unknown when the value arrives: the same comment will appear in a page, in a search index, in an email, in a CSV export and in a log line, and each of those wants a different treatment or none. The second is that encoding on the way in destroys the original, so the value your user reads back is not the value they typed, double-encoded text starts accumulating on every edit, and a search for what they wrote no longer finds it. Store what was written. Decide how to spell it at the moment you know where it is going.

In practice most of this is already done for you, and the discipline is not undoing it. Razor encodes `@value` for the HTML context automatically, React encodes `{value}`, and both are correct by default in the place they are used. `System.Text.Encodings.Web` gives you `HtmlEncoder`, `UrlEncoder` and `JavaScriptEncoder` for the times you assemble output by hand; they exist as three separate types because they are three separate jobs. The failures worth watching for are the escape hatches — `Html.Raw`, `innerHTML`, `dangerouslySetInnerHTML` — which hand a string straight to a parser and cancel every encoder upstream, and the double-encoding that happens when a value already spelled safely goes through an encoder a second time and shows up on the page wearing its own markup. Encode once, at the boundary, for the grammar on the other side of it.
