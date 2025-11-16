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
  applyCssRule(conid, 2, 'td[conid="'+conid+'"] span { opacity:'+(opacity == 'none' ? '0.7' : '1')+'; }');
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
  const bought = val.match(/([\S|\n|\s]*)\n\t?(\S+)\nBot (\d+) @ ([\.|\d]+) on \S+\n\t?\S+[\t|\s]Bought[\t|\s]\d+[\t|\s]\nFilled\n[\d|:|/|,| ]+ \S+\n\t?[\d+|\.]+[\t|\s]\n([\d+|\.]+)\nFees: ([\d+|\.]+)\n*([\S|\n|\s]*)/);
  if (bought) {
    if (parseFloat(bought[3]).toString().length<3) {
      bought[3] = "0".repeat(3-parseFloat(bought[3]).toString().length) + bought[3];
    }
    if (bought[2].length<4) {
      bought[2] += " ".repeat(4-bought[2].length);
    }
    return bought[1].trim() + "\n+" + bought[2] + " " + bought[3] + " @ " + bought[4] /*+ "-" + (parseFloat(bought[5]) + parseFloat(bought[6])).toFixed(2)*/ + "\n" + bought[7];
  } else {
    const sold = val.match(/([\S|\n|\s]*)\n\t?(\S+)\nSold (\d+) @ ([\.|\d]+) on \S+\n\t?\S+[\t|\s]Sold[\t|\s]\d+[\t|\s]\nFilled\n[\d|:|/|,| ]+ \S+\n\t?[\d+|\.]+[\t|\s]\n([\d+|\.]+)\nFees: ([\d+|\.]+)\n*([\S|\n|\s]*)/);
    if (sold) {
      if (parseFloat(sold[3]).toString().length<3) {
        sold[3] = "0".repeat(3-parseFloat(sold[3]).toString().length) + sold[3];
      }
      if (sold[2].length<4) {
        sold[2] += " ".repeat(4-sold[2].length);
      }
      return sold[1].trim() + "\n-" + sold[2] + " " + sold[3] + " @ " + sold[4] /*+ "+" + (parseFloat(sold[5]) - parseFloat(sold[6])).toFixed(2)*/ + "\n" + sold[7];
    }
  }
  return '';
}

var timeOut, timeOut2;
// var prices = {};
async function enhanceTickers(records) {
  var chart = document.querySelector('.quote-mini-chart .highcharts-container');
  if (chart && !chart.dataset.enhanced) {
    chart.dataset.enhanced = "true";
    chart.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      var ticker = document.querySelector('.quote-symbol div');
      if (ticker) {
        window.open("https://www.tradingview.com/chart/Ese8JXt2/?symbol=" + ticker.innerText, "_blank", "width=1500,height=400,top=400,left=600")
      }
    });
  }

  // const grid1 = document.querySelectorAll("div.ptf-positions table td span[fix="31"] span");
  const grid2 = document.querySelectorAll('div.ptf-positions table td div[fix="84"] span, div.ptf-positions table td div[fix="86"] span');
  if (/*grid1 &&*/ grid2) {
    for (const r of records) {
      // grid1.forEach((td) => {
        // if (td === r.target) {
          // var num = (r.addedNodes[0].data || '').replace('C', '').replace('F', '');
          // if (!Number(num)) return;
          // var newNum = parseFloat(num);
          // var oldNum = prices[r.target.parentNode.parentNode.parentNode.querySelectorAll('td')[1].innerText.trim()] || 0;
          // r.target.classList.remove("flash-green", "flash-red"); // void r.target.offsetWidth;
          // if (newNum && oldNum) {
            // if (newNum > oldNum) {
              // r.target.classList.add("flash-green");
            // } else if (newNum < oldNum) {
              // r.target.classList.add("flash-red");
            // }
          // }
          // prices[r.target.parentNode.parentNode.parentNode.querySelectorAll('td')[1].innerText.trim()] = newNum;
        // }
      // })
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

          r.target.parentNode.style.opacity = 0.9;
          requestAnimationFrame(() => {
            r.target.parentNode.classList.add("fade-opacity");
          });

        }
      })
    }
  }

  if (!document.querySelector('textarea#calcNotes') && (document.querySelectorAll('div.ptf-positions table th').length > 20 || (document.querySelector('h1') && document.querySelector('h1').innerText == 'Orders & Trades'))) {
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
              console.log(next_trade);
              await promiseWrapper(next_trade, setStorage)
              window.location.assign('#/dashboard/positions');
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

        text.style = 'width: 94%;text-transform: uppercase;opacity: 0.4;margin-left: 15px;height: 230px;font-size: 21px;background: transparent;border: 0px!important;outline-width: 0px !important;color: inherit;';
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
              span.style.fontSize = '1.825rem';
            // span.style.fontWeight = '600';
          });
        }

        if (document.querySelector('.tws-shortcuts button:last-of-type')) {
          const trades = document.createElement("button");
          trades.type = 'button';
          trades.innerHTML = "<span>Trades</span>";
          trades.className = document.querySelector('.tws-shortcuts button:last-of-type').className.replace(' tws-skeleton', '');
          document.querySelector('.tws-shortcuts button:last-of-type').after(trades);
          trades.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            window.location.assign('#/orders/trades');
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
          document.querySelectorAll('.bar3-logo, footer, div.nav-container button[aria-label="Research"], div.nav-container button[aria-label="Transfer & Pay"], div.nav-container button[aria-label="Education"], div.nav-container button[aria-label="Performance & Reports"]').forEach((b) => {
            b.remove();
          })

          document.querySelectorAll('div.nav-container button[aria-label="Trade"]').forEach((b) => {
            if (b.classList.contains('nav-item')) {
              b.style.position = "relative";
              b.style.left = "212px";
              b.style.fontSize = "0px";
              b.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                window.location.assign('#/orders');
              });
            } else b.remove();
            // if (document.querySelector('.tws-shortcuts button:last-of-type') && b.classList.contains('nav-item')) {
              // console.log("REMOVE", b)
              // b.classList.remove("nav-item", "link");
              // b.ariaLabel = "";
              // b.className += " " + document.querySelector('.tws-shortcuts button:last-of-type').className.replace(' tws-skeleton', '');
              // b.style = "color:transparent;width:0px;border-color:transparent!important;z-index:30;";
              // document.querySelector('.tws-shortcuts button:last-of-type').after(b);
              // const trades = document.createElement("button");
              // trades.type = 'button';
              // trades.style = 'left:-34px;z-index:32;';
              // trades.innerHTML = b.innerHTML;
              // trades.className = b.className;
              // document.querySelector('.tws-shortcuts button:last-of-type').after(trades);
              // trades.addEventListener("click", (e) => {
                // e.stopPropagation();
                // e.preventDefault();
                // window.location.assign('#/orders/trades');
              // });
            // }
            // else b.remove();
          })

          const styleEl = document.createElement("style");
          styleEl.type = 'text/css';
          styleEl.id = 'flashprices';
          document.head.appendChild(styleEl);
          // styleEl.sheet.insertRule("div.ptf-positions table td span[fix="31"] span {transition: color 1s ease;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="86"], div.ptf-positions table td div[fix="84"] {opacity:0.6;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="85"], div.ptf-positions table td div[fix="88"] {color:#3392ff;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="7671"] span, div.ptf-positions table td div[fix="7287"] span, div.ptf-positions table td div[fix="7288"] span, div.ptf-positions table td div[fix="7286"] span {color:#ac70cc;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="7639"] span {color:#939393;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="85"], div.ptf-positions table td div[fix="88"], div.ptf-positions table td._npos {width: 80px!important;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions table col:nth-child(3) {width: 101px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="86"], div.ptf-positions table td span[fix="31"] span, div.ptf-positions table td div[fix="84"] {color:#bdcc70;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.bid-ask-yield span {font-size: 1.325rem;line-height: 17px;font-weight: 600;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.quote-bidask-val {font-size: 1.325rem;line-height: 24px;font-weight: 600;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.bid-ask-container span {font-size: 1.425rem;font-weight: 600;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-positions td {font-size: 110%;}", styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule(".order-pane .odr-sbmt .outsety-32, .order-pane .odr-sbmt .fs7, .pos-widget table td, .order_ticket__submit-view .order_ticket__status-text, .order_ticket__submit-view__compact-table td, .order-ticket__order-preview-sidebar p, .order-ticket__order-preview-sidebar table td {font-size: 130%;}", styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('.order-pane .grow, .order-ticket__order-details-pane .grow {flex: none;}', styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('#cp-header div.one-head div.one-head-menu > button:nth-child(1), #cp-header div.nav-container div.ib-bar3__trade-btn-container > div.flex-flex.middle, div.pane-subactions > div:nth-child(4), div.pane-subactions > div:has(button[id="recurringButton"]), .order-pane .odr-sbmt .flex-flex, .order_ticket__submit-view > .flex-row, button.ptf-positions__expand-collapse-btn {display: none;}', styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('.pos-widget table td span.fg-sell:before {content: "⮟";margin-right: 6px;}', styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('.pos-widget table td span.fg-buy:before {content: "⮝";margin-right: 6px;}', styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('.pos-widget table td span.fg-buy, .pos-widget table td span.fg-sell {padding: 7px 12px;border-radius: 9px;font-weight: 600;}', styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('.pos-widget table td span.fg-buy {background-color: rgb(7, 55, 99);}', styleEl.sheet.cssRules.length);
          /*td.bg15-accent*/styleEl.sheet.insertRule('.pos-widget table td span.fg-sell {background-color: rgb(99 7 7);}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("#cp-header div.nav-container {position: absolute;left: 888px;top: -5px;width: 65%;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.side-panel {max-width: 328px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.sl-search-bar {zoom: 0.8;background-color: #150f0c;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ib-bar3__trade-btn-container {top: -20px;position: relative;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.sl-search-results {zoom: 1.2;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="7743"] {color: #cd8602;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('div.ptf-positions table td div[fix="7681"] span,div.ptf-positions table td div[fix="7678"] span,div.ptf-positions table td div[fix="7679"] span {color: #ae7102;}', styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions table {min-width: 2343px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.dashboard__sub-pages > div > div._tabs2 {background-color:#1d212b;position: absolute;top: 0px;z-index: 1037;zoom: 0.8;left: 869px;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions table td.bg15-accent span {font-size: 23px;line-height: 16.6px;top: 1px;position: relative;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions > div.flex-fixed {position: absolute;top: 6px;left: 1258px;z-index: 9999;width: 966px;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("div.ptf-positions table tr > td:nth-child(3) div, div.ptf-positions table td.bg15-accent {overflow:visible;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".quote-mini-chart .highcharts-container {cursor:pointer;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".quote-bidask-val .fs7 {font-size: 1.125rem;line-height: 24px;font-weight: 600;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-models .ib-row.after-64 {margin-bottom: 0px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-models .ib-row .ib-col {position: absolute;left: 0px;top: 604px;width: 325px;margin: 0px;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-models .ib-row .ib-col table col:nth-child(2) {width: 60%!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-models .ib-row .ib-col table col:nth-child(3) {width: 40%!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-models .ib-row .ib-col table col:nth-child(4) {width: 0px!important;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".ptf-models .ib-row .ib-col table tr td:nth-child(4), .ptf-models div.ib-row div button._btn.lg {display:none;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule(".order-price-info .realtime-data-container {font-size: 19px;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule("@keyframes flashGreen {0%   { color: #00ff95; text-shadow: 0 0 10px #00ff95, 0 0 20px #00ff95; } 100% { color: #00c853;text-shadow: none; } }", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule("@keyframes flashRed {0%   { color: #ff3b3b; text-shadow: 0 0 10px #ff3b3b, 0 0 20px #ff3b3b; } 100% { color: #d50000;text-shadow: none; } }", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule(".flash-green {color: #00c853;animation: flashGreen 0.8s ease;}", styleEl.sheet.cssRules.length);
          // styleEl.sheet.insertRule(".flash-red {color: #d50000;animation: flashRed 0.8s ease;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule("@keyframes fadeOpacity {from { opacity: 0.9; }to   { opacity: 0.6; }}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule(".fade-opacity {animation: fadeOpacity 21s linear forwards;}", styleEl.sheet.cssRules.length);
          styleEl.sheet.insertRule('.order-info__block input[name="quantity"],.order-info__block input.numeric, .order-ticket__sidebar--grid input[name="quantity"], .order-ticket__sidebar--grid input[name="price"] {font-weight: 600;font-size: 30px;}', styleEl.sheet.cssRules.length);
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

// const utterance = new SpeechSynthesisUtterance("Welcome to this tutorial!");

// // Select a voice
// const voices = speechSynthesis.getVoices();
// utterance.voice = voices[0]; // Choose a specific voice

// // Speak the text
// speechSynthesis.speak(new SpeechSynthesisUtterance("ACN"));

// setInterval(()=>{window.speechSynthesis.speak(new SpeechSynthesisUtterance(parseInt(document.querySelector('#cp-ib-app-main-content div.portfolio-summary__header.insetx-24.insety-16  div.account-alias__container__account-values.fs7 > div:nth-child(2) > span').innerText)));},10000);

// setInterval(()=>{window.speechSynthesis.speak(new SpeechSynthesisUtterance(document.querySelector('td[conid="67889930"] span').innerText + " " + parseInt(document.querySelector('tr:has(td[conid="67889930"]) td:nth-child(7)').innerText.replace("C", ""))))},10000);

// localStorage.setItem("xxtbqt665.U16685488_column", `[{"fix_tag":55,"movable":false,"removable":false,"name":"Instrument","description":"Enter the contract symbol or class as it is defined by the exchange on which it's trading.","groups":["G-3"],"id":"INSTRUMENT"},{"fix_tag":76,"removable":false,"name":"Position","description":"The current aggregate position for the selected account or group or model.","groups":["G2"],"id":"POSITION"},{"fix_tag":74,"name":"Avg Price","description":"The average price of the position.","groups":["G2"],"id":"AVG_PRICE"},{"fix_tag":85,"name":"Ask Size","description":"The number of contracts or shares offered at the ask price.","groups":["G4"],"id":"ASK_SIZE"},{"fix_tag":86,"name":"Ask","description":"The lowest price offered on the contract.","groups":["G4"],"id":"ASK"},{"fix_tag":31,"name":"Last","description":"The last price at which the contract traded. \\"C\\" identifies this price as the previous day's closing price. \\"H\\" means that the trading is halted.","groups":["G4"],"id":"LAST"},{"fix_tag":84,"name":"Bid","description":"The highest-priced bid for the contract.","groups":["G4"],"id":"BID"},{"fix_tag":88,"name":"Bid Size","description":"The number of contracts or shares bid for at the bid price.","groups":["G4"],"id":"BID_SIZE"},{"fix_tag":78,"name":"Daily P&L","description":"Your profit or loss for the day since prior Close Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"DAILY_PL"},{"fix_tag":83,"name":"Change %","description":"The difference between the last price and the close on the previous trading day.","groups":["G4"],"id":"PCT_CHANGE"},{"fix_tag":7681,"name":"Price/EMA(20)","description":"Price to Exponential moving average (N = 20) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA20"},{"fix_tag":7679,"name":"Price/EMA(100)","description":"Price to Exponential moving average (N = 100) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA100"},{"fix_tag":7678,"name":"Price/EMA(200)","description":"Price to Exponential moving average (N = 200) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA200"},{"fix_tag":7743,"name":"52 Week Change %","description":"This is the percentage change in the company's stock price over the last fifty two weeks.","groups":["G5"],"id":"52WK_PRICE_PCT_CHANGE"},{"fix_tag":80,"name":"Unrealized P&L %","description":"Unrealized profit or loss. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"UNREALIZED_PL_PCT"},{"fix_tag":77,"name":"Unrealized P&L","description":"Unrealized profit or loss. Right-click on the column header to toggle between displaying the P&L as an absolute value or a percentage or both. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"UNREALIZED_PL"},{"fix_tag":73,"name":"Market Value","description":"The current market value of your position in the security. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"MARKET_VALUE"},{"fix_tag":7639,"name":"% of Net Liq","description":"Displays the market value of the contract as a percentage of the Net Liquidation Value of the account. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"PCT_MARKET_VALUE"},{"fix_tag":7287,"name":"Dividend Yield %","description":"This value is the total of the expected dividend payments over the next twelve months per share divided by the Current Price and is expressed as a percentage. For derivatives, this displays the total of the expected dividend payments over the expiry date.","groups":["G14"],"id":"DIV_YIELD"},{"fix_tag":7288,"name":"Dividend Date","description":"Displays the ex-date of the dividend","groups":["G14"],"id":"DIV_DATE"},{"fix_tag":7286,"name":"Dividend Amount","description":"Displays the amount of the next dividend","groups":["G14"],"id":"DIV_AMT"},{"fix_tag":7671,"name":"Annual Dividends","description":"This value is the total of the expected dividend payments over the next twelve months per share.","groups":["G14"],"id":"DIVIDENDS"},{"fix_tag":7290,"name":"P/E excluding extraordinary items","description":"This ratio is calculated by dividing the current Price by the sum of the Diluted Earnings Per Share from continuing operations BEFORE Extraordinary Items and Accounting Changes over the last four interim periods.","groups":["G15"],"id":"PE"},{"fix_tag":7281,"name":"Category","description":"Displays a more detailed level of description within the industry under which the underlying company can be categorized.","groups":["G-3"],"id":"CATEGORY"},{"fix_tag":7087,"name":"Hist. Vol. %","description":"30-day real-time historical volatility","groups":["G4"],"id":"HISTORICAL_VOL_PERCENT"}]`)
