---
title: "Probe"
date: "2026-10-29"
description: "Every dangerous form in one file"
---

A javascript scheme in a link destination: [click me](javascript:alert(3))

A data scheme in a link destination: [data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)

A raw html script tag: <script>alert(1)</script>

A url with a closing parenthesis, written as a plain destination: [paren](https://evil.example/a)b) tail

A url with a closing parenthesis, written as an angle bracket destination: [paren](<https://evil.example/a)b>)

A bare type name in prose: Vec<T>

A type name in inline code: `Vec<T>`

A fenced code block with braces:

```rust
fn main() {
    let x = { let y = 1; y + 1 };
}
```
