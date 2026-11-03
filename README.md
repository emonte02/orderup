# Order Up!! To Go — browser port

### [▶ Play in your browser](https://emonte02.github.io/orderup/)

The original 3D cooking game, running in desktop Chrome with mouse controls, audio, and saved progress.

**First visit:** select your **Order Up!! To Go 1.65 APK** and both **version 13 OBB files**, then click **Start game**. Choose all three files together. The player verifies them and remembers them in this browser when enabled. Game files stay on your computer; they are never uploaded.

GitHub cannot run interactive games inside a repository README. The **Play** link opens the GitHub Pages player, with no installation or local server needed.

## Game files

| File | Required version |
| --- | --- |
| `orderup-1.65.apk` | Order Up!! To Go 1.65, package `com.svsgames.orderup`, version code 29 |
| `main.13.com.svsgames.orderup.obb` | Main expansion, version 13 |
| `patch.13.com.svsgames.orderup.obb` | Patch expansion, version 13 |

Use your own unmodified copies. The APK filename can differ; its contents must match the supported build. On the original development Mac, all three are in `originals/`. The file called `order-up-to-go.apk` at the workspace root is an unrelated Aptoide installer and will not work.

This repository contains the new browser runtime, C helpers, launcher, tests, and supporting build files. It includes the compiled open-source ARM emulator and its notices. It does **not** contain the original APKs, OBBs, recovered commercial assets, decompiled game, personal saves, or analysis reports.

## Controls

- **Click and drag** to use the original touch controls.
- **Right-click or Escape** to go back or pause.
- **Full screen** expands the game to the display.
- Choose **Continue** in the game to resume saved progress.

Allow **1–2 minutes** for the engine to start and keep the tab selected. The progress indicator shows loading stages. Busy kitchens measured about **20 fps** on the development Mac. Retired purchases, ads, and leaderboards are unavailable. The hosted player currently shows numbered achievement entries; the local preservation build also has the recovered achievement names.

Saves belong to the browser and site address. The GitHub Pages player has separate saves from the local launcher. Clearing site data removes remembered game files and saves. See [PLAYING.md](PLAYING.md).

## Run locally

With **Node.js 22 or newer** and Python 3 installed:

```sh
node tools/package_pages.mjs
python3 -m http.server 8148 --bind 127.0.0.1 --directory _site
```

Open **http://127.0.0.1:8148** and select the same three game files. This works from a clean checkout, without recovered files or analysis tools.

On the original development Mac, **Play Order Up.command** still opens the existing local build at **http://127.0.0.1:8147**, using its existing files and saves.

## Development

- `port/web/`: player, local game-file import, pointer input, and frame loop.
- `port/runtime/`: ARM execution, Android services, graphics, audio, and persistence.
- `port/src/`: C acceleration and archive helpers.
- `port/build/`: the distributable emulator and its build record only.
- `tools/package_pages.mjs`: assembles the website using an explicit file list.
- `.github/workflows/pages.yml`: checks and publishes the player on pushes to `main`.

Run the checks that need no original game data:

```sh
node port/tests/test_mouse.mjs
node port/tests/test_game_files.mjs
node tools/package_pages.mjs
```

The other preservation tests in `port/tests/` use the original local archives and analysis fixtures; they are not standalone clean-checkout tests.

To rebuild the emulator, install Emscripten and CMake, then run `python3 tools/build_emulator.py`. The script fetches the pinned upstream source, applies the included patches, and records the bundle hash. The checked-in bundle lets you run and publish the player without that toolchain. See [third-party notices](port/THIRD_PARTY.md) for source revisions and licenses.

GitHub Pages must use **GitHub Actions** as its publishing source. Only `_site/` is deployed; packaging never copies the original game files.
