#!/usr/bin/env python3
"""Reference outputs from original ARM leaf functions, for the browser CPU probe."""
from pathlib import Path
import json, struct
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM
from unicorn.arm_const import *
ROOT = Path(__file__).resolve().parents[1]
uc = Uc(UC_ARCH_ARM, UC_MODE_ARM)
uc.mem_map(0, 8 * 1024 * 1024)
uc.mem_write(0, (ROOT / 'port/build/crc-guest-image.bin').read_bytes())
uc.reg_write(UC_ARM_REG_C1_C0_2, 0x00f00000)
uc.reg_write(UC_ARM_REG_FPEXC, 0x40000000)
obj, stop = 0x700000, 0x7f0000
f32 = lambda f: struct.pack('<f', f)
u32 = lambda b: struct.unpack('<I', b)[0]
cases = []
values = [0.0, 0.125, -0.75, 1.0, 1.5, -2.5, 123.25, 0.0001]
for index, x in enumerate(values):
    y = values[(index + 3) % len(values)]
    plans = [
        ('Menu::ProgressBar::compute_progress_dims()', 0x2b14ac, [obj], [(0x1c0, f32(x)), (0x78, f32(y)), (0x7c, f32(17.25))], [(0x18c, 8)]),
        ('Menu::Element::GetEffectiveLocalRotation()', 0x2b02d0, [obj], [(0x70, f32(x)), (0xf0, f32(y))], []),
        ('Obj::SimpleActorPhysicsElement::SetMass(float)', 0x3166f4, [obj, u32(f32(x))], [], [(0x118, 8)]),
        ('Gfx::Manager3D::GetFPS() const', 0x35f5a0, [obj], [(0x568, struct.pack('<I', [0,1,2,3,16,33,1000,0xffffffff][index]))], []),
        ('Obj::IngredientElement::Cook(int, float)', 0xf0f08, [obj, index, u32(f32(x))], [(12 + index*4, f32(y))], [(12 + index*4, 4)]),
    ]
    for name, entry, args, writes, reads in plans:
        uc.mem_write(obj, bytes(4096))
        uc.reg_write(UC_ARM_REG_CPSR, 0x10)
        uc.reg_write(UC_ARM_REG_FPSCR, 0)
        for i, reg in enumerate([UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3]):
            uc.reg_write(reg, args[i] if i < len(args) else 0)
        for offset, data in writes:
            uc.mem_write(obj + offset, data)
        uc.reg_write(UC_ARM_REG_LR, stop)
        uc.emu_start(entry, stop, count=1000)
        assert uc.reg_read(UC_ARM_REG_PC) == stop
        cases.append(dict(name=name, entry=entry, args=args,
            writes=[dict(address=obj+o, hex=b.hex()) for o,b in writes],
            reads=[dict(address=obj+o, hex=bytes(uc.mem_read(obj+o,n)).hex()) for o,n in reads],
            expected_r0=uc.reg_read(UC_ARM_REG_R0)))
(ROOT / 'analysis/arm-vfp-probe-vectors.json').write_text(json.dumps(cases, indent=2)+'\n')
print(f'Wrote {len(cases)} original-ARM VFP reference cases across five leaf functions.')
