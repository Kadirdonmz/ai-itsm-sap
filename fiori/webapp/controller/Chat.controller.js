sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/TextArea",
    "sap/m/Select",
    "sap/m/VBox",
    "sap/m/MessageStrip",
    "sap/ui/core/Item"
], function (Controller, JSONModel, MessageToast, MessageBox,
             Dialog, Button, Label, Input, TextArea, Select, VBox, MessageStrip, Item) {
    "use strict";

    var AI_CHAT_URL = "http://localhost:3001/chat";
    var AI_ANALYZE_URL = "http://localhost:3001/analyze";
    var AI_INDEX_URL = "http://localhost:3001/index-item";

    return Controller.extend("zitsm.controller.Chat", {
        onInit: function () {
            // Model must exist before first render for the empty-state bindings
            this.getView().setModel(this._createChatModel(), "chat");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("chat").attachPatternMatched(this._onRouteMatched, this);
        },

        _createChatModel: function () {
            return new JSONModel({
                messages: [],
                draft: "",
                loading: false
            });
        },

        _onRouteMatched: function () {
            this.getView().setModel(this._createChatModel(), "chat");

            // Created on the first message so abandoned chats leave no SAP record
            this._sConvId = null;
            this._bBusy = false;
            this._oAiSuggestion = null;   // raw AI suggestions, kept for ZITSM_AISUG
            this._sAiModel = "";
            this._sTranscript = "";

            this._focusInput();
        },

        onSuggestionPress: function (oEvent) {
            var sText = oEvent.getSource().getText();
            this.getView().getModel("chat").setProperty("/draft", sText);
            this.onSendPress();
        },

        _createConversation: function (fnAfter) {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var that = this;

            oModel.create("/ConversationSet", {}, {
                success: function (oData) {
                    that._sConvId = oData.ConvId;
                    if (fnAfter) { fnAfter(); }
                },
                error: function () {
                    that._bBusy = false;
                    that.getView().getModel("chat").setProperty("/loading", false);
                    MessageBox.error("Sohbet başlatılamadı. Lütfen tekrar deneyin.");
                }
            });
        },

        onSendPress: function () {
            var oChatModel = this.getView().getModel("chat");
            var sText = (oChatModel.getProperty("/draft") || "").trim();

            if (!sText) {
                return;
            }
            if (this._bBusy) {
                return;
            }

            oChatModel.setProperty("/draft", "");
            this._appendMessage("U", sText);

            var that = this;
            this._bBusy = true;
            oChatModel.setProperty("/loading", true);
            this._scrollToBottom();

            var fnSend = function () {
                that._saveMessage("U", sText, function () {
                    that._callAi();
                });
            };

            if (this._sConvId) {
                fnSend();
            } else {
                this._createConversation(fnSend);
            }
        },

        _saveMessage: function (sSender, sText, fnAfter) {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var that = this;

            oModel.create("/MessageSet", {
                ConvId: this._sConvId,
                Sender: sSender,
                MsgText: sText
            }, {
                success: function () {
                    if (fnAfter) { fnAfter(); }
                },
                error: function () {
                    that._bBusy = false;
                    that.getView().getModel("chat").setProperty("/loading", false);
                    MessageBox.error("Mesaj kaydedilemedi.");
                }
            });
        },

        _callAi: function () {
            var oChatModel = this.getView().getModel("chat");
            var aMessages = oChatModel.getProperty("/messages");
            var that = this;

            var aHistory = aMessages.map(function (m) {
                return { sender: m.Sender, text: m.MsgText };
            });

            fetch(AI_CHAT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ history: aHistory })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that._bBusy = false;
                oChatModel.setProperty("/loading", false);

                if (!result || !result.ok) {
                    MessageBox.error((result && result.error) || "AI cevap veremedi. Lütfen tekrar deneyin.");
                    return;
                }

                var sReply = result.data.reply;

                // FR-02: show which KB articles or resolved incidents the answer used
                var sSources = (result.data.usedSources || []).map(function (s) {
                    var sKind = (s.id || "").indexOf("INC-") === 0 ? "Çözülmüş çağrı" : "Bilgi bankası";
                    return sKind + ": " + (s.title || "") + " (" + (s.id || "") + ")";
                }).join("\n");

                that._appendMessage("A", sReply, sSources ? "Kaynak:\n" + sSources : "");

                that._saveMessage("A", sReply);
                that._focusInput();
            })
            .catch(function (err) {
                that._bBusy = false;
                oChatModel.setProperty("/loading", false);
                MessageBox.error(
                    "AI servisine ulaşılamadı. Servisin (node server.js) çalıştığından emin olun.\n\nHata: " +
                    (err.message || "Bilinmeyen hata")
                );
            });
        },

        _appendMessage: function (sSender, sText, sSources) {
            var oChatModel = this.getView().getModel("chat");
            var oNow = new Date();
            var sTime = ("0" + oNow.getHours()).slice(-2) + ":" + ("0" + oNow.getMinutes()).slice(-2);

            // New array so bindings detect the change
            var aMessages = oChatModel.getProperty("/messages").concat([
                { Sender: sSender, MsgText: sText, Time: sTime, Sources: sSources || "" }
            ]);
            oChatModel.setProperty("/messages", aMessages);

            this._scrollToBottom();
        },

        _scrollToBottom: function () {
            var oScroll = this.byId("chatScroll");
            if (!oScroll) { return; }
            setTimeout(function () {
                oScroll.scrollTo(0, 100000, 250);
            }, 60);
        },

        _focusInput: function () {
            var oInput = this.byId("chatInput");
            if (!oInput) { return; }
            setTimeout(function () { oInput.focus(); }, 150);
        },

        onResolvedPress: function () {
            var that = this;

            if (!this._sConvId) {
                MessageToast.show("Henüz bir sohbet başlatılmadı.");
                return;
            }

            MessageBox.confirm(
                "Sohbeti 'çözüldü' olarak işaretleyip listeye dönmek istiyor musunuz?",
                {
                    onClose: function (sAction) {
                        if (sAction !== MessageBox.Action.OK) { return; }
                        that._setOutcome("R", null, function () {
                            MessageToast.show("Sohbet çözüldü olarak kaydedildi.");
                            that.getOwnerComponent().getRouter().navTo("list");
                        });
                    }
                }
            );
        },

        // Converts the chat into an incident (FR-03/FR-04).
        // AI proposes the fields, the user reviews them in a dialog,
        // then suggestions and decisions are written to ZITSM_AISUG.
        onConvertPress: function () {
            var oChatModel = this.getView().getModel("chat");
            var aMessages = oChatModel.getProperty("/messages");

            if (aMessages.length === 0 || !this._sConvId) {
                MessageToast.show("Önce bir sorun anlatın.");
                return;
            }
            if (this._bBusy) {
                return;
            }

            var sTranscript = aMessages.map(function (m) {
                var sLabel = m.Sender === "U" ? "Kullanıcı" : "Asistan";
                return sLabel + ": " + m.MsgText;
            }).join("\n");

            var that = this;
            this.getView().setBusy(true);

            fetch(AI_ANALYZE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentText: sTranscript })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that.getView().setBusy(false);

                if (!result || !result.ok) {
                    MessageBox.error("Sohbetten çağrı bilgisi çıkarılamadı.\n\n" +
                        ((result && result.error) || "Lütfen tekrar deneyin."));
                    return;
                }

                var ai = result.data || {};
                if (ai.needMoreInfo) {
                    MessageBox.information(
                        "Sohbet, çağrı oluşturmak için yeterli ayrıntı içermiyor. " +
                        "Lütfen sorunu biraz daha detaylı anlatın."
                    );
                    return;
                }

                var oMap = { "Low": "L", "Medium": "M", "High": "H" };

                // Same structure as IncidentCreate
                that._oAiSuggestion = {
                    title:          ai.title || "",
                    priority:       oMap[ai.priority] || "",
                    impact:         oMap[ai.impact] || "",
                    category:       ai.category || "",
                    supportGroup:   ai.supportGroup || "",
                    requestType:    ai.requestType || "",
                    reason:         ai.reason || "",
                    categoryReason: ai.categoryReason || "",
                    sourceRef:      (ai.usedSources || []).map(function (s) { return s.id; }).join(",")
                };
                that._sAiModel = result.model || "";
                that._sTranscript = sTranscript;

                // FR-04: structured description instead of the raw transcript
                that._oAiSuggestion.description = that._buildDescription(ai, sTranscript);

                that._openConvertDialog();
            })
            .catch(function (err) {
                that.getView().setBusy(false);
                MessageBox.error("AI servisine ulaşılamadı.\n\n" + (err.message || ""));
            });
        },

        // FR-04: summary, affected system and tried steps first;
        // the full transcript is kept below as evidence.
        _buildDescription: function (ai, sTranscript) {
            var aLines = [];

            aLines.push("Özet:");
            aLines.push(ai.summary || "-");
            aLines.push("");
            aLines.push("Etkilenen sistem: " + (ai.affectedSystem || "Belirtilmedi"));
            aLines.push("");
            aLines.push("Kullanıcının denediği adımlar:");
            if (ai.triedSteps && ai.triedSteps.length) {
                ai.triedSteps.forEach(function (s) { aLines.push("- " + s); });
            } else {
                aLines.push("- Belirtilmedi");
            }
            aLines.push("");
            aLines.push("--- Sohbet dökümü ---");
            aLines.push(sTranscript);

            return aLines.join("\n");
        },

        // Approval dialog with editable AI suggestions
        _openConvertDialog: function () {
            var that = this;
            var oAi = this._oAiSuggestion;

            var oFormModel = new JSONModel({
                Description:  oAi.description,
                Title:        oAi.title,
                Priority:     oAi.priority || "M",
                Impact:       oAi.impact || "",
                Feedback:     "",
                Category:     oAi.category,
                SupportGroup: oAi.supportGroup,
                RequestType:  oAi.requestType || "incident"
            });

            var sInfo = "Aşağıdaki alanlar AI tarafından sohbetten önerildi. Gerekirse düzenleyip onaylayın.";
            if (oAi.reason) {
                sInfo += "\n\nÖncelik gerekçesi: " + oAi.reason;
            }
            if (oAi.categoryReason) {
                sInfo += "\nKategori gerekçesi: " + oAi.categoryReason;
            }

            var fnLabel = function (sText, bRequired) {
                return new Label({ text: sText, required: !!bRequired }).addStyleClass("sapUiSmallMarginTop");
            };

            var oDialog = new Dialog({
                title: "Çağrı Oluştur – AI Önerisi",
                contentWidth: "640px",
                draggable: true,
                resizable: true,
                content: [
                    new VBox({
                        items: [
                            new MessageStrip({
                                text: sInfo,
                                type: "Information",
                                showIcon: true
                            }).addStyleClass("sapUiSmallMarginBottom"),

                            fnLabel("Başlık", true),
                            new Input({ value: "{form>/Title}", maxLength: 100 }),

                            fnLabel("Öncelik", true),
                            new Select({
                                selectedKey: "{form>/Priority}",
                                width: "100%",
                                items: [
                                    new Item({ key: "H", text: "High" }),
                                    new Item({ key: "M", text: "Medium" }),
                                    new Item({ key: "L", text: "Low" })
                                ]
                            }),

                            fnLabel("Etki"),
                            new Select({
                                selectedKey: "{form>/Impact}",
                                width: "100%",
                                forceSelection: false,
                                items: [
                                    new Item({ key: "", text: "Belirtilmemiş" }),
                                    new Item({ key: "L", text: "Düşük" }),
                                    new Item({ key: "M", text: "Orta" }),
                                    new Item({ key: "H", text: "Yüksek" })
                                ]
                            }),

                            fnLabel("Talep Türü"),
                            new Select({
                                selectedKey: "{form>/RequestType}",
                                width: "100%",
                                items: [
                                    new Item({ key: "incident", text: "Arıza" }),
                                    new Item({ key: "request", text: "Talep" })
                                ]
                            }),

                            fnLabel("Kategori"),
                            new Input({ value: "{form>/Category}", maxLength: 100 }),

                            fnLabel("Destek Grubu"),
                            new Input({ value: "{form>/SupportGroup}", maxLength: 30 }),

                            fnLabel("Açıklama (AI tarafından sohbetten oluşturuldu)", true),
                            new TextArea({
                                value: "{form>/Description}",
                                width: "100%",
                                rows: 10,
                                growing: true,
                                growingMaxLines: 18
                            }),

                            fnLabel("AI önerisinde değişiklik yaptıysanız nedeni (isteğe bağlı)"),
                            new TextArea({
                                value: "{form>/Feedback}",
                                width: "100%",
                                rows: 2,
                                maxLength: 255,
                                placeholder: "Örn. Muhasebe ay sonu kapanışı etkilendiği için önceliği yükselttim."
                            })
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new Button({
                    text: "Çağrı Oluştur",
                    type: "Emphasized",
                    icon: "sap-icon://create",
                    press: function () {
                        var oForm = oFormModel.getData();
                        if (!(oForm.Title || "").trim()) {
                            MessageToast.show("Başlık boş olamaz.");
                            return;
                        }
                        if (!(oForm.Description || "").trim()) {
                            MessageToast.show("Açıklama boş olamaz.");
                            return;
                        }
                        oDialog.close();
                        that._createIncidentFromChat(oForm);
                    }
                }),
                endButton: new Button({
                    text: "İptal",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.setModel(oFormModel, "form");
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _createIncidentFromChat: function (oForm) {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var that = this;

            var oPayload = {
                Title:        oForm.Title.trim(),
                Description:  oForm.Description.trim(),
                Priority:     oForm.Priority,
                Impact:       oForm.Impact || "",
                AssignedTo:   "",
                Category:     oForm.Category || "",
                SupportGroup: oForm.SupportGroup || "",
                RequestType:  oForm.RequestType || ""
            };

            this.getView().setBusy(true);

            oModel.create("/IncidentSet", oPayload, {
                success: function (oData) {
                    var sIncidentNo = oData.IncidentNo;

                    // Index right away for similarity search and FR-09
                    that._indexNewIncident(sIncidentNo, oPayload, oData.CreatedOn);

                    // Save suggestions, mark chat as converted (T), then open the incident
                    that._saveAiSuggestions(sIncidentNo, oPayload, (oForm.Feedback || "").trim(), function () {
                        that._setOutcome("T", sIncidentNo, function () {
                            that.getView().setBusy(false);
                            MessageToast.show("Çağrı oluşturuldu: " + sIncidentNo);
                            that.getOwnerComponent().getModel("incidents").refresh();
                            that.getOwnerComponent().getRouter().navTo("detail", { incidentNo: sIncidentNo });
                        });
                    });
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Çağrı oluşturulamadı.");
                }
            });
        },

        _indexNewIncident: function (sIncidentNo, oInc, sCreatedOn) {
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
                    title: oInc.Title,
                    text:  (oInc.Title || "") + ". " + (oInc.Description || ""),
                    meta:  {
                        priority:   oInc.Priority,
                        status:     "O",
                        assignedTo: oInc.AssignedTo,
                        createdOn:  sCreatedOn || sToday
                    }
                })
            }).catch(function () {
                // Incident is already saved in SAP; reindex can catch up later
            });
        },

        // Writes AI suggestions and user decisions to ZITSM_AISUG.
        // Decision: same as AI -> A, empty -> R, different -> M
        _saveAiSuggestions: function (sIncidentNo, oFinal, sFeedback, fnDone) {
            var oAi = this._oAiSuggestion;

            if (!oAi || !sIncidentNo) {
                fnDone();
                return;
            }

            var aSug = [
                { type: "TITLE",        value: oAi.title,        final: oFinal.Title,        reason: oAi.reason },
                { type: "PRIORITY",     value: oAi.priority,     final: oFinal.Priority,     reason: oAi.reason },
                { type: "IMPACT",       value: oAi.impact,       final: oFinal.Impact,       reason: oAi.reason },
                { type: "CATEGORY",     value: oAi.category,     final: oFinal.Category,     reason: oAi.categoryReason },
                { type: "SUPPORTGROUP", value: oAi.supportGroup, final: oFinal.SupportGroup, reason: oAi.categoryReason },
                { type: "REQUESTTYPE",  value: oAi.requestType,  final: oFinal.RequestType,  reason: "" },
                { type: "SUMMARY",      value: oAi.description,  final: oFinal.Description,  reason: "Sohbetten otomatik oluşturulan çağrı açıklaması" }
            ].filter(function (s) { return s.value; });   // skip fields the AI left empty

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
                    UserFeedback: sDecision === "A" ? "" : (sFeedback || "").substring(0, 255)
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

        _setOutcome: function (sStatus, sIncidentNo, fnAfter) {
            var oModel = this.getOwnerComponent().getModel("incidents");

            oModel.update("/ConversationSet('" + this._sConvId + "')", {
                Status: sStatus,
                IncidentNo: sIncidentNo || ""
            }, {
                success: function () {
                    if (fnAfter) { fnAfter(); }
                },
                error: function () {
                    MessageBox.error("Sohbet durumu güncellenemedi, ancak işlem tamamlandı.");
                    if (fnAfter) { fnAfter(); }
                }
            });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("list");
        }

    });
});
