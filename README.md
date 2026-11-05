# Order Up!! To Go — browser port

### [▶ Play in your browser](https://emonte02.github.io/orderup/?v=1c2b0ec763c099b0)

**Open the player and click Start game. Everything needed downloads automatically.** No APK selection, OBB selection, installation, or local server is needed.

The original 3D cooking game runs in desktop Chrome with mouse controls, audio, and saved progress. The first download is about **187 MB**. Keep the tab selected while the engine starts. The progress indicator shows download and startup stages.

GitHub cannot run interactive games inside a repository README. The **Play** link opens the complete GitHub Pages player.

## Controls

- **Click and drag** to use the original touch controls.
- **Right-click or Escape** to go back or pause.
- Choose **Continue** in the game to resume saved progress.

Saves belong to the browser and site address. GitHub Pages and the local Mac launcher have separate saves. Clearing site data removes saved progress. See [PLAYING.md](PLAYING.md).

The optimized build reaches the menu in about **10–11 seconds** on the development M5 Max Mac once the game files are available. Measured restaurant kitchens average **38–49 fps**; performance checks include the tournament demonstration and its loading handoff. Original graphics, sound and game timing are retained. Results depend on the computer and browser; occasional asset-loading stalls remain. See the measured scene coverage in [the architecture notes](port/ARCHITECTURE.md). Retired purchases, ads, and leaderboards are unavailable.

## What this port contains

The original APK was decompiled and analyzed to understand the engine's interfaces. The playable port executes the original ARM game engine inside a **WebAssembly emulator**, with JavaScript implementations of Android services, graphics, audio, input, and saves, plus C acceleration helpers. It is not a full rebuild of the original game from decompiled source.

The source repository contains the new port code, compiled open-source emulator, tests, and build tools. The [game-data release](https://github.com/emonte02/orderup/releases/tag/game-data-1.65) supplies the executable, archives, initial game data, and achievement labels needed by the hosted build. These binary files remain outside Git source history. Personal saves, unrelated APKs, recovered analysis folders, and development reports are not published.

The deployment downloads that release, verifies every file's size and SHA-256 hash, and includes the data in the website. Players only need the **Play** link above.

## Run a checkout locally

With Node.js 22+, Python 3, and the GitHub CLI installed:

```sh
gh release download game-data-1.65 --repo emonte02/orderup --pattern orderup-game-data-1.65.zip --dir _runtime
python3 tools/package_game_data.py --extract _runtime/orderup-game-data-1.65.zip
node tools/package_pages.mjs
python3 -m http.server 8148 --bind 127.0.0.1 --directory _site
```

Open **http://127.0.0.1:8148** and click **Start game**. The release asset can also be downloaded from the release page and placed in `_runtime/`.

On the original development Mac, **Play Order Up.command** still opens the existing local build at **http://127.0.0.1:8147**, using its existing files and saves.

## Development

- `port/web/`: player, automatic verified downloads, pointer input, and frame loop.
- `port/runtime/`: ARM execution, Android services, graphics, audio, and persistence.
- `port/src/`: C acceleration and archive helpers.
- `port/build/`: the distributable emulator and its build record.
- `port/game-data.json`: exact manifest of required runtime data.
- `tools/package_game_data.py`: creates or verifies/extracts the data release.
- `tools/package_pages.mjs`: packages the complete playable website.
- `.github/workflows/pages.yml`: checks and publishes the player on pushes to `main`.

Run the checks that need no original game data:

```sh
node port/tests/test_mouse.mjs
node port/tests/test_downloads.mjs
```

`port/tests/test_pages_browser.mjs` checks the complete site in a fresh Chrome browser without local game files. Set `OU_PAGES_URL=https://emonte02.github.io/orderup/` to check the live site. It needs the dependencies in `tools/browser`; `CHROME_PATH` can override the Chrome executable path. The other preservation tests use the original local archives and analysis fixtures.

To rebuild the emulator, install Emscripten and CMake, then run `python3 tools/build_emulator.py`. The script fetches pinned upstream source, applies the included patches, and records the bundle hash. The checked-in bundle lets you run and publish the player without that toolchain. See [third-party notices](port/THIRD_PARTY.md) for source revisions and licenses.

GitHub Pages must use **GitHub Actions** as its publishing source. Only the assembled `_site/` is deployed. From the original development workspace, `python3 tools/package_game_data.py` regenerates the data release from the exact manifest inputs; it never reads personal browser saves.
