# Recovered SVS WAD v4 format

Evidence is the original `libOrderUp.so` and successful decoding of all 112 WAD containers in this build. This is a little-endian implementation for the supplied Android build, not a universal WAD parser.

The fixed header is 48 bytes. Words at offsets 0..28 are magic `0DAW`, version 4, entry count N, total header length, alignment, compression mode, uncompressed payload length, and on-disk payload length. The original header has further bookkeeping words; their meanings are not required for extraction. Header length is `48 + N*16` in modes 0/1 and `48 + N*24` in mode 2.

At offset 48 there are N sorted `(filename_crc, physical_index)` pairs. A separate N-entry `(offset, length)` table follows, indexed by physical index. Offsets are relative to the beginning of the WAD, not the beginning of the payload. Mode 2 adds another N-entry table of on-disk offset/length pairs.

- Mode 0: the entry table points directly into the file.
- Mode 1: one zlib stream begins immediately after the header, **before** any logical alignment padding. Its decompressed length is the header's uncompressed payload length. The entry offset is relative to `header + decompressed_payload`.
- Mode 2: the extra table identifies individually compressed chunks. If compressed length equals uncompressed length, the chunk is stored raw; otherwise it is a zlib stream. Preserve the entry's original hash when extracting.

Filename hashing uses reflected CRC-32 polynomial `0xedb88320`, initial value `0xffffffff`, ASCII A-Z folding to lowercase, and **no final complement**. Slash normalization is not performed by the CRC routine itself. The script loader constructs `scripts/%s.o`; source `.csl` paths embedded in modules help resolve those hashes. Platform `_iph` source variants can map to the unsuffixed `.o` filename; a candidate is accepted only if its CRC matches.

Reference ELF addresses: `Crc::GenerateCRCFromString` 0x3a4770; `Wad::WADFile::ValidateHeader` 0x39474c; `ValidateEntries` 0x392bd0; `Wad::WADLoader::set_entries` 0x390638; `load_chunk` 0x3919b4. Ghidra pseudocode addresses are shifted by +0x10000 in the saved project.

The C reader adds bounds, index-permutation, ordering, allocation-size and decompression checks. The caller owns the original input buffer until `ou_wad_close`. `ou_wad_read` writes into caller-provided memory; it never chooses output paths or executes asset content.
