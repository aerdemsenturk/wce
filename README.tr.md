# WCE — Wikimedia Commons Editor

Wikimedia Commons kategorileri ve dosya meta verileri için tarayıcı tabanlı bir gezgin ve hafif
düzenleme aracı; kültürel miras içerikleriyle çalışan küçük editoryal ekipler için geliştirildi.

Commons kategori ağacında gezin, dosya meta verilerini inceleyin ve hedefe yönelik düzenlemeler
yapın (açıklamalar, kategoriler, konum, depicts) — bunların hepsi MediaWiki ve Wikidata API'leri
üzerine kurulu, çoğunlukla okuma amaçlı bir proxy ile desteklenen, hızlı ve yerelleştirilmiş bir
arayüz üzerinden.

## Özellikler

- **Kategori gezgini** — alt kategori/dosya sayılarıyla birlikte lazy-load edilen kenar çubuğu
  ağacı, breadcrumb navigasyonu ve geçerli kategori için Wikidata öğe rozeti.
- **Dosya grid'i** — küçük resim, dosya adı, boyut, yükleme yılı içeren responsive kart grid'i;
  her dosya için durum göstergeleri (açıklama / tarih / yazar / lisans / konum) ve bir
  filtre/sıralama çubuğu.
- **Dosya detay paneli** — çok dilli açıklama (`{{Information}}` şablonundan ayrıştırılır),
  tarih, yazar, lisans, tıklanabilir kategoriler, koordinatlar ve Depicts (P180) ifadeleri.
- **Satır içi düzenleme** — dosya açıklamalarını düzenleyin, kategori ekleyin/kaldırın, Depicts
  ifadeleri ekleyin/kaldırın; değişiklikler kuyruğa alınır ve Commons'a gerçek düzenlemeler
  olarak yayınlanır.
- **Sürükle-bırak ile yeniden kategorilendirme** — bir dosyayı veya alt kategoriyi başka bir
  kategorinin üzerine sürükleyerek taşıyın (eski `[[Category:...]]` kaldırılır, yenisi eklenir,
  sıralama anahtarları korunur).
- **Çoklu seçim → yeni kategoride birleştirme** — birden fazla dosya/alt kategori seçip seçimden
  tek adımda yeni bir Commons kategori sayfası oluşturun.
- **Konum** — `{{Location}}` wikitext'ini ve Wikidata koordinatlarını okur, anahtar gerektirmeyen
  MapLibre GL / OpenStreetMap haritasında gösterir, Nominatim ile ters coğrafi kodlama yapar.
  Koordinatlar aynı panelden düzenlenebilir.
- **Arama** — geçerli kategoriyle sınırlı Commons dosya araması (CirrusSearch `incategory:`).
- **i18n** — Türkçe (varsayılan) ve İngilizce, bir çerez ile değiştirilir — URL'de locale segmenti
  yoktur.

## Teknoloji yığını

- **Framework:** Next.js 16 (App Router), React 19
- **Stil:** Tailwind CSS v4 (CSS tabanlı tema yapılandırması, `tailwind.config.js` yok)
- **Harita:** MapLibre GL JS + OpenStreetMap raster tile'lar (API anahtarı gerekmez)
- **i18n:** `next-intl` (çerez tabanlı locale, locale routing yok)
- **Veri kaynakları:** MediaWiki Action API (`commons.wikimedia.org`), Wikidata API
  (`www.wikidata.org`), Nominatim (ters coğrafi kodlama)
- **Kimlik doğrulama:** Wikimedia OAuth 2.0 (yalnızca sahip için consumer — tek hesapla
  düzenleme, login akışı yok)

Tüm üst akış API çağrıları sunucu tarafında, `lib/mediawiki.ts` ve `app/api/` altındaki proxy
route'ları üzerinden yapılır; böylece her zaman doğru bir `User-Agent` gönderilir ve istemci
Wikimedia/Wikidata/Nominatim ile asla doğrudan konuşmaz.

## Başlarken

```bash
npm install
npm run dev      # http://localhost:3000
```

Diğer script'ler:

```bash
npm run build    # production build — projenin typecheck'i de budur (types + lint temiz olmalı)
npm run start     # production build'i çalıştır
npm run lint      # eslint
```

### Ortam değişkenleri

Düzenleme özellikleri, tek bir hesaba bağlı bir Wikimedia OAuth 2.0 erişim token'ı gerektirir.
`.env.local` dosyası oluşturun (gitignore'da):

```
WIKIMEDIA_OAUTH_CLIENT_ID=...
WIKIMEDIA_OAUTH_CLIENT_SECRET=...
WIKIMEDIA_OAUTH_CALLBACK_URL=http://localhost:3000
WIKIMEDIA_OAUTH_ACCESS_TOKEN=...
```

`WIKIMEDIA_OAUTH_ACCESS_TOKEN` olmadan uygulama yine salt-okunur bir gezgin olarak çalışır —
yazma işlemleri devre dışı bırakılır.

## Proje yapısı

```
wce/
├── app/
│   ├── api/commons/{category,file,search}/route.ts   # MediaWiki proxy route'ları
│   ├── api/geocode/reverse/route.ts                  # Nominatim proxy
│   └── api/wikidata/search/route.ts                   # Wikidata arama proxy
├── components/
│   ├── browser/      # BrowserProvider (navigasyon durumu, seçim, bekleyen-değişiklik kuyruğu)
│   ├── category/      # Kenar çubuğu ağacı, breadcrumb, Wikidata rozeti
│   ├── files/         # Dosya/kategori grid'i, filtre çubuğu, kategori oluşturma modalı
│   ├── detail/         # Dosya detay paneli, açıklama/konum/depicts düzenleme, harita
│   ├── layout/         # Header, kenar çubuğu kabuğu, dil değiştirici
│   └── ui/             # Paylaşılan input'lar, picker'lar, toast
├── lib/
│   ├── mediawiki.ts    # Sunucu tarafı MediaWiki/Wikidata istemcisi (okuma + yazma)
│   ├── wikitext.ts     # {{Information}} / {{Location}} ayrıştırma + hedefli yama yardımcıları
│   ├── api.ts          # İstemci fetch yardımcıları + bellek içi cache'ler
│   ├── dnd.ts           # Sürükle-bırak payload yardımcıları
│   ├── pendingChanges.ts # Yayınlamadan önceki yerel düzenleme kuyruğu / undo-redo
│   └── types.ts        # Paylaşılan domain tipleri
├── i18n/                # next-intl yapılandırması, çerez tabanlı locale
└── messages/{tr,en}.json
```

## Durum

Aktif olarak geliştiriliyor. Kategori/dosya gezinme, meta veri görüntüleme ve giderek artan bir
düzenleme işlemleri kümesi (açıklama, kategoriler, konum, depicts), yalnızca sahip için olan bir
OAuth consumer üzerinden gerçek bir Commons hesabına karşı uygulanmış durumda. Henüz bir test
paketi yok — değişiklikleri `npm run build` ile ve tarayıcıda manuel kontrollerle doğrulayın.
