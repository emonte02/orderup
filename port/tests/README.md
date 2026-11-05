# Verification

The player packages only `port/web`, `port/runtime`, the release emulator and the verified data manifest. Test fixtures, loopback controls, original-reference vectors, screenshots and personal saves are excluded.

Native equivalence tests require the preserved Android 1.65 library at `analysis/game-apk/lib/armeabi-v7a/libOrderUp.so`. Reference generators in `tools/make_*vectors.py` execute the untouched ARM code with Python Unicorn and pyelftools, saving results under `analysis/`. Generate the matching vectors before running a test; do not substitute the accelerated runtime as the reference. The file headers identify each generator's output. Original game binaries and generated vectors are deliberately absent from source history.

With reference vectors available, run all 55 semantic/runtime groups against one exact bundle:

```sh
python3 tools/test_perf_candidate.py port/build/unicorn-arm.js verification
```

The compact `fixtures/exit-gate-native.json` contains only newly written CPU test programs and independently generated native results, so CI can check stop and fault boundaries without commercial game data. It passes against both the generic and specialized block-entry implementations.

The aggregate exit status fails if any group fails. Logs and the aggregate JSON are written under `analysis/`. The optional `--profile` build and `test_profile_wasm.mjs` are diagnostic tools; the distributed player has no sampling hooks.

Browser checks need desktop Chrome, the Playwright dependencies in `tools/browser`, the runtime game data described in the root README, and the local OCR helper. On macOS build that helper with `swiftc tools/ocr_image.swift -o tools/ocr-image`. `test_pages_browser.mjs` runs the packaged site under `/orderup/`; set `OU_PAGES_URL` for a fresh-browser check of the published site. Loading, full screen, saves, platform callbacks, mouse input and real guest sleep deadlines have separate browser tests.

`tools/performance_api.mjs` creates an isolated temporary browser profile on a random loopback port. Its controls are for QA only. `tools/perf_client.py` rejects the player's normal local port, 8147. Performance scripts use earned encrypted-save checkpoints and real mouse events; selected native event scripts only prepare otherwise rare challenge entry conditions. Never use branch-test prepared/plated flags or modified opponent times as evidence of mouse-cooked gameplay.

Frame-rate runs must be isolated from builds, profilers and other active game browsers. Reports retain all work and interval outliers after the stated warmup. Presentation checks count unique completed image copies observed by requestAnimationFrame, independently of the later audio/save completion counter. A minimum in a one-second window does not establish that every individual frame finishes within 33.3 ms. Record the exact bundle SHA, challenge outcome, sound scheduling gaps and runtime/graphics errors with each scene result.
