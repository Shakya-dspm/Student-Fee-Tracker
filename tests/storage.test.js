"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storageSource = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "storage.js"), "utf8");

function createResponse(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => "application/json" },
        text: async () => data === null ? "" : JSON.stringify(data)
    };
}

function createHarness({ students = [], batches = [], failPath = "", emptyGetAll = false } = {}) {
    const values = new Map();
    const calls = [];
    const window = {
        localStorage: {
            getItem(key) { return values.has(key) ? values.get(key) : null; },
            setItem(key, value) { values.set(key, String(value)); }
        }
    };
    const fetch = async (url, options = {}) => {
        const parsed = new URL(url, "http://feetrack.test");
        const method = (options.method || "GET").toUpperCase();
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ method, path: parsed.pathname, search: parsed.search, body });
        if (parsed.pathname === failPath) return createResponse({ message: "Mock API failure" }, 400);
        if (parsed.pathname.endsWith("/getAllEnrollments")) return createResponse(emptyGetAll ? [] : students);
        if (parsed.pathname.endsWith("/FilterEnrollments")) return createResponse(students);
        if (parsed.pathname.endsWith("/batches") && method === "GET") return createResponse(batches);
        if (parsed.pathname.endsWith("/addNewEnrollment")) {
            const student = { ...body, enrollmentId: 101 };
            students.push(student);
            return createResponse(student);
        }
        if (parsed.pathname.endsWith("/batches") && method === "POST") {
            const batch = { ...body, batchId: 202 };
            batches.push(batch);
            return createResponse(batch);
        }
        if (parsed.pathname.endsWith("/updateEnrollment") || parsed.pathname.endsWith("/202")) return createResponse(null);
        if (parsed.pathname.endsWith("/SoftDeleteById") || parsed.pathname.endsWith("/batches/202")) return createResponse(null);
        return createResponse({ message: `Unhandled request ${method} ${parsed.pathname}` }, 404);
    };
    const context = vm.createContext({ window, fetch });
    vm.runInContext(storageSource, context, { filename: "storage.js" });
    return { storage: window.FeeTrackStorage, calls, values };
}

test("initialization loads API enrollment and batch records", async () => {
    const { storage, calls } = createHarness({
        students: [{ enrollmentId: 3, studentName: "Nimal Silva", contactNo: "0771234567", totalFees: 1000, totalReceived: 250, batchId: 7, status: "Partial" }],
        batches: [{ batchId: 7, batchName: "Grade 10" }]
    });

    await storage.initialize();

    assert.equal(storage.getStudents()[0].id, "3");
    assert.equal(storage.getStudents()[0].totalReceived, 250);
    assert.equal(storage.getBatches()[0].id, "7");
    assert.deepEqual(calls.map(({ path }) => path).sort(), [
        "/api/FeesTracking/batches",
        "/api/FeesTracking/getAllEnrollments"
    ]);
});

test("initialization falls back to FilterEnrollments when getAllEnrollments is empty", async () => {
    const { storage, calls } = createHarness({
        emptyGetAll: true,
        students: [{ enrollmentId: 8, studentName: "Nadee", contactNo: "0771234567", totalFees: 500, totalReceived: 100, batchId: 2, status: "Partial Paid" }]
    });

    await storage.initialize();

    assert.equal(storage.getStudents().length, 1);
    assert.equal(storage.getStudents()[0].status, "Partial");
    const fallbackCall = calls.find((call) => call.path.endsWith("/FilterEnrollments"));
    assert.equal(fallbackCall.method, "POST");
    assert.deepEqual(fallbackCall.body, {});
});

test("creating students and batches sends the provider's request shapes", async () => {
    const { storage, calls } = createHarness();
    await storage.initialize();

    const batch = await storage.addBatch({ batchName: "Grade 11" });
    const student = await storage.addStudent({
        studentName: "Kavindi Perera",
        contactNo: "+94771234567",
        totalFees: 12000,
        emi1: 4000,
        emi2: 4000,
        emi3: 4000,
        batchId: "7"
    });

    assert.equal(batch.id, "202");
    assert.equal(student.id, "101");
    const batchCall = calls.find((call) => call.method === "POST" && call.path.endsWith("/batches"));
    const enrollmentCall = calls.find((call) => call.path.endsWith("/addNewEnrollment"));
    assert.deepEqual(batchCall.body, { batchName: "Grade 11" });
    assert.equal(enrollmentCall.body.contactNo, "0771234567");
    assert.equal(enrollmentCall.body.batchId, 7);
});

test("payment updates the API enrollment total and stores receipt details locally", async () => {
    const { storage, calls, values } = createHarness({
        students: [{ enrollmentId: 5, studentName: "Sahan", contactNo: "0771111111", totalFees: 1000, totalReceived: 200, batchId: 7, status: "Partial" }]
    });
    await storage.initialize();

    const receipt = await storage.addPayment({ studentId: "5", amount: 300, paymentDate: "2026-11-26", paymentMethod: "Cash", note: "Part payment" });

    assert.equal(storage.getStudentById("5").totalReceived, 500);
    assert.equal(storage.getStudentById("5").status, "Partial");
    assert.equal(storage.getPaymentsByStudentId("5").length, 1);
    assert.equal(receipt.amount, 300);
    const update = calls.find((call) => call.path.endsWith("/updateEnrollment"));
    assert.equal(update.search, "?id=5");
    assert.equal(update.body.totalReceived, 500);
    assert.equal(JSON.parse(values.get("feetTrack_payments"))[0].note, "Part payment");
});

test("API errors surface and do not add optimistic records", async () => {
    const { storage } = createHarness({ failPath: "/api/FeesTracking/batches" });
    await assert.rejects(storage.initialize(), /Mock API failure/);
});
