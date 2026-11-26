(function initializeFeeManagementPage() {
    "use strict";

    const storage = window.FeeTrackStorage;
    const formatter = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatCurrency = (value) => `Rs. ${formatter.format(Number(value) || 0)}`;

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

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = String(text);
        return node;
    }

    async function start() {
        initializeSidebar();
        const page = document.querySelector("[data-fees-page]");
        if (!page) return;
        const notice = page.querySelector("[data-fees-notice]");
        try {
            await storage.initialize();
        } catch (error) {
            showError(error);
            return;
        }
        const setup = page.querySelector("[data-fees-setup]");
        const rows = page.querySelector("[data-fees-rows]");
        const search = page.querySelector("[data-fees-search]");
        let students = [];
        let batches = [];

        function render() {
            if (!storage) throw new Error("FeeTrack storage did not load. Check the storage.js script.");
            students = storage.getStudents().filter((student) => !student.isSoftDelete);
            batches = storage.getBatches();
            const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
            const totalFees = students.reduce((sum, student) => sum + Number(student.totalFees), 0);
            const totalReceived = students.reduce((sum, student) => sum + Number(student.totalReceived), 0);
            const totalOutstanding = students.reduce((sum, student) => sum + Math.max(0, storage.calculateOutstandingBalance(student)), 0);
            const owing = students.filter((student) => storage.calculateOutstandingBalance(student) > 0).length;
            page.querySelector("[data-fees-total]").textContent = formatCurrency(totalFees);
            page.querySelector("[data-fees-received]").textContent = formatCurrency(totalReceived);
            page.querySelector("[data-fees-outstanding]").textContent = formatCurrency(totalOutstanding);
            page.querySelector("[data-fees-count]").textContent = owing.toLocaleString();

            setup.hidden = students.length > 0 && batches.length > 0;
            if (batches.length === 0) {
                setup.replaceChildren(document.createTextNode("Create a batch before registering students. "));
                const link = el("a", "text-link", "Create a batch");
                link.href = "batches.html";
                setup.append(link);
            } else if (students.length === 0) {
                setup.replaceChildren(document.createTextNode("No students yet. Add a student to start tracking fees. "));
                const link = el("a", "text-link", "Add a student");
                link.href = "students.html";
                setup.append(link);
            }

            const query = search.value.trim().toLocaleLowerCase();
            const visible = students.filter((student) => {
                const batch = batchesById.get(student.batchId);
                return !query || `${student.studentName} ${student.id} ${batch ? batch.batchName : ""}`.toLocaleLowerCase().includes(query);
            }).sort((a, b) => a.studentName.localeCompare(b.studentName));
            rows.replaceChildren();
            if (!visible.length) {
                const tr = el("tr");
                const td = el("td", "student-table-empty", students.length ? "No students match this search." : "No student fee records yet.");
                td.colSpan = 7;
                tr.append(td);
                rows.append(tr);
            } else {
                visible.forEach((student) => {
                    const outstanding = Math.max(0, storage.calculateOutstandingBalance(student));
                    const batch = batchesById.get(student.batchId);
                    const tr = el("tr");
                    const studentCell = el("td");
                    const studentLink = el("a", "payment-student-name", student.studentName);
                    studentLink.href = `student-details.html?id=${encodeURIComponent(student.id)}`;
                    studentCell.append(studentLink, el("small", "payment-student-id", student.id));
                    const status = el("span", `status-badge ${student.status === "Paid" ? "status-paid" : student.status === "Partial" ? "status-partial" : "status-pending"}`, student.status);
                    const statusCell = el("td");
                    statusCell.append(status);
                    const action = el("td");
                    if (outstanding > 0) {
                        const paymentLink = el("a", "text-link", "Record payment");
                        paymentLink.href = `payments.html?student=${encodeURIComponent(student.id)}`;
                        action.append(paymentLink);
                    } else {
                        action.textContent = "—";
                    }
                    tr.append(studentCell,
                        el("td", "", batch ? batch.batchName : `Batch ID ${student.batchId} (not in API batch list)`),
                        el("td", "text-end", formatCurrency(student.totalFees)),
                        el("td", "text-end", formatCurrency(student.totalReceived)),
                        el("td", "text-end payment-amount", formatCurrency(outstanding)),
                        statusCell);
                    tr.append(action);
                    rows.append(tr);
                });
            }
            page.querySelector("[data-fees-result-count]").textContent = visible.length.toLocaleString();
        }

        search.addEventListener("input", () => {
            try { render(); } catch (error) { showError(error); }
        });
        function showError(error) {
            notice.textContent = error.message || "Unable to load fee records.";
            notice.classList.add("is-error");
            notice.hidden = false;
        }
        try { render(); } catch (error) { showError(error); }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
}());
