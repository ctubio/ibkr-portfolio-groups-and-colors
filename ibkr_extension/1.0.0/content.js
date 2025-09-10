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

function transformCopyPaste(val) {
  const bought = val.match(/([\S|\n|\s]*)\n\t?(\S+)\nBot( \d+ @ [\.|\d]+ )on \S+\n\t?\S+[\t|\s]Bought[\t|\s]\d+[\t|\s]\nFilled\n[\d|:|/|,| ]+ \S+\n\t?[\d+|\.]+[\t|\s]\n([\d+|\.]+)\nFees: ([\d+|\.]+)\n*([\S|\n|\s]*)/);
  if (bought) {
    return bought[1].trim() + "\n" + "\n" + bought[2] + bought[3] + "-" + (parseFloat(bought[4]) + parseFloat(bought[5])).toString() + "\n" + bought[6];
  } else {
    const sold = val.match(/([\S|\n|\s]*)\n\t?(\S+)\nSold( \d+ @ [\.|\d]+ )on \S+\n\t?\S+[\t|\s]Sold[\t|\s]\d+[\t|\s]\nFilled\n[\d|:|/|,| ]+ \S+\n\t?[\d+|\.]+[\t|\s]\n([\d+|\.]+)\nFees: ([\d+|\.]+)\n*([\S|\n|\s]*)/);
    if (sold) {
      return sold[1].trim() + "\n" + "\n" + sold[2] + sold[3] + "+" + (parseFloat(sold[4]) - parseFloat(sold[5])).toString() + "\n" + sold[6];
    }
  }
  return '';
}

var timeOut, timeOut2;
async function enhanceTickers() {
  if (!document.querySelector('textarea#calcNotes')) {
    clearTimeout(timeOut2);
    timeOut2 = setTimeout(async () => {
      if (!document.querySelector('textarea#calcNotes')) {

        if (document.querySelector('h1') && document.querySelector('h1').innerText == 'Orders & Trades') {
          document.querySelectorAll('table tr._tbgr').forEach(async (tr) => {
            tr.addEventListener("click", async (e) => {
              e.stopPropagation();
              e.preventDefault();
              var next_trade = {};
              next_trade['copypaste'] = tr.innerText.trim();
              await promiseWrapper(next_trade, setStorage)
              window.location.replace('#/dashboard/positions');
            });
          });
        }

        const sdiv = document.querySelector('div.tws-shortcuts');
        if (!sdiv) return

        var data = await promiseWrapper('calcNotes', getStorage);
        if (!data['calcNotes']) data['calcNotes'] = '';

        const text = document.createElement("textarea");
        text.id = 'calcNotes';
        text.spellcheck = false;
        text.value = data['calcNotes'];

        var copypaste = await promiseWrapper('copypaste', getStorage);
        if (!copypaste['copypaste']) copypaste['copypaste'] = '';
        if (copypaste['copypaste'].length) {
          if (!text.value || text.value[text.value.length-1] != "\n") text.value += "\n";
          const transform = transformCopyPaste(text.value+copypaste['copypaste']);
          if (transform) {
            text.value = transform .trim()+ "\n";
            var next_data = {};
            next_data['calcNotes'] = text.value;
            await promiseWrapper(next_data, setStorage)
            var next_trade = {};
            next_trade['copypaste'] = '';
            await promiseWrapper(next_trade, setStorage)
          }
        }

        text.style = 'width: 90%;text-transform: uppercase;opacity: 0.4;margin-left: 20px;height: 180px;font-size: 21px;background: transparent;border: 0px!important;outline-width: 0px !important;color: inherit;';
        sdiv.after(text);
        text.addEventListener("keyup", async (e) => {
          var val = e.target.value;
          if (val.indexOf('Bought') != val.indexOf('Filled')) {
            const transform = transformCopyPaste(val);
            if (transform) {
              e.target.value = val = transform;
            }
          }
          var next_data = {};
          next_data['calcNotes'] = val;
          await promiseWrapper(next_data, setStorage)
        })

        if (document.querySelector('.account-alias__container__account-values')) {
          document.querySelectorAll('.account-alias__container__account-values span').forEach((span) => {
            if (span.className.indexOf('numeric')==-1)
              span.style.fontSize = '1.425rem';
            // span.style.fontWeight = '600';
          });
        }

        if (document.querySelector('.tws-shortcuts button:last-of-type')) {
          const trades = document.createElement("button");
          trades.innerHTML = '<span><p>Trades</p></span>';
          trades.type = 'button';
          trades.className = document.querySelector('.tws-shortcuts button:last-of-type').className.replace(' tws-skeleton', '');
          document.querySelector('.tws-shortcuts button:last-of-type').after(trades);
          trades.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            window.location.replace('#/orders/trades');
          });
        }

      }
    }, 100);
  }

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
