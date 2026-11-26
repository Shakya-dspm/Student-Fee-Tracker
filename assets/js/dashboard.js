(function initializeDashboardPage() {
    "use strict";

    const storage = window.FeeTrackStorage;
    const currency = new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: "LKR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function formatCurrency(value) {
        return currency.format(Number(value) || 0).replace("LKR", "Rs.");
    }

    function setText(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = String(value);
        }
    }

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = String(text);
        return element;
    }

    function initializeSidebar() {
        const toggle = document.querySelector("[data-sidebar-toggle]");
        const backdrop = document.querySelector("[data-sidebar-close]");
        if (!toggle || !backdrop) return;

        const setOpen = (isOpen) => {
            document.body.classList.toggle("sidebar-open", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
        };

        toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("sidebar-open")));
        backdrop.addEventListener("click", () => setOpen(false));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") setOpen(false);
        });
        document.querySelectorAll(".sidebar .nav-link").forEach((link) => {
            link.addEventListener("click", () => {
                if (window.matchMedia("(max-width: 900px)").matches) setOpen(false);
            });
        });
    }

    function setCurrentDate() {
        const dateElement = document.querySelector("[data-current-date]");
        if (dateElement) {
            dateElement.textContent = new Intl.DateTimeFormat("en-LK", {
                day: "numeric", month: "short", year: "numeric"
            }).format(new Date());
        }
    }

    function setSetupGuide(batchCount, studentCount) {
        const guide = document.querySelector("[data-dashboard-setup]");
        if (!guide) return;
        guide.hidden = batchCount > 0 && studentCount > 0;
        guide.replaceChildren();

        const heading = createElement("strong", "", batchCount === 0
            ? "Start by creating your first batch"
            : "Add your first student to begin tracking fees");
        const copy = createElement("span", "", batchCount === 0
            ? "Create a batch before registering students."
            : "Choose a batch, then add students and record their payments.");
        const link = createElement("a", "text-link", batchCount === 0 ? "Create a batch" : "Add a student");
        link.href = batchCount === 0 ? "pages/batches.html" : "pages/students.html";
        guide.append(heading, copy, link);
    }

    function renderMonthlyChart(payments, year) {
        const canvas = document.getElementById("collection-chart");
        if (!canvas || typeof Chart === "undefined") return;
        const totals = Array(12).fill(0);
        payments.forEach((payment) => {
            if (String(payment.paymentDate).slice(0, 4) === String(year)) {
                const month = Number(String(payment.paymentDate).slice(5, 7)) - 1;
                if (month >= 0 && month < 12) totals[month] += Number(payment.amount) || 0;
            }
        });
        new Chart(canvas, {
            type: "bar",
            data: {
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
                datasets: [{
                    label: "Collected",
                    data: totals,
                    backgroundColor: totals.map((_, index) => index === new Date().getMonth() ? "#2563eb" : "#b9d1ff"),
                    hoverBackgroundColor: "#2563eb",
                    borderRadius: 5,
                    borderSkipped: false,
                    maxBarThickness: 24
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (context) => ` ${formatCurrency(context.parsed.y)}` } }
                },
                scales: {
                    x: { grid: { display: false }, border: { display: false } },
                    y: { beginAtZero: true, grid: { color: "#eef2f7" }, border: { display: false },
                        ticks: { callback: (value) => value ? `${(value / 1000).toLocaleString()}k` : "0" } }
                }
            }
        });
    }

    function renderStatusChart(activeStudents) {
        const counts = ["Paid", "Partial", "Pending"].map((status) =>
            activeStudents.filter((student) => student.status === status).length);
        const total = activeStudents.length;
        setText("[data-status-total]", total.toLocaleString());
        ["paid", "partial", "pending"].forEach((key, index) => {
            const element = document.querySelector(`[data-status-${key}]`);
            if (element) {
                const percentage = total ? (counts[index] / total * 100).toFixed(1) : "0.0";
                element.replaceChildren(document.createTextNode(counts[index].toLocaleString() + " "));
                const small = createElement("small", "", `${percentage}%`);
                element.append(small);
            }
        });
        const canvas = document.getElementById("status-chart");
        if (!canvas || typeof Chart === "undefined") return;
        new Chart(canvas, {
            type: "doughnut",
            data: { labels: ["Paid", "Partial", "Pending"], datasets: [{
                data: counts,
                backgroundColor: ["#16a34a", "#f59e0b", "#dc2626"],
                borderWidth: 3,
                borderColor: "#ffffff",
                hoverOffset: 4
            }] },
            options: { maintainAspectRatio: false, responsive: true, cutout: "77%", plugins: { legend: { display: false } } }
        });
    }

    function renderBatchChart(batches, activeStudents) {
        const grouped = batches.map((batch) => ({
            name: batch.batchName,
            count: activeStudents.filter((student) => student.batchId === batch.id).length
        })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);

        const batchList = document.querySelector("[data-dashboard-batches]");
        if (batchList) {
            batchList.replaceChildren();
            if (!grouped.length) {
                batchList.append(createElement("p", "student-table-empty", "No batches yet. Create a batch to get started."));
            } else {
                const dotClasses = ["batch-dot-blue", "batch-dot-violet", "batch-dot-green", "batch-dot-amber", "batch-dot-rose"];
                grouped.forEach((batch, index) => {
                    const row = createElement("div");
                    const label = createElement("span");
                    const dot = createElement("i", `legend-dot ${dotClasses[index]}`);
                    dot.setAttribute("aria-hidden", "true");
                    label.append(dot, document.createTextNode(batch.name));
                    const amount = createElement("strong", "", String(batch.count));
                    amount.append(createElement("small", "", " students"));
                    row.append(label, amount);
                    batchList.append(row);
                });
            }
        }

        const canvas = document.getElementById("batch-chart");
        if (!canvas || typeof Chart === "undefined") return;
        new Chart(canvas, {
            type: "bar",
            data: { labels: grouped.map((batch) => batch.name), datasets: [{
                data: grouped.map((batch) => batch.count),
                backgroundColor: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f472b6"],
                borderRadius: 4,
                borderSkipped: false,
                maxBarThickness: 22
            }] },
            options: { maintainAspectRatio: false, responsive: true, indexAxis: "y", plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, grid: { color: "#eef2f7" }, ticks: { precision: 0 } }, y: { grid: { display: false } } } }
        });
    }

    function renderRecentPayments(payments, students, batches) {
        const body = document.querySelector("[data-dashboard-payments]");
        if (!body) return;
        const studentsById = new Map(students.map((student) => [student.id, student]));
        const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
        const recent = [...payments].sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate))
            || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 5);
        body.replaceChildren();
        if (!recent.length) {
            const row = createElement("tr");
            const cell = createElement("td", "student-table-empty", "No payments recorded yet.");
            cell.colSpan = 7;
            row.append(cell);
            body.append(row);
            return;
        }
        recent.forEach((payment) => {
            const student = studentsById.get(payment.studentId);
            const batch = student && batchesById.get(student.batchId);
            const row = createElement("tr");
            const nameCell = createElement("td");
            const studentCell = createElement("div", "student-cell");
            const avatar = createElement("span", "student-avatar avatar-blue", student
                ? student.studentName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
                : "?");
            studentCell.append(avatar, createElement("strong", "", student ? student.studentName : "Unknown student"));
            nameCell.append(studentCell);
            const status = student ? student.status : "Unknown";
            const statusCell = createElement("td");
            if (student) {
                const statusClass = status === "Paid" ? "status-paid" : status === "Partial" ? "status-partial" : "status-pending";
                statusCell.append(createElement("span", `status-badge ${statusClass}`, status));
            } else {
                statusCell.textContent = status;
            }
            row.append(nameCell,
                createElement("td", "student-id-cell", student ? student.id : payment.studentId),
                createElement("td", "", batch ? batch.batchName : `Batch ID ${student ? student.batchId : "unknown"} (name unavailable)`),
                createElement("td", "", new Date(`${payment.paymentDate}T00:00:00`).toLocaleDateString("en-LK")),
                createElement("td", "amount-cell", formatCurrency(payment.amount)),
                createElement("td", "", payment.paymentMethod),
                statusCell);
            body.append(row);
        });
    }

    function renderRegistrations(students, batches) {
        const list = document.querySelector("[data-dashboard-registrations]");
        if (!list) return;
        const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
        const recent = students.filter((student) => !student.isSoftDelete)
            .sort((a, b) => a.studentName.localeCompare(b.studentName)).slice(0, 4);
        list.replaceChildren();
        if (!recent.length) {
            list.append(createElement("p", "student-table-empty", "No student registrations yet."));
            return;
        }
        recent.forEach((student) => {
            const item = createElement("div", "registration-item");
            const initials = student.studentName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
            const avatar = createElement("span", "student-avatar avatar-blue", initials);
            const copy = createElement("div", "registration-copy");
            copy.append(createElement("strong", "", student.studentName));
            const batch = batchesById.get(student.batchId);
            copy.append(createElement("small", "", batch ? batch.batchName : `Batch ID ${student.batchId} (name unavailable)`));
            const arrow = createElement("i", "bi bi-arrow-up-right registration-arrow");
            arrow.setAttribute("aria-hidden", "true");
            item.append(avatar, copy, arrow);
            list.append(item);
        });
    }

    function renderDashboard() {
        ["[data-dashboard-payments]", "[data-dashboard-batches]", "[data-dashboard-registrations]"].forEach((selector) => {
            const container = document.querySelector(selector);
            if (container) container.replaceChildren();
        });
        if (!storage) throw new Error("FeeTrack storage did not load. Check the storage.js script.");
        const allStudents = storage.getStudents();
        const students = allStudents.filter((student) => !student.isSoftDelete);
        const batches = storage.getBatches();
        const payments = storage.getPayments();
        const totalFees = students.reduce((sum, student) => sum + Number(student.totalFees || 0), 0);
        const received = students.reduce((sum, student) => sum + Number(student.totalReceived || 0), 0);
        const outstanding = students.reduce((sum, student) => sum + storage.calculateOutstandingBalance(student), 0);
        const progress = totalFees ? Math.min(100, received / totalFees * 100) : 0;
        const currentYear = new Date().getFullYear();
        const yearPayments = payments.filter((payment) => String(payment.paymentDate).slice(0, 4) === String(currentYear));
        const yearTotal = yearPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

        setText("[data-dashboard-students]", students.length.toLocaleString());
        setText("[data-dashboard-fees]", formatCurrency(totalFees));
        setText("[data-dashboard-received]", formatCurrency(received));
        setText("[data-dashboard-received-caption]", `${totalFees ? (received / totalFees * 100).toFixed(1) : "0.0"}% of total fees`);
        setText("[data-dashboard-outstanding]", formatCurrency(outstanding));
        setText("[data-dashboard-outstanding-caption]", `Across ${students.filter((student) => student.totalReceived < student.totalFees).length.toLocaleString()} active students`);
        setText("[data-dashboard-year-total]", formatCurrency(yearTotal));
        setText("[data-dashboard-year-caption]", `Receipts saved in this browser during ${currentYear}`);
        setText("[data-dashboard-year-label]", String(currentYear));
        setText("[data-progress-received]", formatCurrency(received));
        setText("[data-progress-fees]", `of ${formatCurrency(totalFees)}`);
        setText("[data-progress-percent]", `${progress.toFixed(1)}% collected`);
        setText("[data-progress-remaining]", `${formatCurrency(outstanding)} remaining`);
        const progressBar = document.querySelector("[data-progress-bar]");
        if (progressBar) {
            progressBar.setAttribute("aria-valuenow", String(progress.toFixed(1)));
            const fill = progressBar.querySelector(".progress-fill");
            if (fill) fill.style.width = `${progress}%`;
        }
        setSetupGuide(batches.length, students.length);
        renderMonthlyChart(payments, currentYear);
        renderStatusChart(students);
        renderBatchChart(batches, students);
        renderRecentPayments(payments, allStudents, batches);
        renderRegistrations(students, batches);
    }

    async function start() {
        initializeSidebar();
        setCurrentDate();
        const notice = document.querySelector("[data-dashboard-notice]");
        try {
            await storage.initialize();
        } catch (error) {
            if (notice) {
                notice.textContent = error.message;
                notice.hidden = false;
                notice.classList.add("is-error");
            }
            return;
        }
        const search = document.querySelector("[data-dashboard-search]");
        if (search) {
            search.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const query = search.value.trim();
                if (!query || !storage) return;
                const normalized = query.toLocaleLowerCase();
                try {
                    const students = storage.getStudents();
                    const payments = storage.getPayments();
                    const batches = storage.getBatches();
                    const student = students.find((item) => !item.isSoftDelete && `${item.studentName} ${item.id} ${item.contactNo}`.toLocaleLowerCase().includes(normalized));
                    if (student) {
                        window.location.href = `pages/students.html?q=${encodeURIComponent(query)}`;
                        return;
                    }
                    const payment = payments.find((item) => `${item.id} ${item.studentId} ${item.paymentMethod} ${item.note || ""}`.toLocaleLowerCase().includes(normalized));
                    if (payment) {
                        window.location.href = `pages/payments.html?q=${encodeURIComponent(query)}`;
                        return;
                    }
                    const batch = batches.find((item) => `${item.batchName} ${item.id}`.toLocaleLowerCase().includes(normalized));
                    if (batch) {
                        window.location.href = `pages/batches.html?q=${encodeURIComponent(query)}`;
                        return;
                    }
                    if (notice) {
                        notice.textContent = `No students, payments, or batches match “${query}”.`;
                        notice.hidden = false;
                    }
                } catch (error) {
                    if (notice) {
                        notice.textContent = error.message || "Unable to search saved records.";
                        notice.classList.add("is-error");
                        notice.hidden = false;
                    }
                }
            });
        }
        try {
            renderDashboard();
        } catch (error) {
            if (notice) {
                notice.textContent = error.message || "Unable to load dashboard data from the API.";
                notice.classList.add("is-error");
                notice.hidden = false;
            }
            console.error("Unable to load FeeTrack dashboard data.", error);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
}());
