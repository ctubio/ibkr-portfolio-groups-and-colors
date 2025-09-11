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
    if (parseFloat(bought[3]).toString().length<3) {
      bought[3] = " ".repeat(3-parseFloat(bought[3]).toString().length) + bought[3];
    }
    return bought[1].trim() + "\n" + "\n" + bought[2] + bought[3] + "-" + (parseFloat(bought[4]) + parseFloat(bought[5])).toString() + "\n" + bought[6];
  } else {
    const sold = val.match(/([\S|\n|\s]*)\n\t?(\S+)\nSold( \d+ @ [\.|\d]+ )on \S+\n\t?\S+[\t|\s]Sold[\t|\s]\d+[\t|\s]\nFilled\n[\d|:|/|,| ]+ \S+\n\t?[\d+|\.]+[\t|\s]\n([\d+|\.]+)\nFees: ([\d+|\.]+)\n*([\S|\n|\s]*)/);
    if (sold) {
      if (parseFloat(sold[3]).toString().length<3) {
        sold[3] = " ".repeat(3-parseFloat(sold[3]).toString().length) + sold[3];
      }
      return sold[1].trim() + "\n" + "\n" + sold[2] + sold[3] + "+" + (parseFloat(sold[4]) - parseFloat(sold[5])).toString() + "\n" + sold[6];
    }
  }
  return '';
}

var timeOut, timeOut2;
// var prices = {};
var col1, col2, col3;
async function enhanceTickers(records) {
  /*if (col1 && col2 && col3) {
    const grid1 = document.querySelectorAll("div.ptf-positions table td:nth-child("+col2+") span");
    const grid2 = document.querySelectorAll("div.ptf-positions table td:nth-child("+col3+") span, div.ptf-positions table td:nth-child("+col1+") span");
    if (grid1 && grid2) {
      for (const r of records) {
        grid1.forEach((td) => {
          if (td === r.target) {
            var num = (r.addedNodes[0].data || '').replace('C', '').replace('F', '');
            if (!Number(num)) return;
            var newNum = parseFloat(num);
            var oldNum = prices[r.target.parentNode.parentNode.parentNode.querySelectorAll('td')[1].innerText.trim()] || 0;
            r.target.classList.remove("flash-green", "flash-red");
            // void r.target.offsetWidth;
            if (newNum && oldNum) {
              if (newNum > oldNum) {
                r.target.classList.add("flash-green");
              } else if (newNum < oldNum) {
                r.target.classList.add("flash-red");
              }
            }
            prices[r.target.parentNode.parentNode.parentNode.querySelectorAll('td')[1].innerText.trim()] = newNum;
          }
        })
        grid2.forEach((td) => {
          if (td === r.target) {
            var num = r.addedNodes[0].data.replace('C', '').replace('F', '');
            if (!Number(num)) return;
            // r.target.classList.remove("flash-green", "flash-red");
            r.target.parentNode.classList.remove("fade-opacity");
            // void r.target.offsetWidth;

            // if (r.addedNodes[0].data && r.removedNodes[0].data) {
              // if (r.addedNodes[0].data > r.removedNodes[0].data) {
                // r.target.classList.add("flash-green");
              // } else if (r.addedNodes[0].data < r.removedNodes[0].data) {
                // r.target.classList.add("flash-red");
              // }
            // }

            r.target.parentNode.style.opacity = 0.8;
            requestAnimationFrame(() => {
              r.target.parentNode.classList.add("fade-opacity");
            });

          }
        })
      }
    }
  }*/

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

        text.style = 'width: 90%;text-transform: uppercase;opacity: 0.4;margin-left: 20px;height: 200px;font-size: 21px;background: transparent;border: 0px!important;outline-width: 0px !important;color: inherit;';
        sdiv.after(text);
        text.addEventListener("keyup", async (e) => {
          var val = e.target.value;
          // if (val.indexOf('Bought') != val.indexOf('Filled')) {
            // const transform = transformCopyPaste(val);
            // if (transform) {
              // e.target.value = val = transform;
            // }
          // }
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

        if (!document.querySelector('style#flashprices')) {
          document.querySelectorAll('div.one-head-menu button').forEach((b) => {
            if (b.innerText.trim() == 'IBKR ForecastTrader') b.remove();
            else if (b.innerText.trim() == 'Get Help') b.remove();
          })
          if (document.querySelector('div.feedbackApp')) {
            document.querySelector('div.feedbackApp').closest('section').remove()
          }
          document.querySelectorAll('.bar3-logo, footer, div.nav-container button[aria-label="Portfolio"], div.nav-container button[aria-label="Research"], div.nav-container button[aria-label="Transfer & Pay"], div.nav-container button[aria-label="Trade"], div.nav-container button[aria-label="Education"], div.nav-container button[aria-label="Performance & Reports"]').forEach((b) => {
            b.remove();
          })
          var ith = 2;
          document.querySelectorAll('div.ptf-positions table th').forEach((th) => {
            if (th.innerText.trim() == 'ASK') {col1 = ith;}
            else if (th.innerText.trim() == 'LAST') {col2 = ith;}
            else if (th.innerText.trim() == 'BID') {col3 = ith;}
            ith++;
          });
          const styleEl = document.createElement("style");
          styleEl.type = 'text/css';
          styleEl.id = 'flashprices';
          document.head.appendChild(styleEl);
          if (col1 && col2 && col3) {
            // styleEl.sheet.insertRule("div.ptf-positions table td:nth-child("+col2+") span {transition: color 1s ease;}", styleEl.sheet.cssRules.length);
            styleEl.sheet.insertRule("div.ptf-positions table td:nth-child("+col1+") div, div.ptf-positions table td:nth-child("+col3+") div {opacity:0.6;}", styleEl.sheet.cssRules.length);
          }
          styleEl.sheet.insertRule("div.bid-ask-yield span {font-size: 1.325rem;line-height: 17px;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.quote-bidask-val {font-size: 1.325rem;line-height: 24px;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.nav-container {position: absolute;left: 888px;top: -18px;width: 65%;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.side-panel {max-width: 346px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.sl-search-bar {background-color: #150f0c;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions table col:nth-child(3) {width: 104px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions table {min-width: 2343px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.dashboard__sub-pages > div > div._tabs2 {position: absolute;top: 0px;z-index: 1037;zoom: 0.8;left: 845px;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule("div.ptf-positions table td:nth-child("+col1+") div, div.ptf-positions table td:nth-child("+col3+") div {opacity:0.4;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule("@keyframes flashGreen {0%   { color: #00ff95; text-shadow: 0 0 10px #00ff95, 0 0 20px #00ff95; } 100% { color: #00c853;text-shadow: none; } }", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule("@keyframes flashRed {0%   { color: #ff3b3b; text-shadow: 0 0 10px #ff3b3b, 0 0 20px #ff3b3b; } 100% { color: #d50000;text-shadow: none; } }", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule(".flash-green {color: #00c853;animation: flashGreen 0.8s ease;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule(".flash-red {color: #d50000;animation: flashRed 0.8s ease;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule("@keyframes fadeOpacity {from { opacity: 0.8; }to   { opacity: 0.4; }}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule(".fade-opacity {animation: fadeOpacity 21s linear forwards;}", styleEl.sheet.cssRules.length);
        }
      }
    }, 300);
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

const observer = new MutationObserver((records) => {
  enhanceTickers(records);
});
observer.observe(document.body, { childList: true, subtree: true });
