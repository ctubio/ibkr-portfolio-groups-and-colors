function d3_uninterpolateNumber(a, b) {
  b = (b -= a = +a) || 1 / b;
  return function(x) {
    return (x - a) / b;
  };
};

function d3_interpolateNumber(a, b) {
  a = +a, b = +b;
  return function(t) {
    return a * (1 - t) + b * t;
  };
};

function d3_scale_bilinear(domain, range) {
  var u = d3_uninterpolateNumber(domain[0], domain[1]), i = d3_interpolateNumber(range[0], range[1]);
  return function(x) {
    return i(u(x));
  };
};

function d3_scale_linear() {
  var domain = [ 0, 1 ];
  var range = [ 0, 1 ];
  var output;
  function rescale() {
    output = d3_scale_bilinear(domain, range);
    return scale;
  }
  function scale(x) {
    return output(x);
  }
  scale.domain = function(x) {
    if (!arguments.length) return domain;
    domain = x.map(Number);
    return rescale();
  };
  scale.range = function(x) {
    if (!arguments.length) return range;
    range = x;
    return rescale();
  };
  return rescale();
};

function d3_svg_line(x, y) {
  function line(data) {
    var segments = [];
    var points = [];
    var i = -1;
    while (++i < data.length) {
      points.push([ +x(data[i], i), +y(data[i], i) ]);
    }
    if (points.length)
      segments.push("M", points.length > 1 ? points.join("L") : points + "Z");
    return segments.length ? segments.join("") : null;
  };
  return line;
};

const sparkWidth = 100;
const sparkHeight = 30;
const sparkX = d3_scale_linear().range([0, sparkWidth]);
const sparkY = d3_scale_linear().range([sparkHeight, 0]);
const sparkPath = d3_svg_line(
  (d) => sparkX(d.date),
  (d) => sparkY(d.price)
);

const sparkline = (conid) => {
  var data = [];

  var mini = document.getElementById('minichart_'+conid);
  if (!mini) {
    var container = document.getElementById('minicharts');
    if (!container) {
      container = document.createElement("div");
      container.id = 'minicharts';
      document.body.append(container)
    }
    mini = document.createElement("div");
    mini.id = 'minichart_'+conid;
    container.append(mini);
  }

  var canvas = document.createElement("canvas");
  canvas.width = sparkWidth;
  canvas.height = sparkHeight;
  mini.append(canvas);

  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = ctx.createLinearGradient(0, 0, 0, 100);
  ctx.strokeStyle.addColorStop(0, "rgb(1, 166, 1, 0.7)");
  ctx.strokeStyle.addColorStop(0.20, "rgb(255, 165, 0, 0.7)");
  ctx.strokeStyle.addColorStop(0.25, "rgb(255, 0, 0, 0.7)");
  ctx.lineWidth = 3;

  return (price) => {
    if (data.length && parseFloat(price) == data.slice(-1)[0].price) return;
    if (data.length > 1 && +data.slice(-2,-1)[0].date > (+new Date())-(30*1000))
      data = data.slice(0, -1);
    data.push({date: new Date(), price: parseFloat(price)});
    if (data.length > 21)
      data = data.slice(-21);

    var dates = [];
    var prices = [];
    // var titles = "";
    data.forEach((x) => {
      if (!dates[0] || +dates[0] > +x.date)
        dates[0] = x.date;
      if (!dates[1] || +dates[1] < +x.date)
        dates[1] = x.date;
      if (!prices[0] || prices[0] > x.price)
        prices[0] = x.price;
      if (!prices[1] || prices[1] < x.price)
        prices[1] = x.price;
      // titles = "\n" + x.date.toISOString().slice(11,19) + "  " + x.price.toFixed(2) + titles;
    });

    sparkX.domain(dates);
    sparkY.domain(prices);

    ctx.clearRect(0, 0, sparkWidth, sparkHeight);
    ctx.stroke(new Path2D(sparkPath(data)));

    // mini.dataset.title = titles.trim();
    // // const diff = prices[1] - prices[0];
    // // mini.dataset.title = (diff>=0?'+':'')+diff.toFixed(2) + "\n" + dates[1].toISOString().slice(11,19) + "\n" + dates[0].toISOString().slice(11,19);
  };
};

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
  var style = document.getElementById('rules_' + conid);
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

var growth = [];
var dividends = [];
var visible = [];
function applyDisplayForTicker(conid, display) {
  applyCssRule(conid, 1, 'tbody:has(td[conid="'+conid+'"]) { display:'+display+'; }');
  applyCssRule(conid, 2, 'div#minichart_'+conid+' { display:'+(display == 'none' ? 'display' : 'inline-block')+';position-anchor: --sparkline_'+conid+'; }');
  applyCssRule(conid, 3, 'div.ptf-positions table td[conid="'+conid+'"] {anchor-name: --sparkline_'+conid+';}');

  var visibleIndex = visible.indexOf(conid);
  if (display != 'none') {
    if (visibleIndex == -1) visible.push(conid);
  } else if (visibleIndex > -1)
    visible.splice(visibleIndex, 1);
}

function applyOpacityForTicker(conid, opacity) {
  applyCssRule(conid, 4, 'td[conid="'+conid+'"] span { opacity:'+(opacity == 'none' ? '0.7' : '1')+'; }');

  if (growth.indexOf(conid) == -1)
    growth.push(conid);
  var dividendsIndex = dividends.indexOf(conid);
  if (opacity == 'none') {
    if (dividendsIndex == -1) dividends.push(conid);
  } else if (dividendsIndex > -1)
    dividends.splice(dividendsIndex, 1);
}

async function setColorForTicker(conid) {
  const key = conid + '_color';
  var data = await promiseWrapper(key, getStorage);

  applyColorForTicker(conid, data[key]);
}

async function setDisplayForTicker(conid) {
  const key = conid + '_view';

  var data = await promiseWrapper(key, getStorage);

  var display = "table-row-group";

  if (!data[key]) data[key] = display;

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  if (view['viewMode'] == 1) display = data[key];
  else if (view['viewMode'] == 2) display = data[key] == 'none' ? display : 'none';

  applyDisplayForTicker(conid, display);

  applyOpacityForTicker(conid, data[key]);
}

async function setNextColorForTicker(conid) {
  const key = conid + '_color';
  const all = ["rgb(159, 27, 27)", "rgb(18, 220, 18)", "rgb(0, 167, 255)", "rgb(167, 84, 212)", "rgb(255, 215, 0)", "rgb(163, 104, 14)", "inherit"];

  const old_data = await promiseWrapper(key, getStorage);

  const prev_i = all.indexOf(old_data[key]);

  const next_color = all[(prev_i + 1) % all.length];

  var data = {};
  data[key] = next_color;

  await promiseWrapper(data, setStorage)

  applyColorForTicker(conid, data[key]);
}

async function setNextDisplayForTicker(conid) {
  const key = conid + '_view';
  const all = ["none", "table-row-group"];

  const data = await promiseWrapper(key, getStorage);

  const prev_i = all.indexOf(data[key]);

  const next_display = all[(prev_i + 1) % all.length];

  var next_data = {};
  next_data[key] = next_display;

  await promiseWrapper(next_data, setStorage)

  await setDisplayForTicker(conid);

  await enhanceCounter();
}

async function enhanceCounter() {
  var groupTitle = document.getElementById('toggleCustomViewTotal');
  if (!groupTitle) {
    var h3 = document.getElementById('cp-ptf-positions-table0')?.parentNode.parentNode.getElementsByTagName('h3')[0];
    if (h3 && h3.innerText.split(" ").length == 2) {
      h3.innerHTML = h3.innerText.split(" ").slice(0, 2).join('<span id="toggleCustomViewTotal"> </span>') + ' <span id="toggleCustomView"></span>';
      groupTitle = h3.firstElementChild;
    }
  }

  if (groupTitle.nextElementSibling?.id != "toggleCustomView") return

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  groupTitle.innerText = ' '+growth.length.toString()+' ';
  groupTitle.nextElementSibling.innerHTML = 'of <span class="'+(view['viewMode'] != 2?'fg-accent':'')+'"><strong>'
      + (growth.length-dividends.length).toString()
      + '</strong> Growth Positions</span> and <span class="'+(view['viewMode'] != 1?'fg-accent':'')+'"><strong>'
      + dividends.length.toString()+'</strong> High-Yield Dividend Positions</span>';
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
var charts = {};
const mutation = async (records) => {
  for (const r of records) {
    if (!r.addedNodes[0]) continue;

    if (r.target.parentNode && r.target.parentNode.attributes.fix && r.target.parentNode.attributes.fix.value == '31') {
      const num = parseFloat(r.addedNodes[0].data.replace(',', '').replace('C', '').replace('F', ''));
      if (!Number(num)) continue;
      const conid = r.target.parentNode.parentNode.parentNode.getElementsByTagName("td")[1].attributes.conid?.value;
      if (!conid || visible.indexOf(conid) == -1) continue;
      ((conid, num) => {
        setTimeout(() => {
          if (!charts[conid]) charts[conid] = sparkline(conid);
          charts[conid](num);
        }, 1);
      })(conid, num);
    }

    else if (r.target.parentNode && r.target.parentNode.attributes.fix && ['85','88'].indexOf(r.target.parentNode.attributes.fix.value) > -1) {
      const other = r.target.parentNode.attributes.fix.value == '85' ? '88' : '85';
      const meNum = parseInt(r.addedNodes[0].data.replace(",","") || "0");
      const otherNum = parseInt(r.target.parentNode.parentNode.parentNode.querySelector("div[fix='"+other+"'] span").innerText.replace(",","") || "0");
      const conid = r.target.parentNode.parentNode.parentNode.getElementsByTagName("td")[1]?.attributes.conid?.value;
      if (!conid) continue;

      var color = "inherit";
      if (meNum != otherNum) {
        color = (other == '85' ? (meNum > otherNum) : (otherNum > meNum)) ? "#0eb35b" : "#e62333";
      }

      applyCssRule('volume_'+conid, 0, 'div.ptf-positions table tr:has(td[conid="'+conid+'"]) td div[fix="86"], div.ptf-positions table tr:has(td[conid="'+conid+'"]) td span[fix="31"] span, div.ptf-positions table tr:has(td[conid="'+conid+'"]) td div[fix="84"] {color:'+color+'}');
    }

    // else if (r.target.parentNode && r.target.parentNode.attributes.fix && ['84','86'].indexOf(r.target.parentNode.attributes.fix.value) > -1) {
      // var num = r.addedNodes[0].data.replace('C', '').replace('F', '');
      // if (!Number(num)) continue;

      // ((classList) => {
        // setTimeout(async () => {
          // classList.remove("fade-opacity");
          // requestAnimationFrame(() => {
            // classList.add("fade-opacity");
          // });
        // }, 1);
      // })(r.target.parentNode.classList);
    // }

    else if (r.target.nodeName == "SPAN" && r.addedNodes[0].nodeName == "#text" && r.target.classList.contains('fs6') && !r.target.classList.contains('text-semibold') && r.target.parentNode && r.target.parentNode.parentNode && r.target.parentNode.parentNode.classList.contains("account-alias__container__account-values")) {
      if (!r.target.nextSibling) {
        const small = document.createElement("small");
        small.className = r.target.className;
        r.target.after(small);
      }
      if (!r.target.nextSibling.classList.contains(r.target.className))
        r.target.nextSibling.className = r.target.className;
      ((data, span, next) => {
        setTimeout(() => {
          if (span && span.innerText && data) {
            var amtdiff = ((100/parseFloat(span.innerText.replace(',', '')))*parseFloat(data.replace(',', ''))).toFixed(2);
            if (Number(amtdiff) && parseFloat(amtdiff) > 0)
              amtdiff = "+" + amtdiff;
            next.innerText = amtdiff + '%'
          } else {
            next.innerText = "0.00%"
          }
        }, span.innerText == '—' ? 1000 : 1);
      })(r.addedNodes[0].data, r.target.parentNode.previousSibling.getElementsByTagName("span")[0], r.target.nextSibling);
    }

    else if (
      (r.addedNodes[0].nodeName == "TR" && r.target.nodeName == "TBODY" && r.target.parentNode?.id == "cp-ptf-positions-table0")
      || (r.addedNodes[0].nodeName == "TBODY" && r.target.nodeName == "TABLE" && r.target.id == "cp-ptf-positions-table0")
    ) {
      const conid = r.addedNodes[0].querySelector("td[conid]")?.attributes.conid?.value;
      if (!conid) continue;

      ((conid) => {
        setTimeout(async () => {
          await setColorForTicker(conid);
          await setDisplayForTicker(conid);

          clearTimeout(timeOut);
          timeOut = setTimeout(async () => {
            await enhanceCounter();
          }, 333);
        }, 1);
      })(conid);
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
  clearTimeout(speakTimeout);
  window.speechSynthesis.cancel();
  var data = await promiseWrapper('speakNet', getStorage);
  if (!data['speakNet']) data['speakNet'] = "[]";
  data['speakNet'] = JSON.parse(data['speakNet']);

  if (target) {
    const conid = isTicker ? target.nextSibling.attributes.conid.value : 'net';
    const indexConid = data['speakNet'].indexOf(conid);
    if (indexConid == -1) data['speakNet'].push(conid);
    else data['speakNet'].splice(indexConid, 1);
    data['speakNet'].sort((a,b) => {
      if (a=='net') return -1;
      if (b=='net') return 1;
      return document.querySelector('td[conid="'+a+'"] span[dir]').innerText.trim().localeCompare(document.querySelector('td[conid="'+b+'"] span[dir]').innerText.trim());
    });

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
    var msgIndex = 0;
    const speakMsg = () => {
      var msg = "";
      const voice = data['speakNet'][msgIndex++];
      if (voice == 'net') {
        var amt = document.querySelector(speakSelector);
        if (amt) msg = parseInt(amt.innerText.replace(",","").replace(".",","));
      } else {
        var text = document.querySelector('div.ptf-positions table tr td[conid="'+voice+'"]');
        var price = document.querySelector('div.ptf-positions table tr:has(td[conid="'+voice+'"]) span[fix="31"]');
        if (text && price) msg = text.innerText.split("").join(" ") + ": " + price.innerText.replace(",","").replace(".",",");
        if (data['speakNet'].length == 1)
          msg = msg.substring(msg.indexOf(":")+2);
      }
      if (!msg) {
        msgIndex = 0;
        setTimeout(speakMsg, 3000);
        return
      }
      var syn = new SpeechSynthesisUtterance(msg);
      syn.onend = () => {
        if (msgIndex == data['speakNet'].length) {
          msgIndex = 0;
          speakTimeout = setTimeout(speakMsg, 21000);
        } else speakTimeout = setTimeout(speakMsg, 3000);
      };
      window.speechSynthesis.speak(syn);
    };
    setTimeout(speakMsg, 1);
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
  const group = document.getElementById('cp-ptf-positions-table0')?.parentNode.parentNode.getElementsByTagName('h3')[0];
  if (!group || (target != group && !group.contains(target))) return

  window.getSelection().removeAllRanges()

  var view = await promiseWrapper('viewMode', getStorage);
  if (!view['viewMode']) view['viewMode'] = 0;

  view['viewMode'] = (view['viewMode'] + 1) % 3;

  if (!view['viewMode']) {
    setTimeout(() => {
      chrome.storage.local.get(null, (data) => {
        for (var key in data)
          if (document.querySelectorAll('div.ptf-positions table td[conid]').length > 21 && key.indexOf('_') > -1 && !document.querySelector('div.ptf-positions table td[conid="'+key.split('_')[0]+'"]'))
            chrome.storage.local.remove(key)
      })
    }, 13000)
  }

  document.querySelectorAll('td[conid]').forEach(async (td) => {
    await setDisplayForTicker(td.attributes.conid.value);
  });

  await promiseWrapper(view, setStorage);

  await enhanceCounter();
};

var timeOutDoubleClick;
const colors = async (e, target) => {
  const table = document.getElementById('cp-ptf-positions-table0');
  if (!target || !table || target.nodeName != "SPAN" || !target.attributes.dir || !table.contains(target) || !target.closest('td[conid]')) return
  e.stopPropagation();
  e.preventDefault();
  window.getSelection().removeAllRanges();
  if (e.detail === 1) {
    timeOutDoubleClick = setTimeout(async () => {
      await setNextColorForTicker(target.closest('td[conid]').attributes.conid.value);
    }, 400);
  }
  if (e.detail === 2) {
    clearTimeout(timeOutDoubleClick);
    await setNextDisplayForTicker(target.closest('td[conid]').attributes.conid.value);
  }
};

const enter = async (e, target) => {
  if (e.keyCode != 13) return
  const ticket = document.querySelector('.order-ticket__sidebar');
  const pane = document.querySelector('.order-pane');
  if (!target || target.nodeName != "INPUT" || target.attributes.inputmode?.value != "decimal") return
  e.stopPropagation();
  e.preventDefault();
  if (ticket && ticket.contains(target)) {
    ticket.querySelector('.order-ticket__sidebar--sticky .border-top button.buy, .order-ticket__sidebar--sticky .border-top button.sell').click();
  } else if (pane && pane.contains(target)) {
    pane.querySelector('.ib-row.border-top button.buy, .ib-row.border-top button.sell').click();
  }
};

const chart = (e, target) => {
  const highchart = document.querySelector('.quote-mini-chart .highcharts-container');
  if (!target || !highchart || !highchart.contains(target)) return
  if (e.detail === 1) {
    timeOutDoubleClick = setTimeout(() => {
      const conid = document.querySelector('td[conid].bg15-accent');
      if (!conid) return
      window.open("https://www.interactivebrokers.ie/portal/#/quote/"+conid.attributes.conid.value, "_blank", "width=1500,height=600,top=300,left=600");
    }, 400);
  }
  if (e.detail === 2) {
    clearTimeout(timeOutDoubleClick);
    const ticker = document.querySelector('.quote-symbol div');
    if (!ticker) return
    window.open("https://www.tradingview.com/chart/Ese8JXt2/?symbol=" + ticker.innerText, "_blank", "width=1500,height=400,top=400,left=600");
  }
};

const fundamentals = (target) => {
  const h1 = document.querySelector('div.quote-main div.quote-symprice h1 .quote-symbol');
  if (!target || !h1 || !h1.contains(target)) return
  const ticker = document.querySelector('.quote-symbol div');
  if (!ticker) returnreturn
  window.open("https://www.benzinga.com/quote/" + ticker.innerText, "_blank", "width=1500,height=800,top=200,left=600");
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
  } else if (!document.getElementById('calcNotes')) {
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

const css = (loading) => {
  if (window.location.href.indexOf("/dashboard/positions") == -1)
    document.body.removeAttribute('hack');
  else
    document.body.setAttribute('hack', '');

  if (!loading) return

  const sheet = makeStyle('nice');
  sheet.insertRule(`
body[hack]
  #cp-header
  div.one-head
  div.one-head-menu
  > button:nth-child(2),
body[hack] div.side-panel__toggle,
body[hack]
  #cp-header
  div.one-head
  div.one-head-menu
  > button:nth-child(1),
body[hack]
  #cp-header
  div.nav-container
  div.ib-bar3__trade-btn-container
  > div.flex-flex.middle,
._btngroup.wgrow.pcon-widget:has(svg),
body[hack]
  div.pane-subactions
  > div.pane-subaction-button:nth-child(4),
body[hack]
  div.pane-subactions
  > div.pane-subaction-button:nth-child(3),
body[hack]
  div.pane-subactions
  > div:has(button[id="recurringButton"]),
.order-pane .odr-sbmt .flex-flex,
.order_ticket__submit-view > .flex-row,
body[hack]
  button.ptf-positions__expand-collapse-btn,
body[hack] .bar3-logo,
body[hack]
  .portfolio-summary__header
  .expand-button,
body[hack] .ib-row.cp-footer,
body[hack]
  div.nav-container
  button[aria-label="Research"],
body[hack]
  div.nav-container
  button[aria-label="Transfer & Pay"],
body[hack]
  div.nav-container
  button[aria-label="Education"],
body[hack]
  div.nav-container
  button[aria-label="Performance & Reports"],
body[hack]
  .one-head-menu
  section
  + button,
body[hack] .one-head-menu section,
.order-ticket__sidebar--expanded form > div:last-child,
div.order-pane div.insetx-16,
div.order-ticket__sidebar--sticky div.flex-fixed,
div.order-ticket__sidebar--container > div > div.insetx-16.insety-8,
div.order-ticket__sidebar--container > div > div.insetx-16 > div.before-16:first-child,
.order-ticket__sidebar--expanded
  form
  > ._formo
  .order-ticket__sidebar--grid
  div:nth-child(6):has(._drop),
.order-ticket__sidebar--expanded
  form
  > ._formo
  .order-ticket__sidebar--grid
  div:nth-child(7):has(._drop),
#orderTicketSellTabPanel
  form
  > ._formo
  .order-ticket__sidebar--grid
  div:nth-child(5):has(._drop),
#orderTicketBuyTabPanel
  form
  > ._formo
  .order-ticket__sidebar--grid
  div:nth-child(2):has(.before-8 ._fldi),
.order-ticket__attach-orders > p,
div.before-8:has(span[aria-label="Price Management Algo"]),
body[hack]
  div.ptf-positions
  > div.flex-fixed
  span.end-4,
body[hack]
  .ptf-models
  .ib-row
  .ib-col
  table
  thead,
body[hack]
  .ptf-models
  .ib-row
  .ib-col
  div.flex-fixed,
body[hack]
  .ptf-models
  .ib-row
  .ib-col
  table
  tr
  td:nth-child(4),
body[hack]
  .ptf-models
  div.ib-row
  div
  button._btn.lg {
  display: none !important;
}`);
  sheet.insertRule(`
body[hack] #cp-header div.nav-container {
  position: absolute;
  left: 888px;
  top: -25px;
  width: 65%;
}`);
  sheet.insertRule(`
body[hack] nav.nav-items-container {
    top: 20px;
    position: relative;
}`);
  sheet.insertRule(`
body[hack] .tws-shortcuts {
  margin-top: 150px;
}`);
  sheet.insertRule(`
body[hack] div.nav-container button[aria-label="Trade"].nav-item {
  font-size: 0px;
  position: relative;
  left: 212px;
}`);
  sheet.insertRule(`
body[hack] .after-32 {
  margin-bottom: 0px !important;
}`);
  sheet.insertRule(`
body[hack] .dashboard__sub-pages .insetx-24 {
  padding-left: 0px !important;
  padding-right: 0px;
}`);
  sheet.insertRule(`
body[hack] div.dashboard__sub-pages > div > div._tabs2 {
  background-color: #1d212b;
  position: absolute;
  top: 0px;
  z-index: 1030;
  zoom: 0.8;
  left: 869px;
}`);
  sheet.insertRule(`
body[hack] div.dashboard__sub-pages .after-16 {
  margin-bottom: 8px;
}`);
  sheet.insertRule(`
div.side-panel {
  max-width: 328px !important;
}`);
  sheet.insertRule(`
.pos-widget table td span.fg-buy,
.pos-widget table td span.fg-sell {
  padding: 7px 12px;
  border-radius: 9px;
  font-weight: 600;
}`);
  sheet.insertRule(`
.ptf-models .ib-row.after-64 {
  margin-bottom: 0px !important;
}`);
  sheet.insertRule(`
.ptf-models .ib-row .ib-col {
  position: absolute;
  left: 0px;
  top: 336px;
  width: 325px;
  margin: 0px;
}`);
  sheet.insertRule(`
.ptf-models .ib-row .ib-col table col:nth-child(2) {
  width: 60% !important;
}`);
  sheet.insertRule(`
.ptf-models .ib-row .ib-col table col:nth-child(3) {
  width: 40% !important;
}`);
  sheet.insertRule(`
.ptf-models .ib-row .ib-col table col:nth-child(4) {
  width: 0px !important;
}`);
  sheet.insertRule(`
span#toggleCustomView {
  font-size: 16px;
  font-weight: normal;
}`);
  sheet.insertRule(`
div.quote-main div.quote-symprice h1 div.quote-symbol:hover {
  text-decoration: underline;
}`);
  sheet.insertRule(`
.quote-bidask-val .fs7 {
  font-size: 1.125rem;
  line-height: 24px;
  font-weight: 600;
}`);
  sheet.insertRule(`
.portfolio-summary__list
  > .portfolio-summary__list__item:nth-last-child(
    1 of .portfolio-summary__list__item
  )
  span.numeric {
  color: #a754d4;
  font-weight: 600;
}`);
  sheet.insertRule(`
div.bid-ask-yield span {
  font-size: 1.325rem;
  line-height: 17px;
  font-weight: 600;
}`);
  sheet.insertRule(`
div.quote-bidask-val {
  font-size: 1.325rem;
  line-height: 24px;
  font-weight: 600;
}`);
  sheet.insertRule(`
div.bid-ask-container span {
  font-size: 1.425rem;
  font-weight: 600;
}`);
  sheet.insertRule(`
.pos-widget table td span.fg-buy {
  background-color: rgb(7, 55, 99);
}`);
  sheet.insertRule(`
.pos-widget table td span.fg-sell {
  background-color: rgb(99, 7, 7);
}`);
  sheet.insertRule(`
.order-info__block input[name="quantity"],
.order-info__block input.numeric,
.order-ticket__sidebar--grid input[name="quantity"],
.order-ticket__sidebar--grid input[name="auxPrice"],
.order-ticket__sidebar--grid input[name="price"] {
  font-weight: 600;
  font-size: 30px;
}`);
  sheet.insertRule(`
div.side-panel__content button.pill {
  color: rgb(189, 204, 112);
}`);
  sheet.insertRule(`
div.quote-main div.quote-symprice h1 div.quote-symbol {
  cursor: pointer;
}`);
  sheet.insertRule(`
.order-pane .odr-sbmt .outsety-32,
.order-pane .odr-sbmt .fs7,
.pos-widget table td,
.order_ticket__submit-view .order_ticket__status-text,
.order_ticket__submit-view__compact-table td,
.order-ticket__order-preview-sidebar p,
.order-ticket__order-preview-sidebar table td {
  font-size: 130%;
}`);
  sheet.insertRule(`
.order-pane .grow,
.order-ticket__order-details-pane .grow {
  flex: none;
}`);
  sheet.insertRule(`
.pos-widget table td span.fg-sell:before {
  content: "⮟";
  margin-right: 6px;
}`);
  sheet.insertRule(`
.pos-widget table td span.fg-buy:before {
  content: "⮝";
  margin-right: 6px;
}`);
  sheet.insertRule(`
div#minicharts > div {
  z-index: 3;
  position: fixed;
  position-area: left center;
  right: -166px;
}`);
  sheet.insertRule(`
div#minicharts > div[data-title]:hover::after {
  content: attr(data-title);
  position: absolute;
  top: -100%;
  left: 10px;
  pointer-events: none;
  box-shadow: color-mix(in srgb, rgb(0, 0, 0) 30%, transparent) 0 1px 2px 0,
  color-mix(in srgb, rgb(0, 0, 0) 15%, transparent) 0 2px 6px 2px;
  padding: 5px 8px;
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
  display: block;
  background-color: #292a2d;
  border-radius: 8px;
  font-size: 19.36px;
  color: white;
  font-family: Proxima Nova, Verdana, Arial, sans-serif;
  white-space: pre;
}`);
  sheet.insertRule(`
body {
  scrollbar-color: hsla(0, 0%, 60%, 0.12) transparent !important;
}`);
  sheet.insertRule(`
.portfolio-summary__list .expand-offset {
  padding-inline-end: 0px;
}`);
  sheet.insertRule(`
.portfolio-summary__header {
  padding-right: 0px;
}`);
  sheet.insertRule(`
.order-ticket__sidebar--expanded form > ._formo {
  padding-top: 16px;
}`);
  sheet.insertRule(`
.order-ticket__price-info > div:nth-child(2),
.order-ticket__attach-orders {
  padding-top: 5px;
}`);
  sheet.insertRule(`
textarea#calcNotes {
  width: 94%;
  margin-top: 10px;
  text-transform: uppercase;
  opacity: 0.4;
  margin-left: 15px;
  height: 230px;
  font-size: 21px;
  background: transparent;
  border: 0px !important;
  outline-width: 0px !important;
  color: inherit;
}`);
  sheet.insertRule(`
div.ptf-positions col:nth-child(12) {
  width: 90px !important;
}`);
  sheet.insertRule(`
div.ptf-positions col:nth-child(3),
div.ptf-positions col:nth-child(8) {
  width: 100px !important;
}`);
  sheet.insertRule(`
div.ptf-positions td {
  font-size: 110%;
}`);
  sheet.insertRule(`
div.sl-search-bar {
  zoom: 0.8;
  background-color: #150f0c;
}`);
  sheet.insertRule(`
div.sl-search-results {
  zoom: 1.2;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7743"] {
  color: #bdcc70;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="86"],
div.ptf-positions div[fix="84"] {
  opacity: 0.9;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7681"] span,
div.ptf-positions div[fix="7678"] span,
div.ptf-positions div[fix="7679"] span {
  color: #ae7102;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7290"] span {
  color: #70ccc8;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="85"],
div.ptf-positions div[fix="88"] {
  color: #3392ff;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7671"] span,
div.ptf-positions div[fix="7287"] span,
div.ptf-positions div[fix="7286"] span {
  color: #ac70cc;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7288"] span {
  color: #a754d4;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7288"] {
  position: relative;
  left: -5px;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="7281"] span,
div.ptf-positions div[fix="7087"] span,
div.ptf-positions div[fix="7281"] span,
div.ptf-positions div[fix="7639"] span {
  color: #939393;
}`);
  sheet.insertRule(`
div.ptf-positions div[fix="85"],
div.ptf-positions div[fix="88"],
div.ptf-positions td._npos {
  width: 80px !important;
}`);
  sheet.insertRule(`
div.ptf-positions td[conid] {
  overflow: visible;
}`);
  sheet.insertRule(`
div.ptf-positions table {
  min-width: 2343px !important;
}`);
  sheet.insertRule(`
div.ptf-positions tr:has(td span[fix="77_raw"]._nneg) span[fix="80"] {
  color: #e62333;
}`);
  sheet.insertRule(`
div.ptf-positions tr:has(td span[fix="77_raw"]._npos) span[fix="80"] {
  color: #0eb35b;
}`);
  sheet.insertRule(`
div.ptf-positions > div.flex-fixed {
  position: absolute;
  top: 6px;
  left: 1258px;
  z-index: 1030;
  width: 888px;
}`);
  sheet.insertRule(`
div.ptf-positions h3,
.quote-mini-chart .highcharts-container {
  cursor: pointer;
}`);
  sheet.insertRule(`
div.ptf-positions h3 {
  display: inline;
}`);
  /*div.ptf-positions td:has(span[fix="83"]) {
    overflow: visible;
  }*/
  /*body:has(div#tv-chart) div.quote-nav {
    display: none !important;
  }
  body:has(section.fundamentals-app) div.quote-nav {
    display: none !important;
  }*/
  /* ._con .bg15-accent {background-color: rgb(115 68 9 / 25%);} */
  /* body[hack] div.ptf-positions table td div[fix="86"], body[hack]  div.ptf-positions table td div[fix="84"] {opacity:0.6;}
  @keyframes fadeOpacity {from { opacity: 0.9; }to   { opacity: 0.6; }}
  body[hack] .fade-opacity {animation: fadeOpacity 21s linear forwards;}*/
};

const links = () => {
  const button = document.querySelector('.tws-shortcuts button:last-of-type');
  if (!button) {
    setTimeout(links, 3000);
  } else if (button.innerText != "Today") {
    [{
      text: "Today",
      site: () => window.open('https://www.investing.com/dividends-calendar/', '_blank', "width=1800,height=760,top=230,left=550")
    },{
      text: "WSB",
      site: () => window.open('https://www.reddit.com/r/wallstreetbets/', '_blank', "width=1800,height=760,top=230,left=550")
    },{
      text: "Scan",
      site: () => window.open('https://stockscan.io/stocks/', '_blank', "width=1800,height=760,top=230,left=550")
    },{
      text: "Map",
      site: () => window.open('https://finviz.com/map.ashx?t=sec', '_blank', "width=1800,height=760,top=230,left=550")
    },{
      text: "Trades",
      site: () => window.location.assign('#/orders/trades')
    }].forEach((attr) => {
      const btn = document.createElement("button");
      btn.type = 'button';
      btn.innerHTML = '<span>' + attr.text + ' </span>';
      btn.className = button.className.replace(' tws-skeleton', '');
      button.after(btn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        attr.site()
      });
    })
  }
};

(new MutationObserver((records) => {
  mutation(records);
})).observe(document.body, { childList: true, subtree: true });

window.addEventListener("load", async () => {
  css(true);
  links();
  await speaker();
  await notes();
});

window.navigation.addEventListener("navigate", async () => {
  setTimeout(async () => {
    css(false);
    links();
    await notes();
  }, 500);
});

window.addEventListener("keyup", async (e) => {
  enter(e, e.target);
});

document.addEventListener("click", async (e) => { // console.log(e); } );
  if (!e.target) return;
  await groups(e.target);
  await colors(e, e.target);
  await copy(e, e.target);
  await speaker(e, e.target);
  chart(e, e.target);
  fundamentals(e.target);
  orders(e.target);
  // setcol on click somewhere with: localStorage.setItem("xxtbqt665.U16685488_column", `[{"fix_tag":55,"movable":false,"removable":false,"name":"Instrument","description":"Enter the contract symbol or class as it is defined by the exchange on which it's trading.","groups":["G-3"],"id":"INSTRUMENT"},{"fix_tag":76,"removable":false,"name":"Position","description":"The current aggregate position for the selected account or group or model.","groups":["G2"],"id":"POSITION"},{"fix_tag":74,"name":"Avg Price","description":"The average price of the position.","groups":["G2"],"id":"AVG_PRICE"},{"fix_tag":85,"name":"Ask Size","description":"The number of contracts or shares offered at the ask price.","groups":["G4"],"id":"ASK_SIZE"},{"fix_tag":86,"name":"Ask","description":"The lowest price offered on the contract.","groups":["G4"],"id":"ASK"},{"fix_tag":31,"name":"Last","description":"The last price at which the contract traded. \\"C\\" identifies this price as the previous day's closing price. \\"H\\" means that the trading is halted.","groups":["G4"],"id":"LAST"},{"fix_tag":84,"name":"Bid","description":"The highest-priced bid for the contract.","groups":["G4"],"id":"BID"},{"fix_tag":88,"name":"Bid Size","description":"The number of contracts or shares bid for at the bid price.","groups":["G4"],"id":"BID_SIZE"},{"fix_tag":78,"name":"Daily P&L","description":"Your profit or loss for the day since prior Close Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"DAILY_PL"},{"fix_tag":83,"name":"Change %","description":"The difference between the last price and the close on the previous trading day.","groups":["G4"],"id":"PCT_CHANGE"},{"fix_tag":7681,"name":"Price/EMA(20)","description":"Price to Exponential moving average (N = 20) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA20"},{"fix_tag":7679,"name":"Price/EMA(100)","description":"Price to Exponential moving average (N = 100) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA100"},{"fix_tag":7678,"name":"Price/EMA(200)","description":"Price to Exponential moving average (N = 200) ratio - 1, displayed in percents","groups":["G40"],"id":"PRICE_VS_EMA200"},{"fix_tag":7743,"name":"52 Week Change %","description":"This is the percentage change in the company's stock price over the last fifty two weeks.","groups":["G5"],"id":"52WK_PRICE_PCT_CHANGE"},{"fix_tag":80,"name":"Unrealized P&L %","description":"Unrealized profit or loss. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"UNREALIZED_PL_PCT"},{"fix_tag":77,"name":"Unrealized P&L","description":"Unrealized profit or loss. Right-click on the column header to toggle between displaying the P&L as an absolute value or a percentage or both. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"UNREALIZED_PL"},{"fix_tag":73,"name":"Market Value","description":"The current market value of your position in the security. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"MARKET_VALUE"},{"fix_tag":7639,"name":"% of Net Liq","description":"Displays the market value of the contract as a percentage of the Net Liquidation Value of the account. Value is calculated with realtime valuation of financial instruments. (even when delayed data is displayed in other columns).","groups":["G2"],"id":"PCT_MARKET_VALUE"},{"fix_tag":7287,"name":"Dividend Yield %","description":"This value is the total of the expected dividend payments over the next twelve months per share divided by the Current Price and is expressed as a percentage. For derivatives, this displays the total of the expected dividend payments over the expiry date.","groups":["G14"],"id":"DIV_YIELD"},{"fix_tag":7288,"name":"Dividend Date","description":"Displays the ex-date of the dividend","groups":["G14"],"id":"DIV_DATE"},{"fix_tag":7286,"name":"Dividend Amount","description":"Displays the amount of the next dividend","groups":["G14"],"id":"DIV_AMT"},{"fix_tag":7671,"name":"Annual Dividends","description":"This value is the total of the expected dividend payments over the next twelve months per share.","groups":["G14"],"id":"DIVIDENDS"},{"fix_tag":7290,"name":"P/E excluding extraordinary items","description":"This ratio is calculated by dividing the current Price by the sum of the Diluted Earnings Per Share from continuing operations BEFORE Extraordinary Items and Accounting Changes over the last four interim periods.","groups":["G15"],"id":"PE"},{"fix_tag":7281,"name":"Category","description":"Displays a more detailed level of description within the industry under which the underlying company can be categorized.","groups":["G-3"],"id":"CATEGORY"},{"fix_tag":7289,"name":"Market capitalization","description":"This value is calculated by multiplying the current Price by the current number of Shares Outstanding.","groups":["G15"],"id":"MKT_CAP"}]`)

  // export on click somewhere with: chrome.storage.local.get(null, (data) => console.log(data))
  // import on click somewhere with: chrome.storage.local.set({})
}, true);
