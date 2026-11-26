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
        const requestedSearch = new URLSearchParams(window.location.search).get("q");
        if (requestedSearch) {
            page.querySelector("[data-batch-search]").value = requestedSearch;
        }

        function loadData() {
            state.batches = storage.getBatches();
            state.students = storage.getStudents();
        }

        function renderSummary() {
            const activeStudents = state.students.filter((student) => !student.isSoftDelete);
            const batchIds = new Set(state.batches.map((batch) => batch.id));
            const assignedCount = activeStudents.filter((student) => batchIds.has(student.batchId)).length;
            setText(page, "[data-summary-total]", String(state.batches.length));
            setText(page, "[data-summary-active]", String(assignedCount));
            setText(page, "[data-summary-completed]", String(activeStudents.length - assignedCount));
            setText(page, "[data-summary-students]", String(activeStudents.length));
        }

        function batchMatchesFilters(batch) {
            const search = page.querySelector("[data-batch-search]").value.trim().toLowerCase();
            if (search && !`${batch.batchName} ${batch.id}`.toLowerCase().includes(search)) {
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
                const row = document.createElement("tr");
                const idCell = createElement("td", "batch-id-cell", batch.id);
                const nameCell = createElement("td", "batch-name-cell", batch.batchName);
                const studentCell = createElement("td", "text-end batch-student-cell", studentCountFor(batch));
                const actionsCell = createElement("td", "text-end");
                const actions = createElement("div", "student-row-actions");
                actions.append(makeActionButton("bi-pencil", "Edit batch", "edit", batch.id));
                actions.append(makeActionButton("bi-trash", "Delete batch", "delete", batch.id, "is-danger"));
                actionsCell.append(actions);
                row.append(idCell, nameCell, studentCell, actionsCell);
                fragment.append(row);
            });

            if (visible.length === 0) {
                const row = document.createElement("tr");
                const cell = createElement("td", "student-table-empty", state.batches.length === 0
                    ? "No batches yet. Create your first batch to start registering students."
                    : "No batches match these filters.");
                cell.colSpan = 4;
                row.append(cell);
                fragment.append(row);
            }
            rows.replaceChildren(fragment);
            setText(page, "[data-result-count]", String(visible.length));
            page.querySelector("#batch-table-title").textContent = "All batches";
        }

        function render() {
            loadData();
            page.querySelector("[data-open-batch-form]").disabled = false;
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
            return { batchName: data.batchName.trim() };
        }

        function isDuplicate(data) {
            return state.batches.some((batch) => {
                return batch.id !== state.editingId
                    && batch.batchName.toLowerCase() === data.batchName.toLowerCase();
            });
        }

        async function saveBatch(event) {
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
                    ? await storage.updateBatch(state.editingId, data)
                    : await storage.addBatch(data);
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

        async function handleRowAction(event) {
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
                            if (!await storage.deleteBatch(batch.id)) {
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
        page.querySelector("[data-batch-sort]").addEventListener("change", renderRows);
        rows.addEventListener("click", handleRowAction);
        form.addEventListener("submit", saveBatch);
        document.querySelectorAll("[data-close-batch-form]").forEach((button) => button.addEventListener("click", closeForm));
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) {
                closeForm();
            }
        });

        try {
            render();
        } catch (error) {
            console.error("Unable to load the batch directory.", error);
            showNotice(notice, error.message || "Unable to load batch records from the API.", "error");
        }
    }

    async function start() {
        initializeSidebar();
        const notice = document.querySelector("[data-batch-notice]");
        showNotice(notice, "Loading batches and students from the API…");
        try {
            await storage.initialize();
        } catch (error) {
            showNotice(notice, error.message, "error");
            return;
        }
        if (notice) notice.hidden = true;
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
