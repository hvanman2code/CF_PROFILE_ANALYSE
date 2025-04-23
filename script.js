let problemLevelChart, verdictChart, ratingChangeChart, problemRatingChart, problemTypeChart, skillRatingChart;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize particles.js with optimized settings
    if (window.innerWidth > 768) {
        particlesJS('particles-js', {
            particles: {
                number: { value: 50, density: { enable: true, value_area: 1000 } },
                color: { value: ['#00ddeb', '#ff007a'] },
                shape: { type: 'circle' },
                opacity: { value: 0.5, random: true },
                size: { value: 3, random: true },
                line_linked: { enable: true, distance: 150, color: '#00ddeb', opacity: 0.4, width: 1 },
                move: { enable: true, speed: 1.5, direction: 'none', random: false, straight: false, out_mode: 'out', bounce: false }
            },
            interactivity: {
                detect_on: 'canvas',
                events: { onhover: { enable: true, mode: 'repulse' }, onclick: { enable: true, mode: 'push' }, resize: true },
                modes: { repulse: { distance: 100, duration: 0.4 }, push: { particles_nb: 4 } }
            },
            retina_detect: true
        });
    }

    // Scroll animation for charts
    const chartContainers = document.querySelectorAll('.chart-container');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    chartContainers.forEach(container => observer.observe(container));
});

async function analyzeProfile() {
    const handle = document.getElementById('handle')?.value.trim();
    const reportDiv = document.getElementById('report');
    const basicInfoDiv = document.getElementById('basic-info');
    const loadingDiv = document.getElementById('loading');

    if (!handle) {
        alert('Please enter a valid Codeforces handle!');
        return;
    }
    if (!reportDiv || !basicInfoDiv || !loadingDiv) {
        console.error('Required elements not found in DOM');
        return;
    }

    reportDiv.style.display = 'none';
    reportDiv.classList.remove('visible');
    loadingDiv.style.display = 'block';

    try {
        const userInfo = await fetchUserInfo(handle);
        const submissions = await fetchUserSubmissions(handle);
        const ratingHistory = await fetchRatingHistory(handle);

        const analysis = await analyzeData(userInfo, submissions, ratingHistory);

        displayReport(analysis, basicInfoDiv);
        renderCharts(analysis);

        loadingDiv.style.display = 'none';
        reportDiv.style.display = 'block';
        setTimeout(() => reportDiv.classList.add('visible'), 10);

    } catch (error) {
        loadingDiv.style.display = 'none';
        basicInfoDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        reportDiv.style.display = 'block';
        reportDiv.classList.add('visible');
    }
}

async function fetchUserInfo(handle) {
    const response = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
    const data = await response.json();
    if (data.status !== 'OK') throw new Error('User not found or API error');
    return data.result[0];
}

async function fetchUserSubmissions(handle) {
    const response = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
    const data = await response.json();
    if (data.status !== 'OK') throw new Error('Submissions not found or API error');
    return data.result;
}

async function fetchRatingHistory(handle) {
    const response = await fetch(`https://codeforces.com/api/user.rating?handle=${handle}`);
    const data = await response.json();
    if (data.status !== 'OK') throw new Error('Rating history not found or API error');
    return data.result;
}

async function analyzeData(userInfo, submissions, ratingHistory) {
    const totalSubmissions = submissions.length;
    const problemLevels = {};
    const problemRatings = {};
    const problemTypes = {};
    const skillRatingByTopic = {};
    const attemptedProblemTypes = {};
    const verdicts = {
        accepted: 0, wrongAnswer: 0, timeLimitExceeded: 0, compilationError: 0,
        runtimeError: 0, memoryLimitExceeded: 0, idlenessLimitExceeded: 0, challenged: 0
    };

    const topicAttempts = {};
    const topicSuccesses = {};
    const topicRatings = {};

    submissions.forEach(sub => {
        if (sub.verdict === 'OK') verdicts.accepted++;
        else if (sub.verdict === 'WRONG_ANSWER') verdicts.wrongAnswer++;
        else if (sub.verdict === 'TIME_LIMIT_EXCEEDED') verdicts.timeLimitExceeded++;
        else if (sub.verdict === 'COMPILATION_ERROR') verdicts.compilationError++;
        else if (sub.verdict === 'RUNTIME_ERROR') verdicts.runtimeError++;
        else if (sub.verdict === 'MEMORY_LIMIT_EXCEEDED') verdicts.memoryLimitExceeded++;
        else if (sub.verdict === 'IDLENESS_LIMIT_EXCEEDED') verdicts.idlenessLimitExceeded++;
        else if (sub.verdict === 'CHALLENGED') verdicts.challenged++;

        if (sub.problem) {
            if (sub.verdict === 'OK') {
                if (sub.problem.index) {
                    problemLevels[sub.problem.index] = (problemLevels[sub.problem.index] || 0) + 1;
                }
                if (sub.problem.rating) {
                    const rating = sub.problem.rating;
                    problemRatings[rating] = (problemRatings[rating] || 0) + 1;
                    if (sub.problem.tags) {
                        sub.problem.tags.forEach(tag => {
                            problemTypes[tag] = (problemTypes[tag] || 0) + 1;
                            topicRatings[tag] = topicRatings[tag] || [];
                            topicRatings[tag].push(rating);
                            topicSuccesses[tag] = (topicSuccesses[tag] || 0) + 1;
                        });
                    }
                }
            }
            if (sub.problem.tags) {
                sub.problem.tags.forEach(tag => {
                    attemptedProblemTypes[tag] = (attemptedProblemTypes[tag] || 0) + 1;
                    topicAttempts[tag] = (topicAttempts[tag] || 0) + 1;
                });
            }
        }
    });

    for (let tag in problemTypes) {
        const successRate = topicSuccesses[tag] / topicAttempts[tag] || 0;
        const ratings = topicRatings[tag] || [];
        const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;
        const solvedCount = problemTypes[tag] || 0;
        const volumeFactor = Math.min(1, solvedCount / 3); // Softer penalty, maxes out at 3 problems

        // Calculate consistency bonus/penalty based on standard deviation
        const meanRating = avgRating;
        const variance = ratings.length > 1 
            ? ratings.reduce((sum, r) => sum + Math.pow(r - meanRating, 2), 0) / (ratings.length - 1) 
            : 0;
        const stdDev = Math.sqrt(variance);
        let consistencyBonus = 0;
        if (stdDev < 200) {
            consistencyBonus = 100; // Bonus for high consistency
        } else if (stdDev > 400) {
            consistencyBonus = -50; // Penalty for low consistency
        } else {
            // Linear interpolation between -50 and 100 for stdDev between 200 and 400
            consistencyBonus = 100 - ((stdDev - 200) / 200) * 150;
        }

        // Calculate skill rating with revised formula
        const successMultiplier = (successRate * 0.2) + 0.8; // Ranges from 0.8 to 1.0
        let skillRating = (avgRating * successMultiplier + consistencyBonus) * volumeFactor + 200;
        
        // Clamp the rating between 800 and 3500
        skillRating = Math.max(800, Math.min(3500, Math.round(skillRating)));
        skillRatingByTopic[tag] = skillRating;
    }

    const ratingChanges = ratingHistory.map(entry => ({
        contestName: entry.contestName,
        rating: entry.newRating,
        date: new Date(entry.ratingUpdateTimeSeconds * 1000).toLocaleDateString()
    }));

    return {
        handle: userInfo.handle,
        rating: userInfo.rating || 'Unrated',
        maxRating: userInfo.maxRating || 'Unrated',
        rank: userInfo.rank || 'Unranked',
        totalSubmissions,
        acceptedSubmissions: verdicts.accepted,
        acceptanceRate: totalSubmissions ? (verdicts.accepted / totalSubmissions * 100).toFixed(2) : 0,
        verdicts,
        problemLevels,
        problemRatings,
        problemTypes,
        skillRatingByTopic,
        ratingChanges
    };
}

function displayReport(analysis, basicInfoDiv) {
    basicInfoDiv.innerHTML = `
        <h2>Analysis Report for ${analysis.handle}</h2>
        <p><strong>Current Rating:</strong> ${analysis.rating}</p>
        <p><strong>Max Rating:</strong> ${analysis.maxRating}</p>
        <p><strong>Rank:</strong> ${analysis.rank}</p>
        <p><strong>Total Submissions:</strong> ${analysis.totalSubmissions}</p>
        <p><strong>Acceptance Rate:</strong> ${analysis.acceptanceRate}%</p>
    `;
}

function renderCharts(analysis) {
    const textColor = '#e0e0e0';
    const gridColor = 'rgba(255, 255, 255, 0.1)';
    const tooltipBgColor = 'rgba(0, 0, 0, 0.9)';
    const tooltipTextColor = '#e0e0e0';

    const problemLevelCanvas = document.getElementById('problemLevelChart');
    const verdictCanvas = document.getElementById('verdictChart');
    const ratingChangeCanvas = document.getElementById('ratingChangeChart');
    const problemRatingCanvas = document.getElementById('problemRatingChart');
    const problemTypeCanvas = document.getElementById('problemTypeChart');
    const skillRatingCanvas = document.getElementById('skillRatingChart');

    if (!problemLevelCanvas || !verdictCanvas || !ratingChangeCanvas || !problemRatingCanvas || !problemTypeCanvas || !skillRatingCanvas) {
        console.error('One or more canvas elements not found');
        return;
    }

    if (problemLevelChart) problemLevelChart.destroy();
    if (verdictChart) verdictChart.destroy();
    if (ratingChangeChart) ratingChangeChart.destroy();
    if (problemRatingChart) problemRatingChart.destroy();
    if (problemTypeChart) problemTypeChart.destroy();
    if (skillRatingChart) skillRatingChart.destroy();

    // Problem Level Chart (Bar)
    problemLevelChart = new Chart(problemLevelCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(analysis.problemLevels),
            datasets: [{
                label: 'Problems Solved',
                data: Object.values(analysis.problemLevels),
                backgroundColor: 'rgba(0, 221, 235, 0.8)',
                borderColor: '#00ddeb',
                borderWidth: 2,
                shadowColor: 'rgba(0, 221, 235, 0.5)',
                shadowBlur: 10
            }]
        },
        options: {
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Problems', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } },
                x: { title: { display: true, text: 'Problem Level', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                title: { display: true, text: 'Solved Problems by Level', font: { size: 18 }, color: textColor },
                legend: { labels: { color: textColor } },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: tooltipTextColor,
                    bodyColor: tooltipTextColor,
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    borderColor: '#00ddeb',
                    borderWidth: 1
                }
            }
        }
    });

    // Verdict Chart (Pie)
    verdictChart = new Chart(verdictCanvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: [
                'Accepted',
                'Wrong Answer',
                'Time Limit Exceeded',
                'Compilation Error',
                'Runtime Error',
                'Memory Limit Exceeded',
                'Idleness Limit Exceeded',
                'Challenged'
            ],
            datasets: [{
                data: [
                    analysis.verdicts.accepted,
                    analysis.verdicts.wrongAnswer,
                    analysis.verdicts.timeLimitExceeded,
                    analysis.verdicts.compilationError,
                    analysis.verdicts.runtimeError,
                    analysis.verdicts.memoryLimitExceeded,
                    analysis.verdicts.idlenessLimitExceeded,
                    analysis.verdicts.challenged
                ],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.8)',
                    'rgba(220, 53, 69, 0.8)',
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(108, 117, 125, 0.8)',
                    'rgba(23, 162, 184, 0.8)',
                    'rgba(253, 126, 20, 0.8)',
                    'rgba(102, 16, 242, 0.8)',
                    'rgba(232, 62, 140, 0.8)'
                ],
                borderColor: '#fff',
                borderWidth: 2,
                shadowColor: 'rgba(0, 221, 235, 0.5)',
                shadowBlur: 10
            }]
        },
        options: {
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 2000
            },
            plugins: {
                title: { display: true, text: 'Submission Verdicts', font: { size: 18 }, color: textColor },
                legend: { labels: { color: textColor } },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: tooltipTextColor,
                    bodyColor: tooltipTextColor,
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    borderColor: '#00ddeb',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // Rating Change Chart (Line)
    ratingChangeChart = new Chart(ratingChangeCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: analysis.ratingChanges.map(entry => entry.date),
            datasets: [{
                label: 'Rating',
                data: analysis.ratingChanges.map(entry => entry.rating),
                fill: true,
                backgroundColor: 'rgba(0, 221, 235, 0.2)',
                borderColor: '#00ddeb',
                tension: 0.3,
                pointBackgroundColor: '#00ddeb',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 8,
                shadowColor: 'rgba(0, 221, 235, 0.5)',
                shadowBlur: 10
            }]
        },
        options: {
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            },
            scales: {
                y: { beginAtZero: false, title: { display: true, text: 'Rating', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } },
                x: { title: { display: true, text: 'Contest Date', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                title: { display: true, text: 'Rating Change Over Time', font: { size: 18 }, color: textColor },
                legend: { labels: { color: textColor } },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: tooltipTextColor,
                    bodyColor: tooltipTextColor,
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    borderColor: '#00ddeb',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const entry = analysis.ratingChanges[context.dataIndex];
                            return `${entry.contestName}: ${entry.rating}`;
                        }
                    }
                }
            }
        }
    });

    // Problem Rating Chart (Histogram)
    const ratingLabels = [];
    const ratingData = [];
    for (let rating = 800; rating <= 3500; rating += 100) {
        ratingLabels.push(rating);
        ratingData.push(analysis.problemRatings[rating] || 0);
    }

    problemRatingChart = new Chart(problemRatingCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ratingLabels,
            datasets: [{
                label: 'Problems Solved',
                data: ratingData,
                backgroundColor: ratingLabels.map(rating => {
                    if (rating <= 1200) return 'rgba(108, 117, 125, 0.8)';
                    if (rating <= 1400) return 'rgba(40, 167, 69, 0.8)';
                    if (rating <= 1600) return 'rgba(23, 162, 184, 0.8)';
                    return 'rgba(111, 66, 193, 0.8)';
                }),
                borderWidth: 0,
                shadowColor: 'rgba(0, 221, 235, 0.5)',
                shadowBlur: 10
            }]
        },
        options: {
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Problems', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } },
                x: { title: { display: true, text: 'Problem Rating', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                title: { display: true, text: 'Problem Ratings Distribution', font: { size: 18 }, color: textColor },
                legend: { labels: { color: textColor } },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: tooltipTextColor,
                    bodyColor: tooltipTextColor,
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    borderColor: '#00ddeb',
                    borderWidth: 1
                }
            }
        }
    });

    // Problem Types Chart (Horizontal Bar)
    const sortedTypes = Object.entries(analysis.problemTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    problemTypeChart = new Chart(problemTypeCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedTypes.map(entry => entry[0]),
            datasets: [{
                label: 'Problems Solved',
                data: sortedTypes.map(entry => entry[1]),
                backgroundColor: [
                    'rgba(220, 53, 69, 0.8)',
                    'rgba(23, 162, 184, 0.8)',
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(40, 167, 69, 0.8)',
                    'rgba(108, 117, 125, 0.8)',
                    'rgba(253, 126, 20, 0.8)',
                    'rgba(102, 16, 242, 0.8)',
                    'rgba(232, 62, 140, 0.8)',
                    'rgba(32, 201, 151, 0.8)',
                    'rgba(0, 123, 255, 0.8)'
                ],
                borderWidth: 0,
                shadowColor: 'rgba(0, 221, 235, 0.5)',
                shadowBlur: 10
            }]
        },
        options: {
            indexAxis: 'y',
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'Number of Problems', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } },
                y: { title: { display: true, text: 'Problem Type', color: textColor, font: { size: 14 } }, ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                title: { display: true, text: 'Problem Types Distribution', font: { size: 18 }, color: textColor },
                legend: { labels: { color: textColor } },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: tooltipTextColor,
                    bodyColor: tooltipTextColor,
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    borderColor: '#00ddeb',
                    borderWidth: 1
                }
            }
        }
    });

    // Skill Rating Chart (Horizontal Bar)
    const sortedSkills = Object.entries(analysis.skillRatingByTopic)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    const typeColors = [
        'rgba(220, 53, 69, 0.8)',   // Red
        'rgba(23, 162, 184, 0.8)',  // Cyan
        'rgba(255, 193, 7, 0.8)',   // Yellow
        'rgba(40, 167, 69, 0.8)',   // Green
        'rgba(108, 117, 125, 0.8)', // Gray
        'rgba(253, 126, 20, 0.8)',  // Orange
        'rgba(102, 16, 242, 0.8)',  // Purple
        'rgba(232, 62, 140, 0.8)',  // Pink
        'rgba(32, 201, 151, 0.8)',  // Teal
        'rgba(0, 123, 255, 0.8)'    // Blue
    ];
    skillRatingChart = new Chart(skillRatingCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedSkills.map(entry => entry[0]),
            datasets: [{
                label: 'Skill Rating',
                data: sortedSkills.map(entry => entry[1]),
                backgroundColor: sortedSkills.map((_, index) => typeColors[index % typeColors.length]),
                borderWidth: 0,
                shadowColor: 'rgba(0, 221, 235, 0.5)',
                shadowBlur: 10
            }]
        },
        options: {
            indexAxis: 'y',
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            },
            scales: {
                x: { 
                    min: 0, // Start at 0 to make 800 visible
                    max: 3500,
                    title: { display: true, text: 'Skill Rating', color: textColor, font: { size: 14 } }, 
                    ticks: { color: textColor, stepSize: 500 }, 
                    grid: { color: gridColor } 
                },
                y: { 
                    title: { display: true, text: 'Topic', color: textColor, font: { size: 14 } }, 
                    ticks: { color: textColor }, 
                    grid: { color: gridColor } 
                }
            },
            plugins: {
                title: { display: true, text: 'Skill Rating by Topic', font: { size: 18 }, color: textColor },
                legend: { labels: { color: textColor } },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: tooltipTextColor,
                    bodyColor: tooltipTextColor,
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    borderColor: '#00ddeb',
                    borderWidth: 1,
                    callbacks: {
                        label: context => `Skill Rating: ${context.raw}`
                    }
                }
            }
        }
    });
}