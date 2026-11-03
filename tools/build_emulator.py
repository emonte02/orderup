#!/usr/bin/env python3
"""Build the pinned Unicorn.js ARM backend with preservation-runtime fixes."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1]
VENDOR=ROOT/'tools/unicorn-js'
REV='1220477c7fb0f8fe4b500f4bd211de52f6dfe638'
def run(args,cwd=ROOT):subprocess.run(args,cwd=cwd,check=True)
def output(args,cwd):return subprocess.check_output(args,cwd=cwd,text=True).strip()
parser=argparse.ArgumentParser();parser.add_argument('--debug',action='store_true');args=parser.parse_args()
if not VENDOR.exists():
 run(['git','clone','--depth','1','https://github.com/AlexAltea/unicorn.js.git',str(VENDOR)])
 if output(['git','rev-parse','HEAD'],VENDOR)!=REV:
  run(['git','fetch','--depth','1','origin',REV],VENDOR);run(['git','checkout','--detach',REV],VENDOR)
 run(['git','submodule','update','--init','--depth','1','unicorn'],VENDOR)
if output(['git','rev-parse','HEAD'],VENDOR)!=REV:raise SystemExit('Unexpected emulator revision; preserve local changes and use the pinned source revision.')
os.chdir(VENDOR)
spec=importlib.util.spec_from_file_location('unicorn_js_build',VENDOR/'build.py');upstream=importlib.util.module_from_spec(spec);spec.loader.exec_module(upstream)
if not (VENDOR/'unicorn/qemu/include/exec/helper-adapter.h').exists():upstream.patchUnicorn()
upstream.generateConstants()
patches=[ROOT/'tools/patches/unicorn-adapter-temporaries.patch',ROOT/'tools/patches/unicorn-temp-pressure.patch']
for patch in patches:
 applied=subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=VENDOR/'unicorn',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 if not applied:run(['git','apply',str(patch)],VENDOR/'unicorn')
run(['emcmake','cmake','-B',str(VENDOR/'unicorn/build'),'-S',str(VENDOR/'unicorn'),'-DCMAKE_BUILD_TYPE=RelWithDebInfo','-DCMAKE_C_FLAGS_RELWITHDEBINFO=-O3 -g -DNDEBUG -flto','-DBUILD_SHARED_LIBS=OFF','-DUNICORN_ARCH=arm','-DUNICORN_BUILD_TESTS=OFF','-DUNICORN_INSTALL=OFF','-DUNICORN_FUZZ=OFF','-DUNICORN_LEGACY_STATIC_ARCHIVE=ON'])
run(['emmake','cmake','--build',str(VENDOR/'unicorn/build'),'--target','unicorn_archive','-j'+str(min(8,os.cpu_count() or 1))])
build=ROOT/'port/build';build.mkdir(parents=True,exist_ok=True)
methods=['ccall','getValue','setValue','addFunction','removeFunction','writeArrayToMemory','HEAPU8']
exports=upstream.EXPORTED_FUNCTIONS+['_ou_guest_zdecompress','_ou_hot_native_create','_ou_hot_native_error','_ou_hot_native_count','_ou_hot_native_enable','_ou_hot_native_destroy','_ou_gl_batch_create','_ou_gl_batch_bind','_ou_gl_batch_buffer','_ou_gl_batch_size','_ou_gl_batch_clear','_ou_gl_batch_enable','_ou_gl_batch_calls','_ou_gl_batch_destroy','_ou_shutdown_guard_create','_ou_memory_sync_code','_ou_memory_map','_ou_budget_create','_ou_budget_begin','_ou_budget_blocks','_ou_budget_stops','_ou_budget_destroy','_ou_guest_adpcm_mix','_ou_guest_font_char_index']
cmd=['emcc','-O1' if args.debug else '-O3','-g2','-sASSERTIONS=2' if args.debug else '-sASSERTIONS=0','-sSTACK_OVERFLOW_CHECK=2' if args.debug else '-sSTACK_OVERFLOW_CHECK=0','-flto','-sSTACK_SIZE=4194304',str(ROOT/'port/src/ou_emulator_host.c'),str(ROOT/'port/src/ou_hot.c'),str(ROOT/'port/src/ou_zdecompress.c'),'-sUSE_ZLIB=1','-I'+str(VENDOR/'unicorn/include'),str(VENDOR/'unicorn/build/libunicorn.a'),'-s','EXPORTED_FUNCTIONS='+str(exports),'-s','EXPORTED_RUNTIME_METHODS='+str(methods),'-sALLOW_TABLE_GROWTH=1','-sALLOW_MEMORY_GROWTH=1','-sMODULARIZE=1','-sSINGLE_FILE=1','-sEXPORT_NAME=MUnicorn']
for p in upstream.constant_files(['arm']):cmd+=['--post-js',p]
next_bundle=build/'unicorn-arm.next.js'
cmd+=['--post-js','src/unicorn-wrapper.js','-o',str(next_bundle)];run(cmd,VENDOR)
os.replace(next_bundle,build/'unicorn-arm.js')
record={'source':REV,'unicorn_source':output(['git','rev-parse','HEAD'],VENDOR/'unicorn'),'patches':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},'debug':args.debug,'cmake_c_flags':'-O3 -g -DNDEBUG -flto','link_flags':['-O1' if args.debug else '-O3','-flto','ASSERTIONS=2' if args.debug else 'ASSERTIONS=0','STACK_OVERFLOW_CHECK=2' if args.debug else 'STACK_OVERFLOW_CHECK=0'],'host_source_sha256':hashlib.sha256((ROOT/'port/src/ou_emulator_host.c').read_bytes()).hexdigest(),'hot_source_sha256':hashlib.sha256((ROOT/'port/src/ou_hot.c').read_bytes()).hexdigest(),'decompression_source_sha256':hashlib.sha256((ROOT/'port/src/ou_zdecompress.c').read_bytes()).hexdigest(),'zlib_port':'Emscripten USE_ZLIB=1','bundle_sha256':hashlib.sha256((build/'unicorn-arm.js').read_bytes()).hexdigest()}
(build/'emulator-build.json').write_text(json.dumps(record,indent=2)+'\n')
print('Built',build/'unicorn-arm.js')
