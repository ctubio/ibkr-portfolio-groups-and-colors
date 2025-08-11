async function promiseWrapper(options, callback) {
  return new Promise((resolve, reject) => {
    try {
      callback(options, resolve)
    } catch (err) {
      reject(err)
    }
  })
}

function setStorage(options, resolve) {
    chrome.storage.local.set(options, () => resolve())
}

function getStorage(collection, resolve) {
    chrome.storage.local.get(collection, (data) => resolve(data))
}

function getStyleForTicker(conid) {
  if (!document.querySelector('style#rules_' + conid)) {
    const styleEl = document.createElement("style");
    styleEl.type = 'text/css';
    styleEl.id = 'rules_' + conid;
    document.head.appendChild(styleEl);
  }

  return document.querySelector('style#rules_' + conid).sheet;
}

function applyCssRule(conid, index, rule) {
  const sheet = getStyleForTicker(conid);
  if (sheet.cssRules.length > index)
    sheet.deleteRule(index);
  sheet.insertRule(rule, index);
}

function applyColorForTicker(conid, color) {
  applyCssRule(conid, 0, 'td[conid="'+conid+'"] { color:'+(color?color:'inherit')+'; }');
}

function applyDisplayForTicker(conid, display) {
  applyCssRule(conid, 1, 'tbody:has(td[conid="'+conid+'"]) { display:'+display+'; }');
}

function applyOpacityForTicker(conid, opacity) {
  applyCssRule(conid, 2, 'td[conid="'+conid+'"] { opacity:'+(opacity == 'none' ? '0.7' : '1')+'; }');
}

async function setColorForTicker(conid, ticker) {
  var data = await promiseWrapper(ticker, getStorage);

  applyColorForTicker(conid, data[ticker]);
}

async function setDisplayForTicker(conid, ticker, store) {
  var data = await promiseWrapper(ticker, getStorage);

  var display = "table-row-group";

  if (!data[ticker]) data[ticker] = display;

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  if (view['viewMode'] == 1) display = data[ticker];
  else if (view['viewMode'] == 2) display = data[ticker] == 'none' ? display : 'none';

  applyDisplayForTicker(conid, display);

  applyOpacityForTicker(conid, data[ticker]);
}

async function setNextColorForTicker(conid, ticker) {
  const all = ["rgb(159, 27, 27)", "rgb(18, 220, 18)", "rgb(0, 167, 255)", "rgb(163, 104, 14)", "inherit"];

  const old_data = await promiseWrapper(ticker, getStorage);

  const prev_i = all.indexOf(old_data[ticker]);

  const next_color = all[(prev_i + 1) % all.length];

  var data = {};
  data[ticker] = next_color;

  await promiseWrapper(data, setStorage)

  applyColorForTicker(conid, data[ticker]);
}

async function setNextDisplayForTicker(conid, ticker) {
  const all = ["none", "table-row-group"];

  const data = await promiseWrapper(ticker, getStorage);

  const prev_i = all.indexOf(data[ticker]);

  const next_display = all[(prev_i + 1) % all.length];

  var next_data = {};
  next_data[ticker] = next_display;

  await promiseWrapper(next_data, setStorage)

  await setDisplayForTicker(conid, ticker, true);

  await enhanceCounter();
}

async function enhanceCounter() {
  var collapsed = total = 0;
  var timeout;

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  document.querySelectorAll('td[conid]').forEach(async (td) => {
    const span = td.querySelector('span.text-semibold');
    if (!span) return;
    const ticker = span.innerText.trim();
    if (!ticker) return;

    total++;
    const data = await promiseWrapper(ticker+'_view', getStorage);
    collapsed += +(data[ticker+'_view'] == 'none');

    clearTimeout(timeout);
    timeout = setTimeout(() => {
      document.querySelectorAll('span#toggleCustomViewTotal').forEach((span) => {
        span.innerText = ' '+total.toString()+' ';
      });
      document.querySelectorAll('span#toggleCustomView').forEach((span) => {
        span.innerHTML = 'of <span class="'+(view['viewMode'] != 2?'fg-accent':'')+'"><strong>'
          + (total-collapsed).toString()
          + '</strong> Growth Positions</span> and <span class="'+(view['viewMode'] != 1?'fg-accent':'')+'"><strong>'
          + collapsed.toString()+'</strong> High-Yield Dividend Positions</span>';
      });
    }, 100);
  });
}

var timeOut;
async function enhanceTickers() {
  if (!document.querySelector('span#toggleCustomView')) {
    const div = document.querySelector('div.ptf-positions');
    if (!div) return

    const h3 = div.firstChild.firstChild.firstChild;

    if (!h3 || h3.innerText.split(" ").slice(0,2).join(" ") != "Your Holdings") return;

    h3.innerHTML = h3.innerText.split(" ").slice(0,2).join('<span id="toggleCustomViewTotal"> </span>') + ' <span id="toggleCustomView" style="font-size: 16px;font-weight: normal;cursor:pointer;"></span>';

    document.querySelector('span#toggleCustomView').addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.getSelection().removeAllRanges()

      var view = await promiseWrapper('viewMode', getStorage);
      if (!view['viewMode']) view['viewMode'] = 0;

      view['viewMode'] = (view['viewMode'] + 1) % 3;

      setTimeout(async () => { await enhanceCounter(); }, 1);

      await promiseWrapper(view, setStorage)

      document.querySelectorAll('td[conid]').forEach(async (td) => {
        const span = td.querySelector('span.text-semibold');
        if (!span || !td.dataset.enhanced) return;
        const ticker = span.innerText.trim();
        if (!ticker) return;
        await setDisplayForTicker(td.attributes.conid.value, ticker + "_view", false);
      });
    });
  }

  document.querySelectorAll('td[conid]').forEach(async (td) => {
    const span = td.querySelector('span.text-semibold');
    if (!span || td.dataset.enhanced) return;

    const ticker = span.innerText.trim();
    if (!ticker) return;
    td.dataset.enhanced = "true";

    await setColorForTicker(td.attributes.conid.value, ticker + "_color");
    await setDisplayForTicker(td.attributes.conid.value, ticker + "_view", true);

    clearTimeout(timeOut);
    timeOut = setTimeout(async () => {
      await enhanceCounter();
    }, 400);

    span.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.getSelection().removeAllRanges();
      const _td = e.target.parentNode.parentNode.parentNode;
      const _ticker = e.target.innerText.trim();
      if (e.detail === 1) {
        timeOut = setTimeout(async () => {
          await setNextColorForTicker(_td.attributes.conid.value, _ticker + "_color");
        }, 400);
      }
      if (e.detail === 2) {
        clearTimeout(timeOut);
        await setNextDisplayForTicker(_td.attributes.conid.value, _ticker + "_view");
      }
    });
  });

}

const observer = new MutationObserver(() => {
  enhanceTickers();
});
observer.observe(document.body, { childList: true, subtree: true });
