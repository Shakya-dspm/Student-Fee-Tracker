(function initializePaymentPage() {
  "use strict";

  const storage = window.FeeTrackStorage;

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function formatCurrency(value) {
    const amount = Number(value) || 0;

    return `Rs. ${amount.toLocaleString("en-LK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function createPaymentId() {
    const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `pay_ui_${randomPart}`;
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const parts = String(value).split("-");

    if (parts.length !== 3) {
      return String(value);
    }

    const date = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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
  }

  function initializePayments(page) {
    const notice = page.querySelector("[data-payment-notice]");
    const rows = page.querySelector("[data-payment-rows]");
    const resultCount = page.querySelector("[data-payment-result-count]");

    const searchInput = page.querySelector("[data-payment-search]");
    const methodFilter = page.querySelector("[data-payment-method-filter]");
    const dateFromFilter = page.querySelector("[data-payment-date-from]");
    const dateToFilter = page.querySelector("[data-payment-date-to]");
    const sortSelect = page.querySelector("[data-payment-sort]");

    const dialog = document.querySelector("[data-payment-dialog]");
    const form = document.querySelector("[data-payment-form]");
    const studentSelect = document.querySelector("[data-payment-student]");
    const amountInput = document.querySelector("[data-payment-amount]");
    const paymentDateInput = document.querySelector("[data-payment-date]");
    const paymentMethodSelect = document.querySelector("[data-payment-method]");
    const formMessage = document.querySelector("[data-payment-form-message]");
    const saveButton = document.querySelector("[data-save-payment]");
    const requestedSearch = new URLSearchParams(window.location.search).get("q");
    if (requestedSearch) {
      searchInput.value = requestedSearch;
    }

    const state = {
      students: [],
      batches: [],
      payments: [],
      methods: [],
    };

    function showNotice(message, type = "success") {
      notice.textContent = message;
      notice.hidden = false;

      if (type === "error") {
        notice.style.borderColor = "#fecaca";
        notice.style.backgroundColor = "#fef2f2";
        notice.style.color = "#991b1b";
      } else {
        notice.style.borderColor = "#bbf7d0";
        notice.style.backgroundColor = "#f0fdf4";
        notice.style.color = "#166534";
      }
    }

    function showFormMessage(message) {
      formMessage.textContent = message;
      formMessage.hidden = false;
    }

    function clearFormMessage() {
      formMessage.textContent = "";
      formMessage.hidden = true;
    }

    function loadData() {
      if (!storage) {
        throw new Error(
          "Payment storage is unavailable. Check the storage.js script.",
        );
      }

      state.students = storage.getStudents();
      state.batches = storage.getBatches();
      state.payments = storage.getPayments();
      state.methods = storage.PAYMENT_METHODS;
    }

    function getStudent(studentId) {
      return state.students.find((student) => student.id === studentId) || null;
    }

    function getBatchName(student) {
      if (!student) {
        return "Unknown batch";
      }

      const batch = state.batches.find((item) => item.id === student.batchId);

      return batch ? batch.batchName : `Batch ID ${student.batchId} (not in API batch list)`;
    }

    function getOutstanding(student) {
      if (!student) {
        return 0;
      }

      const balance = storage.calculateOutstandingBalance(student);

      return Math.max(0, Number(balance) || 0);
    }

    function renderSummary() {
      const totalCollected = state.students.reduce((total, student) => {
        return total + Number(student.totalReceived || 0);
      }, 0);

      const currentMonth = getToday().slice(0, 7);

      const monthlyCollected = state.payments.reduce((total, payment) => {
        if (String(payment.paymentDate).slice(0, 7) === currentMonth) {
          return total + Number(payment.amount || 0);
        }

        return total;
      }, 0);

      const outstanding = state.students.reduce((total, student) => {
        if (student.isSoftDelete) {
          return total;
        }

        return total + getOutstanding(student);
      }, 0);

      page.querySelector("[data-summary-collected]").textContent =
        formatCurrency(totalCollected);

      page.querySelector("[data-summary-month]").textContent =
        formatCurrency(monthlyCollected);

      page.querySelector("[data-summary-count]").textContent =
        state.payments.length.toLocaleString();

      page.querySelector("[data-summary-outstanding]").textContent =
        formatCurrency(outstanding);
    }

    function populateMethodFilters() {
      const allMethodsOption = createElement("option", "", "All methods");
      allMethodsOption.value = "";
      methodFilter.replaceChildren(allMethodsOption);

      const methodPlaceholder = createElement("option", "", "Select a method");
      methodPlaceholder.value = "";
      paymentMethodSelect.replaceChildren(methodPlaceholder);

      state.methods.forEach((method) => {
        const filterOption = createElement("option", "", method);
        filterOption.value = method;
        methodFilter.append(filterOption);

        const formOption = createElement("option", "", method);
        formOption.value = method;
        paymentMethodSelect.append(formOption);
      });
    }

    function populateStudentOptions() {
      const previousValue = studentSelect.value;

      const studentPlaceholder = createElement("option", "", "Select a student");
      studentPlaceholder.value = "";
      studentSelect.replaceChildren(studentPlaceholder);

      const availableStudents = state.students
        .filter((student) => {
          return !student.isSoftDelete && getOutstanding(student) > 0;
        })
        .sort((left, right) => {
          return left.studentName.localeCompare(right.studentName, "en");
        });

      availableStudents.forEach((student) => {
        const option = createElement(
          "option",
          "",
          `${student.studentName} (${student.id})`,
        );

        option.value = student.id;
        studentSelect.append(option);
      });

      const studentHint = page.querySelector("[data-payment-student-hint]");
      if (studentHint) {
        if (availableStudents.length > 0) {
          studentHint.textContent = "Only active students with outstanding fees are available.";
        } else {
          const activeStudents = state.students.filter((student) => !student.isSoftDelete);
          const nextStep = state.batches.length === 0
            ? { text: "Create a batch", href: "batches.html" }
            : activeStudents.length === 0
              ? { text: "Add a student", href: "students.html" }
              : { text: "Review fee balances", href: "fees.html" };
          studentHint.replaceChildren(document.createTextNode("No eligible students. "));
          const link = createElement("a", "text-link", nextStep.text);
          link.href = nextStep.href;
          studentHint.append(link);
        }
      }

      if (availableStudents.some((student) => student.id === previousValue)) {
        studentSelect.value = previousValue;
      }
    }

    function renderRows() {
      const search = searchInput.value.trim().toLowerCase();
      const selectedMethod = methodFilter.value;
      const dateFrom = dateFromFilter.value;
      const dateTo = dateToFilter.value;
      const sortBy = sortSelect.value;

      let visiblePayments = state.payments.filter((payment) => {
        const student = getStudent(payment.studentId);
        const studentName = student ? student.studentName : "Unknown student";
        const batchName = getBatchName(student);

        const searchableText = [
          payment.id,
          payment.studentId,
          studentName,
          batchName,
          payment.note || "",
        ]
          .join(" ")
          .toLowerCase();

        if (search && !searchableText.includes(search)) {
          return false;
        }

        if (selectedMethod && payment.paymentMethod !== selectedMethod) {
          return false;
        }

        if (dateFrom && payment.paymentDate < dateFrom) {
          return false;
        }

        if (dateTo && payment.paymentDate > dateTo) {
          return false;
        }

        return true;
      });

      visiblePayments.sort((left, right) => {
        switch (sortBy) {
          case "date-asc":
            return (
              String(left.paymentDate).localeCompare(
                String(right.paymentDate),
              ) || String(left.createdAt).localeCompare(String(right.createdAt))
            );

          case "amount-desc":
            return Number(right.amount) - Number(left.amount);

          case "amount-asc":
            return Number(left.amount) - Number(right.amount);

          case "date-desc":
          default:
            return (
              String(right.paymentDate).localeCompare(
                String(left.paymentDate),
              ) || String(right.createdAt).localeCompare(String(left.createdAt))
            );
        }
      });

      const fragment = document.createDocumentFragment();

      if (visiblePayments.length === 0) {
        const row = createElement("tr");
        const cell = createElement(
          "td",
          "payment-empty",
          state.payments.length === 0
            ? "No payments have been recorded yet. Use Record Payment to add the first transaction."
            : "No payments match your search or filters.",
        );

        cell.colSpan = 7;
        row.append(cell);
        fragment.append(row);
      } else {
        visiblePayments.forEach((payment) => {
          const student = getStudent(payment.studentId);
          const row = createElement("tr");

          const idCell = createElement("td");
          idCell.append(createElement("span", "payment-id", payment.id));

          const studentCell = createElement("td");

          if (student) {
            const studentLink = createElement(
              "a",
              "payment-student-name",
              student.studentName,
            );

            studentLink.href = `student-details.html?id=${encodeURIComponent(student.id)}`;

            studentCell.append(studentLink);

            const studentId = createElement(
              "span",
              "payment-student-id",
              student.isSoftDelete
                ? `${student.id} · Deleted student`
                : student.id,
            );

            studentCell.append(studentId);
          } else {
            studentCell.append(
              createElement("span", "payment-student-name", "Unknown student"),
            );

            studentCell.append(
              createElement("span", "payment-student-id", payment.studentId),
            );
          }

          const batchCell = createElement("td", "", getBatchName(student));

          const dateCell = createElement(
            "td",
            "",
            formatDate(payment.paymentDate),
          );

          const methodCell = createElement("td");
          methodCell.append(
            createElement(
              "span",
              "payment-method-badge",
              payment.paymentMethod,
            ),
          );

          const noteCell = createElement("td");
          noteCell.append(
            createElement("span", "payment-note", payment.note || "—"),
          );

          const amountCell = createElement(
            "td",
            "text-end payment-amount",
            formatCurrency(payment.amount),
          );

          row.append(
            idCell,
            studentCell,
            batchCell,
            dateCell,
            methodCell,
            noteCell,
            amountCell,
          );

          fragment.append(row);
        });
      }

      rows.replaceChildren(fragment);
      resultCount.textContent = visiblePayments.length.toLocaleString();
    }

    function render() {
      loadData();
      renderSummary();
      populateStudentOptions();
      renderRows();
    }

    function updateStudentSummary() {
      const student = getStudent(studentSelect.value);

      // The dialog lives outside the main payments-page container.
      const totalFeesElement = document.querySelector("[data-form-total-fees]");
      const totalPaidElement = document.querySelector("[data-form-total-paid]");
      const outstandingElement = document.querySelector("[data-form-outstanding]");
      const amountHint = document.querySelector("[data-amount-hint]");

      if (!student || student.isSoftDelete) {
        totalFeesElement.textContent = formatCurrency(0);
        totalPaidElement.textContent = formatCurrency(0);
        outstandingElement.textContent = formatCurrency(0);

        amountInput.removeAttribute("max");
        amountHint.textContent =
          "Choose a student to see the available balance.";
        amountInput.disabled = true;
        saveButton.disabled = true;

        return;
      }

      const outstanding = getOutstanding(student);

      totalFeesElement.textContent = formatCurrency(student.totalFees);
      totalPaidElement.textContent = formatCurrency(student.totalReceived);
      outstandingElement.textContent = formatCurrency(outstanding);

      amountInput.max = outstanding.toFixed(2);
      amountInput.disabled = outstanding <= 0;
      saveButton.disabled = outstanding <= 0;

      amountHint.textContent =
        outstanding > 0
          ? `Maximum payment: ${formatCurrency(outstanding)}`
          : "This student has no outstanding balance.";
    }

    function openForm(preselectedStudentId) {
      form.reset();
      clearFormMessage();

      populateStudentOptions();

      if (preselectedStudentId && Array.from(studentSelect.options).some((option) => option.value === preselectedStudentId)) {
        studentSelect.value = preselectedStudentId;
      }

      paymentDateInput.value = getToday();

      amountInput.disabled = true;
      amountInput.removeAttribute("max");

      updateStudentSummary();

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        showNotice(
          "Your browser does not support the payment form dialog.",
          "error",
        );
      }

      studentSelect.focus();
    }

    function closeForm() {
      if (dialog.open) {
        dialog.close();
      }
    }

    async function handlePaymentSubmit(event) {
      event.preventDefault();
      clearFormMessage();

      if (!form.reportValidity()) {
        return;
      }

      const studentId = studentSelect.value;
      const student = getStudent(studentId);
      const amount = Number(amountInput.value);
      const paymentDate = paymentDateInput.value;
      const paymentMethod = paymentMethodSelect.value;
      const note = form.elements.note.value.trim();

      if (!student || student.isSoftDelete) {
        showFormMessage("Please select a valid active student.");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        showFormMessage("Enter a valid payment amount greater than zero.");
        return;
      }

      if (amount > getOutstanding(student)) {
        showFormMessage(
          "The payment amount cannot exceed the student's outstanding balance.",
        );
        return;
      }

      if (!state.methods.includes(paymentMethod)) {
        showFormMessage("Please select a valid payment method.");
        return;
      }

      const paymentData = {
        id: createPaymentId(),
        studentId,
        amount,
        paymentDate,
        paymentMethod,
        note,
      };

      saveButton.disabled = true;

      try {
        await storage.addPayment(paymentData);

        render();
        closeForm();

        showNotice(
          `Payment of ${formatCurrency(amount)} recorded successfully for ${student.studentName}.`,
          "success",
        );
      } catch (error) {
        showFormMessage(
          error.message ||
            "Unable to record this payment. Please check the details and try again.",
        );

        updateStudentSummary();
      } finally {
        saveButton.disabled = false;
      }
    }

    // Search and filter events
    searchInput.addEventListener("input", renderRows);
    methodFilter.addEventListener("change", renderRows);
    dateFromFilter.addEventListener("change", renderRows);
    dateToFilter.addEventListener("change", renderRows);
    sortSelect.addEventListener("change", renderRows);

    // Payment form events
    studentSelect.addEventListener("change", updateStudentSummary);
    form.addEventListener("submit", handlePaymentSubmit);

    page
      .querySelector("[data-open-payment-form]")
      .addEventListener("click", openForm);

    document.querySelectorAll("[data-close-payment-form]").forEach((button) => {
      button.addEventListener("click", closeForm);
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeForm();
      }
    });

    try {
      render();
      populateMethodFilters();
      const preselectedStudentId = new URLSearchParams(window.location.search).get("student");
      if (preselectedStudentId) {
        openForm(preselectedStudentId);
      }
    } catch (error) {
      showNotice(
        error.message || "Unable to load payment information.",
        "error",
      );
    }
  }

  async function start() {
    initializeSidebar();
    try {
      await storage.initialize();
    } catch (error) {
      const notice = document.querySelector("[data-payment-notice]");
      if (notice) {
        notice.textContent = error.message;
        notice.classList.add("is-error");
        notice.hidden = false;
      }
      return;
    }

    const page = document.querySelector("[data-payments-page]");

    if (page) {
      initializePayments(page);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
