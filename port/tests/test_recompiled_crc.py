#!/usr/bin/env python3
"""Equivalence proof for the recompiled CRC routine.

The test compiles port/src/ou_recompiled_crc.c, runs it against the original
A32 machine code of Crc::GenerateCRCFromString(char const*, unsigned int)
under Unicorn, and compares the results on a shared guest memory image.

Run:
    tools/venv/bin/python port/tests/test_recompiled_crc.py              # run and write analysis/recompiler-proof.json
    tools/venv/bin/python port/tests/test_recompiled_crc.py --no-proof   # run only
    tools/venv/bin/python port/tests/test_recompiled_crc.py -v           # verbose test names

Scope: one routine. The proof does not cover the rest of the game.
"""
import ctypes
import datetime
import hashlib
import json
import platform
import random
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.dont_write_bytecode = True  # keep tools/__pycache__ free of test by-products

import recompile_crc as rc  # noqa: E402

import capstone  # noqa: E402
import unicorn  # noqa: E402
from unicorn import UC_ARCH_ARM, UC_HOOK_CODE, UC_HOOK_MEM_READ, UC_MODE_ARM, Uc  # noqa: E402
from unicorn.arm_const import (  # noqa: E402
    UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2,
    UC_ARM_REG_R3, UC_ARM_REG_R4, UC_ARM_REG_R5, UC_ARM_REG_R6, UC_ARM_REG_R7,
    UC_ARM_REG_R8, UC_ARM_REG_R9, UC_ARM_REG_R10, UC_ARM_REG_R11, UC_ARM_REG_R12,
    UC_ARM_REG_SP,
)

PROOF_PATH = ROOT / "analysis" / "recompiler-proof.json"
SOURCE_C = ROOT / "port" / "src" / "ou_recompiled_crc.c"
SOURCE_H = ROOT / "port" / "src" / "ou_recompiled_crc.h"

# Guest memory layout shared by the C function and the emulator.
IMAGE_SIZE = 0x600000        # covers every PT_LOAD segment (ELF end 0x475e0c)
STRING_BASE = 0x500000       # scratch area for test strings
STRING_LIMIT = 0x510000
STACK_TOP = 0x5E0000         # unused by the leaf routine, set for hygiene
RETURN_SENTINEL = 0x5F0000   # lr value; emulation stops when pc reaches it

CFLAGS = ["-std=c11", "-Wall", "-Wextra", "-Werror", "-pedantic", "-fPIC", "-shared"]
BUILD_VARIANTS = ["-O2", "-O0"]

RANDOM_SEED = 20261102
RANDOM_COUNT = 200

GENERAL_REGS = [UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3,
                UC_ARM_REG_R4, UC_ARM_REG_R5, UC_ARM_REG_R6, UC_ARM_REG_R7,
                UC_ARM_REG_R8, UC_ARM_REG_R9, UC_ARM_REG_R10, UC_ARM_REG_R11,
                UC_ARM_REG_R12]

HARNESS = None


def hx(value):
    return "0x%x" % value


def lowered(data):
    return bytes(c + 0x20 if 0x41 <= c <= 0x5A else c for c in data)


class Harness:
    """Shared state: translation, compiled C, emulator, and recorded evidence."""

    def __init__(self):
        self.tr = rc.translate_routine()
        self.elf = self.tr.image
        self.image = self.image_from_elf()
        self.build_dir = Path(tempfile.mkdtemp(prefix="ou_recompiled_crc_"))
        self.compile_log = {}
        self.functions = {}
        self.buffer = (ctypes.c_ubyte * len(self.image)).from_buffer(self.image)
        for opt in BUILD_VARIANTS:
            self.functions[opt] = self.compile(opt)

        self.uc = Uc(UC_ARCH_ARM, UC_MODE_ARM)
        self.uc.mem_map(0, IMAGE_SIZE)
        self.uc.mem_write(0, bytes(self.image))
        self.uc.hook_add(UC_HOOK_CODE, self._hook_code)
        self.uc.hook_add(UC_HOOK_MEM_READ, self._hook_read)
        self._run_exec = []
        self._run_reads = []

        self.executed = set()
        self.instructions_executed = 0
        self.reads = {"literal": 0, "table": 0, "string": 0, "other": []}
        self.table_read_range = [None, None]
        self._results = None
        self.optimization_disagreements = 0

    # -- construction ----------------------------------------------------

    def image_from_elf(self):
        return self.elf.flat_image(IMAGE_SIZE)

    def compile(self, opt):
        suffix = ".dylib" if platform.system() == "Darwin" else ".so"
        out = self.build_dir / ("libou_recompiled_crc_%s%s" % (opt.strip("-"), suffix))
        cmd = ["cc", opt] + CFLAGS + [str(SOURCE_C), "-o", str(out)]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        self.compile_log[opt] = {"command": cmd, "returncode": proc.returncode,
                                 "stderr": proc.stderr.strip()}
        if proc.returncode != 0:
            raise RuntimeError("compile failed (%s):\n%s" % (opt, proc.stderr))
        lib = ctypes.CDLL(str(out))
        fn = getattr(lib, rc.FUNCTION)
        fn.argtypes = [ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32, ctypes.c_uint32]
        fn.restype = ctypes.c_uint32
        return fn

    # -- emulator hooks ----------------------------------------------------

    def _hook_code(self, uc, address, size, user_data):
        self._run_exec.append(address)

    def _hook_read(self, uc, access, address, size, value, user_data):
        self._run_reads.append((address, size))

    # -- guest memory ------------------------------------------------------

    def poke(self, address, data):
        """Write bytes into both the C image and the emulator memory."""
        self.image[address:address + len(data)] = data
        self.uc.mem_write(address, bytes(data))

    def place_string(self, data):
        if len(data) + 1 > STRING_LIMIT - STRING_BASE:
            raise ValueError("string does not fit the scratch area")
        self.poke(STRING_BASE, data + b"\0")
        return STRING_BASE

    # -- one comparison ----------------------------------------------------

    def run_native(self, opt, string_address, seed):
        return self.functions[opt](self.buffer, string_address, seed)

    def run_emulated(self, string_address, seed):
        uc = self.uc
        for reg in GENERAL_REGS:
            uc.reg_write(reg, 0)
        uc.reg_write(UC_ARM_REG_R0, string_address)
        uc.reg_write(UC_ARM_REG_R1, seed)
        uc.reg_write(UC_ARM_REG_SP, STACK_TOP)
        uc.reg_write(UC_ARM_REG_LR, RETURN_SENTINEL)
        self._run_exec = []
        self._run_reads = []
        uc.emu_start(rc.ENTRY, RETURN_SENTINEL, timeout=10 * 1000 * 1000)
        pc = uc.reg_read(UC_ARM_REG_PC)
        if pc != RETURN_SENTINEL:
            raise RuntimeError("emulation stopped at 0x%x, not at the return sentinel" % pc)
        return uc.reg_read(UC_ARM_REG_R0), list(self._run_exec), list(self._run_reads)

    def classify_reads(self, reads, string_address, string_length):
        tab = self.tr.table()
        table_lo, table_hi = tab["base_address"], tab["base_address"] + tab["span_bytes"]
        literal = {l["literal_address"] for l in self.tr.literals}
        for address, size in reads:
            if address in literal and size == 4:
                self.reads["literal"] += 1
            elif table_lo <= address and address + size <= table_hi:
                self.reads["table"] += 1
                lo, hi = self.table_read_range
                self.table_read_range = [address if lo is None else min(lo, address),
                                         address + size if hi is None else max(hi, address + size)]
            elif string_address is not None and string_address <= address < string_address + string_length + 1:
                self.reads["string"] += 1
            else:
                self.reads["other"].append((address, size))

    def compare(self, category, name, data, seed, string_address=None):
        """Run the C and the emulator on one vector and record the evidence."""
        if data is None:
            address, length = 0, 0
        elif string_address is None:
            address, length = self.place_string(data), len(data)
        else:
            address, length = string_address, len(data)
        native = {opt: self.run_native(opt, address, seed) for opt in BUILD_VARIANTS}
        emulated, executed, reads = self.run_emulated(address, seed)
        self.executed.update(executed)
        self.instructions_executed += len(executed)
        self.classify_reads(reads, None if data is None else address, length)
        if len(set(native.values())) != 1:
            self.optimization_disagreements += 1
        result = {
            "category": category,
            "name": name,
            "string_hex": None if data is None else data.hex(),
            "string_text": (data.decode("ascii") if data is not None and data and all(0x20 <= c < 0x7F for c in data)
                            else ("" if data == b"" else None)),
            "string_address": hx(address),
            "seed": hx(seed),
            "native": hx(native[BUILD_VARIANTS[0]]),
            "emulated": hx(emulated),
            "equal": all(v == emulated for v in native.values()),
            "instructions": len(executed),
            "reads": len(reads),
        }
        return result

    # -- corpus ------------------------------------------------------------

    def corpus(self):
        rng = random.Random(RANDOM_SEED)
        vectors = []
        mixed = [b"Hello World", b"ORDER_UP", b"OrderUp.wad", b"textures/BURGER_bun.PNG",
                 b"aBcDeFgHiJkLmNoPqRsTuVwXyZ", b"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                 b"abcdefghijklmnopqrstuvwxyz", b"@[`{", b"A", b"Z", b"a", b"z",
                 b"MiXeD CaSe 1234 !@#$%^&*()", b"\x80\xff\xc0 HIGH bytes \xa5"]
        for i, s in enumerate(mixed):
            vectors.append(("mixed-case", "mixed-%02d" % i, s, 0xFFFFFFFF, None))
        for seed in (0xFFFFFFFF, 0, 1, 0x80000000, 0x12345678, 0xDEADBEEF):
            vectors.append(("empty", "empty-seed-%08x" % seed, b"", seed, None))
        for seed in (0xFFFFFFFF, 0, 1, 0x80000000, 0x12345678, 0xDEADBEEF):
            vectors.append(("null", "null-seed-%08x" % seed, None, seed, None))
        for seed in (0xFFFFFFFF, 0, 1, 0x80000000, 0x7FFFFFFF, 0x12345678, 0xDEADBEEF):
            vectors.append(("seed", "seed-%08x" % seed, b"Order Up!! To Go", seed, None))
        for i in range(16):
            vectors.append(("seed", "seed-random-%02d" % i, b"OrderUp", rng.getrandbits(32), None))
        for i in range(RANDOM_COUNT):
            length = rng.randint(1, 64)
            data = bytes(rng.randint(1, 255) for _ in range(length))
            seed = rng.getrandbits(32) if i % 2 else 0xFFFFFFFF
            vectors.append(("random", "random-%03d" % i, data, seed, None))
        long_data = bytes(rng.randint(1, 255) for _ in range(4096))
        vectors.append(("long", "long-4096", long_data, 0xFFFFFFFF, None))
        # A string that lives inside the ELF image: the "ELF" magic at guest address 1.
        head = bytes(self.image[1:64])
        in_image = head[:head.index(0)]
        vectors.append(("in-image", "elf-magic-at-1", in_image, 0xFFFFFFFF, 1))
        names = [v[1] for v in vectors]
        if len(set(names)) != len(names):
            raise RuntimeError("duplicate vector names in the corpus")
        return vectors

    def results(self):
        if self._results is None:
            self._results = [self.compare(*vector) for vector in self.corpus()]
        return self._results

    def by_category(self, category):
        return [r for r in self.results() if r["category"] == category]


def setUpModule():
    global HARNESS
    if HARNESS is None:
        HARNESS = Harness()


# ----------------------------------------------------------------------------
# Static translation facts
# ----------------------------------------------------------------------------

class TestStaticTranslation(unittest.TestCase):

    def test_source_binary_identity(self):
        h = HARNESS
        header = SOURCE_H.read_text()
        self.assertIn(h.elf.sha256, header, "header SHA-256 must name the analysed library")
        self.assertEqual(h.elf.symbol(rc.SYMBOL), (rc.ENTRY, rc.SIZE))

    def test_generated_files_match_generator(self):
        h = HARNESS
        self.assertEqual(SOURCE_C.read_text(), h.tr.c_source, "ou_recompiled_crc.c is not the generator output")
        self.assertEqual(SOURCE_H.read_text(), h.tr.h_source, "ou_recompiled_crc.h is not the generator output")

    def test_translation_shape(self):
        r = HARNESS.tr.report
        self.assertEqual(r["words_total"], 20)
        self.assertEqual(r["words_translated"], 19)
        self.assertEqual(r["literal_pool_words"],
                         [{"address": "0x3a47bc", "value": "0x0006bd74", "referenced_by": ["0x3a4784"]}])
        self.assertEqual(r["labels"], ["0x3a478c", "0x3a47b4"])
        self.assertEqual(r["flags_tracked"], ["z", "c"])
        self.assertEqual(r["registers_used"], ["r0", "r1", "r2", "r3", "r12"])
        classes = [i["class"] for i in r["instructions"]]
        for needed in ("load8", "load32", "uxtb", "compare", "branch", "return", "eor", "add", "sub", "mov"):
            self.assertIn(needed, classes)
        conditions = {i["condition"] for i in r["instructions"]}
        self.assertEqual(conditions, {"al", "eq", "ne", "ls"})

    def test_table_resolution(self):
        r = HARNESS.tr.report
        self.assertEqual(r["pc_relative_adds"], [{"instruction": "0x3a4788", "register": "r12", "value": "0x410504"}])
        self.assertEqual(r["table"]["address"], "0x410504")
        self.assertEqual(r["table"]["entries"], 256)
        self.assertEqual(r["table"]["span_bytes"], 1024)
        self.assertEqual(r["table"]["segment"]["flags"], 5, "table must sit in the read+execute segment")
        self.assertTrue(r["table"]["matches_reflected_crc32_edb88320"])
        self.assertEqual(r["minimum_memory_size"], "0x410904")

    def test_c_reads_table_from_guest_memory_not_constants(self):
        text = SOURCE_C.read_text()
        self.assertIn("ou_guest_ld32(memory, 0x3a47bcu)", text, "literal pool read must go through guest memory")
        self.assertIn("ou_guest_ld32(memory, r12 + (r0 << 2))", text, "table read must go through guest memory")
        for constant in ("0x77073096", "0xedb88320", "0x2d02ef8d", "EDB88320"):
            self.assertNotIn(constant, text, "the C must not embed the CRC table or polynomial")

    def test_compiles_with_strict_flags(self):
        for opt in BUILD_VARIANTS:
            log = HARNESS.compile_log[opt]
            self.assertEqual(log["returncode"], 0, log["stderr"])
            self.assertEqual(log["stderr"], "", "compiler must stay silent under -Wall -Wextra -Werror -pedantic")


# ----------------------------------------------------------------------------
# Dynamic equivalence against Unicorn
# ----------------------------------------------------------------------------

class TestEquivalence(unittest.TestCase):

    def assert_category(self, category, minimum):
        rows = HARNESS.by_category(category)
        self.assertGreaterEqual(len(rows), minimum)
        bad = [r for r in rows if not r["equal"]]
        self.assertEqual(bad, [], "mismatch between C and emulated ARM: %s" % bad[:3])

    def test_mixed_case_strings(self):
        self.assert_category("mixed-case", 10)

    def test_empty_string(self):
        self.assert_category("empty", 6)
        for r in HARNESS.by_category("empty"):
            self.assertEqual(r["native"], r["seed"], "empty string must return the seed unchanged")

    def test_null_pointer(self):
        self.assert_category("null", 6)
        for r in HARNESS.by_category("null"):
            self.assertEqual(r["native"], r["seed"], "NULL must return the seed unchanged")
            self.assertEqual(r["reads"], 0, "NULL path must not touch guest memory")
            self.assertEqual(r["instructions"], 4, "NULL path is subs, beq, mov, bx")

    def test_seed_variation(self):
        self.assert_category("seed", 20)
        values = {r["native"] for r in HARNESS.by_category("seed")}
        self.assertGreater(len(values), 15, "different seeds must give different results")

    def test_random_byte_strings(self):
        self.assert_category("random", RANDOM_COUNT)

    def test_long_string(self):
        self.assert_category("long", 1)
        row = HARNESS.by_category("long")[0]
        self.assertGreater(row["instructions"], 4096 * 9)

    def test_string_inside_elf_image(self):
        self.assert_category("in-image", 1)
        row = HARNESS.by_category("in-image")[0]
        self.assertEqual(row["string_address"], "0x1")
        self.assertTrue(row["string_hex"].startswith("454c46"), "guest address 1 holds 'ELF'")

    def test_optimization_levels_agree(self):
        HARNESS.results()
        self.assertEqual(HARNESS.optimization_disagreements, 0)

    def test_semantic_crosscheck_against_zlib(self):
        """Independent reference: seed 0xffffffff and no final xor equals ~zlib.crc32(lowercase)."""
        checked = 0
        for r in HARNESS.results():
            if r["string_hex"] is None or r["seed"] != "0xffffffff":
                continue
            data = bytes.fromhex(r["string_hex"])
            expected = (~zlib.crc32(lowered(data))) & 0xFFFFFFFF
            self.assertEqual(int(r["native"], 16), expected, "vector %s" % r["name"])
            checked += 1
        self.assertGreater(checked, 100)
        HARNESS.zlib_checked = checked

    def test_table_corruption_tracks_guest_memory(self):
        """Change one table entry in guest memory: both sides must follow it."""
        h = HARNESS
        tab = h.tr.table()
        data = b"Hello World"
        address = h.place_string(data)
        base_native = h.run_native("-O2", address, 0xFFFFFFFF)
        base_emulated, _, _ = h.run_emulated(address, 0xFFFFFFFF)
        self.assertEqual(base_native, base_emulated)
        entry = tab["base_address"] + 4 * (ord("h") ^ 0xFF)   # first byte 'H' lowered, xor seed low byte
        original = bytes(h.image[entry:entry + 4])
        try:
            h.poke(entry, bytes(b ^ 0xA5 for b in original))
            changed_native = h.run_native("-O2", address, 0xFFFFFFFF)
            changed_emulated, _, _ = h.run_emulated(address, 0xFFFFFFFF)
        finally:
            h.poke(entry, original)
        self.assertEqual(changed_native, changed_emulated)
        self.assertNotEqual(changed_native, base_native, "the C must read the table from guest memory")
        h.table_corruption_tracked = True


# ----------------------------------------------------------------------------
# Generator must reject what it does not support
# ----------------------------------------------------------------------------

BX_LR = bytes.fromhex("1eff2fe1")

NEGATIVE_CASES = [
    ("push (store multiple)", bytes.fromhex("10402de9") + BX_LR),
    ("store with writeback", bytes.fromhex("04e02de5") + BX_LR),
    ("bl (call, not a leaf)", bytes.fromhex("000000eb") + BX_LR),
    ("svc (system call)", bytes.fromhex("000000ef") + BX_LR),
    ("movs (logical S, shifter carry)", bytes.fromhex("0100b0e1") + BX_LR),
    ("ldr into pc", bytes.fromhex("00f090e5") + BX_LR),
    ("bx with a register other than lr", bytes.fromhex("10ff2fe1") + BX_LR),
    ("branch that leaves the routine", bytes.fromhex("3e0000ea") + BX_LR),
    ("control flow falls off the end", bytes.fromhex("0100a0e1")),
    ("mul", bytes.fromhex("910200e0") + BX_LR),
    ("ldm (load multiple)", bytes.fromhex("020090e8") + BX_LR),
    ("rrx shift", bytes.fromhex("6000a0e1") + BX_LR),
    ("register-specified shift", bytes.fromhex("1102a0e1") + BX_LR),
    ("neon vadd", bytes.fromhex("200a30ee") + BX_LR),
    ("udf (permanently undefined)", bytes.fromhex("f000f0e7") + BX_LR),
    ("undecodable word", bytes.fromhex("ffffffff") + BX_LR),
    ("pc literal without an ELF image", bytes.fromhex("30c09fe5") + BX_LR),
    ("write to lr", bytes.fromhex("00e0a0e3") + BX_LR),
    ("read of sp", bytes.fromhex("0d00a0e1") + BX_LR),
]


class TestGeneratorRejectsUnsupported(unittest.TestCase):

    def disasm(self, code):
        md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_ARM)
        return "; ".join("%s %s" % (i.mnemonic, i.op_str) for i in md.disasm(code, 0x1000)) or "(undecodable)"

    def test_positive_control(self):
        tr = rc.Translator(bytes.fromhex("0100a0e1") + BX_LR, 0x1000).translate()
        self.assertEqual(len(tr.translated), 2)
        self.assertIn("return r0;", tr.c_source)

    def test_rejections(self):
        HARNESS.negative = []
        for name, code in NEGATIVE_CASES:
            with self.subTest(case=name):
                with self.assertRaises(rc.TranslationError) as ctx:
                    rc.Translator(code, 0x1000).translate()
                HARNESS.negative.append({"case": name, "asm": self.disasm(code), "rejected": True,
                                         "error": str(ctx.exception)})
        self.assertEqual(len(HARNESS.negative), len(NEGATIVE_CASES))


# ----------------------------------------------------------------------------
# Coverage over the whole corpus (runs last: class names sort alphabetically)
# ----------------------------------------------------------------------------

class TestZDynamicCoverage(unittest.TestCase):

    def test_every_translated_instruction_executed(self):
        HARNESS.results()
        translated = set(HARNESS.tr.translated)
        missing = sorted(translated - HARNESS.executed)
        self.assertEqual(missing, [], "translated but never executed: %s" % [hx(a) for a in missing])

    def test_no_execution_outside_translation(self):
        HARNESS.results()
        translated = set(HARNESS.tr.translated)
        extra = sorted(HARNESS.executed - translated)
        self.assertEqual(extra, [], "executed but not translated: %s" % [hx(a) for a in extra])
        literal = {l["literal_address"] for l in HARNESS.tr.literals}
        self.assertFalse(literal & HARNESS.executed, "the literal pool word must never execute")

    def test_guest_reads_stay_in_literal_table_and_string(self):
        HARNESS.results()
        reads = HARNESS.reads
        self.assertEqual(reads["other"], [], "unexpected guest reads: %s" % reads["other"][:5])
        self.assertGreater(reads["literal"], 0)
        self.assertGreater(reads["table"], 0)
        self.assertGreater(reads["string"], 0)
        tab = HARNESS.tr.table()
        lo, hi = HARNESS.table_read_range
        self.assertGreaterEqual(lo, tab["base_address"])
        self.assertLessEqual(hi, tab["base_address"] + tab["span_bytes"])
        minimum = int(HARNESS.tr.report["minimum_memory_size"], 16)
        self.assertLessEqual(hi, minimum)


# ----------------------------------------------------------------------------
# Proof record
# ----------------------------------------------------------------------------

class RecordingResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.records.append({"test": test.id(), "status": "pass"})

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.records.append({"test": test.id(), "status": "fail", "detail": self._exc_info_to_string(err, test)[-2000:]})

    def addError(self, test, err):
        super().addError(test, err)
        self.records.append({"test": test.id(), "status": "error", "detail": self._exc_info_to_string(err, test)[-2000:]})

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if err is not None:
            self.records.append({"test": subtest.id(), "status": "fail",
                                 "detail": self._exc_info_to_string(err, test)[-2000:]})


def compiler_version():
    proc = subprocess.run(["cc", "--version"], capture_output=True, text=True, check=False)
    return proc.stdout.splitlines()[0] if proc.stdout else "unknown"


def build_proof(result):
    h = HARNESS
    report = h.tr.report if h else None
    rows = h.results() if h else []
    categories = {}
    for r in rows:
        cat = categories.setdefault(r["category"], {"count": 0, "mismatches": 0, "examples": []})
        cat["count"] += 1
        if not r["equal"]:
            cat["mismatches"] += 1
        if len(cat["examples"]) < 3:
            cat["examples"].append({k: r[k] for k in ("name", "string_text", "string_hex", "string_address",
                                                      "seed", "native", "emulated", "equal", "instructions")})
    failed = sum(1 for rec in result.records if rec["status"] != "pass")
    status = "PASS" if failed == 0 and result.wasSuccessful() else "FAIL"
    translated = sorted(h.tr.translated) if h else []
    proof = {
        "title": "Bounded static recompilation proof: %s" % rc.DEMANGLED,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "scope": {
            "claim": "The C in port/src/ou_recompiled_crc.c is a mechanical translation of the 19 reachable "
                     "A32 instructions of one leaf routine, and it returns the same r0 as the original "
                     "machine code under Unicorn for every test vector on a shared guest memory image.",
            "not_claimed": [
                "This is one routine of 80 bytes. It is not the game, not libOrderUp.so, and not a port.",
                "tools/recompile_crc.py is not a general A32 translator. It handles a small whitelist of "
                "instruction forms and refuses everything else.",
                "Equivalence is tested, not formally verified. The corpus is finite.",
                "The C performs no bounds checks on guest addresses, like the original code.",
                "Flags n and v are not computed because no translated condition reads them.",
                "Logical operations with the S suffix, stores, calls, stack use, Thumb, and NEON are unsupported.",
            ],
        },
        "source": {
            "elf": str(rc.DEFAULT_ELF.relative_to(ROOT)),
            "sha256": h.elf.sha256 if h else None,
            "symbol": rc.SYMBOL,
            "demangled": rc.DEMANGLED,
            "vaddr": hx(rc.ENTRY),
            "size": rc.SIZE,
            "symbol_table_agrees": (h.elf.symbol(rc.SYMBOL) == (rc.ENTRY, rc.SIZE)) if h else None,
        },
        "generated_files": {
            "c": str(SOURCE_C.relative_to(ROOT)),
            "h": str(SOURCE_H.relative_to(ROOT)),
            "c_sha256": hashlib.sha256(SOURCE_C.read_bytes()).hexdigest() if SOURCE_C.exists() else None,
            "h_sha256": hashlib.sha256(SOURCE_H.read_bytes()).hexdigest() if SOURCE_H.exists() else None,
            "reproducible": (SOURCE_C.read_text() == h.tr.c_source and SOURCE_H.read_text() == h.tr.h_source) if h else None,
            "entry_api": "uint32_t ou_recompiled_crc(const unsigned char *memory, uint32_t string_address, uint32_t initial_crc)",
        },
        "static_translation": report,
        "build": {
            "compiler": compiler_version(),
            "host": platform.platform(),
            "flags": CFLAGS,
            "variants": BUILD_VARIANTS,
            "log": h.compile_log if h else None,
        },
        "dynamic_equivalence": {
            "emulator": "unicorn %s (UC_ARCH_ARM, UC_MODE_ARM)" % unicorn.__version__,
            "disassembler": "capstone %s" % capstone.__version__,
            "memory_layout": {
                "image_size": hx(IMAGE_SIZE),
                "elf_segments_at_vaddr": True,
                "string_scratch": [hx(STRING_BASE), hx(STRING_LIMIT)],
                "stack_top_unused": hx(STACK_TOP),
                "return_sentinel_lr": hx(RETURN_SENTINEL),
                "initial_registers": "r0 = string_address, r1 = initial_crc, r2..r12 = 0, lr = sentinel",
                "initial_flags": "not significant: the first instruction (subs) writes every flag",
            },
            "vectors_total": len(rows),
            "mismatches": sum(1 for r in rows if not r["equal"]),
            "random_seed": RANDOM_SEED,
            "categories": categories,
            "instructions_executed_total": h.instructions_executed if h else None,
            "optimization_levels_agree": (h.optimization_disagreements == 0) if h else None,
            "zlib_crosscheck_vectors": getattr(h, "zlib_checked", None),
            "table_corruption_tracks_memory": getattr(h, "table_corruption_tracked", None),
            "coverage": {
                "translated": [hx(a) for a in translated],
                "executed": [hx(a) for a in sorted(h.executed)] if h else [],
                "all_translated_executed": (set(translated) <= h.executed) if h else None,
                "executed_outside_translation": [hx(a) for a in sorted(h.executed - set(translated))] if h else None,
            },
            "guest_reads": {
                "literal": h.reads["literal"] if h else None,
                "table": h.reads["table"] if h else None,
                "string": h.reads["string"] if h else None,
                "other": [[hx(a), s] for a, s in h.reads["other"][:20]] if h else None,
                "table_read_range": [hx(v) for v in h.table_read_range] if h and h.table_read_range[0] is not None else None,
            },
        },
        "negative_generation_tests": getattr(h, "negative", None),
        "test_results": {
            "runner": "unittest",
            "tests_run": result.testsRun,
            "passed": sum(1 for rec in result.records if rec["status"] == "pass"),
            "failed_or_errored": failed,
            "records": result.records,
        },
    }
    return proof


def main(argv):
    write_proof = "--no-proof" not in argv
    argv = [a for a in argv if a != "--no-proof"]
    verbosity = 2 if "-v" in argv else 1
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=verbosity, resultclass=RecordingResult)
    result = runner.run(suite)
    if write_proof:
        proof = build_proof(result)
        PROOF_PATH.parent.mkdir(parents=True, exist_ok=True)
        PROOF_PATH.write_text(json.dumps(proof, indent=2) + "\n")
        print("proof written to %s (status %s)" % (PROOF_PATH, proof["status"]))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
