(function initializeFeeTrackSampleData(root) {
    "use strict";

    const storage = root.FeeTrackStorage;
    if (!storage) {
        throw new Error("Load assets/js/storage.js before assets/js/sample-data.js.");
    }

    const SAMPLE_BATCHES = Object.freeze([
        Object.freeze({
            id: "batch_sample_grade10",
            batchName: "Grade 10 - A",
            courseName: "Mathematics",
            description: "Year 10 mathematics tuition",
            startDate: "2026-01-05",
            endDate: "2026-12-18"
        }),
        Object.freeze({
            id: "batch_sample_grade11",
            batchName: "Grade 11 - B",
            courseName: "Science",
            description: "Year 11 science tuition",
            startDate: "2026-01-06",
            endDate: "2026-12-18"
        }),
        Object.freeze({
            id: "batch_sample_grade12",
            batchName: "Grade 12 - A",
            courseName: "Commerce",
            description: "Year 12 commerce tuition",
            startDate: "2026-01-07",
            endDate: "2026-12-18"
        })
    ]);

    const SAMPLE_STUDENTS = Object.freeze([
        Object.freeze({ id: "student_sample_001", studentName: "Nethmi Dissanayake", contactNo: "0771234567", totalFees: 45000, emi1: 15000, emi2: 15000, emi3: 15000, batchId: "batch_sample_grade10" }),
        Object.freeze({ id: "student_sample_002", studentName: "Ravindu Perera", contactNo: "0712345678", totalFees: 42000, emi1: 14000, emi2: 14000, emi3: 14000, batchId: "batch_sample_grade11" }),
        Object.freeze({ id: "student_sample_003", studentName: "Savindi Fernando", contactNo: "0763456789", totalFees: 38000, emi1: 13000, emi2: 13000, emi3: 12000, batchId: "batch_sample_grade12" }),
        Object.freeze({ id: "student_sample_004", studentName: "Kavindu Madushan", contactNo: "0754567890", totalFees: 36000, emi1: 12000, emi2: 12000, emi3: 12000, batchId: "batch_sample_grade10" }),
        Object.freeze({ id: "student_sample_005", studentName: "Tharushi Herath", contactNo: "0775678901", totalFees: 40000, emi1: 14000, emi2: 13000, emi3: 13000, batchId: "batch_sample_grade11" }),
        Object.freeze({ id: "student_sample_006", studentName: "Dineth Maduranga", contactNo: "0706789012", totalFees: 32000, emi1: 11000, emi2: 11000, emi3: 10000, batchId: "batch_sample_grade12" }),
        Object.freeze({ id: "student_sample_007", studentName: "Praveeni Wijesinghe", contactNo: "0727890123", totalFees: 48000, emi1: 16000, emi2: 16000, emi3: 16000, batchId: "batch_sample_grade10" }),
        Object.freeze({ id: "student_sample_008", studentName: "Isuru Jayawardena", contactNo: "0788901234", totalFees: 30000, emi1: 10000, emi2: 10000, emi3: 10000, batchId: "batch_sample_grade11" })
    ]);

    const SAMPLE_PAYMENTS = Object.freeze([
        Object.freeze({ id: "payment_sample_001", studentId: "student_sample_001", amount: 15000, paymentDate: "2026-02-10", paymentMethod: "Bank Transfer", note: "First installment" }),
        Object.freeze({ id: "payment_sample_002", studentId: "student_sample_001", amount: 30000, paymentDate: "2026-05-10", paymentMethod: "Card", note: "Remaining balance" }),
        Object.freeze({ id: "payment_sample_003", studentId: "student_sample_002", amount: 20000, paymentDate: "2026-03-12", paymentMethod: "Cash", note: "Part payment" }),
        Object.freeze({ id: "payment_sample_004", studentId: "student_sample_004", amount: 36000, paymentDate: "2026-04-04", paymentMethod: "Bank Transfer", note: "Full fee payment" }),
        Object.freeze({ id: "payment_sample_005", studentId: "student_sample_005", amount: 15000, paymentDate: "2026-06-11", paymentMethod: "Other", note: "First payment" }),
        Object.freeze({ id: "payment_sample_006", studentId: "student_sample_007", amount: 24000, paymentDate: "2026-02-15", paymentMethod: "Card", note: "First half" }),
        Object.freeze({ id: "payment_sample_007", studentId: "student_sample_007", amount: 24000, paymentDate: "2026-07-15", paymentMethod: "Bank Transfer", note: "Second half" }),
        Object.freeze({ id: "payment_sample_008", studentId: "student_sample_008", amount: 10000, paymentDate: "2026-08-20", paymentMethod: "Cash", note: "Part payment" })
    ]);

    function initializeSampleData() {
        const existingBatches = storage.getBatches();
        const existingStudents = storage.getStudents();
        const existingPayments = storage.getPayments();
        const result = { batchesAdded: 0, studentsAdded: 0, paymentsAdded: 0 };

        if (existingBatches.length === 0) {
            SAMPLE_BATCHES.forEach((batch) => {
                storage.addBatch(batch);
                result.batchesAdded += 1;
            });
        }

        const batchIds = new Set(storage.getBatches().map((batch) => batch.id));
        if (existingStudents.length === 0 && SAMPLE_BATCHES.every((batch) => batchIds.has(batch.id))) {
            SAMPLE_STUDENTS.forEach((student) => {
                storage.addStudent(student);
                result.studentsAdded += 1;
            });
        }

        const studentIds = new Set(storage.getStudents().map((student) => student.id));
        const currentStudents = storage.getStudents();
        const matchingSampleStudents = SAMPLE_STUDENTS.every((sampleStudent) => {
            const current = currentStudents.find((student) => student.id === sampleStudent.id);
            return studentIds.has(sampleStudent.id)
                && current.studentName === sampleStudent.studentName
                && current.contactNo === sampleStudent.contactNo
                && current.totalFees === sampleStudent.totalFees
                && current.batchId === sampleStudent.batchId;
        });
        if (existingPayments.length === 0 && matchingSampleStudents) {
            SAMPLE_PAYMENTS.forEach((payment) => {
                storage.addPayment(payment);
                result.paymentsAdded += 1;
            });
        }

        return result;
    }

    root.FeeTrackSampleData = Object.freeze({
        initializeSampleData
    });

    // Pages opt into automatic demo data by marking this script with data-auto-seed.
    // The initializer only fills empty collections and never replaces saved records.
    if (root.document && root.document.currentScript
        && root.document.currentScript.hasAttribute("data-auto-seed")) {
        initializeSampleData();
    }
}(window));
