// Manual smoke test for /requirement-diff. Run with: node test.js (service must be running)

fetch("http://localhost:3001/requirement-diff", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    existingRequirements: [
      { reqId: "0000000001", type: "functional", text: "ZNB türündeki satınalma siparişlerinde tutar limiti kontrolü yapılmalı." },
      { reqId: "0000000002", type: "business-rule", text: "50.000 TL üzerindeki siparişlerde kullanıcı uyarılmalı ve sipariş Onay Bekliyor statüsüne alınmalı." },
      { reqId: "0000000003", type: "business-rule", text: "Z_PURCH_MGR yetkisine sahip kullanıcılar kontrolden muaf tutulmalı." },
      { reqId: "0000000004", type: "functional", text: "Dövizli siparişlerde tutar güncel kur ile TL'ye çevrilerek kontrol edilmeli." }
    ],
    tests: [
      { testId: "0000000001", reqId: "0000000002", result: "P", text: "50.000,01 TL siparişte uyarı çıkıyor" },
      { testId: "0000000002", reqId: "0000000002", result: "P", text: "Tam 50.000 TL siparişte uyarı çıkmıyor" },
      { testId: "0000000003", reqId: "0000000003", result: "P", text: "Z_PURCH_MGR kullanıcıda uyarı çıkmıyor" },
      { testId: "0000000004", reqId: "0000000004", result: "P", text: "Dövizli siparişte kur çevrimi doğru" },
      { testId: "0000000005", reqId: "0000000001", result: "P", text: "ZNB dışı tipte kontrol çalışmıyor" }
    ],
    documentText: "REVİZYON 2: ZNB türündeki satınalma siparişlerinde tutar limiti kontrolü yapılmalıdır. Limit 75.000 TL olarak güncellenmiştir; bu tutarın üzerindeki siparişlerde kullanıcı uyarılmalı ve sipariş Onay Bekliyor statüsüne alınmalıdır. Z_PURCH_MGR yetkisine sahip kullanıcılar kontrolden muaftır. Dövizli siparişler bu fazın kapsamından çıkarılmıştır. Ayrıca onaya düşen her sipariş için satınalma müdürüne e-posta bildirimi gönderilmelidir."
  })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)));