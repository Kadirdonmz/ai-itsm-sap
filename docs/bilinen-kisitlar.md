# Bilinen Kısıtlar ve Geliştirilebilecek Alanlar

## Bilinen Kısıtlar

| Alan | Kısıt |
|---|---|
| Yetkilendirme | Rol bazlı (PFCG) yetki kontrolü yoktur. Son kullanıcı, uzman ve yönetici ekranları aynı kullanıcıyla erişilebilir. Sohbet listesi kullanıcıya göre filtrelenmez. |
| Kritik test kuralı | Çözüm metni zorunluluğu backend'de de kontrol edilir, ancak kritik test kontrolü sadece Fiori'de yapılır. OData servisini doğrudan çağıran bir istemci bu kontrolü atlayabilir. |
| Anahtar üretimi | Çağrı numarası numara aralığı nesnesiyle, diğer anahtarlar (`TEST_ID`, `REQ_ID`, `SUG_ID` vb.) `MAX + 1` ile üretilir. Aynı anda çok sayıda kullanıcı kayıt eklerse çakışma olabilir. |
| Vektör indeksi | Tek bir JSON dosyasında tutulur ve tamamı belleğe yüklenir. Birkaç bin kayda kadar yeterlidir; daha büyük veri için vektör veritabanı gerekir. |
| PDF ve RAG | PDF modele doğrudan verilir, metni indekse eklenmez. Sadece PDF ile yapılan analizde bilgi bankası araması yapılmaz. |
| LLM değişkenliği | Aynı girdi için öneriler küçük farklılıklar gösterebilir (örneğin bir testin tipi). Bu yüzden her öneri kullanıcı onayına sunulur ve düzeltmeler kaydedilir. |
| Model kotası | Ücretsiz Gemini kotası dakikalık ve günlük sınırlıdır. Yoğunlukta (503) model `config.js` üzerinden değiştirilebilir. |
| Test geçmişi | Tanım düzenlemesinde geçmişe yeni test metni yazılır; tip, kritiklik veya gereksinim değişikliği ayrıca gösterilmez. |
| Revizyon sonrası test metinleri | Revizyon analizi etkilenen testleri işaretler ve sonuçlarını sıfırlar, ancak test metinlerindeki eski değerleri (örneğin eski limit tutarı) uzmanın güncellemesi gerekir. |
| Test planı onayı | Onay test başına değil plan düzeyindedir. Onaydan sonra yapılan düzenlemeler test geçmişinde görünür ama yeni bir onay istemez. |
| Benzerlik gerekçesi | Ortak ifadeler basit bir kök eşleştirmesiyle (kelimenin ilk 5 harfi) bulunur; eş anlamlı kelimeleri yakalamaz. Asıl benzerlik skoru embedding'den gelir. |
| `ZITSM_AISUG` | Tablo istemci (MANDT) alanı içermez. |
| Dağıtım | AI servisi ve Fiori uygulaması yerel geliştirme ortamında çalışır (`localhost`). AI servisinin adresi controller'larda sabittir. |

## Geliştirilebilecek Alanlar

- PFCG rolleri ile son kullanıcı / uzman / yönetici ayrımı ve sohbetlerin kullanıcıya göre filtrelenmesi
- Tüm anahtarlar için SAP numara aralığı nesneleri
- Vektör indeksinin HANA Vector Engine veya ayrı bir vektör veritabanına taşınması
- PDF metninin parçalara bölünerek indekse eklenmesi (doküman bölümüne kadar kaynak gösterimi)
- Revizyonda etkilenen test metinleri için AI ile güncelleme önerisi
- AI servisi adresinin `manifest.json` içinde bir veri kaynağı olarak tanımlanması ve servisin SAP BTP üzerine taşınması
- Atama e-postasının eski `SO_NEW_DOCUMENT_SEND_API1` fonksiyonu yerine `CL_BCS` ile gönderilmesi
- SLA hedeflerinin (şu an Fiori'de sabit: High 8, Medium 24, Low 72 saat) SAP'de bakımı yapılabilir bir tabloya taşınması
- Test geçmişine tip, kritiklik ve gereksinim değişikliklerinin de yazılması
