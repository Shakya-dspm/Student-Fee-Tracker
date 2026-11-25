"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const storageSource = fs.readFileSync(path.join(projectRoot, "assets", "js", "storage.js"), "utf8");
const sampleSource = fs.readFileSync(path.join(projectRoot, "assets", "js", "sample-data.js"), "utf8");

function createHarness(values) {
    const storedValues = values || new Map();
    let uuid = 0;
    const localStorage = {
        getItem(key) {
            return storedValues.has(key) ? storedValues.get(key) : null;
        },
        setItem(key, value) {
            storedValues.set(String(key), String(value));
        },
        removeItem(key) {
            storedValues.delete(key);
        }
    };
    const window = {
        localStorage,
        crypto: {
            randomUUID() {
                uuid += 1;
                return `test-${uuid}`;
            }
        }
    };
    const context = vm.createContext({ window });
    vm.runInContext(storageSource, context, { filename: "storage.js" });
    vm.runInContext(sampleSource, context, { filename: "sample-data.js" });
    return {
        storage: window.FeeTrackStorage,
        sampleData: window.FeeTrackSampleData,
        localStorage,
        values: storedValues
    };
}

function addTestBatch(storage, overrides) {
    return storage.addBatch({
        batchName: "Grade 10 - A",
        courseName: "Mathematics",
        description: "",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        ...overrides
    });
}

function addTestStudent(storage, batchId, overrides) {
    return storage.addStudent({
        studentName: "Kasun Perera",
        contactNo: "0771234567",
        totalFees: 1000,
        batchId,
        ...overrides
    });
}

test("student and batch records validate, update, soft-delete, and restore", () => {
    const { storage } = createHarness();
    const batch = addTestBatch(storage);
    assert.equal(storage.getBatchById(batch.id).batchName, "Grade 10 - A");

    const student = addTestStudent(storage, batch.id);
    assert.match(student.id, /^stu_/);
    assert.equal(storage.getStudentById(student.id).status, "Pending");
    assert.equal(student.isSoftDelete, false);
    assert.ok(student.createdAt);
    assert.ok(student.updatedAt);
    const anotherStudent = addTestStudent(storage, batch.id, { contactNo: "0712345678" });
    assert.notEqual(student.id, anotherStudent.id);

    const updated = storage.updateStudent(student.id, {
        studentName: "Kasun Jayawardena",
        contactNo: "+94 77 123 4567",
        totalFees: 1200
    });
    assert.equal(updated.studentName, "Kasun Jayawardena");
    assert.equal(updated.contactNo, "+94771234567");
    assert.equal(storage.getStudentById(student.id).totalFees, 1200);
    assert.throws(() => storage.updateStudent(student.id, { totalReceived: 10 }), /unsupported field/);

    assert.throws(() => addTestStudent(storage, batch.id, { contactNo: "abc" }), /mobile number/);
    assert.throws(() => addTestStudent(storage, batch.id, { totalFees: 0 }), /greater than zero/);
    assert.throws(() => addTestStudent(storage, "missing-batch"), /does not reference an existing batch/);
    assert.throws(() => storage.deleteBatch(batch.id), /active student/);

    const archived = storage.softDeleteStudent(student.id);
    assert.equal(archived.isSoftDelete, true);
    assert.equal(storage.getStudentById(student.id).isSoftDelete, true);
    storage.softDeleteStudent(anotherStudent.id);
    assert.throws(() => storage.deleteBatch(batch.id), /archived students/);
    const restored = storage.restoreStudent(student.id);
    assert.equal(restored.isSoftDelete, false);
    assert.equal(storage.updateStudent("unknown", { studentName: "Unknown" }), null);
    assert.equal(storage.restoreStudent("unknown"), null);

    const renamedBatch = storage.updateBatch(batch.id, { description: "Updated class details" });
    assert.equal(renamedBatch.description, "Updated class details");
    const emptyBatch = addTestBatch(storage, { id: "batch-empty", batchName: "Unused batch" });
    assert.equal(storage.deleteBatch(emptyBatch.id).id, emptyBatch.id);
    assert.equal(storage.getBatches().length, 1);
});

test("student profile metadata persists and supports records created before the fields existed", () => {
    const { storage, localStorage } = createHarness();
    const batch = addTestBatch(storage);
    const student = addTestStudent(storage, batch.id, {
        email: "student@example.com",
        address: "12 Lake Road, Colombo",
        registrationDate: "2026-02-14"
    });

    assert.equal(student.email, "student@example.com");
    assert.equal(student.address, "12 Lake Road, Colombo");
    assert.equal(storage.getStudentById(student.id).registrationDate, "2026-02-14");
    assert.throws(() => addTestStudent(storage, batch.id, { email: "not-an-email" }), /valid email/);

    const updated = storage.updateStudent(student.id, { address: "New address" });
    assert.equal(updated.email, "student@example.com");
    assert.equal(updated.address, "New address");
    assert.equal(updated.registrationDate, "2026-02-14");

    const legacyRecord = { ...updated };
    delete legacyRecord.email;
    delete legacyRecord.address;
    delete legacyRecord.registrationDate;
    localStorage.setItem(storage.KEYS.students, JSON.stringify([legacyRecord]));

    const legacyStudent = storage.getStudentById(student.id);
    assert.equal(legacyStudent.email, "");
    assert.equal(legacyStudent.address, "");
    assert.equal(legacyStudent.registrationDate, legacyStudent.createdAt.slice(0, 10));
});

test("payments use cents, enforce balances, update status, and remain queryable", () => {
    const { storage } = createHarness();
    const batch = addTestBatch(storage);
    const student = addTestStudent(storage, batch.id, { totalFees: 0.3 });

    const first = storage.addPayment({
        studentId: student.id,
        amount: 0.1,
        paymentDate: "2026-04-01",
        paymentMethod: "cash",
        note: "First part"
    });
    assert.equal(storage.getStudentById(student.id).totalReceived, 0.1);
    assert.equal(storage.getStudentById(student.id).status, "Partial");
    assert.equal(storage.calculateOutstandingBalance(student.id), 0.2);
    assert.equal(storage.calculateOutstandingBalance(student), 0.2);

    const duplicate = storage.addPayment({
        studentId: student.id,
        amount: 0.1,
        paymentDate: "2026-04-01",
        paymentMethod: "Cash",
        note: "First part"
    });
    assert.equal(duplicate.id, first.id);
    assert.equal(storage.getPaymentsByStudentId(student.id).length, 1);

    const intentionalRepeat = storage.addPayment({
        id: "payment-repeat-2",
        studentId: student.id,
        amount: 0.1,
        paymentDate: "2026-04-01",
        paymentMethod: "Cash",
        note: "First part"
    });
    assert.equal(intentionalRepeat.id, "payment-repeat-2");
    assert.equal(storage.getPaymentsByStudentId(student.id).length, 2);
    assert.equal(storage.getStudentById(student.id).totalReceived, 0.2);

    const second = storage.addPayment({
        studentId: student.id,
        amount: 0.1,
        paymentDate: "2026-04-02",
        paymentMethod: "Card"
    });
    const paidStudent = storage.getStudentById(student.id);
    assert.equal(paidStudent.totalReceived, 0.3);
    assert.equal(paidStudent.status, "Paid");
    assert.equal(storage.calculateOutstandingBalance(paidStudent), 0);
    assert.equal(storage.calculateTotalReceived(student.id), 0.3);
    assert.equal(storage.calculatePaymentStatus(0, 100), "Pending");
    assert.equal(storage.calculatePaymentStatus(20, 100), "Partial");
    assert.equal(storage.calculatePaymentStatus(100, 100), "Paid");
    assert.equal(storage.getPaymentById(second.id).paymentMethod, "Card");
    assert.equal(storage.getPayments().length, 3);
    assert.throws(() => storage.updateStudent(student.id, { totalFees: 0.2 }), /less than the student's recorded payments/);

    assert.throws(() => storage.addPayment({
        studentId: student.id,
        amount: 0,
        paymentDate: "2026-04-03",
        paymentMethod: "Cash"
    }), /greater than zero/);
    assert.throws(() => storage.addPayment({
        studentId: student.id,
        amount: -1,
        paymentDate: "2026-04-03",
        paymentMethod: "Cash"
    }), /greater than zero/);
    assert.throws(() => storage.addPayment({
        studentId: student.id,
        amount: 0.01,
        paymentDate: "2026-04-03",
        paymentMethod: "Cash"
    }), /exceeds the outstanding balance/);
    assert.throws(() => storage.addPayment({
        studentId: "unknown",
        amount: 1,
        paymentDate: "2026-04-03",
        paymentMethod: "Cash"
    }), /does not exist/);
    assert.throws(() => storage.addPayment({
        studentId: student.id,
        amount: 1,
        paymentDate: "2026-04-03",
        paymentMethod: "Cheque"
    }), /paymentMethod must be/);
    storage.softDeleteStudent(student.id);
    assert.equal(storage.getPaymentsByStudentId(student.id).length, 3);
});

test("sample data seeds empty collections once and preserves existing records", () => {
    const { storage, sampleData } = createHarness();
    const firstRun = sampleData.initializeSampleData();
    assert.deepEqual(JSON.parse(JSON.stringify(firstRun)), {
        batchesAdded: 3,
        studentsAdded: 8,
        paymentsAdded: 8
    });
    assert.equal(storage.getBatches().length, 3);
    assert.equal(storage.getStudents().length, 8);
    assert.equal(storage.getPayments().length, 8);
    const statuses = new Set(storage.getStudents().map((student) => student.status));
    assert.deepEqual([...statuses].sort(), ["Paid", "Partial", "Pending"]);

    const secondRun = sampleData.initializeSampleData();
    assert.deepEqual(JSON.parse(JSON.stringify(secondRun)), {
        batchesAdded: 0,
        studentsAdded: 0,
        paymentsAdded: 0
    });
    assert.equal(storage.getStudents().length, 8);
    assert.equal(storage.getPayments().length, 8);

    const existing = createHarness();
    const batch = addTestBatch(existing.storage, { id: "batch-user" });
    const userStudent = addTestStudent(existing.storage, batch.id, { id: "student-user" });
    const result = existing.sampleData.initializeSampleData();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
        batchesAdded: 0,
        studentsAdded: 0,
        paymentsAdded: 0
    });
    assert.equal(existing.storage.getBatchById("batch-user").id, batch.id);
    assert.equal(existing.storage.getStudentById("student-user").id, userStudent.id);
    assert.equal(existing.storage.getPayments().length, 0);
});

test("LocalStorage records persist across a page-context reload", () => {
    const sharedValues = new Map();
    const firstContext = createHarness(sharedValues);
    const batch = addTestBatch(firstContext.storage);
    const student = addTestStudent(firstContext.storage, batch.id, { totalFees: 80.25 });
    const payment = firstContext.storage.addPayment({
        studentId: student.id,
        amount: 20.1,
        paymentDate: "2026-05-01",
        paymentMethod: "Bank Transfer"
    });

    const reloadedContext = createHarness(sharedValues);
    const persistedStudent = reloadedContext.storage.getStudentById(student.id);
    assert.equal(persistedStudent.studentName, "Kasun Perera");
    assert.equal(persistedStudent.totalReceived, 20.1);
    assert.equal(persistedStudent.status, "Partial");
    assert.equal(reloadedContext.storage.calculateOutstandingBalance(student.id), 60.15);
    assert.equal(reloadedContext.storage.getPaymentById(payment.id).paymentMethod, "Bank Transfer");
});

test("corrupted collections fail explicitly and are not overwritten", () => {
    const harness = createHarness();
    const key = harness.storage.KEYS.students;
    harness.localStorage.setItem(key, "{invalid JSON");

    assert.throws(() => harness.storage.getStudents(), /corrupted and was left untouched/);
    assert.equal(harness.localStorage.getItem(key), "{invalid JSON");
    assert.throws(() => harness.sampleData.initializeSampleData(), /corrupted and was left untouched/);
    assert.equal(harness.localStorage.getItem(key), "{invalid JSON");

    harness.localStorage.setItem(key, JSON.stringify({ not: "an array" }));
    assert.throws(() => harness.storage.getStudents(), /must be an array/);
    assert.equal(harness.localStorage.getItem(key), JSON.stringify({ not: "an array" }));

    harness.localStorage.setItem(key, "null");
    assert.throws(() => harness.storage.getStudents(), /must be an array/);
    assert.equal(harness.localStorage.getItem(key), "null");
});

test("inconsistent payment history is rejected without modifying stored records", () => {
    const { storage, localStorage } = createHarness();
    const batch = addTestBatch(storage);
    const student = addTestStudent(storage, batch.id, { totalFees: 10 });
    const invalidPayments = [{
        id: "payment-over-limit",
        studentId: student.id,
        amount: 10.01,
        paymentDate: "2026-05-01",
        paymentMethod: "Cash",
        note: ""
    }];
    localStorage.setItem(storage.KEYS.payments, JSON.stringify(invalidPayments));

    assert.throws(() => storage.getPayments(), /exceeds the fees/);
    assert.equal(localStorage.getItem(storage.KEYS.payments), JSON.stringify(invalidPayments));
});

test("failed payment writes roll back the student summary", () => {
    const { storage, localStorage } = createHarness();
    const batch = addTestBatch(storage);
    const student = addTestStudent(storage, batch.id, { totalFees: 100 });
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = (key, value) => {
        if (key === storage.KEYS.payments) {
            throw new Error("Simulated storage quota error.");
        }
        originalSetItem.call(localStorage, key, value);
    };

    assert.throws(() => storage.addPayment({
        studentId: student.id,
        amount: 25,
        paymentDate: "2026-05-02",
        paymentMethod: "Cash"
    }), /Unable to save "feetTrack_payments"/);

    localStorage.setItem = originalSetItem;
    assert.equal(storage.getStudentById(student.id).totalReceived, 0);
    assert.equal(storage.getPayments().length, 0);
});

test("general storage helpers only clear FeeTrack keys", () => {
    const { storage, localStorage, values } = createHarness();
    storage.saveData(storage.KEYS.settings, { theme: "light" });
    storage.saveData(storage.KEYS.students, []);
    localStorage.setItem("other-application-key", "keep");
    assert.equal(storage.getData(storage.KEYS.settings).theme, "light");

    storage.removeData(storage.KEYS.settings);
    assert.equal(storage.getData(storage.KEYS.settings), null);
    storage.clearAllData();
    assert.equal(storage.getStudents().length, 0);
    assert.equal(values.get("other-application-key"), "keep");
});
