sap.ui.define([], function () {
    "use strict";

    // Target resolution time in hours per priority
    var SLA_TARGET_HOURS = { H: 8, M: 24, L: 72 };
    var SLA_RISK_RATIO = 0.75;   // "at risk" once 75% of the target has elapsed

    // "YYYYMMDD" + "HHMMSS" -> Date, or null if invalid
    function toDate(sDate, sTime) {
        if (!sDate || sDate.length !== 8 || sDate === "00000000") {
            return null;
        }
        var t = (sTime && sTime.length === 6) ? sTime : "000000";
        return new Date(
            parseInt(sDate.substring(0, 4), 10),
            parseInt(sDate.substring(4, 6), 10) - 1,
            parseInt(sDate.substring(6, 8), 10),
            parseInt(t.substring(0, 2), 10),
            parseInt(t.substring(2, 4), 10),
            parseInt(t.substring(4, 6), 10)
        );
    }

    function fmtHours(fHours) {
        var h = Math.abs(fHours);
        if (h >= 48) {
            return Math.floor(h / 24) + " gün";
        }
        if (h >= 1) {
            return Math.floor(h) + " sa";
        }
        return Math.max(1, Math.round(h * 60)) + " dk";
    }

    // Returns { text, state } for the SLA indicator
    function computeSla(sPriority, sStatus, sCreatedOn, sCreatedAt, sClosedOn, sClosedAt) {
        var iTarget = SLA_TARGET_HOURS[sPriority];
        var oCreated = toDate(sCreatedOn, sCreatedAt);

        if (!iTarget || !oCreated) {
            return { text: "-", state: "None" };
        }

        if (sStatus === "R") {
            return { text: "Çözüldü, onay bekliyor", state: "Information" };
        }

        if (sStatus === "C") {
            var oClosed = toDate(sClosedOn, sClosedAt);
            if (!oClosed) {
                return { text: "Kapandı", state: "None" };
            }
            var fTook = (oClosed - oCreated) / 3600000;
            return fTook <= iTarget
                ? { text: "Hedef içinde kapandı", state: "Success" }
                : { text: "Hedef aşılarak kapandı", state: "Error" };
        }

        // Open or in progress: compare elapsed time with the target
        var fElapsed = (new Date() - oCreated) / 3600000;
        var fLeft = iTarget - fElapsed;

        if (fLeft < 0) {
            return { text: "SLA aşıldı (+" + fmtHours(fLeft) + ")", state: "Error" };
        }
        if (fElapsed >= iTarget * SLA_RISK_RATIO) {
            return { text: "Risk: " + fmtHours(fLeft) + " kaldı", state: "Warning" };
        }
        return { text: fmtHours(fLeft) + " kaldı", state: "Success" };
    }

    return {
        statusText: function (sStatus) {
            switch (sStatus) {
                case "O": return "Open";
                case "I": return "In Progress";
                case "R": return "Resolved";
                case "C": return "Closed";
                default:  return sStatus;
            }
        },

        statusState: function (sStatus) {
            switch (sStatus) {
                case "O": return "Success";
                case "I": return "Warning";
                case "R": return "Information";
                case "C": return "Error";
                default:  return "None";
            }
        },

        priorityText: function (sPriority) {
            switch (sPriority) {
                case "L": return "Low";
                case "M": return "Medium";
                case "H": return "High";
                default:  return sPriority;
            }
        },

        formatRequestType: function (sType) {
            switch (sType) {
                case "incident": return "Arıza";
                case "request":  return "Talep";
                default: return "";
            }
        },

        priorityState: function (sPriority) {
            switch (sPriority) {
                case "H": return "Error";
                case "M": return "Warning";
                case "L": return "Success";
                default:  return "None";
            }
        },

        dateText: function (sDate) {
            if (!sDate || sDate.length !== 8) {
                return sDate;
            }
            var sYear = sDate.substring(0, 4);
            var sMonth = sDate.substring(4, 6);
            var sDay = sDate.substring(6, 8);
            return sDay + "." + sMonth + "." + sYear;
        },

        timeText: function (sTime) {
            if (!sTime || sTime.length !== 6) {
                return sTime;
            }
            var sHour = sTime.substring(0, 2);
            var sMin = sTime.substring(2, 4);
            var sSec = sTime.substring(4, 6);
            return sHour + ":" + sMin + ":" + sSec;
        },

        // SLA (bonus): bound to six fields at once
        slaText: function (sPriority, sStatus, sCreatedOn, sCreatedAt, sClosedOn, sClosedAt) {
            return computeSla(sPriority, sStatus, sCreatedOn, sCreatedAt, sClosedOn, sClosedAt).text;
        },

        slaState: function (sPriority, sStatus, sCreatedOn, sCreatedAt, sClosedOn, sClosedAt) {
            return computeSla(sPriority, sStatus, sCreatedOn, sCreatedAt, sClosedOn, sClosedAt).state;
        },

        slaTargetText: function (sPriority) {
            var iTarget = SLA_TARGET_HOURS[sPriority];
            return iTarget ? "Hedef çözüm süresi: " + iTarget + " saat" : "";
        }

    };
});
