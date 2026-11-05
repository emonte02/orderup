/** Clicks enqueue intent; only the frame loop may enter the original engine. */
const preferenceKey = 'orderup-skip-tutorial';
export function createTutorialControls({overlay, skipButton, state, tutorial, storage}) {
  let remembered = false, requested = false, busy = false;
  try { remembered = storage?.getItem(preferenceKey) === 'true'; } catch {}
  function render() {
    skipButton.disabled = busy;
    skipButton.textContent = 'Skip Tutorial';
    overlay.hidden = busy || remembered || state.state !== 'running' || !tutorial.active();
  }
  skipButton.addEventListener('click', () => {
    if (!busy && state.state === 'running' && tutorial.active()) requested = true;
  });
  render();
  return {
    hide() { overlay.hidden = true; },
    async afterFrame({releaseInput=async()=>{state.input=[];}}={}) {
      if (state.state !== 'running') { render(); return; }
      if (!tutorial.active()) { requested = false; render(); return; }
      if (!requested && !remembered) { render(); return; }
      requested = false; busy = true; render();
      try {
        await releaseInput();
        if (await tutorial.skip()) {
          remembered = true;
          try { storage?.setItem(preferenceKey, 'true'); } catch {}
        }
      } finally { busy = false; render(); }
    }
  };
}
