# Order Up!! To Go

Order Up!! To Go brought the fun and chaos of running a kitchen to iOS and Android. As phones moved on, the original 32-bit game was left behind. In April 2018, [EA confirmed that it no longer supported the game](https://web.archive.org/web/20220607195255/https://answers.ea.com/t5/Other-EA-Games/Will-Order-Up-To-Go-be-updated-to-64-bit/td-p/6314236).

Like many fans, we weren't ready to hang up our aprons. This project is a labor of love: bringing a beloved piece of abandonware to the web so fans can step back into the kitchen and play again.

We're fans doing this purely as a hobby. We are in no way affiliated with the game's publishers or developers.

## Play online

Ready to get back in the kitchen? Play directly in your browser—just open the link below and let the game load.

**[Play Order Up!! To Go online](https://emonte02.github.io/orderup/)**

## Run locally

You'll need Git, Node.js 22 or newer, Python 3, and curl installed. Open a terminal and run these commands to clone the repo, download the game files, and start the player:

```sh
git clone https://github.com/emonte02/orderup.git
cd orderup
mkdir -p _runtime
curl -fL -o _runtime/orderup-game-data-1.65.zip https://github.com/emonte02/orderup/releases/download/game-data-1.65/orderup-game-data-1.65.zip
python3 tools/package_game_data.py --extract _runtime/orderup-game-data-1.65.zip
node tools/package_pages.mjs
python3 -m http.server 8148 --bind 127.0.0.1 --directory _site
```

Open [http://127.0.0.1:8148](http://127.0.0.1:8148) in Chrome to play. Keep the terminal open while playing; press **Ctrl+C** there to stop the player.

Next time, open a terminal in the `orderup` folder and run just the last command.
