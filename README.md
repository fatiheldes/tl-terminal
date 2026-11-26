# TL Faiz Terminali

TLREF, TCMB fonlama maliyeti, BIST repo, hazine bonolarından yaklaşık TLREF OIS eğrisi, döviz/altın/Brent/XU100 ve Türkiye ekonomik takvimi tek sayfada.

Canlı sayfa: https://fatiheldes.github.io/tl-terminal/

- `index.html` otomatik üretilir; elle düzenleme. `python3 build.py` ile yeniden oluşturulur.
- `data/` bağlantılardan (TCMB EVDS, Borsa) gelen ham cevapları tutar; zamanlanmış görev hafta içi günde birkaç kez günceller.
- `data/bills_codes.txt` eğride kullanılan, vadesi dolmamış hazine bonolarının EVDS seri kodlarıdır.
- Yaklaşık OIS değerleri gerçek swap kotasyonu değildir; bono fiyatlarından türetilir.
- `vendor/d3.min.js`: D3 v7 (ISC lisansı, `vendor/d3-LICENSE`).
