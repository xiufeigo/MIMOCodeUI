# Third-Party Notices

MIMOCode UI is a desktop client for the MiMo-Code / OpenCode `serve` protocol.
Parts of this project are derived from, or inspired by, the following
open-source projects. Both are distributed under the MIT License, which
permits free use, modification and redistribution, including in commercial
products, provided the copyright notices below are preserved.

---

## OpenCode (anomalyco/opencode)

- Repository: https://github.com/anomalyco/opencode
- License: MIT License, Copyright (c) 2025 opencode

This project adapts UI structure and components from the OpenCode desktop
settings interface (settings-v2: providers / models / servers tabs), the
OpenCode theme set (fetched by `scripts/fetch-themes.mjs` and transpiled into
`src/lib/theme/themes.ts`), and general desktop layout patterns.

```
MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## MiMo-Code (XiaomiMiMo/MiMo-Code)

- Repository: https://github.com/XiaomiMiMo/MiMo-Code
- License: MIT License (Copyright Xiaomi MiMo Team)

This project implements a hand-written v1 HTTP/SSE protocol client
(`src/lib/protocol/`) that speaks the `mimo serve` protocol, which itself is
a fork of OpenCode's server protocol. The protocol endpoints and event
shapes were verified empirically against `@mimo-ai/cli` 0.1.11.

```
MIT License

Copyright (c) Xiaomi MiMo Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Bundled native binary

The installer bundles the MiMo native binary `mimo.exe` (from the
`@mimo-ai/cli` npm package, MIT License) into `src-tauri/resources/` so the
application works without a pre-installed `mimo` CLI.

---

## Runtime npm dependencies

| Package | License |
| --- | --- |
| @floating-ui/dom | MIT |
| @tauri-apps/api | Apache-2.0 OR MIT |
| @tauri-apps/plugin-dialog | MIT OR Apache-2.0 |
| @xterm/addon-fit | MIT |
| @xterm/xterm | MIT |
| dompurify | MPL-2.0 OR Apache-2.0 |
| lucide-solid | ISC |
| marked | MIT |
| solid-js | MIT |

Each dependency is distributed under its own license; see the respective
package for the full license text.
