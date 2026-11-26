#!/usr/bin/env python3
"""Builds index.html (a single self-contained page) from src/, vendor/ and data/.

data/ holds the raw connector answers, written verbatim:
  rates.txt     EVDS get_series_data  TP.BISTTLREF.ORAN-TP.APIFON4-TP.AOFOBAP (markdown table)
  bills.txt     EVDS get_series_data  <data/bills_codes.txt>, frequency 2       (markdown table)
  fx.txt        Borsa get_quote       USD, EUR, gram-altin, BRENT (fx)          (```tsv block)
  usd.txt       Borsa get_historical_data USD fx 3mo                            (```tsv block)
  bist.txt      Borsa get_index_data  XU100 bist                                ("## index" key: value lines)
  cal_this.txt  Borsa get_economic_calendar TR this_week                        (```tsv block, may be empty)
  cal_next.txt  Borsa get_economic_calendar TR next_week                        (```tsv block, may be empty)
  asof.txt      update time shown in the header, e.g. 26.11.2026 14:30
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
IDS = ['rates', 'bills', 'pka', 'reserves', 'fx', 'crypto', 'usd', 'gold_hist', 'xu100_hist', 'bist', 'bist_quotes', 'bist_hist', 'us_quotes', 'inflation', 'cal_this', 'cal_next', 'cal_global', 'tech', 'xu100_daily', 'gainers', 'losers', 'bonds', 'coupons1', 'coupons2', 'polrates1', 'polrates2', 'nonres', 'funding', 'frn', 'frn_coupons', 'gcpi', 'gca', 'ggdp1', 'ggdp2', 'gq1', 'gq2', 'gq3', 'us_yh', 'etf_h', 'etf_h2', 'wgb', 'cds', 'ratings', 'tr_ratings', 'news', 'futs1', 'futs2', 'struct', 'debt', 'ibs', 'mm_daily', 'mm_weekly', 'usmm', 'fxq1', 'fxq2', 'fxh1', 'fxh2', 'fxh3', 'reer', 'fxops', 'cmq1', 'cmq2', 'cmh1', 'cmh2', 'cmc_cl', 'cmc_bz', 'cmc_ng']


def read(p):
    return (ROOT / p).read_text(encoding='utf-8')


def main():
    raw = {}
    for i in IDS:
        f = ROOT / 'data' / f'{i}.txt'
        raw[i] = f.read_text(encoding='utf-8') if f.exists() else ''
    # sanity checks so a bad fetch never replaces a good page
    if raw['rates'].count('\n|') < 20:
        sys.exit('rates.txt looks empty or malformed; not building')
    if raw['bills'].count('\n|') < 5:
        sys.exit('bills.txt looks empty or malformed; not building')
    asof = read('data/asof.txt').strip()

    part = read('src/template.html').replace('__ASOF__', asof)
    style_start, style_end = part.index('<style>'), part.index('</style>') + len('</style>')
    style, body = part[style_start:style_end], (part[:style_start] + part[style_end:]).strip()
    data_js = 'window.TT_ASOF = ' + json.dumps(asof) + ';\nwindow.TT_RAW = ' + json.dumps(raw, ensure_ascii=False) + ';'
    safe = lambda s: s.replace('</script', '<\\/script')

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="1800">
<title>TL Rates Terminal</title>
{style}
<script>{read('vendor/d3.min.js')}</script>
<script>{safe(data_js)}</script>
<script>{read('src/shim.js')}</script>
</head>
<body>
<div id="dash-root">
{body}
</div>
<script>{read('src/charts.js')}</script>
<script>{read('src/logic.js')}</script>
<script>{read('src/draw.js')}</script>
<script>{read('src/fi.js')}</script>
<script>{read('src/fi2.js')}</script>
<script>{read('src/mm.js')}</script>
<script>{read('src/fx.js')}</script>
<script>{read('src/cmdty.js')}</script>
<script>{read('src/nav.js')}</script>
</body>
</html>
'''
    (ROOT / 'index.html').write_text(html, encoding='utf-8')
    print('index.html built,', len(html), 'bytes, as of', asof)


if __name__ == '__main__':
    main()
