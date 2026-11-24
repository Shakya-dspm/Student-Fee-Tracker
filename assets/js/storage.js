(function initializeFeeTrackStorage(root) {
    "use strict";

    const KEYS = Object.freeze({
        students: "feetTrack_students",
        batches: "feetTrack_batches",
        payments: "feetTrack_payments",
        settings: "feetTrack_settings"
    });
    const MISSING_VALUE = Symbol("missing LocalStorage value");
    const PAYMENT_METHODS = Object.freeze(["Cash", "Bank Transfer", "Card", "Other"]);
    const KEY_LIST = Object.values(KEYS);
    const STUDENT_INPUT_FIELDS = new Set([
        "id", "studentName", "contactNo", "totalFees", "emi1", "emi2", "emi3",
        "totalReceived", "status", "batchId", "isSoftDelete", "email", "address", "registrationDate"
    ]);
    const STUDENT_UPDATE_FIELDS = new Set([
        "studentName", "contactNo", "totalFees", "emi1", "emi2", "emi3", "batchId",
        "email", "address", "registrationDate"
    ]);
    const BATCH_INPUT_FIELDS = new Set([
        "id", "batchName", "courseName", "description", "startDate", "endDate"
    ]);
    const BATCH_UPDATE_FIELDS = new Set([
        "batchName", "courseName", "description", "startDate", "endDate"
    ]);
    const PAYMENT_INPUT_FIELDS = new Set([
        "id", "studentId", "amount", "paymentDate", "paymentMethod", "note"
    ]);

    class StorageError extends Error {
        constructor(message, cause) {
            super(message);
            this.name = "StorageError";
            if (cause) {
                this.cause = cause;
            }
        }
    }

    function isRecord(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function storageFailure(message, cause) {
        return new StorageError(message, cause);
    }

    function getBrowserStorage() {
        try {
            if (!root.localStorage) {
                throw new Error("LocalStorage is not available in this browser context.");
            }
            return root.localStorage;
        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw storageFailure("Unable to access browser LocalStorage.", error);
        }
    }

    function assertKnownKey(key) {
        if (!KEY_LIST.includes(key)) {
            throw new TypeError(`Unsupported FeeTrack storage key: ${String(key)}`);
        }
    }

    function assertRecord(value, label) {
        if (!isRecord(value)) {
            throw new TypeError(`${label} must be an object.`);
        }
    }

    function assertAllowedFields(value, allowedFields, label) {
        assertRecord(value, label);
        Object.keys(value).forEach((field) => {
            if (!allowedFields.has(field)) {
                throw new TypeError(`${label} contains an unsupported field: ${field}`);
            }
        });
    }

    function requiredText(value, label, maximumLength) {
        if (typeof value !== "string" || !value.trim()) {
            throw new TypeError(`${label} is required.`);
        }
        const normalized = value.trim();
        if (normalized.length > maximumLength) {
            throw new RangeError(`${label} must be ${maximumLength} characters or fewer.`);
        }
        return normalized;
    }

    function optionalText(value, label, maximumLength) {
        if (value === undefined || value === null) {
            return "";
        }
        if (typeof value !== "string") {
            throw new TypeError(`${label} must be text.`);
        }
        const normalized = value.trim();
        if (normalized.length > maximumLength) {
            throw new RangeError(`${label} must be ${maximumLength} characters or fewer.`);
        }
        return normalized;
    }

    function normalizeId(value, label) {
        return requiredText(value, label, 160);
    }

    function optionalId(value, label) {
        if (value === undefined) {
            return null;
        }
        return normalizeId(value, label);
    }

    function normalizePhone(value) {
        if (typeof value !== "string") {
            throw new TypeError("contactNo must be a mobile number.");
        }
        const compact = value.trim().replace(/[\s().-]/g, "");
        if (!/^(?:07\d{8}|7\d{8}|\+947\d{8})$/.test(compact)) {
            throw new TypeError("contactNo must be a Sri Lankan mobile number in 07XXXXXXXX or +947XXXXXXXX format.");
        }
        return compact;
    }

    function normalizeEmail(value) {
        const email = optionalText(value, "email", 254);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new TypeError("email must be a valid email address.");
        }
        return email;
    }

    function toMinorUnits(value, label, allowZero) {
        let amount;
        if (typeof value === "number") {
            amount = value;
        } else if (typeof value === "string" && value.trim()) {
            amount = Number(value);
        } else {
            throw new TypeError(`${label} must be a valid amount.`);
        }

        if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
            throw new RangeError(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
        }

        const minorUnits = Math.round((amount + Number.EPSILON) * 100);
        if (!Number.isSafeInteger(minorUnits)) {
            throw new RangeError(`${label} is outside the supported currency range.`);
        }
        if (!allowZero && minorUnits === 0) {
            throw new RangeError(`${label} must be at least one cent.`);
        }
        return minorUnits;
    }

    function fromMinorUnits(value) {
        return value / 100;
    }

    function normalizeDate(value, label) {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new TypeError(`${label} must use YYYY-MM-DD format.`);
        }
        const timestamp = Date.parse(`${value}T00:00:00.000Z`);
        if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
            throw new TypeError(`${label} must be a valid calendar date.`);
        }
        return value;
    }

    function today() {
        const date = new Date();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${date.getFullYear()}-${month}-${day}`;
    }

    function registrationDateFor(student) {
        if (student.registrationDate !== undefined) {
            return normalizeDate(student.registrationDate, "registrationDate");
        }
        const createdAt = Date.parse(student.createdAt);
        if (!Number.isFinite(createdAt)) {
            throw new TypeError("createdAt must be a valid date when registrationDate is not set.");
        }
        return new Date(createdAt).toISOString().slice(0, 10);
    }

    function generateId(prefix, existingIds) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const randomPart = root.crypto && typeof root.crypto.randomUUID === "function"
                ? root.crypto.randomUUID()
                : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            const id = `${prefix}_${randomPart}`;
            if (!existingIds.has(id)) {
                return id;
            }
        }
        throw storageFailure(`Unable to generate a unique ${prefix} identifier.`);
    }

    function resolveNewId(value, prefix, existingIds) {
        const requestedId = optionalId(value, "id");
        if (requestedId) {
            if (existingIds.has(requestedId)) {
                throw new TypeError(`A record with id "${requestedId}" already exists.`);
            }
            return requestedId;
        }
        return generateId(prefix, existingIds);
    }

    function assertUniqueRecordIds(records, label) {
        const ids = new Set();
        records.forEach((record, index) => {
            if (!isRecord(record) || typeof record.id !== "string" || !record.id.trim()) {
                throw storageFailure(`${label} contains an invalid record at index ${index}.`);
            }
            if (ids.has(record.id)) {
                throw storageFailure(`${label} contains duplicate id "${record.id}".`);
            }
            ids.add(record.id);
        });
    }

    function readDataValue(key, missingValue) {
        assertKnownKey(key);
        let serialized;
        try {
            serialized = getBrowserStorage().getItem(key);
        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw storageFailure(`Unable to read "${key}" from LocalStorage.`, error);
        }
        if (serialized === null) {
            return missingValue;
        }
        try {
            return JSON.parse(serialized);
        } catch (error) {
            throw storageFailure(`Stored data for "${key}" is corrupted and was left untouched.`, error);
        }
    }

    function getData(key) {
        const value = readDataValue(key, MISSING_VALUE);
        return value === MISSING_VALUE ? null : value;
    }

    function saveData(key, data) {
        assertKnownKey(key);
        let serialized;
        try {
            serialized = JSON.stringify(data);
        } catch (error) {
            throw storageFailure(`Unable to serialize data for "${key}".`, error);
        }
        if (typeof serialized !== "string") {
            throw new TypeError(`Data for "${key}" must be JSON serializable.`);
        }
        try {
            getBrowserStorage().setItem(key, serialized);
        } catch (error) {
            throw storageFailure(`Unable to save "${key}" to LocalStorage.`, error);
        }
        return data;
    }

    function removeData(key) {
        assertKnownKey(key);
        try {
            getBrowserStorage().removeItem(key);
        } catch (error) {
            throw storageFailure(`Unable to remove "${key}" from LocalStorage.`, error);
        }
    }

    function clearAllData() {
        const storage = getBrowserStorage();
        try {
            KEY_LIST.forEach((key) => storage.removeItem(key));
        } catch (error) {
            throw storageFailure("Unable to clear all FeeTrack LocalStorage collections.", error);
        }
    }

    function readCollection(key) {
        const value = readDataValue(key, MISSING_VALUE);
        if (value === MISSING_VALUE) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw storageFailure(`Stored data for "${key}" must be an array; it was left untouched.`);
        }
        assertUniqueRecordIds(value, key);
        return value;
    }

    function readBatches() {
        const batches = readCollection(KEYS.batches);
        batches.forEach((batch) => {
            try {
                requiredText(batch.batchName, "batchName", 120);
                requiredText(batch.courseName, "courseName", 120);
                optionalText(batch.description, "description", 2000);
                const startDate = normalizeDate(batch.startDate, "startDate");
                const endDate = normalizeDate(batch.endDate, "endDate");
                if (startDate > endDate) {
                    throw new TypeError("A batch startDate cannot be after its endDate.");
                }
            } catch (error) {
                throw storageFailure(`Batch "${batch.id}" contains invalid stored data: ${error.message}`, error);
            }
        });
        return batches;
    }

    function readStudents() {
        const students = readCollection(KEYS.students);
        const batchIds = new Set(readBatches().map((batch) => batch.id));
        students.forEach((student) => {
            try {
                requiredText(student.studentName, "studentName", 120);
                normalizePhone(student.contactNo);
                normalizeEmail(student.email);
                optionalText(student.address, "address", 1000);
                registrationDateFor(student);
                toMinorUnits(student.totalFees, "totalFees", false);
                ["emi1", "emi2", "emi3"].forEach((field) => {
                    toMinorUnits(student[field], field, true);
                });
                toMinorUnits(student.totalReceived, "totalReceived", true);
                requiredText(student.status, "status", 20);
                if (!["Paid", "Partial", "Pending"].includes(student.status)) {
                    throw new TypeError("status must be Paid, Partial, or Pending.");
                }
                if (typeof student.isSoftDelete !== "boolean") {
                    throw new TypeError("isSoftDelete must be a boolean.");
                }
                if (!batchIds.has(student.batchId)) {
                    throw new TypeError(`batchId "${student.batchId}" does not reference an existing batch.`);
                }
            } catch (error) {
                throw storageFailure(`Student "${student.id}" contains invalid stored data: ${error.message}`, error);
            }
        });
        return students;
    }

    function readPayments(students) {
        const knownStudents = students === undefined ? readStudents() : students;
        const studentsById = new Map(knownStudents.map((student) => [student.id, student]));
        const totalsByStudentId = new Map();
        const payments = readCollection(KEYS.payments);
        payments.forEach((payment) => {
            try {
                const student = studentsById.get(payment.studentId);
                if (!student) {
                    throw new TypeError(`studentId "${payment.studentId}" does not reference an existing student.`);
                }
                const amountCents = toMinorUnits(payment.amount, "amount", false);
                normalizeDate(payment.paymentDate, "paymentDate");
                if (!PAYMENT_METHODS.includes(payment.paymentMethod)) {
                    throw new TypeError("paymentMethod is not supported.");
                }
                optionalText(payment.note, "note", 2000);
                const totalCents = (totalsByStudentId.get(payment.studentId) || 0) + amountCents;
                const feesCents = toMinorUnits(student.totalFees, "totalFees", false);
                if (!Number.isSafeInteger(totalCents) || totalCents > feesCents) {
                    throw new TypeError(`Payment history exceeds the fees for student "${payment.studentId}".`);
                }
                totalsByStudentId.set(payment.studentId, totalCents);
            } catch (error) {
                throw storageFailure(`Payment "${payment.id}" contains invalid stored data: ${error.message}`, error);
            }
        });
        return payments;
    }

    function assertBatchReference(batchId, batches) {
        if (!batches.some((batch) => batch.id === batchId)) {
            throw new TypeError(`batchId "${batchId}" does not reference an existing batch.`);
        }
    }

    function totalReceivedCents(studentId, payments) {
        return payments.reduce((total, payment) => {
            if (payment.studentId === studentId) {
                const nextTotal = total + toMinorUnits(payment.amount, "amount", false);
                if (!Number.isSafeInteger(nextTotal)) {
                    throw storageFailure(`Payment total for student "${studentId}" is outside the supported range.`);
                }
                return nextTotal;
            }
            return total;
        }, 0);
    }

    function statusFromCents(totalReceived, totalFees) {
        if (totalReceived >= totalFees) {
            return "Paid";
        }
        if (totalReceived > 0) {
            return "Partial";
        }
        return "Pending";
    }

    function withPaymentSummary(student, payments) {
        const fees = toMinorUnits(student.totalFees, "totalFees", false);
        const received = totalReceivedCents(student.id, payments);
        return {
            ...student,
            email: normalizeEmail(student.email),
            address: optionalText(student.address, "address", 1000),
            registrationDate: registrationDateFor(student),
            totalReceived: fromMinorUnits(received),
            status: statusFromCents(received, fees)
        };
    }

    function getStudents() {
        const students = readStudents();
        const payments = readPayments(students);
        return students.map((student) => withPaymentSummary(student, payments));
    }

    function getStudentById(id) {
        const requestedId = typeof id === "string" ? id.trim() : "";
        if (!requestedId) {
            return null;
        }
        return getStudents().find((student) => student.id === requestedId) || null;
    }

    function addStudent(student) {
        assertAllowedFields(student, STUDENT_INPUT_FIELDS, "student");
        const batches = readBatches();
        const students = readStudents();
        const payments = readPayments(students);
        const ids = new Set(students.map((item) => item.id));
        const id = resolveNewId(student.id, "stu", ids);
        const studentName = requiredText(student.studentName, "studentName", 120);
        const contactNo = normalizePhone(student.contactNo);
        const email = normalizeEmail(student.email);
        const address = optionalText(student.address, "address", 1000);
        const registrationDate = student.registrationDate === undefined
            ? today()
            : normalizeDate(student.registrationDate, "registrationDate");
        const totalFeesCents = toMinorUnits(student.totalFees, "totalFees", false);
        const batchId = normalizeId(student.batchId, "batchId");
        assertBatchReference(batchId, batches);

        const installments = ["emi1", "emi2", "emi3"].map((field) =>
            fromMinorUnits(toMinorUnits(student[field] === undefined ? 0 : student[field], field, true))
        );
        if (student.totalReceived !== undefined && toMinorUnits(student.totalReceived, "totalReceived", true) !== 0) {
            throw new TypeError("totalReceived is derived from payment transactions; use addPayment instead.");
        }
        if (student.status !== undefined && student.status !== "Pending") {
            throw new TypeError("A new student without payments must have Pending status.");
        }
        if (student.isSoftDelete !== undefined && student.isSoftDelete !== false) {
            throw new TypeError("New students must be active; use softDeleteStudent after creation.");
        }

        const timestamp = new Date().toISOString();
        const record = {
            id,
            studentName,
            contactNo,
            email,
            address,
            registrationDate,
            totalFees: fromMinorUnits(totalFeesCents),
            emi1: installments[0],
            emi2: installments[1],
            emi3: installments[2],
            totalReceived: 0,
            status: statusFromCents(totalReceivedCents(id, payments), totalFeesCents),
            batchId,
            isSoftDelete: false,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        saveData(KEYS.students, [...students, record]);
        return { ...record };
    }

    function updateStudent(id, updatedData) {
        const studentId = typeof id === "string" ? id.trim() : "";
        if (!studentId) {
            return null;
        }
        assertAllowedFields(updatedData, STUDENT_UPDATE_FIELDS, "updatedData");
        const students = readStudents();
        const index = students.findIndex((student) => student.id === studentId);
        if (index === -1) {
            return null;
        }

        const current = students[index];
        const batches = readBatches();
        const nextValues = { ...current, ...updatedData };
        const batchId = normalizeId(nextValues.batchId, "batchId");
        assertBatchReference(batchId, batches);
        const totalFeesCents = toMinorUnits(nextValues.totalFees, "totalFees", false);
        const payments = readPayments(students);
        const receivedCents = totalReceivedCents(studentId, payments);
        if (totalFeesCents < receivedCents) {
            throw new RangeError("totalFees cannot be less than the student's recorded payments.");
        }

        const nextStudent = {
            ...current,
            studentName: requiredText(nextValues.studentName, "studentName", 120),
            contactNo: normalizePhone(nextValues.contactNo),
            email: normalizeEmail(nextValues.email),
            address: optionalText(nextValues.address, "address", 1000),
            registrationDate: registrationDateFor(nextValues),
            totalFees: fromMinorUnits(totalFeesCents),
            emi1: fromMinorUnits(toMinorUnits(nextValues.emi1, "emi1", true)),
            emi2: fromMinorUnits(toMinorUnits(nextValues.emi2, "emi2", true)),
            emi3: fromMinorUnits(toMinorUnits(nextValues.emi3, "emi3", true)),
            totalReceived: fromMinorUnits(receivedCents),
            status: statusFromCents(receivedCents, totalFeesCents),
            batchId,
            updatedAt: new Date().toISOString()
        };
        const nextStudents = students.slice();
        nextStudents[index] = nextStudent;
        saveData(KEYS.students, nextStudents);
        return { ...nextStudent };
    }

    function setStudentSoftDelete(id, isSoftDelete) {
        const studentId = typeof id === "string" ? id.trim() : "";
        if (!studentId) {
            return null;
        }
        const students = readStudents();
        const index = students.findIndex((student) => student.id === studentId);
        if (index === -1) {
            return null;
        }
        const current = students[index];
        if (isSoftDelete === false) {
            assertBatchReference(current.batchId, readBatches());
        }
        if (current.isSoftDelete === isSoftDelete) {
            return withPaymentSummary(current, readPayments(students));
        }

        const payments = readPayments(students);
        const receivedCents = totalReceivedCents(studentId, payments);
        const nextStudent = {
            ...current,
            isSoftDelete,
            totalReceived: fromMinorUnits(receivedCents),
            status: statusFromCents(receivedCents, toMinorUnits(current.totalFees, "totalFees", false)),
            updatedAt: new Date().toISOString()
        };
        const nextStudents = students.slice();
        nextStudents[index] = nextStudent;
        saveData(KEYS.students, nextStudents);
        return { ...nextStudent };
    }

    function softDeleteStudent(id) {
        return setStudentSoftDelete(id, true);
    }

    function restoreStudent(id) {
        return setStudentSoftDelete(id, false);
    }

    function getBatches() {
        return readBatches().map((batch) => ({ ...batch }));
    }

    function getBatchById(id) {
        const batchId = typeof id === "string" ? id.trim() : "";
        if (!batchId) {
            return null;
        }
        return getBatches().find((batch) => batch.id === batchId) || null;
    }

    function normalizeBatch(input, current, batches) {
        const values = { ...(current || {}), ...input };
        const id = current ? current.id : resolveNewId(input.id, "bat", new Set(batches.map((batch) => batch.id)));
        const startDate = normalizeDate(values.startDate, "startDate");
        const endDate = normalizeDate(values.endDate, "endDate");
        if (startDate > endDate) {
            throw new TypeError("startDate cannot be after endDate.");
        }
        const timestamp = new Date().toISOString();
        return {
            id,
            batchName: requiredText(values.batchName, "batchName", 120),
            courseName: requiredText(values.courseName, "courseName", 120),
            description: optionalText(values.description, "description", 2000),
            startDate,
            endDate,
            createdAt: current ? current.createdAt : timestamp,
            updatedAt: timestamp
        };
    }

    function addBatch(batch) {
        assertAllowedFields(batch, BATCH_INPUT_FIELDS, "batch");
        const batches = readBatches();
        const record = normalizeBatch(batch, null, batches);
        saveData(KEYS.batches, [...batches, record]);
        return { ...record };
    }

    function updateBatch(id, updatedData) {
        const batchId = typeof id === "string" ? id.trim() : "";
        if (!batchId) {
            return null;
        }
        assertAllowedFields(updatedData, BATCH_UPDATE_FIELDS, "updatedData");
        const batches = readBatches();
        const index = batches.findIndex((batch) => batch.id === batchId);
        if (index === -1) {
            return null;
        }
        const updated = normalizeBatch(updatedData, batches[index], batches);
        const nextBatches = batches.slice();
        nextBatches[index] = updated;
        saveData(KEYS.batches, nextBatches);
        return { ...updated };
    }

    function deleteBatch(id) {
        const batchId = typeof id === "string" ? id.trim() : "";
        if (!batchId) {
            return null;
        }
        const batches = readBatches();
        const index = batches.findIndex((batch) => batch.id === batchId);
        if (index === -1) {
            return null;
        }
        const assignedStudents = readStudents().filter((student) => student.batchId === batchId);
        const activeCount = assignedStudents.filter((student) => !student.isSoftDelete).length;
        if (activeCount > 0) {
            throw new TypeError(`Cannot delete batch "${batchId}" while ${activeCount} active student(s) are assigned.`);
        }
        if (assignedStudents.length > 0) {
            throw new TypeError(`Cannot delete batch "${batchId}" while archived students still reference it.`);
        }
        const [deleted] = batches.splice(index, 1);
        saveData(KEYS.batches, batches);
        return { ...deleted };
    }

    function getPayments() {
        const students = readStudents();
        return readPayments(students).map((payment) => ({ ...payment }));
    }

    function getPaymentsByStudentId(studentId) {
        const id = typeof studentId === "string" ? studentId.trim() : "";
        if (!id) {
            return [];
        }
        return getPayments().filter((payment) => payment.studentId === id);
    }

    function getPaymentById(id) {
        const paymentId = typeof id === "string" ? id.trim() : "";
        if (!paymentId) {
            return null;
        }
        return getPayments().find((payment) => payment.id === paymentId) || null;
    }

    function normalizePaymentMethod(value) {
        if (typeof value !== "string") {
            throw new TypeError("paymentMethod must be Cash, Bank Transfer, Card, or Other.");
        }
        const matched = PAYMENT_METHODS.find((method) => method.toLowerCase() === value.trim().toLowerCase());
        if (!matched) {
            throw new TypeError("paymentMethod must be Cash, Bank Transfer, Card, or Other.");
        }
        return matched;
    }

    function samePaymentDetails(existing, candidate) {
        return existing.studentId === candidate.studentId
            && toMinorUnits(existing.amount, "amount", false) === candidate.amountCents
            && existing.paymentDate === candidate.paymentDate
            && existing.paymentMethod === candidate.paymentMethod
            && (existing.note || "") === candidate.note;
    }

    function addPayment(payment) {
        assertAllowedFields(payment, PAYMENT_INPUT_FIELDS, "payment");
        const students = readStudents();
        const payments = readPayments(students);
        const studentId = normalizeId(payment.studentId, "studentId");
        const studentIndex = students.findIndex((student) => student.id === studentId);
        if (studentIndex === -1) {
            throw new TypeError(`Student "${studentId}" does not exist.`);
        }
        const student = students[studentIndex];
        if (student.isSoftDelete) {
            throw new TypeError("Payments cannot be added to a soft-deleted student.");
        }

        const amountCents = toMinorUnits(payment.amount, "amount", false);
        const paymentDate = normalizeDate(payment.paymentDate === undefined ? today() : payment.paymentDate, "paymentDate");
        const paymentMethod = normalizePaymentMethod(payment.paymentMethod);
        const note = optionalText(payment.note, "note", 2000);
        const candidate = { studentId, amountCents, paymentDate, paymentMethod, note };
        const requestedId = optionalId(payment.id, "id");

        if (requestedId) {
            const existingById = payments.find((item) => item.id === requestedId);
            if (existingById) {
                if (samePaymentDetails(existingById, candidate)) {
                    return { ...existingById };
                }
                throw new TypeError(`A payment with id "${requestedId}" already exists with different details.`);
            }
        } else {
            // Exact repeated submissions without an id are treated as retries, not new receipts.
            const duplicate = payments.find((item) => samePaymentDetails(item, candidate));
            if (duplicate) {
                return { ...duplicate };
            }
        }

        const currentReceivedCents = totalReceivedCents(studentId, payments);
        const totalFeesCents = toMinorUnits(student.totalFees, "totalFees", false);
        const outstandingCents = totalFeesCents - currentReceivedCents;
        if (amountCents > outstandingCents) {
            throw new RangeError(`Payment exceeds the outstanding balance of Rs. ${fromMinorUnits(outstandingCents).toFixed(2)}.`);
        }

        const paymentId = requestedId || generateId("pay", new Set(payments.map((item) => item.id)));
        const newPayment = {
            id: paymentId,
            studentId,
            amount: fromMinorUnits(amountCents),
            paymentDate,
            paymentMethod,
            note,
            createdAt: new Date().toISOString()
        };
        const nextReceivedCents = currentReceivedCents + amountCents;
        const nextStudent = {
            ...student,
            totalReceived: fromMinorUnits(nextReceivedCents),
            status: statusFromCents(nextReceivedCents, totalFeesCents),
            updatedAt: new Date().toISOString()
        };
        const nextStudents = students.slice();
        nextStudents[studentIndex] = nextStudent;

        // LocalStorage cannot atomically write both collections, so restore the summary if the ledger write fails.
        saveData(KEYS.students, nextStudents);
        try {
            saveData(KEYS.payments, [...payments, newPayment]);
        } catch (error) {
            try {
                saveData(KEYS.students, students);
            } catch (rollbackError) {
                throw storageFailure(
                    "Payment storage failed and the student summary could not be restored; inspect the stored data before retrying.",
                    rollbackError
                );
            }
            throw error;
        }
        return { ...newPayment };
    }

    function calculateTotalReceived(studentId) {
        const student = getStudentById(studentId);
        if (!student) {
            return null;
        }
        return student.totalReceived;
    }

    function calculateOutstandingBalance(studentOrId) {
        const student = typeof studentOrId === "string"
            ? getStudentById(studentOrId)
            : isRecord(studentOrId) && typeof studentOrId.id === "string"
                ? getStudentById(studentOrId.id) || studentOrId
                : studentOrId;
        if (!student) {
            return null;
        }
        assertRecord(student, "student");
        const totalFeesCents = toMinorUnits(student.totalFees, "totalFees", false);
        const receivedCents = toMinorUnits(student.totalReceived, "totalReceived", true);
        return fromMinorUnits(totalFeesCents - receivedCents);
    }

    function calculatePaymentStatus(totalReceived, totalFees) {
        const receivedCents = toMinorUnits(totalReceived, "totalReceived", true);
        const feesCents = toMinorUnits(totalFees, "totalFees", false);
        return statusFromCents(receivedCents, feesCents);
    }

    root.FeeTrackStorage = Object.freeze({
        KEYS,
        PAYMENT_METHODS,
        StorageError,
        getData,
        saveData,
        removeData,
        clearAllData,
        getStudents,
        getStudentById,
        addStudent,
        updateStudent,
        softDeleteStudent,
        restoreStudent,
        getBatches,
        getBatchById,
        addBatch,
        updateBatch,
        deleteBatch,
        getPayments,
        getPaymentsByStudentId,
        addPayment,
        getPaymentById,
        calculateTotalReceived,
        calculateOutstandingBalance,
        calculatePaymentStatus
    });
}(window));
