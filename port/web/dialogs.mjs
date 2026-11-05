import {readStoredFiles} from './runtime/zip.mjs';

// Drawable names from the original Android achievement list, in game ID order.
const badges = [
  'perfect4', 'patronpleaser', 'impressiveindeed', 'firefighter', 'pestcontrol',
  'squeakyclean', 'spicemerchant', 'piggybank', 'moneybags', 'fullmenu',
  'golden', 'startingyourempire', 'greasejockey', 'onaroll', 'spotless',
  'dusty', 'steakula', 'specialtreatment', 'makingthegrade', 'spicemaster',
  'fastfood', 'headlines', 'hiredhelp', 'monkeybusiness', 'dozen',
  'specialtreatment', 'pepperchop', 'knifeskills', 'chefdecuisine', 'exceptionalcuisine',
];

// The verified APK is already in memory. Open its drawable directory on first
// use and share each image URL for the lifetime of this game document.
export function createDialogIcons(apk) {
  let files;
  const urls = new Map();
  return function icon(resource) {
    const image = document.createElement('img');
    image.alt = '';
    files ??= readStoredFiles(apk, name => name.startsWith('res/drawable/') && name.endsWith('.png'));
    const bytes = files.get('res/drawable/' + resource + '.png');
    if (bytes) {
      if (!urls.has(resource)) urls.set(resource, URL.createObjectURL(new Blob([bytes], {type: 'image/png'})));
      image.src = urls.get(resource);
    } else {
      image.hidden = true;
    }
    return image;
  };
}

function achievementIcon(icon, id) {
  return icon('icon_achievements_crystal_' + badges[id - 13]);
}

export function renderAchievements(body, summary, achievements, unlockedIds, icon) {
  const unlocked = new Set(unlockedIds);
  const items = achievements.length ? achievements : badges.map((_, index) => ({
    id: index + 13, title: 'Achievement ' + (index + 1), description: '',
  }));
  const count = items.filter(item => unlocked.has(item.id)).length;
  summary.textContent = count + ' of ' + items.length + ' unlocked';
  const list = document.createElement('ol');
  list.className = 'achievement-list';
  for (const item of items) {
    const earned = unlocked.has(item.id);
    const row = document.createElement('li');
    row.dataset.earned = String(earned);
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.description;
    copy.append(title, description);
    const status = document.createElement('span');
    status.className = 'achievement-state';
    status.textContent = earned ? 'Unlocked' : 'Locked';
    row.append(achievementIcon(icon, item.id), copy, status);
    list.append(row);
  }
  body.replaceChildren(list);
}

export function renderAchievementToast(status, id, title, icon) {
  const text = document.createElement('span');
  const label = document.createElement('strong');
  label.textContent = 'Achievement unlocked ';
  text.append(label, title);
  status.replaceChildren(achievementIcon(icon, id), text);
}
