# Third-party runtime components

The browser ARM backend is built from [AlexAltea/unicorn.js](https://github.com/AlexAltea/unicorn.js), pinned at `1220477c7fb0f8fe4b500f4bd211de52f6dfe638`, with the Unicorn submodule pinned at `8028ec436f2d9376525352dd38ed9ed6b9f6be10`. Both provide GPL version 2 license text in their source trees; a copy accompanies the shipped bundle in `licenses/unicorn-GPL-2.0.txt`. Unicorn includes QEMU code and third-party notices retained in the pinned checkout. Local fixes are supplied as source patches under `tools/patches`; the host budget helper is `port/src/ou_emulator_host.c`. The complete build command and source revisions are reproducible through `tools/build_emulator.py`, and the built bundle hash is recorded in `port/build/emulator-build.json`.

The emulator also links zlib 1.3.2 through Emscripten `USE_ZLIB=1` for the verified C decompression helper. Its unmodified copyright notice is preserved in `licenses/zlib.txt`; its source is available in the Emscripten ports cache. `port/src/ou_zdecompress.c` is this project's guest-memory wrapper. Original ARM reference cases and every original compressed archive stream were checked against this helper.

The original Order Up!! To Go executable and data are separate, locally stored commercial game files. They are excluded from source tracking and the GitHub Pages package. The hosted player opens copies selected by the player, verifies their hashes, and extracts the required APK members entirely in the browser. It does not upload them.

Playwright is used only for local browser verification, with its dependency lockfile under `tools/browser`. Ghidra, JADX, apktool, Unicorn Python, and Emscripten are analysis/build tools rather than shipped game assets.
