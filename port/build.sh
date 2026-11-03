#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p port/build
cc -std=c11 -O2 -Wall -Wextra -Werror -fPIC -shared port/src/ou_archive.c -lz -o port/build/libou_archive.dylib
emcc port/src/ou_archive.c port/src/ou_recompiled_crc.c -std=c11 -O2 -Wall -Wextra -Werror -sUSE_ZLIB=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=1073741824 -sENVIRONMENT=web,node -sEXPORTED_FUNCTIONS='["_malloc","_free","_ou_crc","_ou_wad_open","_ou_wad_close","_ou_wad_count","_ou_wad_mode","_ou_wad_hash","_ou_wad_size","_ou_wad_find","_ou_wad_read","_ou_recompiled_crc"]' -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8"]' -o port/build/orderup-core.mjs
