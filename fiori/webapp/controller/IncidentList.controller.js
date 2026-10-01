sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "zitsm/model/formatter"
], function (Controller, JSONModel, MessageToast, MessageBox, Filter, FilterOperator, Sorter, formatter) {
    "use strict";

    var AI_SERVICE_URL = "http://localhost:3001";

    return Controller.extend("zitsm.controller.IncidentList", {
        formatter: formatter,

        onInit: function () {
            var oViewModel = new JSONModel({
                sortField: "",
                sortDescending: false,
                sortIconNo: "",
                sortIconTitle: "",
                countTotal: 0,
                countOpen: 0,
                countInProgress: 0,
                countResolved: 0,
                countClosed: 0
            });
            this.getView().setModel(oViewModel, "view");

            this._sSearchQuery = "";
            this._sStatusFilter = "";   // status filter set by the cards ("" = all)
            this._bCardsWired = false;
        },

        onAfterRendering: function () {
            // Attach card click handlers only once, not on every render
            if (this._bCardsWired) {
                return;
            }
            var that = this;
            var mCards = {
                cardTotal: "",
                cardOpen: "O",
                cardProgress: "I",
                cardResolved: "R",
                cardClosed: "C"
            };
            Object.keys(mCards).forEach(function (sCardId) {
                var oCard = that.byId(sCardId);
                if (oCard) {
                    oCard.attachBrowserEvent("click", function () {
                        that._onCardPress(mCards[sCardId], sCardId);
                    });
                }
            });
            this._bCardsWired = true;
        },

        _onCardPress: function (sStatus, sCardId) {
            // Clicking the active card again clears the filter
            if (this._sStatusFilter === sStatus && sStatus !== "") {
                this._sStatusFilter = "";
                this._highlightCard("");
            } else {
                this._sStatusFilter = sStatus;
                this._highlightCard(sCardId);
            }
            this._applyFilters();
        },

        _highlightCard: function (sActiveCardId) {
            var aCardIds = ["cardTotal", "cardOpen", "cardProgress", "cardResolved", "cardClosed"];
            var that = this;
            aCardIds.forEach(function (sId) {
                var oCard = that.byId(sId);
                if (oCard) {
                    oCard.removeStyleClass("cardActive");
                }
            });
            if (sActiveCardId) {
                var oActive = this.byId(sActiveCardId);
                if (oActive) {
                    oActive.addStyleClass("cardActive");
                }
            }
        },

        _updateCounts: function () {
            var oModel = this.getView().getModel("incidents");
            var aData = oModel.getProperty("/") || {};
            var iTotal = 0, iOpen = 0, iInProgress = 0, iResolved = 0, iClosed = 0;

            Object.keys(aData).forEach(function (sKey) {
                if (sKey.indexOf("IncidentSet(") === 0) {
                    var oRow = aData[sKey];
                    iTotal++;
                    if (oRow.Status === "O") { iOpen++; }
                    else if (oRow.Status === "I") { iInProgress++; }
                    else if (oRow.Status === "R") { iResolved++; }
                    else if (oRow.Status === "C") { iClosed++; }
                }
            });

            var oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/countTotal", iTotal);
            oViewModel.setProperty("/countOpen", iOpen);
            oViewModel.setProperty("/countInProgress", iInProgress);
            oViewModel.setProperty("/countResolved", iResolved);
            oViewModel.setProperty("/countClosed", iClosed);
        },

        onCreatePress: function () {
            this.getOwnerComponent().getRouter().navTo("create");
        },

        onOpenOverview: function () {
            this.getOwnerComponent().getRouter().navTo("overview");
        },

        onOpenKb: function () {
            this.getOwnerComponent().getRouter().navTo("kb");
        },

        onOpenChat: function () {
            this.getOwnerComponent().getRouter().navTo("chat");
        },

        onItemPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oContext = oItem.getBindingContext("incidents");
            var sIncidentNo = oContext.getProperty("IncidentNo");

            this.getOwnerComponent().getRouter().navTo("detail", {
                incidentNo: sIncidentNo
            });
        },

        onSearch: function (oEvent) {
            this._sSearchQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._applyFilters();
        },

        onFilterChange: function () {
            this._applyFilters();
        },

        _applyFilters: function () {
            var aFilters = [];

            if (this._sSearchQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("Title", FilterOperator.Contains, this._sSearchQuery),
                        new Filter("IncidentNo", FilterOperator.Contains, this._sSearchQuery)
                    ],
                    and: false
                }));
            }

            var sPriority = this.byId("priorityFilter").getSelectedKey();
            if (sPriority) {
                aFilters.push(new Filter("Priority", FilterOperator.EQ, sPriority));
            }

            if (this._sStatusFilter) {
                aFilters.push(new Filter("Status", FilterOperator.EQ, this._sStatusFilter));
            }

            var oTable = this.byId("incidentTable");
            var oBinding = oTable.getBinding("items");
            oBinding.filter(aFilters);
        },

        onSortNo: function () {
            this._sortBy("IncidentNo");
        },

        onSortTitle: function () {
            this._sortBy("Title");
        },

        // Rebuilds the semantic search index from SAP incidents and KB articles
        onReindexPress: function () {
            var that = this;
            var oModel = this.getOwnerComponent().getModel("incidents");

            this.getView().setBusy(true);
            MessageToast.show("Kayıtlar okunuyor...");

            var aItems = [];
            var iPending = 2;   // IncidentSet + KnowledgeArticleSet

            function done() {
                iPending--;
                if (iPending > 0) { return; }

                if (aItems.length === 0) {
                    that.getView().setBusy(false);
                    MessageToast.show("İndekslenecek kayıt bulunamadı.");
                    return;
                }

                that._sendToIndex(aItems);
            }

            oModel.read("/IncidentSet", {
                success: function (oData) {
                    (oData.results || []).forEach(function (inc) {
                        aItems.push({
                            id:    inc.IncidentNo,
                            kind:  "incident",
                            title: inc.Title,
                            text:  (inc.Title || "") + ". " + (inc.Description || "") +
                                   (inc.Resolution ? " Çözüm: " + inc.Resolution : ""),
                            meta:  {
                                priority: inc.Priority,
                                status:   inc.Status,
                                assignedTo: inc.AssignedTo,
                                createdOn:  inc.CreatedOn,   // FR-09 time window
                                resolution: (inc.Resolution || "").substring(0, 300)   // FR-07
                            }
                        });
                    });
                    done();
                },
                error: function () { done(); }
            });

            oModel.read("/KnowledgeArticleSet", {
                success: function (oData) {
                    (oData.results || []).forEach(function (kb) {
                        aItems.push({
                            id:    kb.KbId,
                            kind:  "kb",
                            title: kb.Title,
                            text:  (kb.Title || "") + ". " + (kb.Problem || "") + " " + (kb.Solution || ""),
                            meta:  { sourceInc: kb.SourceInc }
                        });
                    });
                    done();
                },
                error: function () { done(); }
            });
        },

        _sendToIndex
: function (aItems) {
            var that = this;

            MessageToast.show(aItems.length + " kayıt indeksleniyor, bu biraz sürebilir...");

            fetch(AI_SERVICE_URL + "/reindex", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: aItems })
            })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                that.getView().setBusy(false);

                if (!result || !result.ok) {
                    MessageBox.error("İndeks oluşturulamadı: " +
                        ((result && result.error) || "AI servisi yanıt vermedi."));
                    return;
                }

                MessageBox.success(
                    result.data.indexed + " kayıt indekslendi." +
                    (result.data.failed > 0 ? "\n" + result.data.failed + " kayıt indekslenemedi." : "")
                );
            })
            .catch(function () {
                that.getView().setBusy(false);
                MessageBox.error("AI servisine ulaşılamadı. Servisin çalıştığından emin olun.");
            });
        },

        _sortBy: function (sField) {
            var oViewModel = this.getView().getModel("view");

            var bDescending;
            if (oViewModel.getProperty("/sortField") === sField) {
                bDescending = !oViewModel.getProperty("/sortDescending");
            } else {
                bDescending = false;
            }

            oViewModel.setProperty("/sortField", sField);
            oViewModel.setProperty("/sortDescending", bDescending);

            var oTable = this.byId("incidentTable");
            var oBinding = oTable.getBinding("items");
            var oSorter = new Sorter(sField, bDescending);
            oBinding.sort(oSorter);

            var sIcon = bDescending ? "sap-icon://sort-descending" : "sap-icon://sort-ascending";
            oViewModel.setProperty("/sortIconNo", sField === "IncidentNo" ? sIcon : "");
            oViewModel.setProperty("/sortIconTitle", sField === "Title" ? sIcon : "");
        }

    });
});
