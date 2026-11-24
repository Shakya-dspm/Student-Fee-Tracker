(function initializeBatchPages() {
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

    function todayLocal() {
        const date = new Date();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${date.getFullYear()}-${month}-${day}`;
    }

    function batchStatus(batch) {
        const todayString = todayLocal();
        if (todayString > batch.endDate) {
            return "completed";
        }
        return "active";
    }

    function batchStatusLabel(status) {
        return status === "active" ? "Active" : "Completed";
    }

    function batchStatusClass(status) {
        return status === "active" ? "status-active" : "status-completed";
    }

    function showNotice(container, message, kind) {
        if (!container) {
            return;
        }
        container.textContent = message;
        container.className = "student-notice batch-notice";
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

    function makeActionButton(iconName, label, action, batchId, extraClass) {
        const button = createElement("button", `icon-button student-row-action${extraClass ? ` ${extraClass}` : ""}`);
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.title = label;
        button.dataset.batchAction = action;
        button.dataset.batchId = batchId;
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

    function initializeBatchDirectory(page) {
        if (!storage) {
            showNotice(page.querySelector("[data-batch-notice]"), "Batch storage is unavailable. Reload the page or check the storage script.", "error");
            return;
        }

        const state = {
            batches: [],
            students: [],
            editingId: null,
            isSaving: false
        };
        const notice = page.querySelector("[data-batch-notice]");
        const rows = page.querySelector("[data-batch-rows]");
        const dialog = document.querySelector("[data-batch-dialog]");
        const form = document.querySelector("[data-batch-form]");
        const saveButton = document.querySelector("[data-save-batch]");
        const formMessage = document.querySelector("[data-form-message]");

        function loadData() {
            state.batches = storage.getBatches();
            state.students = storage.getStudents();
        }

        function renderSummary() {
            const active = state.batches.filter((batch) => batchStatus(batch) === "active").length;
            const completed = state.batches.filter((batch) => batchStatus(batch) === "completed").length;
            const totalStudents = state.batches.reduce((total, batch) => {
                return total + state.students.filter((student) => student.batchId === batch.id && !student.isSoftDelete).length;
            }, 0);
            setText(page, "[data-summary-total]", String(state.batches.length));
            setText(page, "[data-summary-active]", String(active));
            setText(page, "[data-summary-completed]", String(completed));
            setText(page, "[data-summary-students]", String(totalStudents));
        }

        function batchMatchesFilters(batch) {
            const search = page.querySelector("[data-batch-search]").value.trim().toLowerCase();
            if (search && !`${batch.batchName} ${batch.courseName} ${batch.id}`.toLowerCase().includes(search)) {
                return false;
            }

            const selectedStatus = page.querySelector("[data-batch-status-filter]").value;
            if (selectedStatus && batchStatus(batch) !== selectedStatus) {
                return false;
            }

            return true;
        }

        function sortBatches(batches) {
            const sortBy = page.querySelector("[data-batch-sort]").value;
            const sorted = [...batches];
            sorted.sort((left, right) => {
                switch (sortBy) {
                    case "name-desc":
                        return right.batchName.localeCompare(left.batchName, "en");
                    case "start-desc":
                        return String(right.startDate || "").localeCompare(String(left.startDate || "")) || left.batchName.localeCompare(right.batchName, "en");
                    case "start-asc":
                        return String(left.startDate || "").localeCompare(String(right.startDate || "")) || left.batchName.localeCompare(right.batchName, "en");
                    case "students-desc": {
                        const leftCount = state.students.filter((student) => student.batchId === left.id && !student.isSoftDelete).length;
                        const rightCount = state.students.filter((student) => student.batchId === right.id && !student.isSoftDelete).length;
                        return rightCount - leftCount || left.batchName.localeCompare(right.batchName, "en");
                    }
                    default:
                        return left.batchName.localeCompare(right.batchName, "en");
                }
            });
            return sorted;
        }

        function studentCountFor(batch) {
            return state.students.filter((student) => student.batchId === batch.id && !student.isSoftDelete).length;
        }

        function renderRows() {
            const visible = sortBatches(state.batches.filter(batchMatchesFilters));
            const fragment = document.createDocumentFragment();
            visible.forEach((batch) => {
                const status = batchStatus(batch);
                const row = document.createElement("tr");
                const idCell = createElement("td", "batch-id-cell", batch.id);
                const nameCell = createElement("td", "batch-name-cell", batch.batchName);
                const courseCell = createElement("td", "", batch.courseName);
                const startCell = createElement("td", "", formatDate(batch.startDate));
                const endCell = createElement("td", "", formatDate(batch.endDate));
                const statusCell = document.createElement("td");
                const statusBadge = createElement("span", `status-badge ${batchStatusClass(status)}`, batchStatusLabel(status));
                statusCell.append(statusBadge);
                const studentCell = createElement("td", "text-end batch-student-cell", studentCountFor(batch));
                const actionsCell = createElement("td", "text-end");
                const actions = createElement("div", "student-row-actions");
                actions.append(makeActionButton("bi-pencil", "Edit batch", "edit", batch.id));
                actions.append(makeActionButton("bi-trash", "Delete batch", "delete", batch.id, "is-danger"));
                actionsCell.append(actions);
                row.append(idCell, nameCell, courseCell, startCell, endCell, statusCell, studentCell, actionsCell);
                fragment.append(row);
            });

            if (visible.length === 0) {
                const row = document.createElement("tr");
                const cell = createElement("td", "student-table-empty", "No batches match these filters.");
                cell.colSpan = 8;
                row.append(cell);
                fragment.append(row);
            }
            rows.replaceChildren(fragment);
            setText(page, "[data-result-count]", String(visible.length));
            page.querySelector("#batch-table-title").textContent = "All batches";
        }

        function render() {
            loadData();
            renderSummary();
            renderRows();
        }

        function clearFormMessage() {
            formMessage.textContent = "";
            formMessage.hidden = true;
            formMessage.className = "student-form-message batch-form-message";
        }

        function showFormError(message) {
            formMessage.textContent = message;
            formMessage.className = "student-form-message batch-form-message is-error";
            formMessage.hidden = false;
        }

        function openForm(batch) {
            state.editingId = batch ? batch.id : null;
            form.reset();
            clearFormMessage();
            form.elements.batchName.value = batch ? batch.batchName : "";
            form.elements.courseName.value = batch ? batch.courseName : "";
            form.elements.description.value = batch ? batch.description || "" : "";
            form.elements.startDate.value = batch ? batch.startDate : todayLocal();
            form.elements.endDate.value = batch ? batch.endDate : todayLocal();
            document.querySelector("[data-form-title]").textContent = batch ? "Edit Batch" : "Add Batch";
            const saveIcon = createElement("i", "bi bi-check2");
            saveIcon.setAttribute("aria-hidden", "true");
            saveButton.replaceChildren(saveIcon, document.createTextNode(batch ? " Save Changes" : " Save Batch"));
            saveButton.disabled = false;
            dialog.showModal();
            form.elements.batchName.focus();
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
            const startDate = data.startDate.trim();
            const endDate = data.endDate.trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
                throw new TypeError("Start date must use YYYY-MM-DD format.");
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
                throw new TypeError("End date must use YYYY-MM-DD format.");
            }
            const startParsed = Date.parse(`${startDate}T00:00:00.000Z`);
            const endParsed = Date.parse(`${endDate}T00:00:00.000Z`);
            if (!Number.isFinite(startParsed) || new Date(startParsed).toISOString().slice(0, 10) !== startDate) {
                throw new TypeError("Start date must be a valid calendar date.");
            }
            if (!Number.isFinite(endParsed) || new Date(endParsed).toISOString().slice(0, 10) !== endDate) {
                throw new TypeError("End date must be a valid calendar date.");
            }
            if (startDate > endDate) {
                throw new TypeError("Start date cannot be after end date.");
            }
            return {
                batchName: data.batchName.trim(),
                courseName: data.courseName.trim(),
                description: data.description.trim(),
                startDate,
                endDate
            };
        }

        function isDuplicate(data) {
            return state.batches.some((batch) => {
                return batch.id !== state.editingId
                    && batch.batchName.toLowerCase() === data.batchName.toLowerCase()
                    && batch.courseName.toLowerCase() === data.courseName.toLowerCase()
                    && batch.startDate === data.startDate
                    && batch.endDate === data.endDate;
            });
        }

        function saveBatch(event) {
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
                    throw new TypeError("A batch with the same name, course, and dates already exists. Review the batch directory before adding another record.");
                }
            } catch (error) {
                showFormError(error.message);
                return;
            }

            state.isSaving = true;
            saveButton.disabled = true;
            try {
                const saved = state.editingId
                    ? storage.updateBatch(state.editingId, data)
                    : storage.addBatch(data);
                if (!saved) {
                    throw new Error("The batch record could not be saved because it no longer exists.");
                }
                const message = state.editingId ? "Batch details updated." : "Batch created successfully.";
                closeForm();
                render();
                showNotice(notice, message, "success");
            } catch (error) {
                showFormError(error.message || "Unable to save the batch record.");
            } finally {
                state.isSaving = false;
                saveButton.disabled = false;
            }
        }

        function handleRowAction(event) {
            const button = event.target.closest("[data-batch-action]");
            if (!button) {
                return;
            }
            const batch = state.batches.find((item) => item.id === button.dataset.batchId);
            if (!batch) {
                showNotice(notice, "The selected batch could not be found. Reload the directory and try again.", "error");
                return;
            }
            try {
                switch (button.dataset.batchAction) {
                    case "edit":
                        openForm(batch);
                        break;
                    case "delete": {
                        const assignedStudents = state.students.filter((student) => student.batchId === batch.id);
                        const activeCount = assignedStudents.filter((student) => !student.isSoftDelete).length;
                        if (activeCount > 0) {
                            showNotice(notice, `Cannot delete "${batch.batchName}" because ${activeCount} active student(s) are assigned to it. Reassign or remove those students first.`, "error");
                            break;
                        }
                        if (assignedStudents.length > 0) {
                            showNotice(notice, `Cannot delete "${batch.batchName}" because archived students still reference it.`, "error");
                            break;
                        }
                        if (window.confirm(`Delete batch "${batch.batchName}"? This cannot be undone.`)) {
                            if (!storage.deleteBatch(batch.id)) {
                                throw new Error("The batch record no longer exists.");
                            }
                            render();
                            showNotice(notice, `Batch "${batch.batchName}" deleted successfully.`, "success");
                        }
                        break;
                    }
                    default:
                        break;
                }
            } catch (error) {
                showNotice(notice, error.message || "Unable to update this batch record.", "error");
            }
        }

        page.querySelector("[data-open-batch-form]").addEventListener("click", () => openForm(null));
        page.querySelector("[data-batch-search]").addEventListener("input", renderRows);
        page.querySelector("[data-batch-status-filter]").addEventListener("change", renderRows);
        page.querySelector("[data-batch-sort]").addEventListener("change", renderRows);
        rows.addEventListener("click", handleRowAction);
        form.addEventListener("submit", saveBatch);
        page.querySelectorAll("[data-close-batch-form]").forEach((button) => button.addEventListener("click", closeForm));
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) {
                closeForm();
            }
        });

        try {
            render();
        } catch (error) {
            console.error("Unable to load the batch directory.", error);
            showNotice(notice, error.message || "Unable to load batch records from LocalStorage.", "error");
        }
    }

    function start() {
        initializeSidebar();
        const directory = document.querySelector("[data-batches-page]");
        if (directory) {
            initializeBatchDirectory(directory);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
}());