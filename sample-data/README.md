# Örnek Veri Seti

Bu klasördeki veriler prototipin SAP sisteminden OData servisi üzerinden dışa aktarılmıştır (Ekim 2026). Demo senaryoları bu verilerle çalıştırılmıştır.

| Dosya | İçerik |
|---|---|
| `SAP_Gelistirme_Talebi_DEV-2026-0341.pdf` | Örnek SAP geliştirme talebi: ME21N/ME22N satınalma siparişi limit kontrolü (ilk sürüm, limit 50.000 TL) |
| `SAP_Gelistirme_Talebi_DEV-2026-0341_Rev2.pdf` | Aynı talebin revize sürümü: limit 75.000 TL, dövizli siparişler kapsam dışı, müdüre e-posta bildirimi eklendi. Revizyon analizini denemek için kullanılır. |
| `knowledge-base.json` | Bilgi bankası makaleleri (`ZITSM_KB`). Her makale çözülmüş bir çağrıdan üretilmiştir (`SourceInc`). |
| `incidents.json` | Geçmiş çağrılar (`ZITSM_INCIDENT`): VPN, yazıcı, SAP erişim, bordro, e-ticaret ve satınalma senaryoları |
| `categories.json` | Kategori → varsayılan destek grubu eşlemesi (`ZITSM_CATEGORY`) |

Alan değerleri:

- **Priority / Impact:** `H` = High, `M` = Medium, `L` = Low
- **Status:** `O` = Open, `I` = In Progress, `R` = Resolved, `C` = Closed
- **RequestType:** `incident` = arıza, `request` = geliştirme/değişiklik talebi
- Tarihler SAP biçimindedir: `YYYYMMDD`, saatler `HHMMSS`

Notlar:

- Bazı eski çağrılar, kategori ve etki alanları eklenmeden önce oluşturulduğu için bu alanları boştur.
- Kullanıcı adları SAP test kullanıcılarıdır (`DEVELOPER`, `DEVELOPER1`, `TESTUSER`). Gerçek kişi bilgisi içermez.
- Veriyi kendi sisteminize yüklemek için kategorileri SM30 ile `ZITSM_CATEGORY` tablosuna, makaleleri uygulamadaki **Bilgi Bankası** ekranından girebilirsiniz. Ardından listedeki **İndeksi Yenile** butonu kayıtları AI arama indeksine aktarır.
