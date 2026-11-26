(function initializeReportsPage() {
    "use strict";

    const storage = window.FeeTrackStorage;
    const money = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatCurrency = (value) => `Rs. ${money.format(Number(value) || 0)}`;

    function initializeSidebar() {
        const toggle = document.querySelector("[data-sidebar-toggle]");
        const backdrop = document.querySelector("[data-sidebar-close]");
        if (!toggle || !backdrop) return;
        const setOpen = (open) => {
            document.body.classList.toggle("sidebar-open", open);
            toggle.setAttribute("aria-expanded", String(open));
        };
        toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("sidebar-open")));
        backdrop.addEventListener("click", () => setOpen(false));
        document.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
    }

    function cell(row, value, className) {
        const td = document.createElement("td");
        if (className) td.className = className;
        td.textContent = String(value);
        row.append(td);
        return td;
    }

    async function start() {
        initializeSidebar();
        const page = document.querySelector("[data-reports-page]");
        if (!page) return;
        const notice = page.querySelector("[data-reports-notice]");
        try {
            await storage.initialize();
        } catch (error) {
            notice.textContent = error.message;
            notice.classList.add("is-error");
            notice.hidden = false;
            return;
        }
        const setup = page.querySelector("[data-reports-setup]");
        let csvRows = [];

        function render() {
            if (!storage) throw new Error("FeeTrack storage did not load. Check the storage.js script.");
            const allStudents = storage.getStudents();
            const students = allStudents.filter((student) => !student.isSoftDelete);
            const batches = storage.getBatches();
            const payments = storage.getPayments();
            setup.hidden = students.length > 0 && batches.length > 0;
            if (batches.length === 0) {
                setup.replaceChildren(document.createTextNode("Create a batch before registering students. "));
                const link = document.createElement("a");
                link.className = "text-link";
                link.href = "batches.html";
                link.textContent = "Create a batch";
                setup.append(link);
            } else if (students.length === 0) {
                setup.replaceChildren(document.createTextNode("No students have been registered yet. "));
                const link = document.createElement("a");
                link.className = "text-link";
                link.href = "students.html";
                link.textContent = "Add a student";
                setup.append(link);
            }
            const totalFees = students.reduce((sum, student) => sum + Number(student.totalFees), 0);
            const received = students.reduce((sum, student) => sum + Number(student.totalReceived), 0);
            const outstanding = students.reduce((sum, student) => sum + Math.max(0, storage.calculateOutstandingBalance(student)), 0);
            const set = (selector, value) => { page.querySelector(selector).textContent = String(value); };
            set("[data-report-students]", students.length.toLocaleString());
            set("[data-report-fees]", formatCurrency(totalFees));
            set("[data-report-received]", formatCurrency(received));
            set("[data-report-outstanding]", formatCurrency(outstanding));

            const statusBody = page.querySelector("[data-report-status]");
            statusBody.replaceChildren();
            ["Paid", "Partial", "Pending"].forEach((status) => {
                const count = students.filter((student) => student.status === status).length;
                const row = document.createElement("tr");
                cell(row, status);
                cell(row, count.toLocaleString(), "text-end");
                cell(row, `${students.length ? (count / students.length * 100).toFixed(1) : "0.0"}%`, "text-end");
                statusBody.append(row);
            });

            const batchesBody = page.querySelector("[data-report-batches]");
            batchesBody.replaceChildren();
            batches.forEach((batch) => {
                const members = students.filter((student) => student.batchId === batch.id);
                const fees = members.reduce((sum, student) => sum + Number(student.totalFees), 0);
                const row = document.createElement("tr");
                cell(row, batch.batchName);
                cell(row, members.length.toLocaleString(), "text-end");
                cell(row, formatCurrency(fees), "text-end");
                batchesBody.append(row);
            });
            if (!batches.length) {
                const row = document.createElement("tr");
                const td = cell(row, "No batches have been created yet.");
                td.colSpan = 3;
                batchesBody.append(row);
            }

            const year = new Date().getFullYear();
            set("[data-report-year]", year);
            const monthly = Array.from({ length: 12 }, (_, index) => ({ month: index, count: 0, amount: 0 }));
            payments.forEach((payment) => {
                if (String(payment.paymentDate).slice(0, 4) !== String(year)) return;
                const month = Number(String(payment.paymentDate).slice(5, 7)) - 1;
                if (month >= 0 && month < 12) {
                    monthly[month].count += 1;
                    monthly[month].amount += Number(payment.amount) || 0;
                }
            });
            const monthlyBody = page.querySelector("[data-report-monthly]");
            monthlyBody.replaceChildren();
            const monthNames = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });
            monthly.forEach((summary, index) => {
                const row = document.createElement("tr");
                cell(row, monthNames.format(new Date(Date.UTC(year, index, 1))));
                cell(row, summary.count.toLocaleString(), "text-end");
                cell(row, formatCurrency(summary.amount), "text-end");
                monthlyBody.append(row);
            });

            csvRows = [["Report", "FeeTrack"], ["Year", year], [], ["Status", "Students", "Share"]];
            ["Paid", "Partial", "Pending"].forEach((status) => {
                const count = students.filter((student) => student.status === status).length;
                csvRows.push([status, count, `${students.length ? (count / students.length * 100).toFixed(1) : "0.0"}%`]);
            });
            csvRows.push([], ["Batch", "Students", "Expected fees"]);
            batches.forEach((batch) => {
                const members = students.filter((student) => student.batchId === batch.id);
                csvRows.push([batch.batchName, members.length, members.reduce((sum, student) => sum + Number(student.totalFees), 0)]);
            });
            csvRows.push([], ["Month", "Transactions", "Amount"]);
            monthly.forEach((summary, index) => csvRows.push([monthNames.format(new Date(Date.UTC(year, index, 1))), summary.count, summary.amount]));
        }

        document.querySelector("[data-export-report]").addEventListener("click", () => {
            try {
                render();
                const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
                const csv = csvRows.map((row) => row.map(quote).join(",")).join("\r\n");
                const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
                const link = document.createElement("a");
                link.href = url;
                link.download = `feetrack-report-${new Date().getFullYear()}.csv`;
                link.hidden = true;
                document.body.append(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
                notice.textContent = error.message || "Unable to export the report.";
                notice.classList.add("is-error");
                notice.hidden = false;
            }
        });

        try {
            render();
        } catch (error) {
            notice.textContent = error.message || "Unable to load report data.";
            notice.classList.add("is-error");
            notice.hidden = false;
            console.error("Unable to load FeeTrack reports.", error);
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
}());
