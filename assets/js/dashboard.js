"use strict";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0
});

const chartFont = {
    family: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    size: 10
};

const gridColor = "#eef2f7";

function formatLkr(value) {
    return currencyFormatter.format(value).replace("LKR", "Rs.");
}

function renderCollectionChart() {
    const canvas = document.getElementById("collection-chart");
    if (!canvas) {
        return;
    }

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            datasets: [{
                label: "Collected",
                data: [580000, 720000, 660000, 950000, 880000, 1110000, 1000000, 1220000, 1080000, 1370000, 1280000, 1570000],
                backgroundColor: (context) => context.dataIndex === 9 ? "#2563eb" : "#b9d1ff",
                hoverBackgroundColor: "#2563eb",
                borderRadius: 5,
                borderSkipped: false,
                maxBarThickness: 24
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            interaction: { intersect: false, mode: "index" },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#172b4d",
                    padding: 10,
                    cornerRadius: 7,
                    titleFont: { ...chartFont, weight: "600" },
                    bodyFont: chartFont,
                    callbacks: {
                        label: (context) => ` ${formatLkr(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    border: { display: false },
                    ticks: { color: "#94a3b8", font: chartFont, maxRotation: 0 }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: 1600000,
                    grid: { color: gridColor, drawBorder: false },
                    border: { display: false, dash: [3, 4] },
                    ticks: {
                        color: "#94a3b8",
                        font: chartFont,
                        maxTicksLimit: 5,
                        callback: (value) => value === 0 ? "0" : `Rs. ${(value / 1000000).toFixed(1)}M`
                    }
                }
            }
        }
    });
}

function renderPaymentStatusChart() {
    const canvas = document.getElementById("status-chart");
    if (!canvas) {
        return;
    }

    new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: ["Paid", "Partial", "Pending"],
            datasets: [{
                data: [692, 170, 386],
                backgroundColor: ["#16a34a", "#f59e0b", "#dc2626"],
                hoverBackgroundColor: ["#15803d", "#d97706", "#b91c1c"],
                borderWidth: 3,
                borderColor: "#ffffff",
                hoverOffset: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            cutout: "77%",
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#172b4d",
                    padding: 10,
                    cornerRadius: 7,
                    titleFont: { ...chartFont, weight: "600" },
                    bodyFont: chartFont,
                    callbacks: {
                        label: (context) => ` ${context.label}: ${context.parsed} students (${((context.parsed / 1248) * 100).toFixed(1)}%)`
                    }
                }
            }
        }
    });
}

function renderBatchChart() {
    const canvas = document.getElementById("batch-chart");
    if (!canvas) {
        return;
    }

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["Grade 9", "Grade 10", "Grade 11", "Grade 12", "Other"],
            datasets: [{
                data: [286, 314, 248, 225, 175],
                backgroundColor: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f472b6"],
                borderRadius: 4,
                borderSkipped: false,
                maxBarThickness: 22
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            indexAxis: "y",
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#172b4d",
                    padding: 9,
                    cornerRadius: 7,
                    titleFont: { ...chartFont, weight: "600" },
                    bodyFont: chartFont,
                    callbacks: {
                        label: (context) => ` ${context.parsed.x} students`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 350,
                    grid: { color: gridColor, drawBorder: false },
                    border: { display: false },
                    ticks: { color: "#94a3b8", font: chartFont, maxTicksLimit: 5, precision: 0 }
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: "#64748b", font: chartFont }
                }
            }
        }
    });
}

function initializeSidebar() {
    const toggle = document.querySelector("[data-sidebar-toggle]");
    const backdrop = document.querySelector("[data-sidebar-close]");

    if (!toggle || !backdrop) {
        return;
    }

    const setOpen = (isOpen) => {
        document.body.classList.toggle("sidebar-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    };

    toggle.addEventListener("click", () => {
        setOpen(!document.body.classList.contains("sidebar-open"));
    });
    backdrop.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setOpen(false);
        }
    });
    document.querySelectorAll(".sidebar .nav-link").forEach((link) => {
        link.addEventListener("click", () => {
            if (window.matchMedia("(max-width: 900px)").matches) {
                setOpen(false);
            }
        });
    });
}

function setCurrentDate() {
    const dateElement = document.querySelector("[data-current-date]");
    if (dateElement) {
        dateElement.textContent = new Intl.DateTimeFormat("en-LK", {
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(new Date());
    }
}

function initializeDashboard() {
    if (typeof Chart === "undefined") {
        console.error("Dashboard charts could not load because Chart.js is unavailable.");
    } else {
        renderCollectionChart();
        renderPaymentStatusChart();
        renderBatchChart();
    }

    initializeSidebar();
    setCurrentDate();
}

document.addEventListener("DOMContentLoaded", initializeDashboard);
