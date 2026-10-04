sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "zitsm/model/formatter"
], function (Controller, JSONModel, MessageToast, MessageBox, Filter, FilterOperator, formatter) {
    "use strict";

    var AI_SERVICE_URL    = "http://localhost:3001/analyze";
    var AI_SIMILAR_URL    = "http://localhost:3001/similar";
    var AI_KB_DRAFT_URL   = "http://localhost:3001/kb-draft";
    var AI_INDEX_URL      = "http://localhost:3001/index-item";
    var AI_RECURRING_URL  = "http://localhost:3001/recurring";
    var AI_RELNOTE_URL    = "http://localhost:3001/release-note";
    var AI_REQDIFF_URL    = "http://localhost:3001/requirement-diff";

    return Controller.extend("zitsm.controller.IncidentDetail", {
        formatter: formatter,

        onInit: function () {
            // Summary box stays hidden until a summary is generated
            this.getView().setModel(new JSONModel({ incidentNo: "" }), "summary");
            var oViewModel = new JSONModel({
                editMode: false
            });
            this.getView().setModel(oViewModel, "view");

            this.getView().setModel(new JSONModel({ items: [] }), "attach");
            this.getView().setModel(new JSONModel({ items: [] }), "test");
            this.getView().setModel(new JSONModel({ items: [] }), "req");


            // Similar incidents and recurring problem warning
            this.getView().setModel(new JSONModel({
                items: [],
                loading: false,
                recurringVisible: false,
                recurringText: "",
                recurringType: "Warning"
            }), "similar");

            this.getView().setModel(new JSONModel({
                exists: false, text: "", decision: "", modelName: "", metaText: ""
            }), "relnote");

            // FR-17 / traceability: AI test plan origin and expert approval
            this.getView().setModel(new JSONModel({ exists: false, approved: false, text: "" }), "testplan");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("detail").attachPatternMatched(this._onObjectMatched, this);

            var oIncidentModel = this.getOwnerComponent().getModel("incidents");
            oIncidentModel.attachRequestFailed(this._onRequestFailed, this);
            oIncidentModel.attachRequestCompleted(this._onRequestCompleted, this);
        },

        _onObjectMatched: function (oEvent) {
            this.getView().getModel("view").setProperty("/editMode", false);

            var sIncidentNo = oEvent.getParameter("arguments").incidentNo;
            this._sIncidentNo = sIncidentNo;
            this._bindIncident(sIncidentNo);
            this._loadAttachments();
            this._loadRequirements();
            this._loadTests();
            this._loadTestPlanInfo();
            this._loadSimilarIncidents();
            this._loadReleaseNote();
        },

        _bindIncident: function (sIncidentNo) {
            this.getView().bindElement({
                path: "/IncidentSet('" + sIncidentNo + "')",
                model: "incidents"
            });

            var oLogTable = this.byId("logTable");
            if (oLogTable) {
                var oBinding = oLogTable.getBinding("items");
                if (oBinding) {
                    var oFilter = new Filter("IncidentNo", FilterOperator.EQ, sIncidentNo);
                    oBinding.filter([oFilter]);
                }
            }
        },

        // --- Attachments ---
        _loadAttachments: function () {
            var oModel = this.getView().getModel("incidents");
            var oAttachModel = this.getView().getModel("attach");
            var sPath = "/IncidentSet('" + this._sIncidentNo + "')/AttachmentSet";

            var that = this;
            oModel.read(sPath, {
                success: function (oData) {
                    oAttachModel.setProperty("/items", oData.results || []);
                    that._linkEvidence();
                },
                error: function () {
                    oAttachModel.setProperty("/items", []);
                }
            });
        },

        // FR-16: links attachments with a TestId to their test row.
        // Called after both loads since they finish independently.
        _linkEvidence: function () {
            var oTestModel = this.getView().getModel("test");
            var aTests = oTestModel.getProperty("/items") || [];
            var aAtt = this.getView().getModel("attach").getProperty("/items") || [];

            aTests.forEach(function (t, i) {
                var aEv = aAtt.filter(function (a) { return a.TestId && a.TestId === t.TestId; });
                oTestModel.setProperty("/items/" + i + "/Evidence", aEv);
            });
        },

        // --- Requirements and tests ---
        _loadRequirements: function () {
            var oModel = this.getView().getModel("incidents");
            var oReqModel = this.getView().getModel("req");

            var oFilter = new Filter("IncidentNo", FilterOperator.EQ, this._sIncidentNo);

            oModel.read("/RequirementSet", {
                filters: [oFilter],
                success: function (oData) {
                    oReqModel.setProperty("/items", oData.results || []);
                },
                error: function () {
                    oReqModel.setProperty("/items", []);
                }
            });
        },

        _loadTests: function () {
            var oModel = this.getView().getModel("incidents");
            var oTestModel = this.getView().getModel("test");
            var that = this;

            var oFilter = new Filter("IncidentNo", FilterOperator.EQ, this._sIncidentNo);

            oModel.read("/TestSet", {
                filters: [oFilter],
                success: function (oData) {
                    var aItems = (oData.results || []).map(function (t) {
                        return {
                            IncidentNo: t.IncidentNo,
                            TestId:     t.TestId,
                            TestText:   t.TestText,
                            TestType:   t.TestType,
                            IsCritical: t.IsCritical,
                            TestResult: t.TestResult,
                            Note:       t.Note,
                            ReqId:      t.ReqId,
                            IsDone:     t.IsDone,
                            DoneBy:     t.DoneBy,
                            DoneOn:     t.DoneOn,
                            ExpectedResult: t.ExpectedResult,
                            Evidence:   []
                        };
                    });
                    oTestModel.setProperty("/items", aItems);
                    that._linkEvidence();

                    // Assigned but no tests yet: generate them
                    that._checkAndGenerateIfAssigned();
                },
                error: function () {
                    oTestModel.setProperty("/items", []);
                }
            });
        },

        // --- Similar incidents (FR-07) ---
        _loadSimilarIncidents: function () {
            var that = this;
            var oSimModel = this.getView().getModel("similar");

            oSimModel.setProperty("/items", []);
            oSimModel.setProperty("/loading", true);
            oSimModel.setProperty("/recurringVisible", false);

            // Wait briefly for the incident binding to be ready
            setTimeout(function () {
                var oCtx = that.getView().getBindingContext("incidents");
                if (!oCtx) {
                    oSimModel.setProperty("/loading", false);
                    return;
                }

                var oIncident = oCtx.getObject();
                var sQuery = (oIncident.Title || "") + ". " + (oIncident.Description || "");

                if (!sQuery.trim()) {
                    oSimModel.setProperty("/loading", false);
                    return;
                }

                fetch(AI_SIMILAR_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: sQuery,
                        kind: "incident",
                        excludeId: that._sIncidentNo
                    })
                })
                .then(function (res) { return res.json(); })
                .then(function (result) {
                    oSimModel.setProperty("/loading", false);

                    if (!result || !result.ok) {
                        return;   // no matches is not an error
                    }

                    var aResults = (result.data && result.data.results) || [];
                    var aItems = aResults.map(function (r) {
                        return {
                            IncidentNo: r.id,
                            Title:      r.title,
                            Text:       r.text,
                            Status:     (r.meta && r.meta.status) || "",
                            Priority:   (r.meta && r.meta.priority) || "",
                            Score:      r.score,
                            ScorePct:   Math.round(r.score * 100) + "%",
                            SharedTerms: (r.sharedTerms || []).join(", "),

                            // FR-07: show the resolution, or a status-based hint if none
                            Resolution: (r.meta && r.meta.resolution) ||
                                        ((r.meta && (r.meta.status === "R" || r.meta.status === "C"))
                                            ? "Çözüm kaydı girilmemiş."
                                            : "Henüz çözülmedi.")
                        };
                    });

                    oSimModel.setProperty("/items", aItems);

                    that._checkRecurringProblem(sQuery);
                })
                .catch(function () {
                    oSimModel.setProperty("/loading", false);
                    // Panel stays empty if the AI service is down
                });
            }, 800);
        },

        // FR-09: flags a problem reported many times in a short period.
        // Uses index similarity counts only, no LLM call.
        _checkRecurringProblem: function (sQuery) {
            var oSimModel = this.getView().getModel("similar");

            fetch(AI_RECURRING_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: sQuery,
                    excludeId: this._sIncidentNo
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (!result || !result.ok || !result.data.isRecurring) {
                    oSimModel.setProperty("/recurringVisible", false);
                    return;
                }

                var d = result.data;
                var sText, sType;

                var sWindow = "Son " + (d.windowDays || 7) + " günde";

                if (d.recommendation === "MAJOR_INCIDENT") {
                    sType = "Error";
                    sText = "Toplu kesinti şüphesi: " + sWindow + " bu problemle yüksek benzerlikte " +
                            d.count + " çağrı açıldı, " + d.openCount + " tanesi hâlâ açık. " +
                            "Bu bir Major Incident olabilir; ilgili ekiple değerlendirilmesi önerilir.";
                } else {
                    sType = "Warning";
                    sText = "Tekrarlayan problem: " + sWindow + " bu problemle yüksek benzerlikte " +
                            d.count + " çağrı açıldı (" + d.openCount + " açık). " +
                            "Kök neden giderilmemiş olabilir; Problem kaydı açılması önerilir.";
                }

                oSimModel.setProperty("/recurringType", sType);
                oSimModel.setProperty("/recurringText", sText);
                oSimModel.setProperty("/recurringVisible", true);
            })
            .catch(function () {
                oSimModel.setProperty("/recurringVisible", false);
            });
        },

        onSimilarPress: function (oEvent) {
            var oItem = oEvent.getSource().getBindingContext("similar").getObject();
            this.getOwnerComponent().getRouter().navTo("detail", {
                incidentNo: oItem.IncidentNo
            });
        },

        // --- AI summary for the support engineer (FR-08) ---
        onSummaryPress: function () {
            var oCtx = this.getView().getBindingContext("incidents");
            if (!oCtx) { return; }
            var oData = oCtx.getObject();
            var that = this;

            this.getView().setBusy(true);

            fetch("http://localhost:3001/summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: oData.Title,
                    description: oData.Description
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that.getView().setBusy(false);

                if (!result || !result.ok) {
                    MessageBox.error((result && result.error) || "Özet oluşturulamadı.");
                    return;
                }

                var d = result.data;

                var fnBullets = function (aList, sEmpty) {
                    if (!aList || aList.length === 0) { return sEmpty; }
                    return aList.map(function (s) { return "• " + s; }).join("\n");
                };

                var oSummaryModel = new JSONModel({
                    incidentNo:  oData.IncidentNo,
                    summary:     d.summary,
                    triedText:   fnBullets(d.triedSteps, "Kayıtlarda belirtilmemiş."),
                    causesText:  fnBullets(d.likelyCauses, "-"),
                    actionsText: fnBullets(d.nextActions, "-")
                });
                that.getView().setModel(oSummaryModel, "summary");
            })
            .catch(function () {
                that.getView().setBusy(false);
                MessageBox.error("AI servisine ulaşılamadı. Servisin (node server.js) çalıştığından emin olun.");
            });
        },

        // --- Knowledge base draft (FR-10) ---
        onCreateKbPress: function () {
            var that = this;
            var oCtx = this.getView().getBindingContext("incidents");
            if (!oCtx) { return; }

            var oIncident = oCtx.getObject();

            // Test notes help the model infer the root cause
            var aTests = this.getView().getModel("test").getProperty("/items") || [];
            var sTestNotes = aTests
                .filter(function (t) { return t.TestResult || t.Note; })
                .map(function (t) {
                    var sRes = t.TestResult === "P" ? "Başarılı"
                             : t.TestResult === "F" ? "Başarısız"
                             : t.TestResult === "N" ? "Uygulanamaz" : "-";
                    return "- " + t.TestText + " [" + sRes + "]" +
                           (t.Note ? " Not: " + t.Note : "");
                })
                .join("\n");

            this.getView().setBusy(true);
            MessageToast.show("Bilgi bankası makalesi hazırlanıyor...");

            fetch(AI_KB_DRAFT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title:       oIncident.Title,
                    description: oIncident.Description,
                    resolution:  oIncident.Resolution,   // primary source for cause and solution
                    testNotes:   sTestNotes
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that.getView().setBusy(false);

                if (!result || !result.ok) {
                    MessageBox.error("Makale taslağı oluşturulamadı: " +
                        ((result && result.error) || "AI servisi yanıt vermedi."));
                    return;
                }

                that._showKbDraftDialog(result.data);
            })
            .catch(function () {
                that.getView().setBusy(false);
                MessageBox.error("AI servisine ulaşılamadı.");
            });
        },

        // Editable draft for human approval
        _showKbDraftDialog: function (oDraft) {
            var that = this;

            if (this._oKbDialog) {
                this._oKbDialog.destroy();
                this._oKbDialog = null;
            }

            function field(sLabel, sId, sValue, iRows) {
                return [
                    new sap.m.Label({ text: sLabel, labelFor: sId, design: "Bold" }),
                    new sap.m.TextArea(sId, {
                        value: sValue || "",
                        width: "100%",
                        rows: iRows || 2,
                        growing: false
                    })
                ];
            }

            var aContent = []
                .concat(field("Başlık", "kbTitle", oDraft.title, 1))
                .concat(field("Problem", "kbProblem", oDraft.problem, 3))
                .concat(field("Kök Neden", "kbCause", oDraft.cause, 2))
                .concat(field("Çözüm Adımları", "kbSolution", oDraft.solution, 6))
                .concat(field("Kontrol Adımları", "kbCheck", oDraft.checkSteps, 3))
                .concat(field("Etiketler", "kbTags", oDraft.tags, 1));

            this._oKbDialog = new sap.m.Dialog({
                title: "Bilgi Bankası Makalesi (AI Taslağı)",
                contentWidth: "40rem",
                resizable: true,
                content: [
                    new sap.m.MessageStrip({
                        text: "Bu taslak AI tarafından üretilmiştir. Kaydetmeden önce gözden geçirip düzenleyebilirsiniz.",
                        type: "Information",
                        showIcon: true,
                        class: "sapUiSmallMarginBottom"
                    }),
                    new sap.m.VBox({ items: aContent, class: "sapUiSmallMargin" })
                ],
                beginButton: new sap.m.Button({
                    text: "Kaydet",
                    type: "Emphasized",
                    press: function () { that._saveKbArticle(); }
                }),
                endButton: new sap.m.Button({
                    text: "İptal",
                    press: function () { that._oKbDialog.close(); }
                })
            });

            this.getView().addDependent(this._oKbDialog);
            this._oKbDialog.open();
        },

        _saveKbArticle: function () {
            var that = this;
            var core = sap.ui.getCore();

            var sTitle = core.byId("kbTitle").getValue().trim();
            if (!sTitle) {
                MessageToast.show("Başlık boş olamaz.");
                return;
            }

            var oPayload = {
                Title:      sTitle,
                Problem:    core.byId("kbProblem").getValue().trim(),
                Cause:      core.byId("kbCause").getValue().trim(),
                Solution:   core.byId("kbSolution").getValue().trim(),
                CheckSteps: core.byId("kbCheck").getValue().trim(),
                Tags:       core.byId("kbTags").getValue().trim(),
                SourceInc:  this._sIncidentNo
            };

            var oModel = this.getView().getModel("incidents");
            this.getView().setBusy(true);

            oModel.create("/KnowledgeArticleSet", oPayload, {
                success: function (oData) {
                    that.getView().setBusy(false);
                    that._oKbDialog.close();
                    MessageToast.show("Bilgi bankası makalesi kaydedildi.");

                    if (oData && oData.KbId) {
                        that._indexKbArticle(oData.KbId, oPayload);
                    }
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Makale kaydedilemedi.");
                }
            });
        },

        _indexKbArticle: function (sKbId, oArticle) {
            fetch(AI_INDEX_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id:    sKbId,
                    kind:  "kb",
                    title: oArticle.Title,
                    text:  oArticle.Title + ". " + oArticle.Problem + " " + oArticle.Solution,
                    meta:  { sourceInc: oArticle.SourceInc }
                })
            }).catch(function () {
                // Article is already saved in SAP; reindex can catch up later
            });
        },

        // Keeps the search index in sync for similarity and FR-09
        _indexIncident: function (oInc) {
            if (!oInc || !oInc.IncidentNo) { return; }
            fetch(AI_INDEX_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id:    oInc.IncidentNo,
                    kind:  "incident",
                    title: oInc.Title,
                    // Resolution is embedded too so matches carry how it was solved
                    text:  (oInc.Title || "") + ". " + (oInc.Description || "") +
                           (oInc.Resolution ? " Çözüm: " + oInc.Resolution : ""),
                    meta:  {
                        priority:   oInc.Priority,
                        status:     oInc.Status,
                        assignedTo: oInc.AssignedTo,
                        createdOn:  oInc.CreatedOn,
                        resolution: (oInc.Resolution || "").substring(0, 300)
                    }
                })
            }).catch(function () {
                // Incident is already saved in SAP; reindex can catch up later
            });
        },

        // --- AI test plan generation ---
        _checkAndGenerateIfAssigned: function () {
            var aTests = this.getView().getModel("test").getProperty("/items") || [];
            if (aTests.length > 0) {
                return;
            }

            var oCtx = this.getView().getBindingContext("incidents");
            if (!oCtx) { return; }

            var sAssignedTo = oCtx.getProperty("AssignedTo");
            var sStatus = oCtx.getProperty("Status");

            if (sAssignedTo && sStatus !== "C") {
                this._generateTestStepsForAssignment();
            }
        },

        // Generates the test plan when the incident is assigned to an expert
        _generateTestStepsForAssignment: function () {
            var that = this;
            var aExisting = this.getView().getModel("test").getProperty("/items") || [];

            if (aExisting.length > 0) {
                return;
            }

            var oCtx = this.getView().getBindingContext("incidents");
            if (!oCtx) { return; }
            var oIncident = oCtx.getObject();

            MessageToast.show("Test planı hazırlanıyor...");

            // Prefer the attached PDF over the description
            var aAttachments = this.getView().getModel("attach").getProperty("/items") || [];
            var oPdf = aAttachments.filter(function (a) {
                return a.Mimetype === "application/pdf" && !a.TestId;   // test evidence is not a request document
            })[0];

            if (oPdf) {
                var oModel = this.getView().getModel("incidents");
                var sPath = "/AttachmentSet(IncidentNo='" + oPdf.IncidentNo +
                            "',AttachId='" + oPdf.AttachId + "')";

                oModel.read(sPath, {
                    success: function (oData) {
                        that._callAiForTestSteps({
                            pdfBase64: oData.Content,
                            mimeType:  "application/pdf"
                        }, oPdf.Filename);
                    },
                    error: function () {
                        // Fall back to the description if the PDF can't be read
                        that._callAiForTestSteps({ documentText: oIncident.Description }, "Çağrı açıklaması");
                    }
                });
            } else {
                this._callAiForTestSteps({ documentText: oIncident.Description }, "Çağrı açıklaması");
            }
        },

        // sSource: where the plan came from (PDF file name or description), kept for traceability
        _callAiForTestSteps: function (oRequestBody, sSource) {
            var that = this;

            fetch(AI_SERVICE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oRequestBody)
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (!result || !result.ok) {
                    MessageToast.show("Test planı oluşturulamadı: " +
                        ((result && result.error) || "AI servisi yanıt vermedi."));
                    return;
                }

                var aReqs  = (result.data && result.data.requirements) || [];
                var aSteps = (result.data && result.data.testSteps) || [];

                if (aReqs.length === 0 && aSteps.length === 0) {
                    MessageToast.show("AI bu talep için gereksinim veya test önermedi.");
                    return;
                }

                // Requirements first so tests can link to their ReqId
                that._saveRequirements(aReqs, function (oReqIdMap) {
                    that._saveTestSteps(aSteps, oReqIdMap, function (aTestIds) {
                        that._logTestPlan(result.model, sSource, Object.keys(oReqIdMap).length, aTestIds);
                    });
                });
            })
            .catch(function () {
                MessageToast.show("AI servisine ulaşılamadı, test planı oluşturulamadı.");
            });
        },

        // Saves requirements sequentially; fnDone receives a map
        // from AI labels ("REQ-01") to SAP ReqIds
        _saveRequirements: function (aReqs, fnDone) {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var oReqIdMap = {};
            var iIndex = 0;

            function saveNext() {
                if (iIndex >= aReqs.length) {
                    fnDone(oReqIdMap);
                    return;
                }

                var oReq = aReqs[iIndex];
                var sAiId = oReq.id;
                iIndex++;

                var oPayload = {
                    IncidentNo: that._sIncidentNo,
                    ReqText:    oReq.text,
                    ReqType:    oReq.type,
                    SourceRef:  oReq.sourceRef
                };

                oModel.create("/RequirementSet", oPayload, {
                    success: function (oData) {
                        if (oData && oData.ReqId) {
                            oReqIdMap[sAiId] = oData.ReqId;
                        }
                        saveNext();
                    },
                    error: function () {
                        saveNext();
                    }
                });
            }

            saveNext();
        },

        // Saves tests one by one; parallel creates collided on test_id
        _saveTestSteps: function (aSteps, oReqIdMap, fnDone) {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var iIndex = 0;
            var aTestIds = [];

            function saveNext() {
                if (iIndex >= aSteps.length) {
                    MessageToast.show(aTestIds.length + " test adımı oluşturuldu.");
                    that._loadRequirements();
                    that._loadTests();
                    if (fnDone) { fnDone(aTestIds); }
                    return;
                }

                var oStep = aSteps[iIndex];
                iIndex++;

                // Older responses may return plain strings
                var sText       = (typeof oStep === "string") ? oStep : oStep.text;
                var sType       = (typeof oStep === "string") ? "pozitif" : (oStep.type || "pozitif");
                var bCritical   = (typeof oStep === "string") ? false : (oStep.isCritical === true);
                var sAiReqId    = (typeof oStep === "string") ? "" : (oStep.reqId || "");
                var sRealReqId  = (oReqIdMap && oReqIdMap[sAiReqId]) ? oReqIdMap[sAiReqId] : "";

                var oPayload = {
                    IncidentNo: that._sIncidentNo,
                    TestText:   sText,
                    TestType:   sType,
                    IsCritical: bCritical ? "X" : "",
                    ReqId:      sRealReqId,
                    ExpectedResult: (typeof oStep === "string") ? "" : String(oStep.expectedResult || "").substring(0, 255),
                    TestResult: "",
                    Note:       ""
                };

                oModel.create("/TestSet", oPayload, {
                    success: function (oData) {
                        aTestIds.push(oData && oData.TestId);
                        saveNext();
                    },

                    error: function () {
                        saveNext();
                    }
                });
            }

            saveNext();
        },

        // --- AI test plan traceability and approval (FR-17) ---

        // Logs what the AI generated, from which source and with which model.
        // FinalValue keeps the generated test IDs so the review can tell what the expert changed.
        _logTestPlan: function (sModel, sSource, iReqCount, aTestIds) {
            var that = this;
            var aIds = aTestIds.filter(Boolean).map(function (s) { return String(parseInt(s, 10)); });

            this.getView().getModel("incidents").create("/SuggestionSet", {
                IncidentNo: this._sIncidentNo,
                SugType:    "TESTPLAN",
                SugValue:   "AI test planı: " + iReqCount + " gereksinim, " + aIds.length + " test",
                Reason:     ("Kaynak: " + (sSource || "-")).substring(0, 255),
                SourceRef:  (sSource || "").substring(0, 100),
                ModelName:  sModel || "",
                Decision:   "",
                FinalValue: ("T:" + aIds.join(",")).substring(0, 255),
                UserFeedback: ""
            }, {
                success: function () { that._loadTestPlanInfo(); },
                error: function () { console.warn("Could not log the AI test plan."); }
            });
        },

        _loadTestPlanInfo: function () {
            var that = this;
            var oPlanModel = this.getView().getModel("testplan");

            this.getView().getModel("incidents").read("/SuggestionSet", {
                filters: [new Filter("IncidentNo", FilterOperator.EQ, this._sIncidentNo)],
                success: function (oData) {
                    var aRows = oData.results || [];
                    var fnLast = function (sType) {
                        return aRows.filter(function (r) { return r.SugType === sType; })
                            .sort(function (a, b) { return a.SugId < b.SugId ? 1 : -1; })[0];
                    };
                    var oPlan = fnLast("TESTPLAN");
                    var oReview = fnLast("TESTREVIEW");

                    if (!oPlan) {
                        oPlanModel.setData({ exists: false, approved: false, text: "" });
                        return;
                    }

                    var bApproved = !!(oReview && oReview.SugId > oPlan.SugId);
                    var sText = oPlan.SugValue + " · " + that._fmtStamp(oPlan.CreatedOn, oPlan.CreatedAt) +
                        " · Model: " + (oPlan.ModelName || "-") + " · " + oPlan.Reason;
                    sText += bApproved
                        ? "\nOnaylayan: " + oReview.CreatedBy + " · " + that._fmtStamp(oReview.CreatedOn, oReview.CreatedAt) +
                          " · " + oReview.SugValue + " (" + oReview.Reason + ")"
                        : "\nUzman onayı bekleniyor. Testleri gözden geçirip düzenledikten sonra planı onaylayın.";

                    oPlanModel.setData({ exists: true, approved: bApproved, text: sText, plan: oPlan });
                },
                error: function () {
                    oPlanModel.setData({ exists: false, approved: false, text: "" });
                }
            });
        },

        // Approval is logged as a TESTREVIEW row: A if the AI plan was kept as is, M if the expert changed it
        onApproveTestPlanPress: function () {
            var that = this;
            var oPlan = this.getView().getModel("testplan").getProperty("/plan");
            if (!oPlan) { return; }

            var aGenerated = (oPlan.FinalValue || "").replace(/^T:/, "").split(",").filter(Boolean);
            var aCurrent = (this.getView().getModel("test").getProperty("/items") || [])
                .map(function (t) { return String(parseInt(t.TestId, 10)); });

            this.getView().getModel("incidents").read("/TestHistorySet", {
                filters: [new Filter("IncidentNo", FilterOperator.EQ, this._sIncidentNo)],
                success: function (oData) {
                    var aHist = oData.results || [];
                    var iEdits = aHist.filter(function (h) { return h.Action === "EDIT"; }).length;
                    var iDeletes = aHist.filter(function (h) { return h.Action === "DELETE"; }).length;
                    var iAdded = aCurrent.filter(function (id) { return aGenerated.indexOf(id) === -1; }).length;
                    var sDecision = (iEdits + iDeletes + iAdded === 0) ? "A" : "M";
                    var sChanges = iEdits + " düzenleme, " + iDeletes + " silme, " + iAdded + " ekleme";

                    MessageBox.confirm(
                        aCurrent.length + " test adımından oluşan plan onaylanacak.\n\n" +
                        "AI'ın ürettiği plan: " + aGenerated.length + " test\nUzman değişiklikleri: " + sChanges +
                        "\n\nOnay, kim ve ne zaman bilgisiyle kaydedilir. Devam edilsin mi?",
                        {
                            title: "Test Planını Onayla",
                            onClose: function (sAction) {
                                if (sAction !== MessageBox.Action.OK) { return; }
                                that._saveTestPlanReview(oPlan, sDecision, aCurrent.length, sChanges);
                            }
                        }
                    );
                },
                error: function () {
                    MessageBox.error("Test geçmişi okunamadı, onay kaydedilemedi.");
                }
            });
        },

        _saveTestPlanReview: function (oPlan, sDecision, iTestCount, sChanges) {
            var that = this;

            this.getView().getModel("incidents").create("/SuggestionSet", {
                IncidentNo: this._sIncidentNo,
                SugType:    "TESTREVIEW",
                SugValue:   iTestCount + " test onaylandı",
                Reason:     sChanges,
                SourceRef:  oPlan.SourceRef || "",
                ModelName:  oPlan.ModelName || "",
                Decision:   sDecision,
                FinalValue: oPlan.SugValue || "",
                UserFeedback: ""
            }, {
                success: function () {
                    MessageToast.show("Test planı onaylandı.");
                    that._loadTestPlanInfo();
                },
                error: function () {
                    MessageBox.error("Onay kaydedilemedi.");
                }
            });
        },

        // "YYYYMMDD" + "HHMMSS" -> "DD.MM.YYYY HH:MM"
        _fmtStamp: function (sDate, sTime) {
            var d = sDate || "";
            var t = sTime || "";
            if (d.length !== 8) { return ""; }
            return d.substring(6, 8) + "." + d.substring(4, 6) + "." + d.substring(0, 4) +
                (t.length >= 4 ? " " + t.substring(0, 2) + ":" + t.substring(2, 4) : "");
        },

        // --- Test editing (FR-17) ---
        onTestResultChange: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("test");
            var sPath = oCtx.getPath();
            var sKey = oEvent.getSource().getSelectedKey();

            this.getView().getModel("test").setProperty(sPath + "/TestResult", sKey);
        },

        onTestNoteChange: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("test");
            var sPath = oCtx.getPath();
            var sValue = oEvent.getSource().getValue();

            this.getView().getModel("test").setProperty(sPath + "/Note", sValue);
        },

        onTestDeletePress: function (oEvent) {
            var oItem = oEvent.getSource().getBindingContext("test").getObject();
            var that = this;

            MessageBox.confirm("Bu test adımını silmek istiyor musunuz?\n\n" + oItem.TestText, {
                title: "Test Adımını Sil",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    var oModel = that.getView().getModel("incidents");
                    var sPath = "/TestSet(IncidentNo='" + oItem.IncidentNo +
                                "',TestId='" + oItem.TestId + "')";

                    oModel.remove(sPath, {
                        success: function () {
                            MessageToast.show("Test adımı silindi.");
                            that._loadTests();
                        },
                        error: function () {
                            MessageToast.show("Test adımı silinemedi.");
                        }
                    });
                }
            });
        },

        // Edits a test step's text, type, criticality and requirement.
        // A changed definition invalidates an existing result, so it is reset.
        onTestEditPress: function (oEvent) {
            var that = this;
            var oCtx = oEvent.getSource().getBindingContext("test");
            var sRowPath = oCtx.getPath();
            var oItem = oCtx.getObject();

            var aReqs = this.getView().getModel("req").getProperty("/items") || [];
            var aReqItems = [new sap.ui.core.Item({ key: "", text: "— Bağlı değil —" })]
                .concat(aReqs.map(function (r) {
                    var sText = (r.ReqText || "");
                    if (sText.length > 70) { sText = sText.substring(0, 70) + "…"; }
                    return new sap.ui.core.Item({ key: r.ReqId, text: "REQ-" + r.ReqId + "  " + sText });
                }));

            var oForm = new JSONModel({
                TestText:   oItem.TestText || "",
                TestType:   oItem.TestType || "pozitif",
                IsCritical: oItem.IsCritical === "X",
                ReqId:      oItem.ReqId || "",
                ExpectedResult: oItem.ExpectedResult || ""
            });

            var fnLabel = function (sText, bReq) {
                return new sap.m.Label({ text: sText, required: !!bReq }).addStyleClass("sapUiSmallMarginTop");
            };

            var oDialog = new sap.m.Dialog({
                title: "Test Adımını Düzenle",
                contentWidth: "36rem",
                content: [
                    new sap.m.VBox({
                        items: [
                            fnLabel("Test adımı", true),
                            new sap.m.TextArea({ value: "{form>/TestText}", width: "100%", rows: 4, growing: true }),

                            fnLabel("Beklenen sonuç"),
                            new sap.m.TextArea({ value: "{form>/ExpectedResult}", width: "100%", rows: 2, growing: true, maxLength: 255 }),

                            fnLabel("Test tipi"),
                            new sap.m.Select({
                                selectedKey: "{form>/TestType}",
                                width: "100%",
                                items: [
                                    new sap.ui.core.Item({ key: "pozitif",   text: "Pozitif" }),
                                    new sap.ui.core.Item({ key: "negatif",   text: "Negatif" }),
                                    new sap.ui.core.Item({ key: "sinir",     text: "Sınır Değer" }),
                                    new sap.ui.core.Item({ key: "yetki",     text: "Yetki" }),
                                    new sap.ui.core.Item({ key: "regresyon", text: "Regresyon" })
                                ]
                            }),

                            fnLabel("Bağlı gereksinim"),
                            new sap.m.Select({
                                selectedKey: "{form>/ReqId}",
                                width: "100%",
                                items: aReqItems
                            }),

                            new sap.m.CheckBox({
                                text: "Kritik test (sonuçlanmadan talep Resolved yapılamaz)",
                                selected: "{form>/IsCritical}"
                            }).addStyleClass("sapUiSmallMarginTop")
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new sap.m.Button({
                    text: "Kaydet",
                    type: "Emphasized",
                    press: function () {
                        var f = oForm.getData();
                        var sText = (f.TestText || "").trim();
                        if (!sText) {
                            MessageToast.show("Test adımı metni boş olamaz.");
                            return;
                        }

                        var oNew = {
                            TestText:   sText,
                            TestType:   f.TestType,
                            IsCritical: f.IsCritical ? "X" : "",
                            ReqId:      f.ReqId || "",
                            ExpectedResult: (f.ExpectedResult || "").trim()
                        };

                        var bChanged = oNew.TestText !== (oItem.TestText || "") ||
                                       oNew.TestType !== (oItem.TestType || "") ||
                                       oNew.IsCritical !== (oItem.IsCritical || "") ||
                                       oNew.ReqId !== (oItem.ReqId || "") ||
                                       oNew.ExpectedResult !== (oItem.ExpectedResult || "");
                        if (!bChanged) {
                            oDialog.close();
                            return;
                        }

                        var bDefinitionChanged = oNew.TestText !== (oItem.TestText || "") ||
                                                 oNew.TestType !== (oItem.TestType || "") ||
                                                 oNew.ReqId !== (oItem.ReqId || "") ||
                                                 oNew.ExpectedResult !== (oItem.ExpectedResult || "");
                        var bHasResult = !!oItem.TestResult;

                        var fnSave = function (bResetResult) {
                            oDialog.close();
                            that._saveTestEdit(sRowPath, oItem, oNew, bResetResult);
                        };

                        if (bDefinitionChanged && bHasResult) {
                            MessageBox.confirm(
                                "Bu test daha önce sonuçlandırılmış. Test tanımı değiştiği için önceki sonuç ve açıklama sıfırlanacak; testin yeniden yapılması gerekecek.\n\nDevam edilsin mi?",
                                {
                                    title: "Sonuç Sıfırlanacak",
                                    onClose: function (sAction) {
                                        if (sAction === MessageBox.Action.OK) { fnSave(true); }
                                    }
                                }
                            );
                        } else {
                            fnSave(false);
                        }
                    }
                }),
                endButton: new sap.m.Button({
                    text: "İptal",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.setModel(oForm, "form");
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        // Updates only this row; reloading the list would drop unsaved results in other rows
        _saveTestEdit: function (sRowPath, oItem, oNew, bResetResult) {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var oTestModel = this.getView().getModel("test");

            var sPath = "/TestSet(IncidentNo='" + oItem.IncidentNo +
                        "',TestId='" + oItem.TestId + "')";

            var oPayload = {
                IncidentNo: oItem.IncidentNo,
                TestId:     oItem.TestId,
                TestText:   oNew.TestText,
                TestType:   oNew.TestType,
                IsCritical: oNew.IsCritical,
                ReqId:      oNew.ReqId,
                ExpectedResult: oNew.ExpectedResult,
                TestResult: bResetResult ? "" : (oItem.TestResult || ""),
                Note:       bResetResult ? "" : (oItem.Note || "")
            };

            this.getView().setBusy(true);

            oModel.update(sPath, oPayload, {
                merge: true,
                success: function () {
                    that.getView().setBusy(false);
                    oTestModel.setProperty(sRowPath + "/TestText",   oPayload.TestText);
                    oTestModel.setProperty(sRowPath + "/TestType",   oPayload.TestType);
                    oTestModel.setProperty(sRowPath + "/IsCritical", oPayload.IsCritical);
                    oTestModel.setProperty(sRowPath + "/ReqId",      oPayload.ReqId);
                    oTestModel.setProperty(sRowPath + "/ExpectedResult", oPayload.ExpectedResult);
                    if (bResetResult) {
                        oTestModel.setProperty(sRowPath + "/TestResult", "");
                        oTestModel.setProperty(sRowPath + "/Note", "");
                    }
                    MessageToast.show(bResetResult
                        ? "Test adımı güncellendi; sonucu sıfırlandı."
                        : "Test adımı güncellendi.");
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Test adımı güncellenemedi.");
                }
            });
        },

        // --- Test evidence (FR-16) ---
        // Stored as a normal attachment, linked to the test via TestId
        onTestEvidencePress: function (oEvent) {
            var that = this;
            var oItem = oEvent.getSource().getBindingContext("test").getObject();
            var aTests = this.getView().getModel("test").getProperty("/items") || [];
            var iNo = aTests.indexOf(oItem) + 1;
            var oFile = null;

            var oUploader = new sap.ui.unified.FileUploader({
                width: "100%",
                buttonText: "Dosya Seç",
                placeholder: "Ekran görüntüsü, log veya belge seçin",
                change: function (e) {
                    var f = e.getParameter("files") && e.getParameter("files")[0];
                    if (!f) { oFile = null; return; }
                    var oReader = new FileReader();
                    oReader.onload = function (ev) {
                        var s = ev.target.result;
                        oFile = {
                            filename: f.name,
                            mimetype: f.type || "application/octet-stream",
                            content:  s.substring(s.indexOf(",") + 1)
                        };
                    };
                    oReader.readAsDataURL(f);
                }
            });

            var oDialog = new sap.m.Dialog({
                title: "Test " + iNo + " – Kanıt Ekle",
                contentWidth: "32rem",
                content: [
                    new sap.m.VBox({
                        items: [
                            new sap.m.Text({ text: oItem.TestText }).addStyleClass("sapUiSmallMarginBottom"),
                            oUploader
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new sap.m.Button({
                    text: "Yükle",
                    type: "Emphasized",
                    icon: "sap-icon://upload",
                    press: function () {
                        if (!oFile) {
                            MessageToast.show("Önce bir dosya seçin.");
                            return;
                        }
                        oDialog.close();
                        that._uploadEvidence(oItem, oFile);
                    }
                }),
                endButton: new sap.m.Button({
                    text: "İptal",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _uploadEvidence: function (oTest, oFile) {
            var that = this;
            var oModel = this.getView().getModel("incidents");

            this.getView().setBusy(true);
            oModel.create("/AttachmentSet", {
                IncidentNo: this._sIncidentNo,
                Filename:   oFile.filename,
                Mimetype:   oFile.mimetype,
                Content:    oFile.content,
                TestId:     oTest.TestId
            }, {
                success: function () {
                    that.getView().setBusy(false);
                    MessageToast.show("Kanıt dosyası eklendi.");
                    that._loadAttachments();
                },
                error: function (oError) {
                    that.getView().setBusy(false);
                    var sMsg = "Kanıt dosyası yüklenemedi.";
                    try {
                        var oBody = JSON.parse(oError.responseText);
                        if (oBody.error && oBody.error.message && oBody.error.message.value) {
                            sMsg = oBody.error.message.value;
                        }
                    } catch (e) {}
                    MessageBox.error(sMsg);
                }
            });
        },

        onEvidenceDownloadPress: function (oEvent) {
            var oAtt = oEvent.getSource().getBindingContext("test").getObject();
            var oModel = this.getView().getModel("incidents");
            var sPath = "/AttachmentSet(IncidentNo='" + oAtt.IncidentNo +
                        "',AttachId='" + oAtt.AttachId + "')";
            var that = this;

            oModel.read(sPath, {
                success: function (oData) {
                    that._triggerDownload(oData.Content, oAtt.Filename, oAtt.Mimetype);
                },
                error: function () {
                    MessageToast.show("Dosya indirilemedi.");
                }
            });
        },

        // --- Test history (FR-20) ---
        onTestHistoryPress: function () {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var aTests = this.getView().getModel("test").getProperty("/items") || [];

            // Deleted tests have no row number, so they get a generic label
            var oTestMap = {};
            aTests.forEach(function (t, i) {
                oTestMap[t.TestId] = "Test " + (i + 1) + ": " + (t.TestText || "");
            });

            this.getView().setBusy(true);
            oModel.read("/TestHistorySet", {
                filters: [new Filter("IncidentNo", FilterOperator.EQ, this._sIncidentNo)],
                success: function (oData) {
                    that.getView().setBusy(false);

                    var aRows = (oData.results || []).map(function (h) {
                        return {
                            Test:    oTestMap[h.TestId] || ("Silinmiş test (" + h.TestId.replace(/^0+/, "") + ")"),
                            Action:  that.formatHistAction(h.Action),
                            Result:  that.formatResultText(h.TestResult),
                            Note:    h.Note,
                            By:      h.ChangedBy,
                            When:    that.formatItemDate(h.ChangedOn) + " " +
                                     (h.ChangedAt ? h.ChangedAt.substring(0, 2) + ":" + h.ChangedAt.substring(2, 4) : ""),
                            Sort:    h.ChangedOn + h.ChangedAt
                        };
                    }).sort(function (a, b) { return a.Sort < b.Sort ? 1 : -1; });   // newest first

                    that._showTestHistoryDialog(aRows);
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Test geçmişi okunamadı.");
                }
            });
        },

        _showTestHistoryDialog: function (aRows) {
            var oHistModel = new JSONModel({ items: aRows });

            var oTable = new sap.m.Table({
                noDataText: "Bu talep için henüz test geçmişi kaydı yok.",
                columns: [
                    new sap.m.Column({ header: new sap.m.Text({ text: "Tarih" }), width: "9rem" }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Test" }) }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "İşlem" }), width: "8rem" }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Sonuç" }), width: "7rem" }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Açıklama / Yeni tanım" }),
                                       minScreenWidth: "Tablet", demandPopin: true }),
                    new sap.m.Column({ header: new sap.m.Text({ text: "Kullanıcı" }), width: "7rem" })
                ]
            });
            oTable.bindItems({
                path: "hist>/items",
                template: new sap.m.ColumnListItem({
                    cells: [
                        new sap.m.Text({ text: "{hist>When}" }),
                        new sap.m.Text({ text: "{hist>Test}" }),
                        new sap.m.Text({ text: "{hist>Action}" }),
                        new sap.m.Text({ text: "{hist>Result}" }),
                        new sap.m.Text({ text: "{hist>Note}" }),
                        new sap.m.Text({ text: "{hist>By}" })
                    ]
                })
            });

            var oDialog = new sap.m.Dialog({
                title: "Test Geçmişi",
                contentWidth: "70rem",
                resizable: true,
                draggable: true,
                content: [
                    new sap.m.MessageStrip({
                        text: "Test sonuçlarındaki her değişiklik (sonuç girme, sıfırlama, tanım düzenleme, silme) SAP'de ayrı bir kayıt olarak saklanır; önceki sonuçlar kaybolmaz.",
                        type: "Information",
                        showIcon: true
                    }).addStyleClass("sapUiSmallMargin"),
                    oTable
                ],
                endButton: new sap.m.Button({
                    text: "Kapat",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.setModel(oHistModel, "hist");
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        // Same fields as the edit dialog so manual tests can be linked to a requirement (FR-14)
        onTestAddPress: function () {
            var that = this;

            var aReqs = this.getView().getModel("req").getProperty("/items") || [];
            var aReqItems = [new sap.ui.core.Item({ key: "", text: "— Bağlı değil —" })]
                .concat(aReqs.map(function (r) {
                    var sText = (r.ReqText || "");
                    if (sText.length > 70) { sText = sText.substring(0, 70) + "…"; }
                    return new sap.ui.core.Item({ key: r.ReqId, text: "REQ-" + r.ReqId + "  " + sText });
                }));

            var oForm = new JSONModel({
                TestText: "", ExpectedResult: "", TestType: "pozitif", ReqId: "", IsCritical: false
            });

            var fnLabel = function (sText, bReq) {
                return new sap.m.Label({ text: sText, required: !!bReq }).addStyleClass("sapUiSmallMarginTop");
            };

            var oDialog = new sap.m.Dialog({
                title: "Yeni Test Adımı",
                contentWidth: "36rem",
                content: [
                    new sap.m.VBox({
                        items: [
                            fnLabel("Test adımı", true),
                            new sap.m.TextArea({ value: "{form>/TestText}", width: "100%", rows: 3, growing: true }),

                            fnLabel("Beklenen sonuç"),
                            new sap.m.TextArea({ value: "{form>/ExpectedResult}", width: "100%", rows: 2, growing: true, maxLength: 255 }),

                            fnLabel("Test tipi"),
                            new sap.m.Select({
                                selectedKey: "{form>/TestType}",
                                width: "100%",
                                items: [
                                    new sap.ui.core.Item({ key: "pozitif",   text: "Pozitif" }),
                                    new sap.ui.core.Item({ key: "negatif",   text: "Negatif" }),
                                    new sap.ui.core.Item({ key: "sinir",     text: "Sınır Değer" }),
                                    new sap.ui.core.Item({ key: "yetki",     text: "Yetki" }),
                                    new sap.ui.core.Item({ key: "regresyon", text: "Regresyon" })
                                ]
                            }),

                            fnLabel("Bağlı gereksinim"),
                            new sap.m.Select({ selectedKey: "{form>/ReqId}", width: "100%", items: aReqItems }),

                            new sap.m.CheckBox({
                                text: "Kritik test (sonuçlanmadan talep Resolved yapılamaz)",
                                selected: "{form>/IsCritical}"
                            }).addStyleClass("sapUiSmallMarginTop")
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new sap.m.Button({
                    text: "Ekle",
                    type: "Emphasized",
                    press: function () {
                        var f = oForm.getData();
                        var sText = (f.TestText || "").trim();
                        if (!sText) {
                            MessageToast.show("Test adımı metni boş olamaz.");
                            return;
                        }
                        oDialog.close();
                        that._createManualTest(sText, f.IsCritical, (f.ExpectedResult || "").trim(), f.TestType, f.ReqId);
                    }
                }),
                endButton: new sap.m.Button({
                    text: "İptal",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.setModel(oForm, "form");
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _createManualTest: function (sText, bCritical, sExpected, sType, sReqId) {
            var that = this;
            var oModel = this.getView().getModel("incidents");

            var oPayload = {
                IncidentNo: this._sIncidentNo,
                TestText:   sText,
                TestType:   sType || "pozitif",
                IsCritical: bCritical ? "X" : "",
                ReqId:      sReqId || "",
                ExpectedResult: sExpected || "",
                TestResult: "",
                Note:       ""
            };

            oModel.create("/TestSet", oPayload, {
                success: function () {
                    MessageToast.show("Test adımı eklendi.");
                    that._loadTests();
                },
                error: function () {
                    MessageToast.show("Test adımı eklenemedi.");
                }
            });
        },

        onSaveTestsPress: function () {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var aItems = this.getView().getModel("test").getProperty("/items") || [];

            if (aItems.length === 0) {
                MessageToast.show("Kaydedilecek test adımı yok.");
                return;
            }

            var iDone = 0;
            var iTotal = aItems.length;
            var bAnyError = false;

            this.getView().setBusy(true);

            aItems.forEach(function (oItem) {
                var sPath = "/TestSet(IncidentNo='" + oItem.IncidentNo +
                            "',TestId='" + oItem.TestId + "')";

                var oPayload = {
                    IncidentNo: oItem.IncidentNo,
                    TestId:     oItem.TestId,
                    TestText:   oItem.TestText,
                    TestType:   oItem.TestType,
                    IsCritical: oItem.IsCritical,
                    ReqId:      oItem.ReqId,
                    ExpectedResult: oItem.ExpectedResult || "",
                    TestResult: oItem.TestResult || "",
                    Note:       oItem.Note || ""
                };

                oModel.update(sPath, oPayload, {
                    merge: true,
                    success: function () {
                        iDone++;
                        if (iDone === iTotal) {
                            that.getView().setBusy(false);
                            MessageToast.show(bAnyError
                                ? "Bazı test adımları kaydedilemedi."
                                : "Test sonuçları kaydedildi.");
                            that._loadTests();
                        }
                    },
                    error: function () {
                        bAnyError = true;
                        iDone++;
                        if (iDone === iTotal) {
                            that.getView().setBusy(false);
                            MessageToast.show("Bazı test adımları kaydedilemedi.");
                            that._loadTests();
                        }
                    }
                });
            });
        },

        // --- Attachment upload/download ---
        onFileSelected: function (oEvent) {
            var oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (!oFile) {
                this._oSelectedFile = null;
                return;
            }

            var that = this;
            var oReader = new FileReader();
            oReader.onload = function (e) {
                var sResult = e.target.result;
                var sBase64 = sResult.substring(sResult.indexOf(",") + 1);

                that._oSelectedFile = {
                    filename: oFile.name,
                    mimetype: oFile.type || "application/octet-stream",
                    content: sBase64
                };
            };
            oReader.readAsDataURL(oFile);
        },

        onUploadPress: function () {
            if (!this._oSelectedFile) {
                MessageToast.show("Önce bir dosya seçin.");
                return;
            }

            var oModel = this.getView().getModel("incidents");

            var oPayload = {
                IncidentNo: this._sIncidentNo,
                Filename:   this._oSelectedFile.filename,
                Mimetype:   this._oSelectedFile.mimetype,
                Content:    this._oSelectedFile.content
            };

            this._bUploading = true;
            oModel.create("/AttachmentSet", oPayload, {
                success: function () {
                    this._bUploading = false;
                    MessageToast.show("Dosya yüklendi.");
                    this._oSelectedFile = null;
                    var oFU = this.byId("fileUploader");
                    if (oFU) { oFU.clear(); }
                    this._loadAttachments();
                }.bind(this),
                error: function (oError) {
                    this._bUploading = false;
                    var sMsg = "Dosya yüklenemedi.";
                    try {
                        var oBody = JSON.parse(oError.responseText);
                        if (oBody.error && oBody.error.message && oBody.error.message.value) {
                            sMsg = oBody.error.message.value;
                        }
                    } catch (e) {}
                    MessageBox.error(sMsg);
                }.bind(this)
            });
        },

        onDownloadPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("attach");
            var oItem = oCtx.getObject();

            var oModel = this.getView().getModel("incidents");
            var sPath = "/AttachmentSet(IncidentNo='" + oItem.IncidentNo +
                        "',AttachId='" + oItem.AttachId + "')";

            var that = this;
            oModel.read(sPath, {
                success: function (oData) {
                    that._triggerDownload(oData.Content, oItem.Filename, oItem.Mimetype);
                },
                error: function () {
                    MessageToast.show("Dosya indirilemedi.");
                }
            });
        },

        onDeletePress: function (oEvent) {
            var oItem = oEvent.getSource().getBindingContext("attach").getObject();
            var that = this;

            MessageBox.confirm("'" + oItem.Filename + "' ekini silmek istiyor musunuz?", {
                title: "Eki Sil",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }

                    var oModel = that.getView().getModel("incidents");
                    var sPath = "/AttachmentSet(IncidentNo='" + oItem.IncidentNo +
                                "',AttachId='" + oItem.AttachId + "')";

                    that._bAttachOp = true;
                    oModel.remove(sPath, {
                        success: function () {
                            that._bAttachOp = false;
                            MessageToast.show("Ek silindi.");
                            that._loadAttachments();
                        },
                        error: function (oError) {
                            that._bAttachOp = false;
                            var sMsg = "Ek silinemedi.";
                            try {
                                var oBody = JSON.parse(oError.responseText);
                                if (oBody.error && oBody.error.message && oBody.error.message.value) {
                                    sMsg = oBody.error.message.value;
                                }
                            } catch (e) {}
                            MessageBox.error(sMsg);
                        }
                    });
                }
            });
        },

        _triggerDownload: function (sBase64, sFilename, sMimetype) {
            if (!sBase64) {
                MessageToast.show("Dosya içeriği boş.");
                return;
            }

            var sBinary = atob(sBase64);
            var aBytes = new Uint8Array(sBinary.length);
            for (var i = 0; i < sBinary.length; i++) {
                aBytes[i] = sBinary.charCodeAt(i);
            }
            var oBlob = new Blob([aBytes], { type: sMimetype || "application/octet-stream" });

            var sUrl = window.URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = sFilename || "dosya";
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            window.URL.revokeObjectURL(sUrl);
        },

        // --- Release note (bonus) ---

        // An empty record means no note yet, not an error
        _loadReleaseNote: function () {
            var oModel = this.getView().getModel("incidents");
            var oRel = this.getView().getModel("relnote");
            var that = this;

            oModel.read("/ReleaseNoteSet('" + this._sIncidentNo + "')", {
                success: function (d) {
                    var bExists = !!(d.NoteText && d.NoteText.trim());
                    oRel.setData({
                        exists:    bExists,
                        text:      d.NoteText || "",
                        decision:  d.Decision || "",
                        modelName: d.ModelName || "",
                        metaText:  bExists ? that._buildRelNoteMeta(d) : ""
                    });
                },
                error: function () {
                    oRel.setData({ exists: false, text: "", decision: "", modelName: "", metaText: "" });
                }
            });
        },

        _buildRelNoteMeta: function (d) {
            var sDate = formatter.dateText(d.ApprovedOn);
            var sTime = (d.ApprovedAt && d.ApprovedAt.length === 6)
                ? d.ApprovedAt.substring(0, 2) + ":" + d.ApprovedAt.substring(2, 4) : "";
            var sDecision = d.Decision === "A"
                ? "AI taslağı olduğu gibi onaylandı"
                : "Uzman tarafından düzenlenerek onaylandı";

            return "Onaylayan: " + d.ApprovedBy + " · " + sDate + " " + sTime +
                   " · " + sDecision + (d.ModelName ? " · Model: " + d.ModelName : "");
        },

        onReleaseNotePress: function () {
            var that = this;
            if (this.getView().getModel("relnote").getProperty("/exists")) {
                MessageBox.confirm(
                    "Bu çağrının onaylanmış bir değişiklik özeti var. Yerine yeni bir AI taslağı hazırlansın mı?",
                    {
                        onClose: function (sAction) {
                            if (sAction === MessageBox.Action.OK) { that._generateReleaseNote(); }
                        }
                    }
                );
            } else {
                this._generateReleaseNote();
            }
        },

        onReleaseNoteEditPress: function () {
            var oRel = this.getView().getModel("relnote");
            this._sRelNoteAiText = null;
            this._sRelNoteModel = oRel.getProperty("/modelName");
            this._showReleaseNoteDialog(oRel.getProperty("/text"), false);
        },

        _generateReleaseNote: function () {
            var that = this;
            var oCtx = this.getView().getBindingContext("incidents");
            if (!oCtx) { return; }
            var oInc = oCtx.getObject();

            var aReqs = (this.getView().getModel("req").getProperty("/items") || []).map(function (r) {
                return { id: "REQ-" + r.ReqId, text: r.ReqText };
            });

            var aTests = (this.getView().getModel("test").getProperty("/items") || []).map(function (t) {
                return {
                    text:       t.TestText,
                    type:       t.TestType,
                    result:     t.TestResult,
                    isCritical: t.IsCritical === "X",
                    note:       t.Note
                };
            });

            this.getView().setBusy(true);
            MessageToast.show("Değişiklik özeti hazırlanıyor...");

            fetch(AI_RELNOTE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    incidentNo:   this._sIncidentNo,
                    title:        oInc.Title,
                    description:  oInc.Description,
                    category:     oInc.Category,
                    requestType:  oInc.RequestType,
                    resolution:   oInc.Resolution,
                    requirements: aReqs,
                    tests:        aTests
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that.getView().setBusy(false);

                if (!result || !result.ok) {
                    MessageBox.error("Değişiklik özeti oluşturulamadı: " +
                        ((result && result.error) || "AI servisi yanıt vermedi."));
                    return;
                }

                that._sRelNoteAiText = result.data.noteText;
                that._sRelNoteModel = result.model || "";
                that._showReleaseNoteDialog(result.data.noteText, true);
            })
            .catch(function () {
                that.getView().setBusy(false);
                MessageBox.error("AI servisine ulaşılamadı. Değişiklik özetini daha sonra 'AI ile Oluştur' butonuyla üretebilirsiniz.");
            });
        },

        // Editable draft for human approval
        _showReleaseNoteDialog: function (sText, bFromAi) {
            var that = this;

            if (this._oRelDialog) {
                this._oRelDialog.destroy();
                this._oRelDialog = null;
            }

            var aContent = [];
            if (bFromAi) {
                aContent.push(new sap.m.MessageStrip({
                    text: "Bu taslak AI tarafından çağrı bilgileri, gereksinimler ve test sonuçlarından üretilmiştir. " +
                          "'Doğrulama' bölümündeki sayılar gerçek test kayıtlarından hesaplanmıştır. " +
                          "Onaylamadan önce gözden geçirip düzenleyebilirsiniz.",
                    type: "Information",
                    showIcon: true
                }).addStyleClass("sapUiSmallMarginBottom"));
            }
            aContent.push(new sap.m.TextArea("relNoteText", {
                value: sText || "",
                width: "100%",
                rows: 20,
                growing: false
            }));

            this._oRelDialog = new sap.m.Dialog({
                title: "Değişiklik Özeti (Release Note)",
                contentWidth: "44rem",
                resizable: true,
                draggable: true,
                content: [new sap.m.VBox({ items: aContent }).addStyleClass("sapUiSmallMargin")],
                beginButton: new sap.m.Button({
                    text: "Onayla ve Kaydet",
                    type: "Emphasized",
                    press: function () { that._saveReleaseNote(); }
                }),
                endButton: new sap.m.Button({
                    text: "Daha Sonra",
                    press: function () { that._oRelDialog.close(); }
                })
            });

            this.getView().addDependent(this._oRelDialog);
            this._oRelDialog.open();
        },

        // Decision: unchanged AI text -> A, edited -> M
        _saveReleaseNote: function () {
            var that = this;
            var sText = sap.ui.getCore().byId("relNoteText").getValue().trim();

            if (!sText) {
                MessageToast.show("Değişiklik özeti boş olamaz.");
                return;
            }

            var oRel = this.getView().getModel("relnote");
            var sDecision;

            if (this._sRelNoteAiText) {
                sDecision = (sText === this._sRelNoteAiText.trim()) ? "A" : "M";
            } else {
                if (sText === (oRel.getProperty("/text") || "").trim()) {
                    this._oRelDialog.close();
                    return;
                }
                sDecision = "M";
            }

            var oModel = this.getView().getModel("incidents");
            this.getView().setBusy(true);

            oModel.create("/ReleaseNoteSet", {
                IncidentNo: this._sIncidentNo,
                NoteText:   sText,
                Decision:   sDecision,
                ModelName:  this._sRelNoteModel || ""
            }, {
                success: function () {
                    that.getView().setBusy(false);
                    that._oRelDialog.close();
                    MessageToast.show("Değişiklik özeti kaydedildi.");
                    that._loadReleaseNote();
                },
                error: function (oError) {
                    that.getView().setBusy(false);
                    var sMsg = "Değişiklik özeti kaydedilemedi.";
                    try {
                        var oBody = JSON.parse(oError.responseText);
                        if (oBody.error && oBody.error.message && oBody.error.message.value) {
                            sMsg = oBody.error.message.value;
                        }
                    } catch (e) {}
                    MessageBox.error(sMsg);
                }
            });
        },

        // --- Test suggestions from similar incidents (bonus) ---
        // Reuses tests that passed on similar incidents instead of generating new ones
        onSuggestTestsPress: function () {
            var that = this;
            var oCtx = this.getView().getBindingContext("incidents");
            if (!oCtx) { return; }
            var oInc = oCtx.getObject();
            var sQuery = (oInc.Title || "") + ". " + (oInc.Description || "");

            this.getView().setBusy(true);

            fetch(AI_SIMILAR_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: sQuery,
                    kind: "incident",
                    excludeId: this._sIncidentNo,
                    topK: 5
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                var aSimilar = (result && result.ok && result.data && result.data.results) || [];
                if (aSimilar.length === 0) {
                    that.getView().setBusy(false);
                    MessageBox.information("Bu çağrıya yeterince benzeyen geçmiş bir talep bulunamadı.");
                    return;
                }
                that._collectSimilarTests(aSimilar);
            })
            .catch(function () {
                that.getView().setBusy(false);
                MessageBox.error("AI servisine ulaşılamadı. Servisin (node server.js) çalıştığından emin olun.");
            });
        },

        // Only passed tests that this incident doesn't already have
        _collectSimilarTests: function (aSimilar) {
            var that = this;
            var oModel = this.getView().getModel("incidents");

            var oSeen = {};
            (this.getView().getModel("test").getProperty("/items") || []).forEach(function (t) {
                oSeen[(t.TestText || "").trim().toLowerCase()] = true;
            });

            var aSuggestions = [];
            var iPending = aSimilar.length;

            function done() {
                iPending--;
                if (iPending > 0) { return; }

                that.getView().setBusy(false);

                if (aSuggestions.length === 0) {
                    MessageBox.information(
                        "Benzer geçmiş talepler bulundu, ancak bunlarda başarılı sonuçlanmış ve " +
                        "bu çağrıda henüz olmayan bir test yok."
                    );
                    return;
                }

                aSuggestions.sort(function (a, b) { return b.Score - a.Score; });
                that._showTestSuggestDialog(aSuggestions);
            }

            aSimilar.forEach(function (oSim) {
                oModel.read("/TestSet", {
                    filters: [new Filter("IncidentNo", FilterOperator.EQ, oSim.id)],
                    success: function (oData) {
                        (oData.results || []).forEach(function (t) {
                            var sKey = (t.TestText || "").trim().toLowerCase();
                            if (t.TestResult !== "P" || !sKey || oSeen[sKey]) { return; }
                            oSeen[sKey] = true;

                            aSuggestions.push({
                                TestText:   t.TestText,
                                TestType:   t.TestType,
                                IsCritical: t.IsCritical,
                                Score:      oSim.score,
                                Info:       Math.round(oSim.score * 100) + "% benzerlik",
                                Desc:       (that.formatTestType(t.TestType) || "Tip yok") +
                                            (t.IsCritical === "X" ? " · KRİTİK" : "") +
                                            " · Kaynak: Çağrı " + oSim.id + " – " + (oSim.title || "")
                            });
                        });
                        done();
                    },
                    error: function () { done(); }
                });
            });
        },

        _showTestSuggestDialog: function (aSuggestions) {
            var that = this;

            if (this._oSuggestDialog) {
                this._oSuggestDialog.destroy();
                this._oSuggestDialog = null;
            }

            var oList = new sap.m.List({
                mode: "MultiSelect",
                includeItemInSelection: true,
                items: {
                    path: "/items",
                    template: new sap.m.StandardListItem({
                        title: "{TestText}",
                        description: "{Desc}",
                        info: "{Info}",
                        wrapping: true
                    })
                }
            });
            oList.setModel(new JSONModel({ items: aSuggestions }));

            this._oSuggestDialog = new sap.m.Dialog({
                title: "Benzer Taleplerden Test Önerileri",
                contentWidth: "46rem",
                resizable: true,
                draggable: true,
                content: [
                    new sap.m.MessageStrip({
                        text: "Aşağıdaki testler, bu çağrıya anlamca benzeyen geçmiş taleplerde kullanılmış ve " +
                              "BAŞARILI sonuçlanmıştır. Benzerlik oranı, metinlerin anlam vektörleri (embedding) " +
                              "arasındaki kosinüs benzerliğidir. Eklemek istediklerinizi seçin.",
                        type: "Information",
                        showIcon: true
                    }).addStyleClass("sapUiSmallMargin"),
                    oList
                ],
                beginButton: new sap.m.Button({
                    text: "Seçilenleri Ekle",
                    type: "Emphasized",
                    press: function () {
                        var aSel = oList.getSelectedContexts().map(function (c) { return c.getObject(); });
                        if (aSel.length === 0) {
                            MessageToast.show("En az bir test seçin.");
                            return;
                        }
                        that._oSuggestDialog.close();
                        that._addSuggestedTests(aSel);
                    }
                }),
                endButton: new sap.m.Button({
                    text: "İptal",
                    press: function () { that._oSuggestDialog.close(); }
                })
            });

            this.getView().addDependent(this._oSuggestDialog);
            this._oSuggestDialog.open();
        },

        // Sequential: parallel creates collide on test_id
        _addSuggestedTests: function (aSel) {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var i = 0;
            var iSaved = 0;

            this.getView().setBusy(true);

            function next() {
                if (i >= aSel.length) {
                    that.getView().setBusy(false);
                    MessageToast.show(iSaved + " test adımı eklendi.");
                    that._loadTests();
                    return;
                }
                var t = aSel[i++];

                oModel.create("/TestSet", {
                    IncidentNo: that._sIncidentNo,
                    TestText:   t.TestText,
                    TestType:   t.TestType || "pozitif",
                    IsCritical: t.IsCritical || "",
                    ReqId:      "",
                    TestResult: "",
                    Note:       ""
                }, {
                    success: function () { iSaved++; next(); },
                    error: function () { next(); }
                });
            }

            next();
        },

        // --- Document revision analysis (bonus) ---

        onRevisionAnalysisPress: function () {
            var that = this;
            var aReqs = this.getView().getModel("req").getProperty("/items") || [];

            if (aReqs.length === 0) {
                MessageBox.information(
                    "Bu çağrıda karşılaştırılacak gereksinim yok. Revizyon analizi, ilk dokümandan " +
                    "gereksinim çıkarılmış taleplerde kullanılır."
                );
                return;
            }

            // The revision is the most recently uploaded PDF
            var aPdfs = (this.getView().getModel("attach").getProperty("/items") || [])
                .filter(function (a) { return a.Mimetype === "application/pdf" && !a.TestId; })
                .sort(function (a, b) { return a.AttachId < b.AttachId ? 1 : -1; });

            if (aPdfs.length === 0) {
                MessageBox.information(
                    "Revize doküman bulunamadı. Talep dokümanının yeni sürümünü PDF olarak " +
                    "'Ekler' bölümüne yükleyip tekrar deneyin."
                );
                return;
            }

            var oPdf = aPdfs[0];
            var sMsg = aPdfs.length === 1
                ? "Bu çağrıda tek bir PDF var ('" + oPdf.Filename + "'). Gereksinimler zaten bu dokümandan " +
                  "çıkarılmış olabilir. Yine de bu dokümanla karşılaştırılsın mı?"
                : "En son yüklenen doküman revize sürüm olarak kullanılacak:\n'" + oPdf.Filename +
                  "'\n\nMevcut gereksinimlerle karşılaştırılsın mı?";

            MessageBox.confirm(sMsg, {
                title: "Revizyon Analizi",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._runRevisionAnalysis(oPdf);
                    }
                }
            });
        },

        _runRevisionAnalysis: function (oPdf) {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var sPath = "/AttachmentSet(IncidentNo='" + oPdf.IncidentNo + "',AttachId='" + oPdf.AttachId + "')";

            var aReqs = (this.getView().getModel("req").getProperty("/items") || []).map(function (r) {
                return { reqId: r.ReqId, text: r.ReqText, type: r.ReqType };
            });
            var aTests = (this.getView().getModel("test").getProperty("/items") || []).map(function (t) {
                return { testId: t.TestId, text: t.TestText, reqId: t.ReqId, result: t.TestResult };
            });

            this.getView().setBusy(true);
            MessageToast.show("Revize doküman analiz ediliyor...");

            oModel.read(sPath, {
                success: function (oData) {
                    fetch(AI_REQDIFF_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            existingRequirements: aReqs,
                            tests:     aTests,
                            pdfBase64: oData.Content,
                            mimeType:  "application/pdf"
                        })
                    })
                    .then(function (res) { return res.json(); })
                    .then(function (result) {
                        that.getView().setBusy(false);

                        if (!result || !result.ok) {
                            MessageBox.error("Revizyon analizi yapılamadı: " +
                                ((result && result.error) || "AI servisi yanıt vermedi."));
                            return;
                        }

                        that._sRevisionModel = result.model || "";
                        that._sRevisionSource = oPdf.Filename || "";
                        that._showRevisionDialog(result.data);
                    })
                    .catch(function () {
                        that.getView().setBusy(false);
                        MessageBox.error("AI servisine ulaşılamadı. Servisin (node server.js) çalıştığından emin olun.");
                    });
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Revize doküman okunamadı.");
                }
            });
        },

        // Shows the diff for human approval
        _showRevisionDialog: function (d) {
            var that = this;

            if (this._oRevDialog) {
                this._oRevDialog.destroy();
                this._oRevDialog = null;
            }

            if (d.changed.length + d.removed.length + d.added.length === 0) {
                MessageBox.information(
                    "Revize dokümanda mevcut gereksinimlere göre anlamlı bir değişiklik bulunmadı." +
                    (d.summary ? "\n\n" + d.summary : "")
                );
                return;
            }

            var mResult = { P: "Başarılı", F: "Başarısız", N: "Uygulanamaz" };

            function section(sTitle, aItems, fnMap) {
                if (!aItems || aItems.length === 0) { return []; }
                var oList = new sap.m.List({ showSeparators: "Inner" });
                aItems.forEach(function (x) {
                    var m = fnMap(x);
                    oList.addItem(new sap.m.StandardListItem({
                        title: m.title,
                        description: m.desc,
                        info: m.info,
                        infoState: m.state,
                        wrapping: true
                    }));
                });
                return [
                    new sap.m.Title({ text: sTitle, level: "H5" }).addStyleClass("sapUiSmallMarginTop"),
                    oList
                ];
            }

            var aContent = [
                new sap.m.MessageStrip({
                    text: (d.summary ? d.summary + " " : "") +
                          "Etkilenen testler, test–gereksinim bağlantısından (REQ↔TEST) hesaplanmıştır; AI tahmini değildir.",
                    type: "Information",
                    showIcon: true
                })
            ]
            .concat(section("Değişen Gereksinimler (" + d.changed.length + ")", d.changed, function (c) {
                return {
                    title: "REQ-" + c.reqId + ": " + c.newText,
                    desc:  "Önceki: " + c.oldText + (c.reason ? " — " + c.reason : ""),
                    info:  "Değişti", state: "Warning"
                };
            }))
            .concat(section("Kaldırılan Gereksinimler (" + d.removed.length + ")", d.removed, function (r) {
                return {
                    title: "REQ-" + r.reqId + ": " + r.oldText,
                    desc:  r.reason || "",
                    info:  "Kaldırıldı", state: "Error"
                };
            }))
            .concat(section("Yeni Gereksinimler (" + d.added.length + ")", d.added, function (a) {
                return {
                    title: a.text,
                    desc:  that.formatReqType(a.type) + (a.sourceRef ? " · Kaynak: " + a.sourceRef : ""),
                    info:  "Yeni", state: "Success"
                };
            }))
            .concat(section("Etkilenen Testler (" + d.affectedTests.length + ") — sonuçları sıfırlanacak",
                d.affectedTests, function (t) {
                return {
                    title: t.text,
                    desc:  "REQ-" + t.reqId + " · " + t.reason + " · Mevcut sonuç: " + (mResult[t.result] || "-"),
                    info:  "Yeniden test", state: "Warning"
                };
            }));

            if (d.unlinkedTests > 0) {
                aContent.push(new sap.m.Text({
                    text: d.unlinkedTests + " test herhangi bir gereksinime bağlı olmadığı için etkisi değerlendirilemedi."
                }).addStyleClass("sapUiSmallMarginTop"));
            }

            this._oRevDialog = new sap.m.Dialog({
                title: "Revizyon Analizi: Gereksinim/Test Farkları",
                contentWidth: "48rem",
                resizable: true,
                draggable: true,
                content: [new sap.m.VBox({ items: aContent }).addStyleClass("sapUiSmallMargin")],
                beginButton: new sap.m.Button({
                    text: "Değişiklikleri Uygula",
                    type: "Emphasized",
                    press: function () {
                        that._oRevDialog.close();
                        that._applyRevision(d);
                    }
                }),
                endButton: new sap.m.Button({
                    text: "İptal",
                    press: function () { that._oRevDialog.close(); }
                })
            });

            this.getView().addDependent(this._oRevDialog);
            this._oRevDialog.open();
        },

        // Applies approved changes sequentially and logs the revision
        _applyRevision: function (d) {
            var that = this;
            var oModel = this.getView().getModel("incidents");
            var sInc = this._sIncidentNo;
            var aOps = [];
            var oStats = { changed: 0, removed: 0, added: 0, tests: 0, errors: 0 };

            var oRemoved = {};
            d.removed.forEach(function (r) { oRemoved[r.reqId] = true; });

            // 1) Update changed requirements
            d.changed.forEach(function (c) {
                aOps.push(function (next) {
                    oModel.update("/RequirementSet(IncidentNo='" + sInc + "',ReqId='" + c.reqId + "')", {
                        IncidentNo: sInc,
                        ReqId:      c.reqId,
                        ReqText:    c.newText.substring(0, 255),
                        ReqType:    c.type
                    }, {
                        merge: true,
                        success: function () { oStats.changed++; next(); },
                        error:   function () { oStats.errors++; next(); }
                    });
                });
            });

            // 2) Delete removed requirements
            d.removed.forEach(function (r) {
                aOps.push(function (next) {
                    oModel.remove("/RequirementSet(IncidentNo='" + sInc + "',ReqId='" + r.reqId + "')", {
                        success: function () { oStats.removed++; next(); },
                        error:   function () { oStats.errors++; next(); }
                    });
                });
            });

            // 3) Add new requirements
            d.added.forEach(function (a) {
                aOps.push(function (next) {
                    oModel.create("/RequirementSet", {
                        IncidentNo: sInc,
                        ReqText:    a.text.substring(0, 255),
                        ReqType:    a.type,
                        SourceRef:  ("Revizyon: " + (a.sourceRef || "")).substring(0, 100)
                    }, {
                        success: function () { oStats.added++; next(); },
                        error:   function () { oStats.errors++; next(); }
                    });
                });
            });

            // 4) Reset affected test results and unlink removed requirements
            var aTestItems = this.getView().getModel("test").getProperty("/items") || [];
            d.affectedTests.forEach(function (at) {
                var t = aTestItems.filter(function (x) { return x.TestId === at.testId; })[0];
                if (!t) { return; }
                aOps.push(function (next) {
                    oModel.update("/TestSet(IncidentNo='" + sInc + "',TestId='" + t.TestId + "')", {
                        IncidentNo: sInc,
                        TestId:     t.TestId,
                        TestText:   t.TestText,
                        TestType:   t.TestType,
                        IsCritical: t.IsCritical,
                        ReqId:      oRemoved[t.ReqId] ? "" : t.ReqId,
                        TestResult: "",
                        Note:       ""
                    }, {
                        merge: true,
                        success: function () { oStats.tests++; next(); },
                        error:   function () { oStats.errors++; next(); }
                    });
                });
            });

            // 5) Store the revision as an AI suggestion record for traceability
            aOps.push(function (next) {
                oModel.create("/SuggestionSet", {
                    IncidentNo: sInc,
                    SugType:    "REVISION",
                    SugValue:   (d.summary || "Doküman revizyonu uygulandı").substring(0, 255),
                    Reason:     ("Değişen: " + d.changed.length + ", kaldırılan: " + d.removed.length +
                                 ", eklenen: " + d.added.length + ", etkilenen test: " + d.affectedTests.length),
                    SourceRef:  (that._sRevisionSource || "").substring(0, 100),
                    ModelName:  that._sRevisionModel || "",
                    Decision:   "A",
                    FinalValue: ""
                }, { success: next, error: next });
            });

            this.getView().setBusy(true);
            var i = 0;

            function run() {
                if (i >= aOps.length) {
                    that.getView().setBusy(false);
                    that._loadRequirements();
                    that._loadTests();
                    MessageBox.success(
                        "Revizyon uygulandı.\n\n" +
                        "Güncellenen gereksinim: " + oStats.changed + "\n" +
                        "Kaldırılan gereksinim: " + oStats.removed + "\n" +
                        "Eklenen gereksinim: " + oStats.added + "\n" +
                        "Sonucu sıfırlanan test: " + oStats.tests +
                        (oStats.errors ? "\n\n" + oStats.errors + " işlem başarısız oldu." : "") +
                        (oStats.added ? "\n\nYeni gereksinimler için 'Test Ekle' veya 'Benzer Taleplerden Öner' ile test ekleyebilirsiniz." : ""),
                        { title: "Revizyon Analizi" }
                    );
                    return;
                }
                aOps[i++](run);
            }

            run();
        },

        onEditPress: function () {
            var oCtx = this.getView().getBindingContext("incidents");
            this._sOldStatus = oCtx.getProperty("Status");
            this._sOldAssignedTo = oCtx.getProperty("AssignedTo");

            this.getView().getModel("view").setProperty("/editMode", true);
        },

        // Fill the category's default support group from ZITSM_CATEGORY
        onCategoryChange: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            var oCtx = this.getView().getBindingContext("incidents");
            if (!oItem || !oCtx) { return; }
            var sGroup = oItem.getBindingContext("incidents").getProperty("SupportGroup");
            if (sGroup) {
                oCtx.getModel().setProperty(oCtx.getPath() + "/SupportGroup", sGroup);
            }
        },

        onCancelPress: function () {
            this.getView().getModel("view").setProperty("/editMode", false);
        },

        onSavePress: function () {
            var oCtx = this.getView().getBindingContext("incidents");
            var oData = oCtx.getObject();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            // A closed incident cannot be reopened
            if (this._sOldStatus === "C" && oData.Status !== "C") {
                MessageBox.error(oBundle.getText("msgClosedCantReopen"));
                oCtx.getModel().setProperty(oCtx.getPath() + "/Status", "C");
                return;
            }

            // Moving to Resolved (FR-18, FR-19)
            if (oData.Status === "R" && this._sOldStatus !== "R") {
                // Resolution is required (also enforced in the backend, ZITSM 010)
                if (!(oData.Resolution || "").trim()) {
                    MessageBox.error(
                        "Talebi 'Resolved' durumuna almak için 'Çözüm' alanına sorunun nasıl çözüldüğünü yazın.",
                        { title: "Çözüm Açıklaması Eksik" }
                    );
                    return;
                }

                var aBlockers = this._getResolveBlockers();
                if (aBlockers.length > 0) {
                    MessageBox.error(
                        "Talep 'Resolved' durumuna alınamıyor. Engelleyen maddeler:\n\n" +
                        aBlockers.join("\n"),
                        { title: "Eksik Test Maddeleri" }
                    );
                    oCtx.getModel().setProperty(oCtx.getPath() + "/Status", this._sOldStatus);
                    return;
                }
            }

            // Closed is only allowed from Resolved
            if (oData.Status === "C" && this._sOldStatus !== "C") {
                if (this._sOldStatus !== "R") {
                    MessageBox.error(
                        "Talep doğrudan kapatılamaz. Önce ilgili uzman test adımlarını " +
                        "tamamlayıp talebi 'Resolved' durumuna almalıdır."
                    );
                    oCtx.getModel().setProperty(oCtx.getPath() + "/Status", this._sOldStatus);
                    return;
                }
            }

            this._doSave();
        },

        // FR-19: lists what blocks Resolved. Critical tests must pass;
        // every test that did not pass needs a note.
        _getResolveBlockers: function () {
            var aTests = this.getView().getModel("test").getProperty("/items") || [];
            var aBlockers = [];

            var oPlan = this.getView().getModel("testplan").getData();
            if (oPlan.exists && !oPlan.approved) {
                aBlockers.push("• AI tarafından üretilen test planı henüz uzman tarafından onaylanmadı.");
            }

            aTests.forEach(function (t, i) {
                var sNo = "Test " + (i + 1);
                var sShort = t.TestText || "";
                if (sShort.length > 80) { sShort = sShort.substring(0, 80) + "…"; }
                var bCritical = (t.IsCritical === "X");
                var sResult = t.TestResult || "";
                var sNote = (t.Note || "").trim();

                if (bCritical) {
                    if (!sResult) {
                        aBlockers.push("• [KRİTİK] " + sNo + " sonuçlandırılmamış: " + sShort);
                        return;
                    }
                    if (sResult !== "P") {
                        aBlockers.push("• [KRİTİK] " + sNo + " başarılı değil: " + sShort);
                        return;
                    }
                }

                if (sResult !== "P" && !sNote) {
                    aBlockers.push("• " + sNo + " için açıklama girilmeli: " + sShort);
                }
            });

            return aBlockers;
        },

        _doSave: function () {
            var oModel = this.getView().getModel("incidents");

            if (oModel.hasPendingChanges()) {
                this._bSaving = true;
                oModel.submitChanges();
            } else {
                this.getView().getModel("view").setProperty("/editMode", false);
            }
        },

        _onRequestCompleted: function (oEvent) {
            if (!this._bSaving) {
                return;
            }
            var bSuccess = oEvent.getParameter("success");
            if (bSuccess) {
                this._bSaving = false;

                var oModel = this.getView().getModel("incidents");
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                var oCtx = this.getView().getBindingContext("incidents");
                var sNo = oCtx ? oCtx.getProperty("IncidentNo") : "";

                oModel.refresh(true);
                this.getView().getModel("view").setProperty("/editMode", false);
                MessageToast.show(oBundle.getText("msgIncidentUpdated", [sNo]));

                // Status or priority may have changed
                if (oCtx) {
                    this._indexIncident(oCtx.getObject());
                }

                // Newly assigned: generate the test plan
                var sNewAssignedTo = oCtx ? oCtx.getProperty("AssignedTo") : "";
                if (sNewAssignedTo && sNewAssignedTo !== this._sOldAssignedTo) {
                    this._generateTestStepsForAssignment();
                }

                // Just resolved: draft the release note
                var sNewStatus = oCtx ? oCtx.getProperty("Status") : "";
                if (sNewStatus === "R" && this._sOldStatus !== "R") {
                    this._generateReleaseNote();
                }
            }
        },

        _onRequestFailed: function (oEvent) {
            // Attachment/test/requirement calls show their own errors
            var sUrl = (oEvent.getParameter("url") || "").toLowerCase();
            if (sUrl.indexOf("attachmentset") > -1 ||
                sUrl.indexOf("testset") > -1 ||
                sUrl.indexOf("requirementset") > -1 ||
                sUrl.indexOf("knowledgearticleset") > -1 ||
                sUrl.indexOf("releasenoteset") > -1) {
                return;
            }

            var oResponse = oEvent.getParameter("response");
            if (!oResponse) {
                return;
            }

            var sMessage = "İşlem sırasında bir hata oluştu.";
            try {
                var oBody = JSON.parse(oResponse.responseText);
                if (oBody.error && oBody.error.message && oBody.error.message.value) {
                    sMessage = oBody.error.message.value;
                }
            } catch (e) {}

            MessageBox.error(sMessage);
            this._bSaving = false;

            var oModel = this.getView().getModel("incidents");
            if (oModel.hasPendingChanges()) {
                oModel.resetChanges();
            }
            this.getView().getModel("view").setProperty("/editMode", false);
        },

        // --- Formatters ---
        formatItemSize: function (iBytes) {
            if (!iBytes) { return "0 KB"; }
            if (iBytes < 1024) { return iBytes + " B"; }
            if (iBytes < 1048576) { return Math.round(iBytes / 1024) + " KB"; }
            return (iBytes / 1048576).toFixed(1) + " MB";
        },

        formatItemDate: function (sDate) {
            if (!sDate || sDate === "00000000") { return ""; }
            if (sDate instanceof Date) {
                var d = ("0" + sDate.getDate()).slice(-2);
                var m = ("0" + (sDate.getMonth() + 1)).slice(-2);
                return d + "." + m + "." + sDate.getFullYear();
            }
            var s = "" + sDate;
            if (s.length === 8) {
                return s.substring(6, 8) + "." + s.substring(4, 6) + "." + s.substring(0, 4);
            }
            return s;
        },

        formatImpactText: function (s) {
            return s === "H" ? "Yüksek" : s === "M" ? "Orta" : s === "L" ? "Düşük" : "Belirtilmemiş";
        },

        formatImpactState: function (s) {
            return s === "H" ? "Error" : s === "M" ? "Warning" : s === "L" ? "Success" : "None";
        },

        formatResultText: function (s) {
            return s === "P" ? "Başarılı" : s === "F" ? "Başarısız" : s === "N" ? "Uygulanamaz" : "-";
        },

        formatHistAction: function (s) {
            switch (s) {
                case "RESULT": return "Sonuç girildi";
                case "RESET":  return "Sonuç sıfırlandı";
                case "NOTE":   return "Açıklama değişti";
                case "EDIT":   return "Tanım düzenlendi";
                case "DELETE": return "Test silindi";
                default:       return s || "";
            }
        },

        formatEvidenceTest: function (sTestId) {
            if (!sTestId) { return ""; }
            var aTests = this.getView().getModel("test").getProperty("/items") || [];
            for (var i = 0; i < aTests.length; i++) {
                if (aTests[i].TestId === sTestId) { return "Test " + (i + 1) + " kanıtı"; }
            }
            return "Test kanıtı";
        },

        formatTestType: function (sType) {
            switch (sType) {
                case "pozitif":   return "Pozitif";
                case "negatif":   return "Negatif";
                case "sinir":     return "Sınır Değer";
                case "yetki":     return "Yetki";
                case "regresyon": return "Regresyon";
                default:          return sType || "";
            }
        },

        formatCriticalText: function (sCritical) {
            return sCritical === "X" ? "KRİTİK" : "";
        },

        formatCriticalState: function (sCritical) {
            return sCritical === "X" ? "Error" : "None";
        },

        formatReqType: function (sType) {
            switch (sType) {
                case "functional":    return "Fonksiyonel";
                case "business-rule": return "İş Kuralı";
                case "boundary":      return "Sınır Koşulu";
                case "constraint":    return "Kısıt";
                case "affected-area": return "Etkilenen Alan";
                default:              return sType || "";
            }
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
                var oCtx = this.getView().getBindingContext("incidents");
                oCtx.getModel().setProperty(oCtx.getPath() + "/AssignedTo", sUsername);
            }
        },

        onUserCancel: function () {
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("list");
        }

    });
});
