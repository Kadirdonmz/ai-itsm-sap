# Uçtan Uca Demo Senaryoları

İki senaryo da canlı sistemde baştan sona çalıştırılmıştır. Kullanılan veriler [`sample-data/`](../sample-data) klasöründedir.

- [Senaryo A: Son kullanıcı destek problemi (VPN)](#senaryo-a-son-kullanıcı-destek-problemi-vpn)
- [Senaryo B: SAP geliştirme / değişiklik talebi (ME21N limit kontrolü)](#senaryo-b-sap-geliştirme--değişiklik-talebi-me21n-limit-kontrolü)

---

## Senaryo A: Son Kullanıcı Destek Problemi (VPN)

### A1. Kullanıcı sorununu asistana anlatır (FR-01, FR-02)

Kullanıcı: *"Evden çalışırken VPN'e bağlanmaya çalışıyorum ama sürekli timeout hatası alıyorum."*

Asistan, bilgi bankasında anlamca en yakın makaleyi bulur (RAG), ilk çözüm adımını önerir ve eksik bilgiyi sorar. Cevabın dayandığı makale altında gösterilir.

### A2. Kullanıcı denediği adımları ve etkiyi anlatır

Kullanıcı: *"Cisco AnyConnect kullanıyorum. İnterneti kontrol ettim, uygulamayı kapatıp açtım, bilgisayarı da yeniden başlattım ama olmadı. Dün akşamdan beri böyle, ekipteki 3 kişi de aynı sorunu yaşıyor."*

Asistan temel adımların denendiğini ve birden fazla kişinin etkilendiğini fark eder, konuyu uzmana yönlendirir.

### A3. Sohbet tek tıkla çağrıya dönüşür (FR-03, FR-04, FR-05, FR-06)

**Çağrı Oluştur** butonu sohbetin tamamını AI servisine gönderir. Kullanıcı hiçbir alanı tekrar yazmaz; onay penceresinde AI önerilerini görür ve gerekirse düzeltir.

- Başlık, öncelik ve etki (gerekçesiyle), talep türü
- Kategori ve destek grubu (sadece SAP'deki `ZITSM_CATEGORY` listesinden)
- Yapılandırılmış açıklama: özet, etkilenen sistem, **kullanıcının denediği adımlar**; sohbet dökümü kanıt olarak altta

Onaylanan her alan, AI'ın önerdiği değer ve kullanıcının kararı ile birlikte `ZITSM_AISUG` tablosuna yazılır.

### A4. Uzman benzer çağrıları ve AI özetini görür (FR-07, FR-08)

Çağrı detayında geçmiş benzer çağrılar embedding benzerliğine göre listelenir. Gösterilen yüzde, iki metnin vektörleri arasındaki gerçek kosinüs benzerliğidir. Her çağrının altında iki metnin ortak ifadeleri gerekçe olarak gösterilir (örneğin *Cisco, AnyConnect, VPN, Bağlantı, Hatası, Timeout*).

**Özet Oluştur** ile uzman için özet, kullanıcının denediği adımlar, muhtemel nedenler ve sonraki aksiyonlar üretilir. Kullanıcının zaten denediği adımlar tekrar önerilmez.

### A5. Çağrı çözülür ve bilgi bankası taslağı üretilir (FR-10)

Uzman çözümü yazıp çağrıyı **Resolved** yapar. Ardından **Bilgi Bankası Makalesi** butonu, uzmanın çözüm metnini temel alarak *Problem > Kök Neden > Çözüm > Kontrol* formatında bir taslak üretir. Uzman düzenleyip kaydeder; makale SAP'ye yazılır ve aynı anda arama indeksine eklenir.

### A6. Döngü kapanır: yeni makale sonraki kullanıcıya önerilir

Yeni bir kullanıcı aynı sorunu yazdığında asistan az önce oluşturulan makaleyi (KB-0000000005) kaynak olarak kullanır. Asistan ayrıca çözülmüş çağrının kendisini de kaynak olarak gösterir: *"Çözülmüş çağrı: Cisco AnyConnect VPN Bağlantı Hatası ve Timeout Sorunu (INC-0000000087)"*.

### A7. Tekrarlayan problem tespiti (FR-09)

Bu kullanıcının sorunu da çözülmeyip çağrıya dönüştüğünde, detay ekranı son 7 günde aynı problemle yüksek benzerlikte 3 çağrı açıldığını tespit eder ve **Problem kaydı** önerir. Benzer çağrıların hepsi açık olsaydı öneri **Major Incident** olurdu. Bu kontrol LLM kullanmaz; indeks üzerinden sayım yapar.

Aynı tabloda çözülmüş çağrının "Nasıl Çözüldü" bilgisi de görünür.

---

## Senaryo B: SAP Geliştirme / Değişiklik Talebi (ME21N Limit Kontrolü)

Kullanılan dokümanlar: [`DEV-2026-0341.pdf`](../sample-data/SAP_Gelistirme_Talebi_DEV-2026-0341.pdf) (ilk sürüm) ve [`DEV-2026-0341_Rev2.pdf`](../sample-data/SAP_Gelistirme_Talebi_DEV-2026-0341_Rev2.pdf) (revizyon).

### B1. Talep dokümanı yüklenir, çağrı alanları AI ile dolar (FR-04, FR-05, FR-06, FR-11)

Kullanıcı **Yeni Incident** ekranında sadece PDF'i seçip **AI ile Öner**'e basar. Başlık, açıklama (doküman özeti), öncelik ve etki (*450 kullanıcı, denetim takvimi* gerekçesiyle High), talep türü, kategori ve destek grubu doldurulur. Talep olduğu için doğrudan uygun uzman önerilir.

AI kategori olarak *SAP > ABAP > Özel Geliştirme* önerdi. Kullanıcı bunu *SAP > MM > Satınalma* olarak değiştirip gerekçesini yazdı. Bu karar `ZITSM_AISUG` tablosuna **M** (değiştirildi) olarak, gerekçesiyle birlikte kaydedilir.

### B2. Dokümandan gereksinimler çıkarılır (FR-12)

Çağrı uzmana atandığında AI, PDF'ten 11 gereksinim çıkarır. Her gereksinimin tipi (fonksiyonel, iş kuralı, sınır koşulu, kısıt, etkilenen alan) ve dokümandaki kaynak bölümü gösterilir.

### B3. Gereksinimlerden test senaryoları üretilir (FR-13, FR-14, FR-15)

Pozitif, negatif, sınır değer, yetki ve regresyon testleri üretilir. Her testte beklenen sonuç, kritiklik ve bağlı gereksinim (REQ → TEST) vardır.

Aynı ekranda geçmişte çözülmüş benzer talep ve nasıl çözüldüğü de görünür (çağrı 66, %84 benzerlik).

### B4. Uzman testleri gözden geçirir (FR-17)

AI ilk testi (limit altındaki siparişte uyarı **çıkmaması**) *Pozitif* olarak işaretlemişti. Uzman bunu *Negatif* olarak düzeltti. Her düzenleme test geçmişine yazılır.

Test Planı bölümünün üstünde planın kökeni görünür:

```
AI test planı: 11 gereksinim, 10 test · 05.10.2026 00:53 · Model: gemini-3.5-flash · Kaynak: SAP_Gelistirme_Talebi_DEV-2026-0341.pdf
Uzman onayı bekleniyor.
```

Uzman planı gözden geçirdikten sonra **Test Planını Onayla** der. Onay penceresi uzmanın AI planına yaptığı değişiklikleri sayar ve onay kim / ne zaman bilgisiyle kaydedilir:

```
Onaylayan: DEVELOPER · 05.10.2026 00:54 · 9 test onaylandı (0 düzenleme, 1 silme, 0 ekleme)
```

### B5. Doküman revize edilir: gereksinim/test fark analizi (bonus)

Rev2 PDF'i yüklenip **Revizyon Analizi** çalıştırılır. AI sadece gereksinim düzeyinde karşılaştırır:

- **Değişen:** limit 50.000 TL → 75.000 TL (ve buna bağlı sınır koşulu)
- **Kaldırılan:** dövizli siparişler kapsam dışı
- **Yeni:** onaya düşen siparişler için müdüre e-posta bildirimi

Etkilenen testler AI'a sorulmaz; REQ ↔ TEST bağlantısından kodda hesaplanır ve sonuçları sıfırlanır.

Uzman ardından kapsam dışı kalan döviz testini sildi, eski tutarları içeren 3 testi güncelledi ve yeni e-posta gereksinimi için kritik bir test ekledi. Bunların hepsi test geçmişinde görünür (FR-20).

### B6. Testler sonuçlandırılır ve kanıt eklenir (FR-15, FR-16)

Uzman sonuçları girer, bir teste açıklama ve ekran görüntüsü ekler. Kanıt dosyası ekler tablosunda ilgili teste bağlı görünür.

### B7. Kritik test tamamlanmadan Resolved engellenir (FR-18, FR-19)

E-posta testi sonuçlandırılmadan **Resolved** denendiğinde sistem kaydı engeller ve engelleyen maddeyi listeler. AI'ın ürettiği test planı onaylanmamışsa bu da engelleyen maddeler arasında gösterilir. Çözüm metni girilmeden de Resolved yapılamaz (aynı kural backend'de `ZITSM 010` mesajıyla da uygulanır).

### B8. Testler tamamlanır, release note üretilir (bonus)

Son test de başarılı işaretlenince çağrı Resolved olur ve AI bir değişiklik özeti taslağı hazırlar. Doğrulama satırı AI'a yazdırılmaz, gerçek test sonuçlarından hesaplanır:

```
Doğrulama:
9 test adımından 9 başarılı, 0 başarısız, 0 uygulanamaz (5 kritik test dahil).
```

Uzman taslağı onayladığında kayıt `Onaylayan: DEVELOPER · 04.10.2026 21:19 · AI taslağı olduğu gibi onaylandı · Model: gemini-3.5-flash` bilgisiyle saklanır. Gereksinimler, testler, sonuçlar, kanıtlar ve tüm değişiklik geçmişi çağrı üzerinde kalır (FR-20).
