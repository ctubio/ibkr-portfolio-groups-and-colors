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

function makeStyle(conid) {
  var style = document.querySelector('style#rules_' + conid);
  if (!style) {
    style = document.createElement("style");
    style.type = 'text/css';
    style.id = 'rules_' + conid;
    document.head.appendChild(style);
  }
  return style.sheet;
}

function applyCssRule(conid, index, rule) {
  const sheet = makeStyle(conid);
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

async function setDisplayForTicker(conid, ticker) {
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

  await setDisplayForTicker(conid, ticker);

  await enhanceCounter();
}

async function enhanceCounter() {
  const group = document.querySelector('div.ptf-positions h3');
  if (group && group.innerText.split(" ").length == 2) {
    group.innerHTML = group.innerText.split(" ").slice(0,2).join('<span id="toggleCustomViewTotal"> </span>') + ' <span id="toggleCustomView" style="font-size: 16px;font-weight: normal;"></span>';
  }

  var collapsed = total = 0;
  var timeout;

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  document.querySelectorAll('td[conid] span[dir]').forEach(async (span) => {
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

var timeOut;
const mutation = async (records) => {
  for (const r of records) {
    if (!r.addedNodes[0]) continue;

   if (r.target.parentNode && r.target.parentNode.attributes.fix && ['85','88'].indexOf(r.target.parentNode.attributes.fix.value) > -1) {
      var other = r.target.parentNode.attributes.fix.value == '85' ? '88' : '85';
      var meNum = parseInt(r.addedNodes[0].data.replace(",","") || "0");
      var otherNum = parseInt(r.target.parentNode.parentNode.parentNode.querySelector("div[fix='"+other+"'] span").innerText.replace(",","") || "0");
      var meConid = r.target.parentNode.parentNode.parentNode.querySelector("td[conid]").attributes.conid.value;
      if (!meConid) continue;

      var color = "inherit";
      if (meNum != otherNum) {
        color = (other == '85' ? (meNum > otherNum) : (otherNum > meNum)) ? "#0eb35b" : "#e62333";
      }

      applyCssRule('volume_'+meConid, 0, 'div.ptf-positions table tr:has(td[conid="'+meConid+'"]) td div[fix="86"], div.ptf-positions table tr:has(td[conid="'+meConid+'"]) td span[fix="31"] span, div.ptf-positions table tr:has(td[conid="'+meConid+'"]) td div[fix="84"] {color:'+color+'}');
    }

    else if (r.target.parentNode && r.target.parentNode.attributes.fix && ['84','86'].indexOf(r.target.parentNode.attributes.fix.value) > -1) {
      var num = r.addedNodes[0].data.replace('C', '').replace('F', '');
      if (!Number(num)) continue;

      r.target.parentNode.classList.remove("fade-opacity");
      r.target.parentNode.style.opacity = 0.9;
      requestAnimationFrame(() => {
        r.target.parentNode.classList.add("fade-opacity");
      });
    }

    else if (
      (r.addedNodes[0].nodeName == "TR" && r.target.nodeName == "TBODY" && r.target.parentNode && r.target.parentNode.id == "cp-ptf-positions-table0")
      || (r.addedNodes[0].nodeName == "TBODY" && r.target.nodeName == "TABLE" && r.target.id == "cp-ptf-positions-table0")
    ) {
      const td = r.addedNodes[0].querySelector('td[conid]');
      if (!td) continue;
      const span = td.querySelector('span[dir]');
      if (!span) continue;
      const ticker = span.innerText.trim();
      if (!ticker) continue;

      setTimeout(async () => {
        await setColorForTicker(td.attributes.conid.value, ticker + "_color");
        await setDisplayForTicker(td.attributes.conid.value, ticker + "_view");

        clearTimeout(timeOut);
        timeOut = setTimeout(async () => {
          await enhanceCounter();
        }, 333);
      }, 1);
    }

    else if (r.target.nodeName == "SPAN" && r.addedNodes[0].nodeName == "#text" && r.target.classList.contains('fs6') && !r.target.classList.contains('text-semibold') && r.target.parentNode && r.target.parentNode.parentNode && r.target.parentNode.parentNode.classList.contains("account-alias__container__account-values")) {
      if (!r.target.nextSibling) {
        const small = document.createElement("small");
        small.className = r.target.className;
        r.target.after(small);
      }
      r.target.nextSibling.className = r.target.className;
      var span = r.target.parentNode.previousSibling.querySelector("span");
      if (span && span.innerText && r.addedNodes[0].data)
        r.target.nextSibling.innerText = ((100/parseFloat(span.innerText.replace(',', '')))*parseFloat(r.addedNodes[0].data.replace(',', ''))).toFixed(2)+'%'
      else
        r.target.nextSibling.innerText = "0.00%"
    }
  }
}

var speakTimeout;
const speaker = async (e, target) => {
  const speakSelector = '#cp-ib-app-main-content div.portfolio-summary__header.insetx-24.insety-16  div.account-alias__container__account-values.fs7 > div:nth-child(2) > span';
  const isTicker = target && target.classList.contains('_tbsid') && target.nextSibling && target.nextSibling.attributes.conid;
  if (target && target != document.querySelector(speakSelector) && !isTicker) return
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  var data = await promiseWrapper('speakNet', getStorage);
  if (!data['speakNet']) data['speakNet'] = "[]";
  data['speakNet'] = JSON.parse(data['speakNet']);

  if (target) {
    const conid = isTicker ? target.nextSibling.attributes.conid.value : 'net';
    const indexConid = data['speakNet'].indexOf(conid);
    if (indexConid == -1) data['speakNet'].push(conid);
    else data['speakNet'].splice(indexConid, 1);

    var encodedData = {};
    encodedData['speakNet'] = JSON.stringify(data['speakNet']);
    await promiseWrapper(encodedData, setStorage);
  } else {
    makeStyle('speakNet');
    applyCssRule('speakNet', 0, speakSelector+' {cursor: pointer;font-size:1.825rem;margin-bottom: 11px;}');
    applyCssRule('speakNet', 1, speakSelector+' + small {position: absolute;top: 72px;}');
    applyCssRule('speakNet', 2, speakSelector+':hover::before {content: "🕪";color:#575757;font-size: 19px;vertical-align: middle;padding-right: 21px;}');
    applyCssRule('speakNet', 3, 'div.ptf-positions table td._tbsid:hover::before {content: "🕪";color:#575757;}');
  }

  if (data['speakNet'].length) {
    const speakPrices = async () => {
      var next = await promiseWrapper('speakNet', getStorage);
      if (!next['speakNet']) next['speakNet'] = "[]";
      next['speakNet'] = JSON.parse(next['speakNet']);
      if (!next['speakNet'].length) return;
      var msgs = "";
      next['speakNet'].forEach((voice) => {
        if (voice == 'net') {
          var amt = document.querySelector(speakSelector);
          if (amt) msgs = parseInt(amt.innerText.replace(",","").replace(".",","))+'\n' + msgs;
        } else {
          var text = document.querySelector('div.ptf-positions table tr td[conid="'+voice+'"]');
          var price = document.querySelector('div.ptf-positions table tr:has(td[conid="'+voice+'"]) span[fix="31"]');
          if (text && price) msgs += text.innerText.split("").join(" ") + ": " + price.innerText.replace(",","").replace(".",",")+'\n';
        }
      });
      if (!msgs.length) {
        setTimeout(speakPrices, 21000);
        return
      }
      var msgsList = msgs.trim().split('\n');
      msgsList.sort();
      if (msgsList.length == 1 && msgsList[0].indexOf(":") > -1)
        msgsList[0] = msgsList[0].substring(msgsList[0].indexOf(":")+2);
      var msgIndex = 0;
      const speakMsg = () => {
        var syn = new SpeechSynthesisUtterance(msgsList[msgIndex++]);
        syn.onend = () => {
          clearTimeout(speakTimeout);
          if (msgIndex == msgsList.length)
            speakTimeout = setTimeout(speakPrices, 21000);
          else speakTimeout = setTimeout(speakMsg, 3000);
        };
        window.speechSynthesis.speak(syn);
      };
      speakMsg();
    };
    window.speechSynthesis.cancel();
    setTimeout(speakPrices, 1);
    var rules = "";
    applyCssRule('speakNet', 4, speakSelector+'::before {content: "";}');
    applyCssRule('speakNet', 5, 'div.ptf-positions table td._tbsid::before {content: "";}');
    data['speakNet'].forEach((voice) => {
      if (voice == 'net')
        applyCssRule('speakNet', 4, speakSelector+'::before {content: "🕪";color:#ddd!important;font-size: 19px;vertical-align: middle;padding-right: 21px;}');
      else {
        if (rules.length) rules += ", ";
        rules += 'div.ptf-positions table tr:has(td[conid="'+voice+'"]) td._tbsid::before';
      }
    });
    if (rules.length)
      applyCssRule('speakNet', 5, rules+' {content: "🕪";color:#ddd!important;font-size: 19px;vertical-align: middle;padding-right: 21px;}');
  } else {
    applyCssRule('speakNet', 4, speakSelector+'::before {content: "";}');
    applyCssRule('speakNet', 5, 'div.ptf-positions table td._tbsid::before {content: "";}');
  }
};

const groups = async (target) => {
  const group = document.querySelector('div.ptf-positions h3');
  if (!group || (target != group && !group.contains(target))) return

  window.getSelection().removeAllRanges()

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  view['viewMode'] = (view['viewMode'] + 1) % 3;

  if (!view['viewMode']) {
    setTimeout(() => {
      chrome.storage.local.get(null, (data) => {
        for (key in data)
          if (key.indexOf('_') > -1 && !document.querySelector('div.ptf-positions table tr[aria-label="'+key.split('_')[0]+'"]'))
            chrome.storage.local.remove(key)
      })
    }, 13000)
  }

  setTimeout(async () => { await enhanceCounter(); }, 1);

  await promiseWrapper(view, setStorage)

  document.querySelectorAll('td[conid] span[dir]').forEach(async (span) => {
    const ticker = span.innerText.trim();
    if (!ticker) return;
    await setDisplayForTicker(span.parentNode.parentNode.parentNode.attributes.conid.value, ticker + "_view");
  });
};

var timeOutColors;
const colors = async (e, target) => {
  const table = document.querySelector('div.ptf-positions table');
  if (!target || !table || target.nodeName != "SPAN" || !target.attributes.dir || !table.contains(target) || !target.closest('td[conid]')) return
  e.stopPropagation();
  e.preventDefault();
  window.getSelection().removeAllRanges();
  const ticker = target.innerText.trim();
  if (!ticker) return;
  if (e.detail === 1) {
    timeOutColors = setTimeout(async () => {
      await setNextColorForTicker(target.closest('td[conid]').attributes.conid.value, ticker + "_color");
    }, 400);
  }
  if (e.detail === 2) {
    clearTimeout(timeOutColors);
    await setNextDisplayForTicker(target.closest('td[conid]').attributes.conid.value, ticker + "_view");
  }
};

const chart = (target) => {
  const highchart = document.querySelector('.quote-mini-chart .highcharts-container');
  if (!target || !highchart || !highchart.contains(target)) return
  const ticker = document.querySelector('.quote-symbol div');
  if (ticker) {
    window.open("https://www.tradingview.com/chart/Ese8JXt2/?symbol=" + ticker.innerText, "_blank", "width=1500,height=400,top=400,left=600");
  }
};

const orders = (target) => {
  const dot = document.querySelector('div.nav-container button[aria-label="Trade"].nav-item > span > span');
  if (!target || !dot || target != dot) return
  window.location.assign('#/orders');
};

const copy = async (e, target) => {
  const table = document.querySelector('._tbscomfortable table');
  if (!target || !table || !table.contains(target) || !target.closest('tr._tbgr')) return
  e.stopPropagation();
  e.preventDefault();
  var next_trade = {};
  next_trade['copyPaste'] = target.closest('tr._tbgr').innerText.trim();
  await promiseWrapper(next_trade, setStorage)
  window.location.assign('#/dashboard/positions');
};

const notes = async () => {
  const sdiv = document.querySelector('div.tws-shortcuts');
  if (!sdiv) {
    if (location.href.indexOf('/dashboard') > -1)
      setTimeout(notes, 3000);
  } else if (!document.querySelector('textarea#calcNotes')) {
    const text = document.createElement("textarea");
    text.id = 'calcNotes';
    text.spellcheck = false;
    sdiv.after(text);

    var data = await promiseWrapper('calcNotes', getStorage);
    if (!data['calcNotes']) data['calcNotes'] = '';

    text.value = data['calcNotes'];

    var copypaste = await promiseWrapper('copyPaste', getStorage);
    if (!copypaste['copyPaste']) copypaste['copyPaste'] = '';
    if (copypaste['copyPaste'].length) {
      if (!text.value || text.value[text.value.length-1] != "\n") text.value += "\n";
      const transform = transformCopyPaste(text.value+copypaste['copyPaste']);
      if (transform) {
        text.value = transform .trim()+ "\n";
        var next_data = {};
        next_data['calcNotes'] = text.value;
        await promiseWrapper(next_data, setStorage)
        var next_trade = {};
        next_trade['copyPaste'] = '';
        await promiseWrapper(next_trade, setStorage)
      }
    }

    text.addEventListener("keyup", async (e) => {
      var val = e.target.value;
      var next_data = {};
      next_data['calcNotes'] = val;
      await promiseWrapper(next_data, setStorage)
    })
  }
};

const links = () => {
  const button = document.querySelector('.tws-shortcuts button:last-of-type');
  if (!button) {
    setTimeout(links, 3000);
  } else if (button.innerText != "Today") {
    const calendar = document.createElement("button");
    calendar.type = 'button';
    calendar.innerHTML = "<span>Today</span>";
    calendar.className = button.className.replace(' tws-skeleton', '');
    button.after(calendar);
    calendar.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.open('https://www.investing.com/dividends-calendar/', '_blank', "width=1800,height=760,top=230,left=550");
    });

    const bets = document.createElement("button");
    bets.type = 'button';
    bets.innerHTML = "<span>WSB</span>";
    bets.className = button.className.replace(' tws-skeleton', '');
    button.after(bets);
    bets.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.open('https://www.reddit.com/r/wallstreetbets/', '_blank', "width=1800,height=760,top=230,left=550");
    });

    const map = document.createElement("button");
    map.type = 'button';
    map.innerHTML = "<span>Map</span>";
    map.className = button.className.replace(' tws-skeleton', '');
    button.after(map);
    map.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.open('https://finviz.com/map.ashx?t=sec', '_blank', "width=1800,height=760,top=230,left=550");
    });

    const trades = document.createElement("button");
    trades.type = 'button';
    trades.innerHTML = "<span>Trades</span>";
    trades.className = button.className.replace(' tws-skeleton', '');
    button.after(trades);
    trades.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.location.assign('#/orders/trades');
    });
  }
};

const css = () => {
  const sheet = makeStyle('nice');
  sheet.insertRule('#cp-header div.one-head div.one-head-menu > button:nth-child(2), #cp-header div.one-head div.one-head-menu > button:nth-child(1), #cp-header div.nav-container div.ib-bar3__trade-btn-container > div.flex-flex.middle, div.pane-subactions > div:nth-child(4), div.pane-subactions > div:has(button[id="recurringButton"]), .order-pane .odr-sbmt .flex-flex, .order_ticket__submit-view > .flex-row, button.ptf-positions__expand-collapse-btn, .bar3-logo, footer, div.nav-container button[aria-label="Research"], div.nav-container button[aria-label="Transfer & Pay"], div.nav-container button[aria-label="Education"], div.nav-container button[aria-label="Performance & Reports"], .one-head-menu section + button, .one-head-menu section {display:none!important;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="86"], div.ptf-positions table td div[fix="84"] {opacity:0.6;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="85"], div.ptf-positions table td div[fix="88"] {color:#3392ff;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="7671"] span, div.ptf-positions table td div[fix="7287"] span, div.ptf-positions table td div[fix="7286"] span {color:#ac70cc;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="7288"] span {color:#a754d4;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="7281"] span, div.ptf-positions table td div[fix="7087"] span, div.ptf-positions table td div[fix="7290"] span, div.ptf-positions table td div[fix="7639"] span {color:#939393;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="85"], div.ptf-positions table td div[fix="88"], div.ptf-positions table td._npos {width: 80px!important;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table col:nth-child(3), div.ptf-positions table col:nth-child(8){width: 100px!important;}', sheet.cssRules.length);
  sheet.insertRule("div.bid-ask-yield span {font-size: 1.325rem;line-height: 17px;font-weight: 600;}", sheet.cssRules.length);
  sheet.insertRule("div.quote-bidask-val {font-size: 1.325rem;line-height: 24px;font-weight: 600;}", sheet.cssRules.length);
  sheet.insertRule("div.bid-ask-container span {font-size: 1.425rem;font-weight: 600;}", sheet.cssRules.length);
  sheet.insertRule(".ptf-positions td {font-size: 110%;}", sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table tr:has(td span[fix="77_raw"]._nneg) td span[fix="80"] {color: #e62333;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table tr:has(td span[fix="77_raw"]._npos) td span[fix="80"] {color: #0eb35b;}', sheet.cssRules.length);
  sheet.insertRule(".order-pane .odr-sbmt .outsety-32, .order-pane .odr-sbmt .fs7, .pos-widget table td, .order_ticket__submit-view .order_ticket__status-text, .order_ticket__submit-view__compact-table td, .order-ticket__order-preview-sidebar p, .order-ticket__order-preview-sidebar table td {font-size: 130%;}", sheet.cssRules.length);
  sheet.insertRule('.order-pane .grow, .order-ticket__order-details-pane .grow {flex: none;}', sheet.cssRules.length);
  sheet.insertRule('.pos-widget table td span.fg-sell:before {content: "⮟";margin-right: 6px;}', sheet.cssRules.length);
  sheet.insertRule('.pos-widget table td span.fg-buy:before {content: "⮝";margin-right: 6px;}', sheet.cssRules.length);
  sheet.insertRule('.pos-widget table td span.fg-buy, .pos-widget table td span.fg-sell {padding: 7px 12px;border-radius: 9px;font-weight: 600;}', sheet.cssRules.length);
  sheet.insertRule('.pos-widget table td span.fg-buy {background-color: rgb(7, 55, 99);}', sheet.cssRules.length);
  sheet.insertRule('.pos-widget table td span.fg-sell {background-color: rgb(99 7 7);}', sheet.cssRules.length);
  sheet.insertRule("#cp-header div.nav-container {position: absolute;left: 888px;top: -5px;width: 65%;}", sheet.cssRules.length);
  sheet.insertRule("div.side-panel {max-width: 328px!important;}", sheet.cssRules.length);
  sheet.insertRule("div.sl-search-bar {zoom: 0.8;background-color: #150f0c;}", sheet.cssRules.length);
  sheet.insertRule("div.ib-bar3__trade-btn-container {top: -20px;position: relative;}", sheet.cssRules.length);
  sheet.insertRule("div.sl-search-results {zoom: 1.2;}", sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="7743"] {color: #bdcc70;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="7681"] span,div.ptf-positions table td div[fix="7678"] span,div.ptf-positions table td div[fix="7679"] span {color: #ae7102;}', sheet.cssRules.length);
  sheet.insertRule('div.ptf-positions table td div[fix="7290"] span,div.ptf-positions table td div[fix="7281"] span{color: #70ccc8;}', sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions table {min-width: 2343px!important;}", sheet.cssRules.length);
  sheet.insertRule("div.dashboard__sub-pages > div > div._tabs2 {background-color:#1d212b;position: absolute;top: 0px;z-index: 1037;zoom: 0.8;left: 869px;}", sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions table td.bg15-accent span {font-size: 23px;line-height: 16.6px;top: 1px;position: relative;}", sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions > div.flex-fixed {position: absolute;top: 6px;left: 1258px;z-index: 9999;width: 888px;}", sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions table tr > td:nth-child(3) div, div.ptf-positions table td.bg15-accent {overflow:visible;}", sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions h3, .quote-mini-chart .highcharts-container {cursor:pointer;}", sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions h3 {display:inline;}", sheet.cssRules.length);
  sheet.insertRule(".quote-bidask-val .fs7 {font-size: 1.125rem;line-height: 24px;font-weight: 600;}", sheet.cssRules.length);
  sheet.insertRule(".ptf-models .ib-row.after-64 {margin-bottom: 0px!important;}", sheet.cssRules.length);
  sheet.insertRule(".ptf-models .ib-row .ib-col {position: absolute;left: 0px;top: 777px;width: 325px;margin: 0px;}", sheet.cssRules.length);
  sheet.insertRule(".ptf-models .ib-row .ib-col table col:nth-child(2) {width: 60%!important;}", sheet.cssRules.length);
  sheet.insertRule(".ptf-models .ib-row .ib-col table col:nth-child(3) {width: 40%!important;}", sheet.cssRules.length);
  sheet.insertRule(".ptf-models .ib-row .ib-col table col:nth-child(4) {width: 0px!important;}", sheet.cssRules.length);
  sheet.insertRule("div.ptf-positions > div.flex-fixed span.end-4, .ptf-models .ib-row .ib-col table thead, .ptf-models .ib-row .ib-col div.flex-fixed, .ptf-models .ib-row .ib-col table tr td:nth-child(4), .ptf-models div.ib-row div button._btn.lg {display:none;}", sheet.cssRules.length);
  sheet.insertRule("@keyframes fadeOpacity {from { opacity: 0.9; }to   { opacity: 0.6; }}", sheet.cssRules.length);
  sheet.insertRule(".fade-opacity {animation: fadeOpacity 21s linear forwards;}", sheet.cssRules.length);
  sheet.insertRule('.order-info__block input[name="quantity"],.order-info__block input.numeric, .order-ticket__sidebar--grid input[name="quantity"], .order-ticket__sidebar--grid input[name="price"] {font-weight: 600;font-size: 30px;}', sheet.cssRules.length);
  sheet.insertRule('div.nav-container button[aria-label="Trade"].nav-item {font-size:0px;position:relative;left:212px;}', sheet.cssRules.length);
  sheet.insertRule('div.side-panel__content textarea#calcNotes {width: 94%;text-transform: uppercase;opacity: 0.4;margin-left: 15px;height: 230px;font-size: 21px;background: transparent;border: 0px!important;outline-width: 0px !important;color: inherit;}', sheet.cssRules.length);
};

(new MutationObserver((records) => {
  mutation(records);
})).observe(document.body, { childList: true, subtree: true });

window.addEventListener("load", async (e) => {
  css();
  links();
  await speaker();
  await notes();
});

window.navigation.addEventListener("navigate", async () => {
  setTimeout(async () => {
    links();
    await notes();
  }, 500);
});

document.addEventListener("click", async (e) => { // console.log(e); } );
  if (!e.target) return;
  await groups(e.target);
  await colors(e, e.target);
  await copy(e, e.target);
  await speaker(e, e.target);
  await chart(e.target);
  orders(e.target);
  // setcol on click somewhere with: localStorage.setItem("xxtbqt665.U16685488_column", `[{"fix_tag":55,"movable":false,"removable":false,"name":"Instrument","description":"Enter the contract symbol or class as it is defined by the exchange on which it's trading.","groups":["G-3"],"id":"INSTRUMENT"},{"fix_tag":76,"removable":false,"name":"Position","description":"The current aggregate position for the selected account or group or model.","groups":["G2"],"id":"POSITION"},{"fix_tag":74,"name":"Avg Price","description":"The average price of the position.","groups":["G2"],"id":"AVG_PRICE"},{"fix_tag":85,"name":"Ask Size","description":"The number of contracts or shares offered at the ask price.","groups":["G4"],"id":"ASK_SIZE"},{"fix_tag":86,"name":"Ask","description":"The lowest price offered on the contract.","groups":["G4"],"id":"ASK"},{"fix_tag":31,"name":"Last","description":"The last price at which the contract traded. \\"C\\" identifies this price as the previous day's closing price. \\"H\\" means that the trading is halted.","groups":["G4"],"id":"LAST"},{"fix_tag":84,"name":"Bid","description":"The highest-priced bid for the contract.","groups":["G4"],"id":"BID"},{"fix_tag":88,"name":"Bid Size","description":"The number of contracts or shares bid for at the bid price.","groups":["G4"],"id":"BID_SIZE"},{"fix_tag":78,"name":"Daily P&L","description":"Your profit or loss for the day since prior Close Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"DAILY_PL"},{"fix_tag":83,"name":"Change %","description":"The difference between the last price and the close on the previous trading day.","groups":["G4"],"id":"PCT_CHANGE"},{"fix_tag":7681,"name":"Price/EMA(20)","description":"Price to Exponential moving average (N = 20) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA20"},{"fix_tag":7679,"name":"Price/EMA(100)","description":"Price to Exponential moving average (N = 100) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA100"},{"fix_tag":7678,"name":"Price/EMA(200)","description":"Price to Exponential moving average (N = 200) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA200"},{"fix_tag":7743,"name":"52 Week Change %","description":"This is the percentage change in the company's stock price over the last fifty two weeks.","groups":["G5"],"id":"52WK_PRICE_PCT_CHANGE"},{"fix_tag":80,"name":"Unrealized P&L %","description":"Unrealized profit or loss. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"UNREALIZED_PL_PCT"},{"fix_tag":77,"name":"Unrealized P&L","description":"Unrealized profit or loss. Right-click on the column header to toggle between displaying the P&L as an absolute value or a percentage or both. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"UNREALIZED_PL"},{"fix_tag":73,"name":"Market Value","description":"The current market value of your position in the security. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"MARKET_VALUE"},{"fix_tag":7639,"name":"% of Net Liq","description":"Displays the market value of the contract as a percentage of the Net Liquidation Value of the account. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"PCT_MARKET_VALUE"},{"fix_tag":7287,"name":"Dividend Yield %","description":"This value is the total of the expected dividend payments over the next twelve months per share divided by the Current Price and is expressed as a percentage. For derivatives, this displays the total of the expected dividend payments over the expiry date.","groups":["G14"],"id":"DIV_YIELD"},{"fix_tag":7288,"name":"Dividend Date","description":"Displays the ex-date of the dividend","groups":["G14"],"id":"DIV_DATE"},{"fix_tag":7286,"name":"Dividend Amount","description":"Displays the amount of the next dividend","groups":["G14"],"id":"DIV_AMT"},{"fix_tag":7671,"name":"Annual Dividends","description":"This value is the total of the expected dividend payments over the next twelve months per share.","groups":["G14"],"id":"DIVIDENDS"},{"fix_tag":7290,"name":"P/E excluding extraordinary items","description":"This ratio is calculated by dividing the current Price by the sum of the Diluted Earnings Per Share from continuing operations BEFORE Extraordinary Items and Accounting Changes over the last four interim periods.","groups":["G15"],"id":"PE"},{"fix_tag":7281,"name":"Category","description":"Displays a more detailed level of description within the industry under which the underlying company can be categorized.","groups":["G-3"],"id":"CATEGORY"},{"fix_tag":7087,"name":"Hist. Vol. %","description":"30-day real-time historical volatility","groups":["G4"],"id":"HISTORICAL_VOL_PERCENT"}]`)
  // export on click somewhere with: chrome.storage.local.get(null, (data) => console.log(data))
  // import on click somewhere with: chrome.storage.local.set({})
}, true);
