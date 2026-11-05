/** Per-browser player preference, independent of the original encrypted saves. */
export const tutorialPreferenceKey = 'orderup-skip-tutorial';

export function readTutorialPreference(storage) {
  try { return storage.getItem(tutorialPreferenceKey) === 'true'; }
  catch { return false; }
}

export function writeTutorialPreference(storage, skip) {
  try { storage.setItem(tutorialPreferenceKey, String(skip)); return true; }
  catch { return false; }
}

/** Clicks enqueue intent; only the frame loop may enter the original engine. */
export function createTutorialControls({overlay, skipButton, preferenceButton, state, say, storage, tutorial}) {
  let skip = readTutorialPreference(storage), requested = false, busy = false;
  function render() {
    preferenceButton.setAttribute('aria-pressed', String(skip));
    preferenceButton.textContent = skip ? 'Tutorial: skip' : 'Tutorial: play';
    preferenceButton.disabled = busy;
    skipButton.disabled = busy;
    skipButton.textContent = busy ? 'Skipping…' : 'Skip tutorial';
    overlay.hidden = state.state !== 'running' || !tutorial.active();
  }
  function remember(value) {
    skip = value;
    const saved = writeTutorialPreference(storage, value);
    say(saved ? (value ? 'Tutorials will be skipped on this browser.' : 'The tutorial will play next time.') : 'This browser could not save your tutorial preference. It applies for this visit.');
    render();
  }
  skipButton.addEventListener('click', () => { requested = true; });
  preferenceButton.addEventListener('click', () => remember(!skip));
  render();
  return {
    hide() { overlay.hidden = true; },
    async afterFrame({releaseInput=async()=>{state.input=[];}}={}) {
      if (state.state !== 'running') { render(); return; }
      if (!tutorial.active()) { requested = false; render(); return; }
      if (!requested && !skip) { render(); return; }
      busy = true; render();
      try {
        await releaseInput();
        if (await tutorial.skip()) { requested = false; if (!skip) remember(true); }
      } finally { busy = false; render(); }
    }
  };
}
