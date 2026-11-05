// Original Android 1.65 tutorial FSM. Symbols/structure offsets refer to the
// manifest-pinned libOrderUp.so; the executable and save data are not patched.
const states = new Set([
  0xf40fc165, 0x33adb836, 0x0be459d9, 0x746c198d, 0x0d5b791d,
  0x03b07c99, 0x8bc49266, 0xb477bf5c, 0x84fa0954, 0xf84e108c,
  0x3953d848, 0x011a39a7, 0x3ae4315c, 0xba9b9cc7, 0xd3430093,
  0x5dc04f9d, 0x4e0e3d68, 0x4763edd4, 0x2b023641, 0xd7076cd2,
  0x433b6c74, 0xb34121a9, 0x4c0e05b7, 0x0607d366, 0x4fce6aee,
  0x7c0de356, 0xa7a2094e
]);

export function createTutorialSkipper(runtime) {
  const r = runtime;
  const managerAddress = r.elf.address('_ZN10Restaurant9g_ManagerE');
  const fsmAddress = r.elf.address('_ZN13StateFunction23g_state_machine_elementE');
  let exiting = false;
  function current() {
    const manager = r.u32(managerAddress), restaurant = manager && r.u32(manager + 0x1c);
    const data = restaurant && r.u32(restaurant + 0x49c);
    // Check the live restaurant before touching the global FSM, which can
    // outlive its scene. Other restaurant tips and minigames are not this FSM.
    if (!data || !r.u8(data + 0x25) || r.str(r.u32(restaurant + 0x14)) !== 'fastfood') return null;
    const fsm = r.u32(fsmAddress), state = fsm && r.u32(fsm + 0x14);
    return state && states.has(r.u32(state)) ? {manager, restaurant, fsm} : null;
  }
  return {
    active() {
      const value = current();
      if (!value) exiting = false;
      return !!value && !exiting;
    },
    // Called only between completed frames, serialized with input and saves.
    async skip() {
      const value = current();
      if (!value || exiting) return false;
      const {manager, restaurant, fsm} = value;
      r.beginJNIFrame();
      try {
        await r.call('_ZN13StateFunction10dialog_endEv');
        const assistant = await r.call('_ZN10Restaurant7Manager18GetBoughtAssistantEi', [manager, 0]);
        // The opening dialogue normally hires this temporary assistant. The
        // native exit path expects its model even if the player skips early.
        if (!assistant) await r.call('_ZN10Restaurant7Manager12BuyAssistantE10checksum32i', [manager, 0x116598ab, 0]);
        const crc = r.malloc(4);
        try {
          r.u32(crc, 0xa7a2094e); // State_TutorialEndOfDay marks TutorialSetFinished.
          const changed = await r.call('_ZN3Obj19StateMachineElement8SetStateERKjbb', [fsm, crc, 1, 1]);
          if (!changed) throw Error('The tutorial could not finish.');
        } finally { r.free(crc); }
        await r.call('_ZN10Restaurant9KitchenUI7SetModeENS_11KitchenModeEib', [r.elf.address('_ZN10Restaurant8Instance11s_KitchenUIE'), 0, 0xffffffff, 0]);
        await r.call('_ZN10Restaurant7Manager13FireAssistantE10checksum32', [manager, 0x116598ab]);
        // Mark the farewell dialogue handled through its original handler,
        // then cancel its delayed notification before the scene is destroyed.
        await r.call('_ZN13StateFunction19AssistantManagerFsm17handle_end_of_dayEPN3Obj6ObjectEPNS1_19StateMachineElementEPvS6_', [r.u32(fsm + 4), fsm, 0, 0]);
        await r.call('_ZN13StateFunction10dialog_endEv');
        const timers = r.u32(r.elf.address('_ZN3Tmr14g_TimerManagerE'));
        const callback = r.elf.address('_ZN13StateFunction13timer_expiredEjPvjj');
        // TimerManager's intrusive list; Destroy only marks timers for removal.
        // Restrict cleanup to this tutorial's native callback, leaving music,
        // animation, autosave, and unrelated script timers alone.
        const head = timers + 4, seen = new Set();
        for (let node = r.u32(head); node && node !== head; node = r.u32(node)) {
          if (seen.has(node) || seen.size >= 4096) throw Error('Invalid tutorial timer list.');
          seen.add(node);
          const timer = r.u32(node + 4);
          if (timer && r.u32(timer + 0xc) === callback) await r.call('_ZN3Tmr9GameTimer7DestroyEv', [timer]);
        }
        await r.call('_ZN10Restaurant9DriveThru21TutorialSpawnCustomerEi10checksum32', [restaurant, 0, 0]);
        await r.call('_ZN10Restaurant9DriveThru14DestroyVehicleEv', [restaurant]);
        await r.call('_ZN10Restaurant9DriveThru21AllowTutorialEndOfDayEb', [restaurant, 1]);
        exiting = true;
        return true;
      } finally { r.endJNIFrame(); }
    }
  };
}
