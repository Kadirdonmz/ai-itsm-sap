# Veri Modeli (DDIC)

Tablolar `ZITSM_DPC_BACKUP` programıyla sistemden dışa aktarılmıştır. **K** = anahtar alan.

## ZITSM_AISUG

AI önerileri ve kullanıcı kararları (A/M/R)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| SUG_ID | ✓ |  | CHAR | 10 |
| SUG_TYPE |  |  | CHAR | 20 |
| SUG_VALUE |  |  | CHAR | 255 |
| REASON |  |  | CHAR | 255 |
| SOURCE_REF |  |  | CHAR | 100 |
| DECISION |  |  | CHAR | 1 |
| FINAL_VALUE |  |  | CHAR | 255 |
| MODEL_NAME |  |  | CHAR | 40 |
| CREATED_BY |  | SYUNAME | CHAR | 12 |
| CREATED_ON |  |  | DATS | 8 |
| CREATED_AT |  |  | TIMS | 6 |
| USER_FEEDBACK |  |  | CHAR | 255 |

## ZITSM_ATTACH

Ekler ve test kanıtları (TEST_ID dolu ise kanıt)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| ATTACH_ID | ✓ |  | CHAR | 10 |
| FILENAME |  |  | CHAR | 128 |
| MIMETYPE |  |  | CHAR | 100 |
| FILESIZE |  |  | INT4 | 10 |
| CONTENT |  |  | STRG | 0 |
| UPLOADED_BY |  | SYUNAME | CHAR | 12 |
| UPLOADED_ON |  |  | DATS | 8 |
| TEST_ID |  |  | CHAR | 10 |

## ZITSM_CATEGORY

Kategori → varsayılan destek grubu (SM30 ile bakım)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| CATEGORY | ✓ | ZITSM_DE_CATEGORY | CHAR | 100 |
| SUPPORT_GROUP |  | ZITSM_DE_SUPP_GROUP | CHAR | 100 |
| IS_ACTIVE |  | XFELD | CHAR | 1 |

## ZITSM_CONV

AI sohbet oturumu (R = AI ile çözüldü, T = çağrıya dönüştü)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| CONV_ID | ✓ |  | CHAR | 10 |
| USERNAME |  | SYUNAME | CHAR | 12 |
| INCIDENT_NO |  | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| STATUS |  |  | CHAR | 1 |
| CREATED_ON |  |  | DATS | 8 |
| CREATED_AT |  |  | TIMS | 6 |

## ZITSM_EXPERT

Uzmanlık alanı → uzman kullanıcı eşlemesi

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| EXPERTISE | ✓ |  | CHAR | 30 |
| USERNAME | ✓ | SYUNAME | CHAR | 12 |
| FULLNAME |  |  | CHAR | 60 |
| EMAIL |  |  | CHAR | 100 |

## ZITSM_INCIDENT

Çağrı (ticket) ana tablosu

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| TITLE |  | ZITSM_DE_TITLE | CHAR | 100 |
| DESCRIPTION |  | ZITSM_DE_DESCRIPTION | STRG | 0 |
| PRIORITY |  | ZITSM_DE_PRIORITY | CHAR | 1 |
| STATUS |  | ZITSM_DE_STATUS | CHAR | 1 |
| REPORTER |  | SYUNAME | CHAR | 12 |
| ASSIGNED_TO |  | SYUNAME | CHAR | 12 |
| CREATED_ON |  |  | DATS | 8 |
| CREATED_AT |  |  | TIMS | 6 |
| CLOSED_ON |  |  | DATS | 8 |
| CLOSED_AT |  |  | TIMS | 6 |
| CATEGORY |  |  | CHAR | 100 |
| SUPPORT_GROUP |  |  | CHAR | 30 |
| REQUEST_TYPE |  |  | CHAR | 10 |
| RESOLUTION |  | ZITSM_DE_DESCRIPTION | STRG | 0 |
| IMPACT |  |  | CHAR | 1 |

## ZITSM_INC_LOG

Durum değişikliği geçmişi

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| LOG_ID | ✓ |  | INT4 | 10 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| OLD_STATUS |  | ZITSM_DE_STATUS | CHAR | 1 |
| NEW_STATUS |  | ZITSM_DE_STATUS | CHAR | 1 |
| CHANGED_BY |  | SYUNAME | CHAR | 12 |
| CHANGE_DATE |  |  | DATS | 8 |
| CHANGE_TIME |  |  | TIMS | 6 |

## ZITSM_KB

Bilgi bankası makaleleri

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| KB_ID | ✓ |  | CHAR | 10 |
| TITLE |  |  | CHAR | 100 |
| PROBLEM |  |  | CHAR | 255 |
| CAUSE |  |  | CHAR | 255 |
| SOLUTION |  |  | CHAR | 1000 |
| CHECK_STEPS |  |  | CHAR | 500 |
| TAGS |  |  | CHAR | 200 |
| SOURCE_INC |  | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| CREATED_BY |  | SYUNAME | CHAR | 12 |
| CREATED_ON |  |  | DATS | 8 |

## ZITSM_MSG

Sohbet mesajları (U = kullanıcı, A = asistan)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| CONV_ID | ✓ |  | CHAR | 10 |
| MSG_NO | ✓ |  | NUMC | 4 |
| SENDER |  |  | CHAR | 1 |
| MSG_TEXT |  | ZITSM_DE_DESCRIPTION | STRG | 0 |
| CREATED_ON |  |  | DATS | 8 |
| CREATED_AT |  |  | TIMS | 6 |

## ZITSM_RELNOTE

Değişiklik özeti (release note)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| NOTE_TEXT |  | ZITSM_DE_DESCRIPTION | STRG | 0 |
| DECISION |  |  | CHAR | 1 |
| MODEL_NAME |  |  | CHAR | 40 |
| APPROVED_BY |  | SYUNAME | CHAR | 12 |
| APPROVED_ON |  |  | DATS | 8 |
| APPROVED_AT |  |  | TIMS | 6 |

## ZITSM_REQ

Dokümandan çıkarılan gereksinimler

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| REQ_ID | ✓ |  | CHAR | 10 |
| REQ_TEXT |  |  | CHAR | 255 |
| REQ_TYPE |  |  | CHAR | 20 |
| SOURCE_REF |  |  | CHAR | 100 |
| CREATED_BY |  | SYUNAME | CHAR | 12 |
| CREATED_ON |  |  | DATS | 8 |

## ZITSM_TEST

Test adımları ve sonuçları

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| TEST_ID | ✓ |  | CHAR | 10 |
| TEST_TEXT |  |  | CHAR | 255 |
| IS_DONE |  |  | CHAR | 1 |
| DONE_BY |  | SYUNAME | CHAR | 12 |
| DONE_ON |  |  | DATS | 8 |
| TEST_TYPE |  |  | CHAR | 20 |
| IS_CRITICAL |  |  | CHAR | 1 |
| TEST_RESULT |  |  | CHAR | 1 |
| NOTE |  |  | CHAR | 255 |
| REQ_ID |  |  | CHAR | 10 |
| EXPECTED_RESULT |  |  | CHAR | 255 |

## ZITSM_TEST_HIST

Test sonuç/düzenleme geçmişi (FR-20)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| INCIDENT_NO | ✓ | ZITSM_DE_INCIDENT_NO | NUMC | 10 |
| TEST_ID | ✓ |  | CHAR | 10 |
| HIST_NO | ✓ |  | NUMC | 4 |
| ACTION |  |  | CHAR | 10 |
| TEST_RESULT |  |  | CHAR | 1 |
| NOTE |  |  | CHAR | 255 |
| CHANGED_BY |  | SYUNAME | CHAR | 12 |
| CHANGED_ON |  |  | DATS | 8 |
| CHANGED_AT |  |  | TIMS | 6 |

## ZITSM_USER

Kullanıcı e-posta bilgisi (atama bildirimi)

| Alan | K | Veri elemanı | Tip | Uzunluk |
|---|---|---|---|---|
| MANDT | ✓ | MANDT | CLNT | 3 |
| USERNAME | ✓ | SYUNAME | CHAR | 12 |
| EMAIL |  | AD_SMTPADR | CHAR | 241 |
