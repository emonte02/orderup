#!/usr/bin/env python3
"""Create or extract the verified game-data release used by the hosted player."""
from pathlib import Path
import argparse, hashlib, json, zipfile
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'port/game-data.json').read_text())
OUTPUT = ROOT / '_runtime'

def verify(data, spec):
    if len(data) != spec['size'] or hashlib.sha256(data).hexdigest() != spec['sha256']:
        raise ValueError('Game data does not match the supported build: ' + spec['path'])
    return data

def create():
    payloads = []
    for spec in MANIFEST['files']:
        source = ROOT / spec['source']
        if 'member' in spec:
            with zipfile.ZipFile(source) as archive:
                data = archive.read(spec['member'])
        else:
            data = source.read_bytes()
        payloads.append((spec, verify(data, spec)))
    OUTPUT.mkdir(exist_ok=True)
    destination = OUTPUT / MANIFEST['archive']
    temporary = destination.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for spec, data in payloads:
            info = zipfile.ZipInfo(spec['path'], date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    temporary.replace(destination)
    extract(destination)
    print('Created', destination, '(' + str(destination.stat().st_size) + ' bytes)')

def extract(source):
    # Extract only exact manifest entries, never paths supplied by an archive.
    with zipfile.ZipFile(source) as archive:
        expected = [spec['path'] for spec in MANIFEST['files']]
        if sorted(archive.namelist()) != sorted(expected):
            raise ValueError('Runtime archive contains missing, extra, or duplicate entries.')
        payloads = []
        for spec in MANIFEST['files']:
            if archive.getinfo(spec['path']).file_size != spec['size']:
                raise ValueError('Incorrect file size: ' + spec['path'])
            payloads.append((spec, verify(archive.read(spec['path']), spec)))
    for spec, data in payloads:
        destination = OUTPUT / 'data' / spec['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    print('Verified', len(expected), 'runtime files. No personal saves or analysis reports included.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extract', type=Path, help='Extract a downloaded release instead of creating one.')
    args = parser.parse_args()
    if args.extract:
        extract(args.extract)
    else:
        create()
