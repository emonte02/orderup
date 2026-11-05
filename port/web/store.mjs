// Original Android product IDs; fulfillment stays inside the local game engine.
// The Android store layout associates these legacy image names with these SKUs.
const goldPacks = [[10, 12], [30, 28], [100, 72], [300, 150], [900, 310], [2000, 800]].map(([amount, image]) => ({
  id: 'gold_coins_' + amount,
  title: amount.toLocaleString('en-US') + ' Gold Coins',
  label: amount.toLocaleString('en-US'),
  image: 'iap_' + image + 'coins',
}));
const silverUpgrades = [
  {id: 'doublesilver5', title: 'Double Silver Coins - 5 Shifts', label: '5 shifts', image: 'iap_doublecoins_5days'},
  {id: 'doublesilver15', title: 'Double Silver Coins - 15 Shifts', label: '15 shifts', image: 'iap_doublecoins_15days'},
  {id: 'doublesilver0', title: 'Double Silver Coins - Permanent', label: 'Permanent', image: 'iap_doublecoins_infinite_alt'},
];
const products=[...goldPacks,...silverUpgrades];
const nativePrefix='Java_com_svsgames_orderup_OrderUpJNILib_';
const pendingOperations = new WeakMap();

// Called only while the frame controller is paused. Use the same fulfillment
// callback as Android billing, with a scoped JNI string and no billing SDK/network.
export async function purchaseCoins(runtime,id){
 if(!products.some(product=>product.id===id))throw Error('Unknown coin product: '+id);
 runtime.beginJNIFrame();
 try{
  const sku=runtime.jobject({kind:'string',value:'com.svs.orderup.'+id});
  await runtime.call(runtime.elf.address(nativePrefix+'playTrack'),[runtime.jniEnv,0,sku]);
 }finally{runtime.endJNIFrame();}
}

export async function showCoinStore(state, dialog, body, silverOnly, icon, onError) {
  if (!dialog.open) return;
  const close = dialog.querySelector('#notice-close');
  const preventCancel = event => event.preventDefault();
  function lock() {
    pendingOperations.set(dialog, (pendingOperations.get(dialog) || 0) + 1);
    close.disabled = true;
    dialog.addEventListener('cancel', preventCancel);
  }
  function unlock() {
    const remaining = pendingOperations.get(dialog) - 1;
    pendingOperations.set(dialog, remaining);
    close.disabled = remaining > 0;
    dialog.removeEventListener('cancel', preventCancel);
  }

  const menu = document.createElement('div');
  menu.className = 'coin-menu';
  body.replaceChildren(menu);
  let permanent;
  lock();
  try {
    await state.controller.pause();
    if (state.state !== 'paused' || !menu.isConnected || !dialog.open) return;
    permanent = await state.runtime.call(nativePrefix + 'getPermanentDoubleSilverCoins', [state.runtime.jniEnv, 0]);
  } finally {
    unlock();
  }

  let purchased = false;
  async function buyProduct(product) {
    if (purchased || !dialog.open || !menu.isConnected || state.state !== 'paused') return;
    purchased = true;
    for (const button of menu.querySelectorAll('button')) button.disabled = true;
    lock();
    try {
      await purchaseCoins(state.runtime, product.id);
      await state.flushSaves();
      if (dialog.open && menu.isConnected) {
        const receipt = document.createElement('p');
        receipt.className = 'purchase-receipt';
        receipt.setAttribute('role', 'status');
        receipt.append(icon(product.image), product.title + ' purchased.');
        body.replaceChildren(receipt);
        body.scrollTop = 0;
      }
    } catch (error) {
      onError(error);
    } finally {
      unlock();
      if (dialog.open) close.focus({preventScroll: true});
    }
  }

  const sections = silverOnly ? [] : [['Gold coins', goldPacks]];
  sections.push(['Double silver coins', silverUpgrades]);
  for (const [heading, offers] of sections) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = heading;
    const list = document.createElement('ul');
    list.className = 'coin-options';
    for (const product of offers) {
      const row = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = product.label;
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.dataset.product = product.id;
      buy.disabled = Boolean(permanent && offers === silverUpgrades);
      buy.textContent = buy.disabled ? 'Owned' : 'Buy';
      buy.setAttribute('aria-label', buy.textContent + ' ' + product.title);
      buy.addEventListener('click', () => buyProduct(product));
      row.append(icon(product.image), label, buy);
      list.append(row);
    }
    section.append(title, list);
    menu.append(section);
  }
}
