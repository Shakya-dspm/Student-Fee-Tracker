(function initializeStudentPages() {
    "use strict";

    const storage = window.FeeTrackStorage;

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        if (text !== undefined) {
            element.textContent = text;
        }
        return element;
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("en-LK", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function formatCurrency(value) {
        return `Rs. ${formatNumber(value)}`;
    }

    function outstandingFor(student) {
        const feesInCents = Math.round((Number(student.totalFees) + Number.EPSILON) * 100);
        const receivedInCents = Math.round((Number(student.totalReceived) + Number.EPSILON) * 100);
        return Math.max(0, feesInCents - receivedInCents) / 100;
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }
        const date = new Date(`${value}T00:00:00`);
        if (!Number.isFinite(date.getTime())) {
            return String(value);
        }
        return new Intl.DateTimeFormat("en-LK", {
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function showNotice(container, message, kind) {
        if (!container) {
            return;
        }
        container.textContent = message;
        container.className = "student-notice";
        if (kind) {
            container.classList.add(`is-${kind}`);
        }
        container.hidden = false;
    }

    function setText(root, selector, value) {
        const element = root.querySelector(selector);
        if (element) {
            element.textContent = value === undefined || value === null || value === "" ? "—" : String(value);
        }
    }

    function makeActionButton(iconName, label, action, studentId, extraClass) {
        const button = createElement("button", `icon-button student-row-action${extraClass ? ` ${extraClass}` : ""}`);
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.title = label;
        button.dataset.studentAction = action;
        button.dataset.studentId = studentId;
        const icon = createElement("i", `bi ${iconName}`);
        icon.setAttribute("aria-hidden", "true");
        button.append(icon);
        return button;
    }

    function initializeSidebar() {
        const toggle = document.querySelector("[data-sidebar-toggle]");
        const closeControl = document.querySelector("[data-sidebar-close]");
        const sidebar = document.querySelector("#app-sidebar");
        if (!toggle || !closeControl || !sidebar) {
            return;
        }

        function closeSidebar() {
            document.body.classList.remove("sidebar-open");
            toggle.setAttribute("aria-expanded", "false");
        }

        toggle.addEventListener("click", () => {
            const isOpen = document.body.classList.toggle("sidebar-open");
            toggle.setAttribute("aria-expanded", String(isOpen));
        });
        closeControl.addEventListener("click", closeSidebar);
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeSidebar();
            }
        });
        sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeSidebar));
    }

    function canonicalPhone(value) {
        const compact = String(value || "").trim().replace(/[\s().-]/g, "");
        if (compact.startsWith("+94")) {
            return compact;
        }
        if (compact.startsWith("0")) {
            return `+94${compact.slice(1)}`;
        }
        return compact.startsWith("7") ? `+94${compact}` : compact;
    }

    function normalizeName(value) {
        return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
    }

    function initializeStudentDirectory(page) {
        if (!storage) {
            showNotice(page.querySelector("[data-student-notice]"), "Student storage is unavailable. Reload the page or check the storage script.", "error");
            return;
        }

        const state = {
            students: [],
            batches: [],
            showDeleted: false,
            editingId: null,
            isSaving: false
        };
        const notice = page.querySelector("[data-student-notice]");
        const rows = page.querySelector("[data-student-rows]");
        const batchFilter = page.querySelector("[data-batch-filter]");
        const formBatch = document.querySelector("[data-student-batch-select]");
        const dialog = document.querySelector("[data-student-dialog]");
        const form = document.querySelector("[data-student-form]");
        const saveButton = document.querySelector("[data-save-student]");
        const formMessage = document.querySelector("[data-form-message]");
        const showDeleted = page.querySelector("[data-show-deleted]");
        const requestedSearch = new URLSearchParams(window.location.search).get("q");
        if (requestedSearch) {
            page.querySelector("[data-student-search]").value = requestedSearch;
        }

        function loadData() {
            state.students = storage.getStudents();
            state.batches = storage.getBatches();
        }

        function setSelectOptions(select, batches, includeAll, selectedValue) {
            if (!select) {
                return;
            }
            const placeholder = createElement("option", "", includeAll ? "All batches" : "Select a batch");
            placeholder.value = "";
            const options = [placeholder];
            batches.forEach((batch) => {
                const option = createElement("option", "", batch.batchName);
                option.value = batch.id;
                options.push(option);
            });
            select.replaceChildren(...options);
            select.value = selectedValue || "";
            select.disabled = !includeAll && batches.length === 0;
        }

        function renderSummary() {
            const active = state.students.filter((student) => !student.isSoftDelete);
            const paid = active.filter((student) => student.status === "Paid");
            const outstanding = active.reduce((total, student) => {
                return total + outstandingFor(student);
            }, 0);
            setText(page, "[data-summary-total]", String(state.students.length));
            setText(page, "[data-summary-active]", String(active.length));
            setText(page, "[data-summary-paid]", String(paid.length));
            setText(page, "[data-summary-outstanding]", formatCurrency(outstanding));
        }

        function batchNameFor(student) {
            const batch = state.batches.find((item) => item.id === student.batchId);
            return batch ? batch.batchName : `Batch ID ${student.batchId} (name unavailable)`;
        }

        function studentMatchesFilters(student) {
            const isDeleted = Boolean(student.isSoftDelete);
            if (isDeleted !== state.showDeleted) {
                return false;
            }

            const search = page.querySelector("[data-student-search]").value.trim().toLowerCase();
            if (search && !`${student.studentName} ${student.id}`.toLowerCase().includes(search)) {
                return false;
            }

            const selectedBatch = batchFilter.value;
            if (selectedBatch && student.batchId !== selectedBatch) {
                return false;
            }

            const selectedStatus = page.querySelector("[data-status-filter]").value;
            return !selectedStatus || student.status === selectedStatus;
        }

        function sortStudents(students) {
            const sortBy = page.querySelector("[data-student-sort]").value;
            const sorted = [...students];
            const compareName = (left, right) => left.studentName.localeCompare(right.studentName, "en");
            sorted.sort((left, right) => {
                switch (sortBy) {
                    case "name-desc":
                        return compareName(right, left);
                    case "fees-desc":
                        return right.totalFees - left.totalFees || compareName(left, right);
                    case "balance-desc":
                        return outstandingFor(right) - outstandingFor(left)
                            || compareName(left, right);
                    default:
                        return compareName(left, right);
                }
            });
            return sorted;
        }

        function renderRows() {
            const visible = sortStudents(state.students.filter(studentMatchesFilters));
            const fragment = document.createDocumentFragment();
            visible.forEach((student) => {
                const row = document.createElement("tr");
                const idCell = createElement("td", "student-id-cell", student.id);
                const nameCell = createElement("td", "student-name-cell", student.studentName);
                const contactCell = createElement("td", "", student.contactNo);
                const batchCell = createElement("td", "", batchNameFor(student));
                const totalCell = createElement("td", "text-end student-fee-cell", formatCurrency(student.totalFees));
                const receivedCell = createElement("td", "text-end student-fee-cell", formatCurrency(student.totalReceived));
                const balanceCell = createElement("td", "text-end student-fee-cell", formatCurrency(outstandingFor(student)));
                const statusCell = document.createElement("td");
                const status = createElement("span", `status-badge status-${String(student.status).toLowerCase()}`, student.status);
                statusCell.append(status);
                const actionsCell = createElement("td", "text-end");
                const actions = createElement("div", "student-row-actions");
                const view = createElement("a", "icon-button student-row-action");
                view.href = `student-details.html?id=${encodeURIComponent(student.id)}`;
                view.title = "View student";
                view.setAttribute("aria-label", `View ${student.studentName}`);
                const viewIcon = createElement("i", "bi bi-eye");
                viewIcon.setAttribute("aria-hidden", "true");
                view.append(viewIcon);
                actions.append(view);

                if (student.isSoftDelete) {
                    actions.append(makeActionButton("bi-arrow-counterclockwise", "Restore student", "restore", student.id, "is-restore"));
                } else {
                    actions.append(makeActionButton("bi-pencil", "Edit student", "edit", student.id));
                    actions.append(makeActionButton("bi-archive", "Delete student", "delete", student.id, "is-danger"));
                }
                actionsCell.append(actions);
                row.append(idCell, nameCell, contactCell, batchCell, totalCell, receivedCell, balanceCell, statusCell, actionsCell);
                fragment.append(row);
            });

            if (visible.length === 0) {
                const row = document.createElement("tr");
                const cell = createElement(
                    "td",
                    "student-table-empty",
                    state.students.length === 0 && !state.showDeleted
                        ? "No students yet. Create a batch, then register your first student."
                        : state.showDeleted
                            ? "No deleted students match these filters."
                            : "No students match these filters."
                );
                cell.colSpan = 9;
                row.append(cell);
                fragment.append(row);
            }
            rows.replaceChildren(fragment);
            setText(page, "[data-result-count]", String(visible.length));
            page.querySelector("#student-table-title").textContent = state.showDeleted ? "Deleted students" : "All students";
        }

        function render() {
            loadData();
            setSelectOptions(batchFilter, state.batches, true, batchFilter.value);
            setSelectOptions(formBatch, state.batches, false, formBatch.value);
            page.querySelector("[data-batch-hint]").hidden = state.batches.length > 0;
            page.querySelector("[data-open-student-form]").disabled = state.batches.length === 0;
            renderSummary();
            renderRows();
        }

        function clearFormMessage() {
            formMessage.textContent = "";
            formMessage.hidden = true;
            formMessage.className = "student-form-message";
        }

        function showFormError(message) {
            formMessage.textContent = message;
            formMessage.className = "student-form-message is-error";
            formMessage.hidden = false;
        }

        function openForm(student) {
            if (!state.batches.length) {
                showNotice(notice, "Add a batch before registering a student. The batch list is currently empty.", "error");
                return;
            }
            state.editingId = student ? student.id : null;
            form.reset();
            clearFormMessage();
            setSelectOptions(formBatch, state.batches, false, student ? student.batchId : "");
            form.elements.studentName.value = student ? student.studentName : "";
            form.elements.contactNo.value = student ? student.contactNo : "";
            form.elements.totalFees.value = student ? student.totalFees : "";
            form.elements.emi1.value = student ? student.emi1 || "" : "";
            form.elements.emi2.value = student ? student.emi2 || "" : "";
            form.elements.emi3.value = student ? student.emi3 || "" : "";
            document.querySelector("[data-form-title]").textContent = student ? "Edit Student" : "Add Student";
            const saveIcon = createElement("i", "bi bi-check2");
            saveIcon.setAttribute("aria-hidden", "true");
            saveButton.replaceChildren(saveIcon, document.createTextNode(student ? " Save Changes" : " Save Student"));
            saveButton.disabled = false;
            dialog.showModal();
            form.elements.studentName.focus();
        }

        function closeForm() {
            if (dialog.open) {
                dialog.close();
            }
            state.editingId = null;
            form.reset();
            clearFormMessage();
        }

        function readFormData() {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const compactContact = data.contactNo.trim().replace(/[\s().-]/g, "");
            if (!/^(?:07\d{8}|7\d{8}|\+947\d{8})$/.test(compactContact)) {
                throw new TypeError("Enter a valid Sri Lankan mobile number, such as 0771234567 or +94771234567.");
            }
            if (!Number.isFinite(Number(data.totalFees)) || Number(data.totalFees) <= 0) {
                throw new TypeError("Total course fee must be greater than zero.");
            }
            ["emi1", "emi2", "emi3"].forEach((field) => {
                if (data[field] !== "" && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0)) {
                    throw new TypeError(`${field.toUpperCase()} must be zero or a positive amount.`);
                }
            });
            return {
                studentName: data.studentName.trim(),
                contactNo: data.contactNo.trim(),
                batchId: data.batchId,
                totalFees: Number(data.totalFees),
                emi1: data.emi1 === "" ? 0 : Number(data.emi1),
                emi2: data.emi2 === "" ? 0 : Number(data.emi2),
                emi3: data.emi3 === "" ? 0 : Number(data.emi3),
            };
        }

        function isDuplicate(data) {
            return state.students.some((student) => {
                return student.id !== state.editingId
                    && normalizeName(student.studentName) === normalizeName(data.studentName)
                    && canonicalPhone(student.contactNo) === canonicalPhone(data.contactNo)
                    && student.batchId === data.batchId;
            });
        }

        async function saveStudent(event) {
            event.preventDefault();
            if (state.isSaving) {
                return;
            }
            clearFormMessage();
            if (!form.reportValidity()) {
                return;
            }

            let data;
            try {
                data = readFormData();
                if (isDuplicate(data)) {
                    throw new TypeError("A student with the same name, contact number, and batch already exists. Review the directory before adding another record.");
                }
            } catch (error) {
                showFormError(error.message);
                return;
            }

            state.isSaving = true;
            saveButton.disabled = true;
            try {
                const saved = state.editingId
                    ? await storage.updateStudent(state.editingId, data)
                    : await storage.addStudent(data);
                if (!saved) {
                    throw new Error("The student record could not be saved because it no longer exists.");
                }
                const message = state.editingId ? "Student details updated." : "Student registered successfully.";
                closeForm();
                render();
                showNotice(notice, message, "success");
            } catch (error) {
                showFormError(error.message || "Unable to save the student record.");
            } finally {
                state.isSaving = false;
                saveButton.disabled = false;
            }
        }

        async function handleRowAction(event) {
            const button = event.target.closest("[data-student-action]");
            if (!button) {
                return;
            }
            const student = state.students.find((item) => item.id === button.dataset.studentId);
            if (!student) {
                showNotice(notice, "The selected student could not be found. Reload the directory and try again.", "error");
                return;
            }
            try {
                switch (button.dataset.studentAction) {
                    case "edit":
                        openForm(student);
                        break;
                    case "delete":
                        if (window.confirm(`Move ${student.studentName} to deleted students? Their payment history will be preserved.`)) {
                            if (!await storage.softDeleteStudent(student.id)) {
                                throw new Error("The student record no longer exists.");
                            }
                            render();
                            showNotice(notice, "Student moved to deleted students. Payment history has been preserved.", "success");
                        }
                        break;
                    case "restore":
                        if (!await storage.restoreStudent(student.id)) {
                            throw new Error("The student record could not be restored because it no longer exists.");
                        }
                        render();
                        showNotice(notice, "Student restored to the active directory.", "success");
                        break;
                    default:
                        break;
                }
            } catch (error) {
                showNotice(notice, error.message || "Unable to update this student record.", "error");
            }
        }

        page.querySelector("[data-open-student-form]").addEventListener("click", () => openForm(null));
        page.querySelector("[data-student-search]").addEventListener("input", renderRows);
        batchFilter.addEventListener("change", renderRows);
        page.querySelector("[data-status-filter]").addEventListener("change", renderRows);
        page.querySelector("[data-student-sort]").addEventListener("change", renderRows);
        showDeleted.addEventListener("change", () => {
            state.showDeleted = showDeleted.checked;
            renderRows();
        });
        rows.addEventListener("click", handleRowAction);
        form.addEventListener("submit", saveStudent);
        document.querySelectorAll("[data-close-student-form]").forEach((button) => button.addEventListener("click", closeForm));
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) {
                closeForm();
            }
        });

        try {
            render();
            const editId = new URLSearchParams(window.location.search).get("edit");
            if (editId) {
                const student = state.students.find((item) => item.id === editId && !item.isSoftDelete);
                if (student) {
                    openForm(student);
                } else {
                    showNotice(notice, "That active student could not be found for editing.", "error");
                }
            }
            const missingBatchCount = state.students.filter((student) => !student.isSoftDelete
                && !state.batches.some((batch) => batch.id === student.batchId)).length;
            if (missingBatchCount > 0) {
                showNotice(notice, `${missingBatchCount} active student records reference batch IDs missing from the API batch list. Rows show the ID where the batch name is unavailable.`);
            }
        } catch (error) {
            console.error("Unable to load the student directory.", error);
            showNotice(notice, error.message || "Unable to load student records from the API.", "error");
        }
    }

    function initializeStudentDetails(page) {
        const notice = page.querySelector("[data-student-notice]");
        const emptyState = page.querySelector("[data-detail-empty]");
        const content = page.querySelector("[data-detail-content]");
        const actions = page.querySelector("[data-detail-actions]");
        const editLink = page.querySelector("[data-detail-edit]");
        const deleteButton = page.querySelector("[data-detail-delete]");
        const restoreButton = page.querySelector("[data-detail-restore]");
        const studentId = new URLSearchParams(window.location.search).get("id");

        function render() {
            if (!storage) {
                throw new Error("Student storage is unavailable. Reload the page or check the storage script.");
            }
            const student = storage.getStudentById(studentId);
            if (!student) {
                emptyState.hidden = false;
                content.hidden = true;
                actions.hidden = true;
                return;
            }

            const batch = storage.getBatchById(student.batchId);
            const payments = storage.getPaymentsByStudentId(student.id).sort((left, right) => {
                return String(right.paymentDate).localeCompare(String(left.paymentDate))
                    || String(right.createdAt).localeCompare(String(left.createdAt));
            });
            const outstanding = storage.calculateOutstandingBalance(student);
            const paymentStatus = storage.calculatePaymentStatus(student.totalReceived, student.totalFees);
            const initials = student.studentName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

            emptyState.hidden = true;
            content.hidden = false;
            actions.hidden = false;
            setText(page, "[data-detail-name]", student.studentName);
            setText(page, "[data-detail-id]", `Student ID: ${student.id}`);
            setText(page, "[data-detail-initials]", initials);
            setText(page, "[data-detail-contact]", student.contactNo);
            setText(page, "[data-detail-batch]", batch ? batch.batchName : `Batch ID ${student.batchId} (name unavailable)`);
            setText(page, "[data-detail-total-fees]", formatCurrency(student.totalFees));
            setText(page, "[data-detail-received]", formatCurrency(student.totalReceived));
            setText(page, "[data-detail-outstanding]", formatCurrency(outstanding));

            const status = page.querySelector("[data-detail-status]");
            status.className = student.isSoftDelete
                ? "status-badge status-deleted"
                : `status-badge status-${paymentStatus.toLowerCase()}`;
            status.textContent = student.isSoftDelete ? `Deleted · ${paymentStatus}` : paymentStatus;
            editLink.href = `students.html?edit=${encodeURIComponent(student.id)}`;
            deleteButton.hidden = Boolean(student.isSoftDelete);
            restoreButton.hidden = !student.isSoftDelete;

            const paymentRows = page.querySelector("[data-payment-rows]");
            const fragment = document.createDocumentFragment();
            payments.forEach((payment) => {
                const row = document.createElement("tr");
                row.append(
                    createElement("td", "", formatDate(payment.paymentDate)),
                    createElement("td", "student-id-cell", payment.id),
                    createElement("td", "", payment.paymentMethod),
                    createElement("td", "", payment.note || "—"),
                    createElement("td", "text-end payment-amount", formatCurrency(payment.amount))
                );
                fragment.append(row);
            });
            if (payments.length === 0) {
                const row = document.createElement("tr");
                const cell = createElement("td", "student-table-empty", "No payment transactions have been recorded for this student.");
                cell.colSpan = 5;
                row.append(cell);
                fragment.append(row);
            }
            paymentRows.replaceChildren(fragment);
            setText(page, "[data-payment-count]", String(payments.length));
        }

        deleteButton.addEventListener("click", async () => {
            try {
                const student = storage.getStudentById(studentId);
                if (!student) {
                    throw new Error("The student record no longer exists.");
                }
                if (!window.confirm(`Move ${student.studentName} to deleted students? Their payment history will be preserved.`)) {
                    return;
                }
                if (!await storage.softDeleteStudent(studentId)) {
                    throw new Error("The student record could not be deleted because it no longer exists.");
                }
                render();
                showNotice(notice, "Student moved to deleted students. Payment history has been preserved.", "success");
            } catch (error) {
                showNotice(notice, error.message || "Unable to delete this student.", "error");
            }
        });
        restoreButton.addEventListener("click", async () => {
            try {
                if (!await storage.restoreStudent(studentId)) {
                    throw new Error("The student record could not be restored because it no longer exists.");
                }
                render();
                showNotice(notice, "Student restored to the active directory.", "success");
            } catch (error) {
                showNotice(notice, error.message || "Unable to restore this student.", "error");
            }
        });

        try {
            render();
        } catch (error) {
            console.error("Unable to load student details.", error);
            content.hidden = true;
            emptyState.hidden = false;
            emptyState.querySelector("h2").textContent = "Unable to load student";
            emptyState.querySelector("p").textContent = error.message || "Student details could not be loaded from the API.";
            showNotice(notice, error.message || "Unable to load student details.", "error");
        }
    }

    async function start() {
        initializeSidebar();
        const directory = document.querySelector("[data-students-page]");
        const details = document.querySelector("[data-student-details-page]");
        [directory, details].filter(Boolean).forEach((page) => {
            showNotice(page.querySelector("[data-student-notice]"), "Loading student and batch records from the API…");
        });
        try {
            await storage.initialize();
        } catch (error) {
            document.querySelectorAll("[data-student-notice]").forEach((notice) => showNotice(notice, error.message, "error"));
            return;
        }
        document.querySelectorAll("[data-student-notice]").forEach((notice) => { notice.hidden = true; });
        if (directory) {
            initializeStudentDirectory(directory);
        }
        if (details) {
            initializeStudentDetails(details);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
}());
