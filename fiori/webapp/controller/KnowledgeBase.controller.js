sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/TextArea",
    "sap/m/VBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox,
             Dialog, Button, Label, Input, TextArea, VBox) {
    "use strict";

    var AI_INDEX_URL  = "http://localhost:3001/index-item";
    var AI_REMOVE_URL = "http://localhost:3001/index-remove";

    // Knowledge base maintenance. SAP (ZITSM_KB) is the source of truth;
    // the AI search index is synced after every change.
    return Controller.extend("zitsm.controller.KnowledgeBase", {
        onInit: function () {
            this.getView().setModel(new JSONModel({ items: [], count: 0 }), "kb");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("kb").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._load();
        },

        _load: function () {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var oKb = this.getView().getModel("kb");
            var oView = this.getView();

            oView.setBusy(true);
            oModel.read("/KnowledgeArticleSet", {
                success: function (oData) {
                    var aItems = oData.results || [];
                    oKb.setProperty("/items", aItems);
                    oKb.setProperty("/count", aItems.length);
                    oView.setBusy(false);
                },
                error: function () {
                    oView.setBusy(false);
                    MessageBox.error("Bilgi bankası makaleleri okunamadı.");
                }
            });
        },

        onSearch: function (oEvent) {
            var sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").trim();
            var aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("Title",   FilterOperator.Contains, sQuery),
                        new Filter("Problem", FilterOperator.Contains, sQuery),
                        new Filter("Tags",    FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            this.byId("kbTable").getBinding("items").filter(aFilters);
        },

        onAddPress: function () {
            this._openDialog(null);
        },

        onEditPress: function (oEvent) {
            var oArticle = oEvent.getSource().getBindingContext("kb").getObject();
            this._openDialog(oArticle);
        },

        onSourcePress: function (oEvent) {
            var sInc = oEvent.getSource().getBindingContext("kb").getProperty("SourceInc");
            this.getOwnerComponent().getRouter().navTo("detail", { incidentNo: sInc });
        },

        // Add/edit dialog; oArticle is null for a new article
        _openDialog: function (oArticle) {
            var that = this;
            var bNew = !oArticle;

            var oForm = new JSONModel({
                Title:      bNew ? "" : (oArticle.Title || ""),
                Problem:    bNew ? "" : (oArticle.Problem || ""),
                Cause:      bNew ? "" : (oArticle.Cause || ""),
                Solution:   bNew ? "" : (oArticle.Solution || ""),
                CheckSteps: bNew ? "" : (oArticle.CheckSteps || ""),
                Tags:       bNew ? "" : (oArticle.Tags || "")
            });

            var fnLabel = function (sText, bReq) {
                return new Label({ text: sText, required: !!bReq }).addStyleClass("sapUiSmallMarginTop");
            };
            // Max lengths match the ZITSM_KB field lengths
            var fnArea = function (sPath, iRows, iMax) {
                return new TextArea({
                    value: "{form>/" + sPath + "}",
                    width: "100%",
                    rows: iRows,
                    maxLength: iMax,
                    showExceededText: true,
                    growing: true
                });
            };

            var oDialog = new Dialog({
                title: bNew ? "Yeni Bilgi Bankası Makalesi" : "Makaleyi Düzenle – KB-" + oArticle.KbId,
                contentWidth: "44rem",
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        items: [
                            fnLabel("Başlık", true),
                            new Input({ value: "{form>/Title}", maxLength: 100 }),
                            fnLabel("Problem", true),
                            fnArea("Problem", 3, 255),
                            fnLabel("Kök Neden"),
                            fnArea("Cause", 2, 255),
                            fnLabel("Çözüm Adımları", true),
                            fnArea("Solution", 6, 1000),
                            fnLabel("Kontrol Adımları"),
                            fnArea("CheckSteps", 3, 500),
                            fnLabel("Etiketler (virgülle ayırın)"),
                            new Input({ value: "{form>/Tags}", maxLength: 200 })
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new Button({
                    text: "Kaydet",
                    type: "Emphasized",
                    press: function () {
                        var f = oForm.getData();
                        var oPayload = {
                            Title:      (f.Title || "").trim(),
                            Problem:    (f.Problem || "").trim(),
                            Cause:      (f.Cause || "").trim(),
                            Solution:   (f.Solution || "").trim(),
                            CheckSteps: (f.CheckSteps || "").trim(),
                            Tags:       (f.Tags || "").trim()
                        };
                        if (!oPayload.Title || !oPayload.Problem || !oPayload.Solution) {
                            MessageToast.show("Başlık, Problem ve Çözüm Adımları zorunludur.");
                            return;
                        }
                        oDialog.close();
                        if (bNew) {
                            that._create(oPayload);
                        } else {
                            that._update(oArticle, oPayload);
                        }
                    }
                }),
                endButton: new Button({
                    text: "İptal",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.setModel(oForm, "form");
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _create: function (oPayload) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel("incidents");

            oPayload.SourceInc = "";   // manually added, no source incident

            this.getView().setBusy(true);
            oModel.create("/KnowledgeArticleSet", oPayload, {
                success: function (oData) {
                    that.getView().setBusy(false);
                    MessageToast.show("Makale eklendi: KB-" + oData.KbId);
                    that._indexArticle(oData.KbId, oPayload, "");
                    that._load();
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Makale eklenemedi.");
                }
            });
        },

        _update: function (oArticle, oPayload) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel("incidents");
            var sPath = "/KnowledgeArticleSet('" + oArticle.KbId + "')";

            this.getView().setBusy(true);
            oModel.update(sPath, oPayload, {
                merge: true,
                success: function () {
                    that.getView().setBusy(false);
                    MessageToast.show("Makale güncellendi.");
                    that._indexArticle(oArticle.KbId, oPayload, oArticle.SourceInc);
                    that._load();
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Makale güncellenemedi.");
                }
            });
        },

        onDeletePress: function (oEvent) {
            var that = this;
            var oArticle = oEvent.getSource().getBindingContext("kb").getObject();

            MessageBox.confirm(
                "KB-" + oArticle.KbId + " – " + oArticle.Title +
                "\n\nBu makale silinecek ve AI asistanın kaynakları arasından da çıkarılacak. Emin misiniz?",
                {
                    title: "Makaleyi Sil",
                    emphasizedAction: MessageBox.Action.CANCEL,
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            that._delete(oArticle);
                        }
                    }
                }
            );
        },

        _delete: function (oArticle) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel("incidents");
            var sPath = "/KnowledgeArticleSet('" + oArticle.KbId + "')";

            this.getView().setBusy(true);
            oModel.remove(sPath, {
                success: function () {
                    that.getView().setBusy(false);
                    MessageToast.show("Makale silindi.");
                    // Keep deleted articles out of AI sources
                    fetch(AI_REMOVE_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: oArticle.KbId, kind: "kb" })
                    }).catch(function () {
                        MessageToast.show("Makale silindi ancak AI indeksi güncellenemedi. 'İndeksi Yenile' ile senkronlayın.");
                    });
                    that._load();
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageBox.error("Makale silinemedi.");
                }
            });
        },

        _indexArticle: function (sKbId, oArticle, sSourceInc) {
            fetch(AI_INDEX_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id:    sKbId,
                    kind:  "kb",
                    title: oArticle.Title,
                    text:  oArticle.Title + ". " + oArticle.Problem + " " + oArticle.Solution,
                    meta:  { sourceInc: sSourceInc || "" }
                })
            }).catch(function () {
                MessageToast.show("Makale kaydedildi ancak AI indeksi güncellenemedi. 'İndeksi Yenile' ile senkronlayın.");
            });
        },

        formatDate
: function (s) {
            if (!s || s === "00000000" || s.length !== 8) { return ""; }
            return s.substring(6, 8) + "." + s.substring(4, 6) + "." + s.substring(0, 4);
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("list");
        }
    });
});
