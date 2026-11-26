(function initializeFeeTrackStorage(root) {
    "use strict";

    // Use the local proxy during development; static deployments call the API directly.
    const hostname = root.location?.hostname;
    const API_BASE_URL = hostname === "localhost" || hostname === "127.0.0.1"
        ? ""
        : "https://api.freeprojectapi.com";
    const PAYMENT_KEY = "feetTrack_payments";
    const PAYMENT_METHODS = Object.freeze(["Cash", "Bank Transfer", "Card", "Other"]);
    let students = [];
    let batches = [];
    let payments = [];
    let initialized = false;
    let initializePromise;

    async function request(path, options = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers
            }
        });
        const body = await response.text();
        if (response.headers.get("content-type")?.includes("text/html") && body.includes("Cannot GET")) {
            throw new Error("The API proxy is not running. Start this project with `node server.js`, then open http://localhost:8000/ (not Live Server or Python's static server).");
        }
        if (!response.ok) {
            let detail = body;
            try {
                const parsed = JSON.parse(body);
                detail = parsed.message || parsed.title || body;
            } catch (_) { /* keep the response text */ }
            throw new Error(detail || `API request failed (${response.status}).`);
        }
        if (!body) return null;
        try { return JSON.parse(body); } catch (_) { return body; }
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (value && Array.isArray(value.data)) return value.data;
        if (value && Array.isArray(value.result)) return value.result;
        return [];
    }

    function mapBatch(record) {
        return {
            id: String(record.batchId),
            batchName: record.batchName || "Unnamed batch",
            courseName: "General",
            description: "",
            startDate: "",
            endDate: "",
            createdDate: record.createdDate || ""
        };
    }

    function mapStudent(record) {
        const totalFees = Number(record.totalFees || 0);
        const totalReceived = Number(record.totalReceived || 0);
        return {
            id: String(record.enrollmentId),
            studentName: record.studentName || "",
            contactNo: record.contactNo || "",
            totalFees,
            emi1: Number(record.emi1 || 0),
            emi2: Number(record.emi2 || 0),
            emi3: Number(record.emi3 || 0),
            totalReceived,
            status: paymentStatus(totalReceived, totalFees),
            batchId: String(record.batchId),
            isSoftDelete: Boolean(record.isSoftDelete),
            email: "",
            address: "",
            registrationDate: ""
        };
    }

    function readPaymentLedger() {
        try {
            const parsed = JSON.parse(root.localStorage.getItem(PAYMENT_KEY) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    async function initialize() {
        if (initialized) return;
        if (!initializePromise) {
            initializePromise = Promise.all([
                request("/api/FeesTracking/getAllEnrollments"),
                request("/api/FeesTracking/batches")
            ]).then(async ([enrollmentResult, batchResult]) => {
                let enrollmentRecords = asArray(enrollmentResult);
                // The provider currently returns [] from getAllEnrollments even though records exist.
                // FilterEnrollments with no criteria is a read-only fallback that returns the full set.
                if (enrollmentRecords.length === 0) {
                    enrollmentRecords = asArray(await request("/api/FeesTracking/FilterEnrollments", {
                        method: "POST",
                        body: JSON.stringify({})
                    }));
                }
                students = enrollmentRecords.map(mapStudent);
                batches = asArray(batchResult).map(mapBatch);
                payments = readPaymentLedger();
                initialized = true;
            }).catch((error) => {
                initializePromise = null;
                throw new Error(`Could not connect to the Fees Tracking API. ${error.message}`);
            });
        }
        return initializePromise;
    }

    function requireInitialized() {
        if (!initialized) throw new Error("Fee records are still loading. Please try again.");
    }

    function normalizePhone(value) {
        const compact = String(value || "").trim().replace(/[\s().-]/g, "");
        if (/^\+947\d{8}$/.test(compact)) return `0${compact.slice(3)}`;
        if (/^7\d{8}$/.test(compact)) return `0${compact}`;
        if (/^07\d{8}$/.test(compact)) return compact;
        throw new TypeError("Contact number must be a Sri Lankan mobile number.");
    }

    function paymentStatus(received, fees) {
        if (received >= fees) return "Paid";
        if (received > 0) return "Partial";
        return "Pending";
    }

    function enrollmentBody(student) {
        return {
            ...(student.id && /^\d+$/.test(String(student.id)) ? { enrollmentId: Number(student.id) } : {}),
            studentName: String(student.studentName || "").trim(),
            contactNo: normalizePhone(student.contactNo),
            totalFees: Number(student.totalFees),
            emi1: Number(student.emi1 || 0),
            emi2: Number(student.emi2 || 0),
            emi3: Number(student.emi3 || 0),
            totalReceived: Number(student.totalReceived || 0),
            status: paymentStatus(Number(student.totalReceived || 0), Number(student.totalFees)),
            isSoftDelete: Boolean(student.isSoftDelete),
            batchId: Number(student.batchId)
        };
    }

    function unwrapRecord(value) {
        if (value && value.data && !Array.isArray(value.data)) return value.data;
        return value;
    }

    function getStudents() { requireInitialized(); return students.map((item) => ({ ...item })); }
    function getStudentById(id) { requireInitialized(); return students.find((item) => item.id === String(id)) || null; }
    function getBatches() { requireInitialized(); return batches.map((item) => ({ ...item })); }
    function getBatchById(id) { requireInitialized(); return batches.find((item) => item.id === String(id)) || null; }
    function getPayments() { requireInitialized(); return payments.filter((item) => students.some((student) => student.id === String(item.studentId))).map((item) => ({ ...item })); }
    function getPaymentsByStudentId(id) { requireInitialized(); return payments.filter((item) => item.studentId === String(id)).map((item) => ({ ...item })); }
    function getPaymentById(id) { requireInitialized(); return payments.find((item) => item.id === String(id)) || null; }

    async function addStudent(input) {
        requireInitialized();
        const body = enrollmentBody(input);
        const created = unwrapRecord(await request("/api/FeesTracking/addNewEnrollment", { method: "POST", body: JSON.stringify(body) }));
        const student = mapStudent(created || body);
        if (!student.id || student.id === "undefined") throw new Error("The API did not return an enrollment ID. Reload the student list before retrying.");
        students.push(student);
        return { ...student };
    }

    async function updateStudent(id, changes) {
        requireInitialized();
        const existing = getStudentById(id);
        if (!existing) return null;
        const updated = { ...existing, ...changes };
        const body = enrollmentBody(updated);
        await request(`/api/FeesTracking/updateEnrollment?id=${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
        Object.assign(existing, mapStudent(body));
        return { ...existing };
    }

    async function setStudentDeleted(id, deleted) {
        requireInitialized();
        const existing = getStudentById(id);
        if (!existing) return false;
        if (existing.isSoftDelete === deleted) return true;
        if (deleted) {
            await request(`/api/FeesTracking/SoftDeleteById?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            existing.isSoftDelete = true;
        } else {
            const body = enrollmentBody({ ...existing, isSoftDelete: false });
            await request(`/api/FeesTracking/updateEnrollment?id=${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
            existing.isSoftDelete = false;
        }
        return true;
    }

    async function addBatch(input) {
        requireInitialized();
        const created = unwrapRecord(await request("/api/FeesTracking/batches", {
            method: "POST",
            body: JSON.stringify({ batchName: String(input.batchName || "").trim() })
        }));
        if (!created || created.batchId === undefined) throw new Error("The API did not return a batch ID. Reload the batch list before retrying.");
        const batch = mapBatch(created);
        batches.push(batch);
        return { ...batch };
    }

    async function updateBatch(id, changes) {
        requireInitialized();
        const existing = getBatchById(id);
        if (!existing) return null;
        const body = { batchId: Number(id), batchName: String(changes.batchName || existing.batchName).trim() };
        await request(`/api/FeesTracking/batches/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
        Object.assign(existing, mapBatch(body));
        return { ...existing };
    }

    async function deleteBatch(id) {
        requireInitialized();
        const existing = getBatchById(id);
        if (!existing) return false;
        await request(`/api/FeesTracking/batches/${encodeURIComponent(id)}`, { method: "DELETE" });
        batches = batches.filter((item) => item.id !== String(id));
        return true;
    }

    async function addPayment(input) {
        requireInitialized();
        const student = getStudentById(input.studentId);
        if (!student) throw new Error("The selected student no longer exists.");
        const amount = Number(input.amount);
        const outstanding = calculateOutstandingBalance(student);
        if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("Payment amount must be greater than zero.");
        if (amount > outstanding) throw new RangeError(`Payment exceeds the outstanding balance of Rs. ${outstanding.toFixed(2)}.`);
        if (!PAYMENT_METHODS.includes(input.paymentMethod)) throw new TypeError("Choose a valid payment method.");
        const nextReceived = Math.round((student.totalReceived + amount + Number.EPSILON) * 100) / 100;
        const updated = { ...student, totalReceived: nextReceived, status: paymentStatus(nextReceived, student.totalFees) };
        const body = enrollmentBody(updated);
        await request(`/api/FeesTracking/updateEnrollment?id=${encodeURIComponent(student.id)}`, { method: "PUT", body: JSON.stringify(body) });
        Object.assign(student, mapStudent(body));
        const payment = {
            id: input.id || `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            studentId: student.id,
            amount,
            paymentDate: input.paymentDate || new Date().toISOString().slice(0, 10),
            paymentMethod: input.paymentMethod,
            note: input.note || "",
            createdAt: new Date().toISOString()
        };
        payments.push(payment);
        try { root.localStorage.setItem(PAYMENT_KEY, JSON.stringify(payments)); }
        catch (error) { throw new Error(`Payment total was saved by the API, but this browser could not save its receipt history: ${error.message}`); }
        return { ...payment };
    }

    function calculateTotalReceived(id) { const student = getStudentById(id); return student ? student.totalReceived : null; }
    function calculateOutstandingBalance(studentOrId) {
        const student = typeof studentOrId === "string" ? getStudentById(studentOrId) : studentOrId;
        return student ? Number(student.totalFees) - Number(student.totalReceived || 0) : null;
    }

    root.FeeTrackStorage = Object.freeze({
        PAYMENT_METHODS,
        initialize,
        getStudents,
        getStudentById,
        addStudent,
        updateStudent,
        softDeleteStudent: (id) => setStudentDeleted(id, true),
        restoreStudent: (id) => setStudentDeleted(id, false),
        getBatches,
        getBatchById,
        addBatch,
        updateBatch,
        deleteBatch,
        getPayments,
        getPaymentsByStudentId,
        getPaymentById,
        addPayment,
        calculateTotalReceived,
        calculateOutstandingBalance,
        calculatePaymentStatus: paymentStatus
    });
}(window));
