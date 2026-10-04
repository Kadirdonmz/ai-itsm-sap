sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, MessageToast, MessageBox, Filter, FilterOperator) {
    "use strict";

    var AI_SERVICE_URL = "http://localhost:3001/analyze";
    var AI_INDEX_URL   = "http://localhost:3001/index-item";

    return Controller.extend("zitsm.controller.IncidentCreate", {
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("create").attachPatternMatched(this._onRouteMatched, this);

            var oModel = this.getOwnerComponent().getModel("incidents");
            oModel.attachRequestCompleted(this._onRequestCompleted, this);
            oModel.attachRequestFailed(this._onRequestFailed, this);
        },

        _onRouteMatched: function () {
            var oNewModel = new JSONModel({
                Title: "",
                Description: "",
                Priority: "",
                AssignedTo: "",
                TitleFromAI: false,
                PriorityFromAI: false,
                Category: "",
                SupportGroup: "",
                RequestType: "",
                Impact: "",
                Feedback: "",   // user's reason for changing an AI suggestion
                AiUsed: false   // feedback box is shown only after AI analysis
            });
            this.getView().setModel(oNewModel, "new");
            this._bCreating = false;

            this._oAiFile = null;
            this._aSuggestedSolutions = [];
            this._aExpertise = [];
            this._oAiSuggestion = null;   // raw AI suggestions, kept for ZITSM_AISUG
            this._sAiModel = "";

            var oFileUploader = this.byId("aiFileUploader");
            if (oFileUploader) {
                oFileUploader.clear();
            }
        },

        onAiFileSelected: function (oEvent) {
            var oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (!oFile) {
                this._oAiFile = null;
                return;
            }

            if (oFile.type !== "application/pdf") {
                MessageToast.show("Lütfen sadece PDF dosyası seçin.");
                this._oAiFile = null;
                return;
            }

            var that = this;
            var oReader = new FileReader();
            oReader.onload = function (e) {
                var sResult = e.target.result;
                var sBase64 = sResult.substring(sResult.indexOf(",") + 1);

                that._oAiFile = {
                    filename: oFile.name,
                    mimetype: oFile.type,
                    content: sBase64
                };
                MessageToast.show("'" + oFile.name + "' seçildi. Şimdi 'AI ile Analiz Et'e basın.");
            };
            oReader.readAsDataURL(oFile);
        },

        onTitleChange: function () {
            this.getView().getModel("new").setProperty("/TitleFromAI", false);
        },

        // Fill the category's default support group from ZITSM_CATEGORY
        onCategoryChange: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) { return; }
            var oCtx = oItem.getBindingContext("incidents");
            var sGroup = oCtx ? oCtx.getProperty("SupportGroup") : "";
            if (sGroup) {
                this.getView().getModel("new").setProperty("/SupportGroup", sGroup);
            }
        },

        onPriorityChange: function () {
            this.getView().getModel("new").setProperty("/PriorityFromAI", false);
        },

        onAiSuggest: function () {
            var oModel = this.getView().getModel("new");
            var oData = oModel.getData();

            var bHasPdf = this._oAiFile && this._oAiFile.content;
            var bHasText = oData.Description && oData.Description.trim();

            if (!bHasPdf && !bHasText) {
                MessageToast.show("Önce bir PDF seçin veya Açıklama alanına problemi yazın.");
                return;
            }

            var that = this;

            this.getView().setBusy(true);

            var oRequestBody = {};
            if (bHasPdf) {
                oRequestBody.pdfBase64 = this._oAiFile.content;
                oRequestBody.mimeType = this._oAiFile.mimetype;
            }
            if (bHasText) {
                oRequestBody.documentText = oData.Description;
            }

            fetch(AI_SERVICE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oRequestBody)
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that.getView().setBusy(false);

                if (!result || !result.ok) {
                    var sMsg = (result && result.error) || "AI önerisi alınamadı.";
                    var sErrorCode = result && result.code;

                    switch (sErrorCode) {
                        case "EMPTY_DOC":
                            sMsg = "Açıklama alanı boş. Lütfen bir arıza açıklaması yazınız.";
                            break;
                        case "UNSUPPORTED_FILE_TYPE":
                            sMsg = "Sadece PDF dosyaları desteklenmektedir.";
                            break;
                        case "FILE_TOO_LARGE":
                            sMsg = "PDF dosyası çok büyük (en fazla 10 MB).";
                            break;
                        case "AI_TIMEOUT":
                            sMsg = "AI servisi yanıt vermedi (zaman aşımı). Lütfen birkaç saniye sonra deneyin.";
                            break;
                        case "AI_SERVICE_ERROR":
                            sMsg = "AI servisine ulaşılamadı. Lütfen birkaç saniye sonra deneyin.";
                            break;
                        case "GEMINI_NO_CANDIDATES":
                        case "GEMINI_NO_CONTENT":
                        case "GEMINI_EMPTY_TEXT":
                        case "AI_INVALID_JSON":
                            sMsg = "AI'nın cevabı geçerli değildi. Lütfen tekrar deneyin.";
                            break;
                        case "INTERNAL_ERROR":
                            sMsg = "Beklenmeyen bir hata oluştu. Lütfen birkaç saniye sonra deneyin.";
                            break;
                    }

                    MessageBox.error(sMsg);
                    return;
                }

                var ai = result.data;

                // Not enough content: ask for details instead of filling fields
                if (ai.needMoreInfo) {
                    that._oAiSuggestion = null;
                    MessageBox.information(
                        "Açıklama, başlık ve öncelik önermek için yetersiz. Lütfen biraz daha ayrıntı ekleyin."
                    );
                    return;
                }

                var oMap = { "Low": "L", "Medium": "M", "High": "H" };

                // Written to ZITSM_AISUG together with the user's decision on save
                that._oAiSuggestion = {
                    title:          ai.title || "",
                    priority:       oMap[ai.priority] || "",
                    impact:         oMap[ai.impact] || "",
                    category:       ai.category || "",
                    supportGroup:   ai.supportGroup || "",
                    requestType:    ai.requestType || "",
                    reason:         ai.reason || "",
                    categoryReason: ai.categoryReason || "",
                    // Only logged when it was actually used as the description
                    summary:        (ai.summary && !oData.Description) ? ai.summary : "",
                    sourceRef:      (ai.usedSources || []).map(function (s) { return s.id; }).join(",")
                };
                that._sAiModel = result.model || "";

                // Fill only empty fields so user input is never overwritten
                if (ai.title && !oData.Title) {
                    oModel.setProperty("/Title", ai.title);
                    oModel.setProperty("/TitleFromAI", true);
                }

                if (ai.priority && !oData.Priority) {
                    var sPriorityCode = oMap[ai.priority];
                    if (sPriorityCode) {
                        oModel.setProperty("/Priority", sPriorityCode);
                        oModel.setProperty("/PriorityFromAI", true);
                    }
                }

                if (ai.category && !oData.Category) {
                    oModel.setProperty("/Category", ai.category);
                }
                if (ai.supportGroup && !oData.SupportGroup) {
                    oModel.setProperty("/SupportGroup", ai.supportGroup);
                }
                if (ai.requestType && !oData.RequestType) {
                    oModel.setProperty("/RequestType", ai.requestType);
                }
                if (ai.impact && !oData.Impact && oMap[ai.impact]) {
                    oModel.setProperty("/Impact", oMap[ai.impact]);
                }
                // FR-04: a PDF-only request gets its description from the AI summary
                if (ai.summary && !oData.Description) {
                    oModel.setProperty("/Description", ai.summary);
                }
                oModel.setProperty("/AiUsed", true);

                var sReasonMsg = "AI önerileri dolduruldu.";
                if (ai.reason) {
                    sReasonMsg += "\n\nGerekçe: " + ai.reason;
                }
                MessageToast.show(sReasonMsg);

                // Test steps are generated later, when the incident is assigned
                that._aSuggestedSolutions = ai.suggestedSolutions || [];
                that._aExpertise = ai.expertise || [];
                that._aUsedSources = ai.usedSources || [];

                // Incidents show self-service solutions first; requests go straight to expert suggestion
                if (that._aSuggestedSolutions.length > 0) {
                    that._showSolutionDialog();
                } else if (that._aExpertise.length > 0) {
                    that._showExpertiseSuggestion();
                }
            })
            .catch(function (err) {
                that.getView().setBusy(false);
                MessageBox.error(
                    "AI servisine ulaşılamadı. Servisin (node server.js) çalıştığından emin olun.\n\nHata: " +
                    (err.message || "Bilinmeyen hata")
                );
            });
        },

        _showSolutionDialog: function () {
            var that = this;

            var sList = this._aSuggestedSolutions
                .map(function (s, i) { return (i + 1) + ". " + s; })
                .join("\n");

            // Show which KB articles the suggestion is based on
            var sSources = "";
            if (this._aUsedSources && this._aUsedSources.length > 0) {
                sSources = "\n\n📚 Bu öneriler şu kayıtlara dayanmaktadır:\n" +
                    this._aUsedSources.map(function (s) {
                        var sKind = (s.id || "").indexOf("INC-") === 0 ? "Çözülmüş çağrı" : "Bilgi bankası";
                        return "• " + sKind + ": " + s.title + " (" + s.id + ")";
                    }).join("\n");

            }

            MessageBox.show(
                "Kaydı oluşturmadan önce şu çözümleri denemek ister misiniz?\n\n" + sList + sSources,
                {
                    icon: MessageBox.Icon.QUESTION,
                    title: "Önerilen Çözümler",
                    actions: ["Denedim, sorun sürüyor", "Henüz denemedim"],
                    onClose: function (sAction) {
                        if (sAction === "Denedim, sorun sürüyor") {
                            that._showExpertiseSuggestion();
                        }
                    }
                }
            );
        },

        // Maps suggested expertise to real people via ExpertSet
        _showExpertiseSuggestion: function () {
            var aExpertise = this._aExpertise || [];

            if (aExpertise.length === 0) {
                MessageBox.information(
                    "Bu problem için sistemde tanımlı bir uzmanlık alanı bulunamadı. " +
                    "Kaydı oluşturabilir, ilgili ekip yönlendirmesini bekleyebilirsiniz."
                );
                return;
            }

            var oModel = this.getOwnerComponent().getModel("incidents");
            var that = this;
            var aPeople = [];
            var iDone = 0;

            this.getView().setBusy(true);

            aExpertise.forEach(function (sExp) {
                var oFilter = new Filter("Expertise", FilterOperator.EQ, sExp);
                oModel.read("/ExpertSet", {
                    filters: [oFilter],
                    success: function (oData) {
                        (oData.results || []).forEach(function (p) {
                            aPeople.push({
                                expertise: p.Expertise,
                                fullname: (p.Fullname || "").trim(),
                                username: p.Username,
                                email: (p.Email || "").trim()
                            });
                        });
                        iDone++;
                        if (iDone === aExpertise.length) {
                            that.getView().setBusy(false);
                            that._displayPeople(aExpertise, aPeople);
                        }
                    },
                    error: function () {
                        iDone++;
                        if (iDone === aExpertise.length) {
                            that.getView().setBusy(false);
                            that._displayPeople(aExpertise, aPeople);
                        }
                    }
                });
            });
        },

        _displayPeople: function (aExpertise, aPeople) {
            var sMsg;

            if (aPeople.length === 0) {
                sMsg = "Önerilen uzmanlık alanları: " + aExpertise.join(", ") +
                       "\n\nAncak bu alanlarda sistemde tanımlı bir kişi bulunamadı. " +
                       "Kaydı oluşturduğunuzda ilgili ekibe yönlendirilecektir.";
                MessageBox.information(sMsg, { title: "Uzmanlık Önerisi" });
                return;
            }

            var oByExp = {};
            aPeople.forEach(function (p) {
                if (!oByExp[p.expertise]) { oByExp[p.expertise] = []; }
                oByExp[p.expertise].push(p.fullname + " (" + p.username + ")");
            });

            var sList = Object.keys(oByExp).map(function (sExp) {
                return "• " + sExp + ": " + oByExp[sExp].join(", ");
            }).join("\n");

            sMsg = "Bu problem için önerilen uzmanlık alanları ve ilgili kişiler:\n\n" + sList;
            MessageBox.information(sMsg, { title: "İlgili Uzmanlar" });
        },

        onSavePress: function () {
            var oNew = this.getView().getModel("new").getData();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (!oNew.Title) {
                MessageBox.error(oBundle.getText("msgTitleRequired"));
                return;
            }
            if (!oNew.Description) {
                MessageBox.error(oBundle.getText("msgDescRequired"));
                return;
            }
            if (!oNew.Priority) {
                MessageBox.error(oBundle.getText("msgPriorityRequired"));
                return;
            }

            if (this._bCreating) {
                return;
            }

            var oModel = this.getOwnerComponent().getModel("incidents");

            var oPayload = {
                Title: oNew.Title,
                Description: oNew.Description,
                Priority: oNew.Priority,
                AssignedTo: oNew.AssignedTo,
                Category: oNew.Category,
                SupportGroup: oNew.SupportGroup,
                RequestType: oNew.RequestType,
                Impact: oNew.Impact
            };

            this._bCreating = true;
            this.getView().setBusy(true);   // also prevents double submit
            oModel.create("/IncidentSet", oPayload);
        },

        _onRequestCompleted: function (oEvent) {
            if (!this._bCreating) {
                return;
            }
            if (oEvent.getParameter("success")) {
                this._bCreating = false;

                var oResponse = oEvent.getParameter("response");
                var sNewIncidentNo = this._extractIncidentNo(oResponse);

                this._sNewIncidentNo = sNewIncidentNo;

                var that = this;

                // Index right away so similarity and FR-07/FR-09 checks
                // work without a manual reindex
                this._indexNewIncident(sNewIncidentNo, this.getView().getModel("new").getData());

                // Save suggestions, then upload the PDF if any, then finish
                this._saveAiSuggestions(sNewIncidentNo, function () {
                    if (that._oAiFile && that._oAiFile.content && sNewIncidentNo) {
                        that._uploadAttachmentAfterCreate(sNewIncidentNo);
                    } else {
                        that._finishCreate();
                    }
                });
            }
        },

        _indexNewIncident: function (sIncidentNo, oNew) {
            if (!sIncidentNo) { return; }
            var oNow = new Date();
            var sToday = "" + oNow.getFullYear() +
                ("0" + (oNow.getMonth() + 1)).slice(-2) +
                ("0" + oNow.getDate()).slice(-2);

            fetch(AI_INDEX_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id:    sIncidentNo,
                    kind:  "incident",
                    title: oNew.Title,
                    text:  (oNew.Title || "") + ". " + (oNew.Description || ""),
                    meta:  {
                        priority:   oNew.Priority,
                        status:     "O",
                        assignedTo: oNew.AssignedTo,
                        createdOn:  sToday
                    }
                })
            }).catch(function () {
                // Incident is already saved in SAP; reindex can catch up later
            });
        },

        // Writes AI suggestions and user decisions to ZITSM_AISUG.
        // Decision: same as AI -> A, empty -> R, different -> M
        _saveAiSuggestions: function (sIncidentNo, fnDone) {
            var oAi = this._oAiSuggestion;

            if (!oAi || !sIncidentNo) {
                fnDone();
                return;
            }

            var oNew = this.getView().getModel("new").getData();

            var aSug = [
                { type: "TITLE",        value: oAi.title,        final: oNew.Title,        reason: oAi.reason },
                { type: "PRIORITY",     value: oAi.priority,     final: oNew.Priority,     reason: oAi.reason },
                { type: "IMPACT",       value: oAi.impact,       final: oNew.Impact,       reason: oAi.reason },
                { type: "CATEGORY",     value: oAi.category,     final: oNew.Category,     reason: oAi.categoryReason },
                { type: "SUPPORTGROUP", value: oAi.supportGroup, final: oNew.SupportGroup, reason: oAi.categoryReason },
                { type: "REQUESTTYPE",  value: oAi.requestType,  final: oNew.RequestType,  reason: "" },
                { type: "SUMMARY",      value: oAi.summary,      final: oNew.Description,  reason: "Dokümandan otomatik oluşturulan çağrı açıklaması" }
            ].filter
(function (s) { return s.value; });   // skip fields the AI left empty

            var oModel = this.getOwnerComponent().getModel("incidents");
            var sModelName = this._sAiModel;
            var sSourceRef = (oAi.sourceRef || "").substring(0, 100);
            var i = 0;

            // Sequential on purpose: parallel creates collide on SUG_ID (MAX+1)
            var fnNext = function () {
                if (i >= aSug.length) {
                    fnDone();
                    return;
                }
                var s = aSug[i++];
                var sFinal = s.final || "";
                var sDecision = (sFinal === s.value) ? "A" : (!sFinal ? "R" : "M");

                oModel.create("/SuggestionSet", {
                    IncidentNo: sIncidentNo,
                    SugType:    s.type,
                    SugValue:   String(s.value).substring(0, 255),
                    Reason:     String(s.reason || "").substring(0, 255),
                    SourceRef:  sSourceRef,
                    ModelName:  sModelName,
                    Decision:   sDecision,
                    FinalValue: String(sFinal).substring(0, 255),
                    // Feedback only applies to suggestions that were not accepted
                    UserFeedback: sDecision === "A" ? "" : String(oNew.Feedback || "").trim().substring(0, 255)
                }, {
                    success: fnNext,
                    error: function () {
                        console.warn("Could not save AI suggestion:", s.type);
                        fnNext();
                    }
                });
            };

            fnNext();
        },

        _extractIncidentNo: function (oResponse) {
            try {
                var sText = oResponse.responseText || oResponse.body;
                var oBody = JSON.parse(sText);

                if (oBody.d && oBody.d.IncidentNo) {
                    return oBody.d.IncidentNo;
                }

                if (oBody.d && oBody.d.__metadata && oBody.d.__metadata.id) {
                    var sId = oBody.d.__metadata.id;
                    var oMatch = sId.match(/IncidentSet\('([^']+)'\)/);
                    if (oMatch && oMatch[1]) {
                        return oMatch[1];
                    }
                }

                return null;
            } catch (e) {
                console.error("Could not read IncidentNo:", e.message);
                return null;
            }
        },

        _uploadAttachmentAfterCreate: function (sIncidentNo) {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var that = this;

            var oPayload = {
                IncidentNo: sIncidentNo,
                Filename:   this._oAiFile.filename,
                Mimetype:   this._oAiFile.mimetype,
                Content:    this._oAiFile.content
            };

            oModel.create("/AttachmentSet", oPayload, {
                success: function () {
                    that._oAiFile = null;
                    that._finishCreate();
                },
                error: function () {
                    that._oAiFile = null;
                    MessageToast.show("Doküman eklenemedi, ancak devam ediliyor.");
                    that._finishCreate();
                }
            });
        },

        _finishCreate: function () {
            this.getView().setBusy(false);
            MessageToast.show("Incident başarıyla oluşturuldu.");
            this.getOwnerComponent().getModel("incidents").refresh();
            this.getOwnerComponent().getRouter().navTo("list");
        },

        _onRequestFailed: function () {
            if (!this._bCreating) {
                return;
            }
            this._bCreating = false;
            this.getView().setBusy(false);
            MessageBox.error("Oluşturma sırasında hata oluştu.");
        },

        onValueHelpRequest: function () {
            var oView = this.getView();

            if (!this._oValueHelpDialog) {
                this._oValueHelpDialog = sap.ui.xmlfragment(
                    oView.getId(),
                    "zitsm.view.UserValueHelp",
                    this
                );
                oView.addDependent(this._oValueHelpDialog);
            }

            this._oValueHelpDialog.open();
        },

        onUserSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oFilter = new Filter("Username", FilterOperator.Contains, sValue);
            oEvent.getSource().getBinding("items").filter([oFilter]);
        },

        onUserConfirm: function (oEvent) {
            var oSelected = oEvent.getParameter("selectedItem");
            if (oSelected) {
                var sUsername = oSelected.getTitle();
                this.getView().getModel("new").setProperty("/AssignedTo", sUsername);
            }
        },

        onUserCancel: function () {
        },

        onCancelPress: function () {
            this.getOwnerComponent().getRouter().navTo("list");
        }

    });
});
