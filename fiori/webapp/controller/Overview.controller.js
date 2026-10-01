sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    // Display names of AI suggestion types
    var SUG_TYPE_TEXT = {
        TITLE: "Başlık",
        PRIORITY: "Öncelik",
        CATEGORY: "Kategori",
        SUPPORTGROUP: "Destek Grubu",
        REQUESTTYPE: "Talep Türü",
        SUMMARY: "Çağrı Özeti",
        IMPACT: "Etki",
        REVISION: "Revizyon"
    };

    return Controller.extend("zitsm.controller.Overview", {
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("overview").attachPatternMatched(this._onRouteMatched, this);

            this.getView().setModel(new JSONModel({
                statusData: [],
                userData: [],
                dateData: [],
                categoryData: [],
                sugData: [],
                kpi: {
                    aiResolved: { value: "—", sub: "Yükleniyor..." },
                    converted:  { value: "—", sub: "Yükleniyor..." },
                    testPass:   { value: "—", sub: "Yükleniyor..." },
                    sugAccept:  { value: "—", sub: "Yükleniyor..." }
                }
            }), "overview");
        },

        _onRouteMatched: function () {
            this._loadData();
            this._loadAiKpis();
        },

        _pct: function (iPart, iTotal) {
            if (!iTotal) { return "—"; }
            return Math.round((iPart * 100) / iTotal) + "%";
        },

        _loadData: function () {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var oView = this.getView();
            var that = this;

            oModel.read("/IncidentSet", {
                success: function (oData) {
                    var aItems = oData.results || [];
                    var oOverview = oView.getModel("overview");

                    var oCounts = { O: 0, I: 0, R: 0, C: 0 };
                    aItems.forEach(function (oItem) {
                        if (oCounts.hasOwnProperty(oItem.Status)) {
                            oCounts[oItem.Status]++;
                        }
                    });

                    oOverview.setProperty("/statusData", [
                        { status: "Open", count: oCounts.O },
                        { status: "In Progress", count: oCounts.I },
                        { status: "Resolved", count: oCounts.R },
                        { status: "Closed", count: oCounts.C }
                    ]);

                    oView.byId("statusChart").setVizProperties({
                        title: { text: "Durum Dağılımı" },
                        plotArea: { dataLabel: { visible: true } },
                        legend: { title: { visible: false } }
                    });

                    // Top 8 categories
                    var oCatMap = {};
                    aItems.forEach(function (oItem) {
                        if (oItem.Category) {
                            oCatMap[oItem.Category] = (oCatMap[oItem.Category] || 0) + 1;
                        }
                    });

                    var aCat = Object.keys(oCatMap)
                        .map(function (sKey) { return { category: sKey, count: oCatMap[sKey] }; })
                        .sort(function (a, b) { return b.count - a.count; })
                        .slice(0, 8);

                    oOverview.setProperty("/categoryData", aCat);

                    oView.byId("categoryChart").setVizProperties({
                        title: { text: "En Çok Çağrı Açılan Kategoriler" },
                        plotArea: { dataLabel: { visible: true }, gridline: { visible: false } },
                        legend: { visible: false },
                        valueAxis: { visible: false },
                        categoryAxis: { title: { visible: false } }
                    });

                    var oUserMap = {};
                    aItems.forEach(function (oItem) {
                        var sUser = oItem.AssignedTo || "(Atanmamış)";
                        oUserMap[sUser] = (oUserMap[sUser] || 0) + 1;
                    });

                    oOverview.setProperty("/userData", Object.keys(oUserMap).map(function (sUser) {
                        return { user: sUser, count: oUserMap[sUser] };
                    }));

                    oView.byId("userChart").setVizProperties({
                        title: { text: "Kullanıcıya Göre Incident" },
                        plotArea: { dataLabel: { visible: true }, gridline: { visible: false } },
                        valueAxis: { visible: false },
                        categoryAxis: { title: { visible: false } }
                    });

                    // Keep all rows so the date filter can rebuild the chart
                    that._aAllItems = aItems;
                    that._buildDateChart(aItems);
                },
                error: function () {
                    MessageToast.show("Veri yüklenemedi.");
                }
            });
        },

        // AI KPI cards, each loaded independently
        _loadAiKpis: function () {
            var oModel = this.getOwnerComponent().getModel("incidents");
            var oView = this.getView();
            var oOverview = oView.getModel("overview");
            var that = this;

            // Chats: resolved by AI vs. converted to incident
            oModel.read("/ConversationSet", {
                success: function (oData) {
                    var iR = 0, iT = 0;
                    (oData.results || []).forEach(function (c) {
                        if (c.Status === "R") { iR++; }
                        else if (c.Status === "T") { iT++; }
                    });
                    var iDone = iR + iT;

                    oOverview.setProperty("/kpi/aiResolved", {
                        value: that._pct(iR, iDone),
                        sub: iDone ? "AI ile çözülen: " + iR + " / " + iDone + " sohbet" : "Henüz sonuçlanan sohbet yok"
                    });
                    oOverview.setProperty("/kpi/converted", {
                        value: that._pct(iT, iDone),
                        sub: iDone ? "Çağrıya dönüşen: " + iT + " / " + iDone + " sohbet" : "Henüz sonuçlanan sohbet yok"
                    });
                },
                error: function () {
                    oOverview.setProperty("/kpi/aiResolved", { value: "—", sub: "Veri okunamadı" });
                    oOverview.setProperty("/kpi/converted", { value: "—", sub: "Veri okunamadı" });
                }
            });

            // Test pass rate = P / (P + F); N/A and pending are excluded
            oModel.read("/TestSet", {
                success: function (oData) {
                    var iP = 0, iF = 0;
                    (oData.results || []).forEach(function (t) {
                        if (t.TestResult === "P") { iP++; }
                        else if (t.TestResult === "F") { iF++; }
                    });
                    var iTot = iP + iF;

                    oOverview.setProperty("/kpi/testPass", {
                        value: that._pct(iP, iTot),
                        sub: iTot ? "Başarılı: " + iP + " / " + iTot + " test" : "Sonuçlanmış test yok"
                    });
                },
                error: function () {
                    oOverview.setProperty("/kpi/testPass", { value: "—", sub: "Veri okunamadı" });
                }
            });

            // AI suggestions: acceptance rate and decisions by type
            oModel.read("/SuggestionSet", {
                success: function (oData) {
                    var aSug = oData.results || [];
                    var iA = 0;
                    var oByType = {};

                    aSug.forEach(function (s) {
                        if (s.Decision === "A") { iA++; }

                        if (!oByType[s.SugType]) {
                            oByType[s.SugType] = {
                                type: SUG_TYPE_TEXT[s.SugType] || s.SugType,
                                accepted: 0,
                                changed: 0
                            };
                        }
                        if (s.Decision === "A") {
                            oByType[s.SugType].accepted++;
                        } else {
                            oByType[s.SugType].changed++;
                        }
                    });

                    oOverview.setProperty("/kpi/sugAccept", {
                        value: that._pct(iA, aSug.length),
                        sub: aSug.length ? "Değiştirilmeden kabul: " + iA + " / " + aSug.length + " öneri" : "Henüz AI önerisi yok"
                    });

                    oOverview.setProperty("/sugData", Object.keys(oByType).map(function (k) {
                        return oByType[k];
                    }));

                    oView.byId("sugChart").setVizProperties({
                        title: { text: "AI Öneri Kararları (Öneri Tipine Göre)" },
                        plotArea: {
                            dataLabel: { visible: true },
                            gridline: { visible: false },
                            colorPalette: ["#2e7d32", "#f0a202"]
                        },
                        legend: { title: { visible: false } },
                        valueAxis: { visible: false },
                        categoryAxis: { title: { visible: false } }
                    });
                },
                error: function () {
                    oOverview.setProperty("/kpi/sugAccept", { value: "—", sub: "Veri okunamadı" });
                }
            });
        },

        _buildDateChart: function (aItems) {
            var oView = this.getView();
            var oOverview = oView.getModel("overview");

            var oDateMap = {};
            aItems.forEach(function (oItem) {
                var sRaw = oItem.CreatedOn;
                if (sRaw && sRaw.length === 8) {
                    oDateMap[sRaw] = (oDateMap[sRaw] || 0) + 1;
                }
            });

            var aDateData = Object.keys(oDateMap).sort().map(function (sKey) {
                var sLabel = sKey.substring(6, 8) + "." + sKey.substring(4, 6) + "." + sKey.substring(0, 4);
                return { date: sLabel, count: oDateMap[sKey] };
            });

            oOverview.setProperty("/dateData", aDateData);

            oView.byId("dateChart").setVizProperties({
                title: { text: "Tarihe Göre Incident" },
                plotArea: { dataLabel: { visible: true }, gridline: { visible: false } },
                valueAxis: { visible: false },
                categoryAxis: { title: { visible: false } }
            });
        },

        onDateRangeChange: function (oEvent) {
            var oFrom = oEvent.getParameter("from");
            var oTo = oEvent.getParameter("to");
            var aItems = this._aAllItems || [];

            if (oFrom && oTo) {
                var sFrom = this._dateToYmd(oFrom);
                var sTo = this._dateToYmd(oTo);
                aItems = aItems.filter(function (oItem) {
                    var s = oItem.CreatedOn;
                    return s && s.length === 8 && s >= sFrom && s <= sTo;
                });
            }

            this._buildDateChart(aItems);
        },

        onClearDateRange: function () {
            this.getView().byId("dateRange").setValue("");
            this._buildDateChart(this._aAllItems || []);
        },

        _dateToYmd
: function (oDate) {
            var y = oDate.getFullYear();
            var m = ("0" + (oDate.getMonth() + 1)).slice(-2);
            var d = ("0" + oDate.getDate()).slice(-2);
            return "" + y + m + d;
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("list");
        }

    });
});
