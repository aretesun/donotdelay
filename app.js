// State
let goals = JSON.parse(localStorage.getItem('goals')) || [];
let currentImportance = 3;
let currentTheme = localStorage.getItem('theme') || 'light';
let currentTab = 'all';

// Pomodoro State
let pomodoroState = {
    mode: 'focus', // 'focus' or 'break' or 'longBreak'
    isRunning: false,
    isPaused: false,
    timeRemaining: 25 * 60, // seconds
    totalTime: 25 * 60,
    sessions: 0,
    totalFocusTime: 0, // in minutes
    currentGoalId: null, // for integrated mode
    timerInterval: null
};

// Pomodoro settings
const POMODORO_TIMES = {
    focus: 25 * 60,
    break: 5 * 60,
    longBreak: 15 * 60
};

// Load pomodoro stats
let pomodoroStats = JSON.parse(localStorage.getItem('pomodoroStats')) || {
    todaySessions: 0,
    totalFocusMinutes: 0,
    lastSessionDate: null
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Set theme
    document.documentElement.setAttribute('data-theme', currentTheme);

    // Setup canvas
    setupConfettiCanvas();

    // Setup event listeners
    setupEventListeners();

    // Initialize pomodoro
    initPomodoro();

    // Initialize pomodoro collapsed state
    initPomodoroCollapsedState();

    // Initialize ambient sounds
    initAmbientSounds();

    // Request notification permission
    requestNotificationPermission();

    // Render goals
    renderAllGoals();

    // Update statistics
    updateStatistics();
}

// Event Listeners
function setupEventListeners() {
    // Dark mode toggle
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);

    // Importance selector
    document.querySelectorAll('.importance-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.importance-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentImportance = parseInt(this.dataset.level);
        });
    });

    // Add goal
    document.getElementById('add-goal-btn').addEventListener('click', addGoal);

    // Enter key to add goal
    document.getElementById('goal-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addGoal();
        }
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Pomodoro controls
    const pomodoroStart = document.getElementById('pomodoro-start');
    const pomodoroPause = document.getElementById('pomodoro-pause');
    const pomodoroReset = document.getElementById('pomodoro-reset');

    if (pomodoroStart) pomodoroStart.addEventListener('click', startPomodoro);
    if (pomodoroPause) pomodoroPause.addEventListener('click', pausePomodoro);
    if (pomodoroReset) pomodoroReset.addEventListener('click', resetPomodoro);

    // Mode switchers
    const focusBtn = document.getElementById('mode-focus');
    const breakBtn = document.getElementById('mode-break');
    const longBreakBtn = document.getElementById('mode-longbreak');

    if (focusBtn) focusBtn.addEventListener('click', () => switchMode('focus'));
    if (breakBtn) breakBtn.addEventListener('click', () => switchMode('break'));
    if (longBreakBtn) longBreakBtn.addEventListener('click', () => switchMode('longBreak'));

    // Pomodoro toggle
    const pomodoroToggle = document.getElementById('pomodoro-toggle');
    if (pomodoroToggle) {
        pomodoroToggle.addEventListener('click', togglePomodoroSection);
    }
}

// Dark Mode
function toggleDarkMode() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

// Add Goal
function addGoal() {
    const input = document.getElementById('goal-input');
    const goalText = input.value.trim();

    if (!goalText) {
        alert('목표를 입력해주세요!');
        return;
    }

    const estimatedTime = document.getElementById('estimated-time').value;

    const newGoal = {
        id: Date.now(),
        text: goalText,
        estimatedTime: parseInt(estimatedTime),
        importance: currentImportance,
        createdAt: new Date().toISOString(),
        delayCount: 0,
        status: 'active' // active, completed
    };

    goals.push(newGoal);
    saveGoals();
    input.value = '';

    renderAllGoals();
    updateStatistics();
}

// Complete Goal
function completeGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.status = 'completed';
    goal.completedAt = new Date().toISOString();

    // Calculate total time taken
    let startTime = new Date(goal.createdAt);

    // If delayed 5 times, use final timer start time
    if (goal.finalTimerStartedAt) {
        startTime = new Date(goal.finalTimerStartedAt);
    }

    const endTime = new Date(goal.completedAt);
    const totalMinutes = Math.round((endTime - startTime) / (60 * 1000));
    goal.totalTimeTaken = totalMinutes;

    saveGoals();

    // Show confetti!
    launchConfetti();

    renderAllGoals();
    updateStatistics();
}

// Delay Goal
function delayGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    // Check if can delay
    const canDelayResult = canDelayGoal(goal);

    if (!canDelayResult.canDelay) {
        alert(canDelayResult.message);
        return;
    }

    // Check if already delayed 5 times
    if (goal.delayCount >= 5) {
        alert('안돼요! 이젠 정말 끝내야 합니다! 🚨\n더 이상 미룰 수 없어요!');
        return;
    }

    goal.delayCount++;
    goal.lastDelayedAt = new Date().toISOString();

    // Start final timer after 5th delay
    if (goal.delayCount === 5) {
        goal.finalTimerStartedAt = new Date().toISOString();
        alert('⚠️ 마지막 기회입니다!\n5번 미뤘어요. 이제 타이머가 시작됩니다!\n더 이상 미루기는 불가능합니다!');
    }

    saveGoals();

    // Show emoji rain!
    launchEmojiRain();

    renderAllGoals();
    updateStatistics();

    // Add animation only once per delay
    const goalCard = document.querySelector(`[data-goal-id="${goalId}"]`);
    if (goalCard && !goalCard.classList.contains('is-animating')) {
        goalCard.classList.add('is-animating');
        setTimeout(() => {
            goalCard.classList.remove('is-animating');
        }, 600);
    }
}

// Check if goal can be delayed
function canDelayGoal(goal) {
    const now = new Date();
    const createdAt = new Date(goal.createdAt);
    const estimatedTimeMs = goal.estimatedTime * 60 * 1000; // minutes to milliseconds

    // Check if estimated time has passed
    const timeSinceCreation = now - createdAt;
    if (timeSinceCreation < estimatedTimeMs) {
        const remainingMinutes = Math.ceil((estimatedTimeMs - timeSinceCreation) / (60 * 1000));
        return {
            canDelay: false,
            message: `아직 예상 시간이 지나지 않았어요!\n${remainingMinutes}분 후에 미루기가 가능합니다.`
        };
    }

    // Check if 1 hour has passed since last delay
    if (goal.lastDelayedAt) {
        const lastDelayedAt = new Date(goal.lastDelayedAt);
        const timeSinceLastDelay = now - lastDelayedAt;
        const oneHourMs = 60 * 60 * 1000;

        if (timeSinceLastDelay < oneHourMs) {
            const remainingMinutes = Math.ceil((oneHourMs - timeSinceLastDelay) / (60 * 1000));
            return {
                canDelay: false,
                message: `미루기는 1시간에 한 번만 가능해요!\n${remainingMinutes}분 후에 다시 미루기가 가능합니다.`
            };
        }
    }

    return { canDelay: true };
}

// Delete Goal
function deleteGoal(goalId) {
    const confirmDelete = confirm('목표를 삭제하시겠어요?');
    if (!confirmDelete) return;

    goals = goals.filter(g => g.id !== goalId);
    saveGoals();

    renderAllGoals();
    updateStatistics();
}

// Tab Switching
function switchTab(tabName) {
    currentTab = tabName;

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Render All Goals
function renderAllGoals() {
    renderActiveGoals();
    renderDelayingGoals();
    renderCompletedGoals();
}

// Render Active Goals
function renderActiveGoals() {
    const container = document.getElementById('active-goals-list');
    const empty = document.getElementById('all-empty');
    const activeGoals = goals.filter(g => g.status === 'active');

    if (activeGoals.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    container.innerHTML = activeGoals.map(goal => createGoalCard(goal)).join('');

    // Add event listeners - search within container
    activeGoals.forEach(goal => {
        const goalCard = container.querySelector(`[data-goal-id="${goal.id}"]`);
        if (!goalCard) return;

        const pomodoroBtn = goalCard.querySelector('.btn-pomodoro-small');
        const pomodoroStopBtn = goalCard.querySelector('.btn-pomodoro-stop-small');
        const completeBtn = goalCard.querySelector('.btn-complete-small');
        const delayBtn = goalCard.querySelector('.btn-delay-small');
        const shareBtn = goalCard.querySelector('.btn-share-small');
        const deleteBtn = goalCard.querySelector('.btn-delete-small');

        if (pomodoroBtn) {
            pomodoroBtn.addEventListener('click', () => startPomodoroForGoal(goal.id));
        }
        if (pomodoroStopBtn) {
            pomodoroStopBtn.addEventListener('click', () => stopPomodoroForGoal());
        }
        if (completeBtn) {
            completeBtn.addEventListener('click', () => completeGoal(goal.id));
        }
        if (delayBtn) {
            delayBtn.addEventListener('click', () => delayGoal(goal.id));
        }
        if (shareBtn) {
            shareBtn.addEventListener('click', () => shareGoal(goal.id));
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteGoal(goal.id));
        }
    });

    updateFinalTimers();
}

// Render Delaying Goals
function renderDelayingGoals() {
    const container = document.getElementById('delaying-goals-list');
    const empty = document.getElementById('delaying-empty');
    const warning = document.getElementById('delaying-warning');
    const delayingGoals = goals.filter(g => g.status === 'active' && g.delayCount > 0)
        .sort((a, b) => b.delayCount - a.delayCount);

    if (delayingGoals.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        if (warning) warning.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    if (warning) warning.style.display = 'block';
    container.innerHTML = delayingGoals.map(goal => createGoalCard(goal)).join('');

    // Add event listeners - search within container
    delayingGoals.forEach(goal => {
        const goalCard = container.querySelector(`[data-goal-id="${goal.id}"]`);
        if (!goalCard) {
            console.warn(`Goal card not found for goal ${goal.id}`);
            return;
        }

        const pomodoroBtn = goalCard.querySelector('.btn-pomodoro-small');
        const pomodoroStopBtn = goalCard.querySelector('.btn-pomodoro-stop-small');
        const completeBtn = goalCard.querySelector('.btn-complete-small');
        const delayBtn = goalCard.querySelector('.btn-delay-small');
        const shareBtn = goalCard.querySelector('.btn-share-small');
        const deleteBtn = goalCard.querySelector('.btn-delete-small');

        if (pomodoroBtn) {
            pomodoroBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Pomodoro start clicked for goal:', goal.id);
                startPomodoroForGoal(goal.id);
            });
        }
        if (pomodoroStopBtn) {
            pomodoroStopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Pomodoro stop clicked');
                stopPomodoroForGoal();
            });
        }
        if (completeBtn) {
            completeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                completeGoal(goal.id);
            });
        }
        if (delayBtn) {
            delayBtn.addEventListener('click', (e) => {
                e.preventDefault();
                delayGoal(goal.id);
            });
        }
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.preventDefault();
                shareGoal(goal.id);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                deleteGoal(goal.id);
            });
        }
    });

    updateFinalTimers();
}

// Render Completed Goals
function renderCompletedGoals() {
    const container = document.getElementById('completed-goals-list');
    const empty = document.getElementById('completed-empty');
    const completedGoals = goals.filter(g => g.status === 'completed')
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    if (completedGoals.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    container.innerHTML = completedGoals.map(goal => createCompletedGoalCard(goal)).join('');
}

// Create Goal Card
function createGoalCard(goal) {
    const delayClass = getDelayClass(goal.delayCount);
    const delayEmoji = getDelayEmoji(goal.delayCount);
    const isTimerActive = pomodoroState.currentGoalId === goal.id;

    return `
        <div class="goal-card ${delayClass} ${isTimerActive ? 'timer-active' : ''}" data-goal-id="${goal.id}">
            <div class="goal-header">
                <div class="goal-text">${delayEmoji} ${goal.text}</div>
                ${isTimerActive ? '<span class="timer-badge">🍅 타이머 작동 중</span>' : ''}
            </div>
            <div class="goal-meta">
                <span class="meta-item">⏱️ ${goal.estimatedTime}분</span>
                <span class="meta-item">${'⭐'.repeat(goal.importance)}</span>
                ${goal.delayCount > 0 ? `<span class="meta-item delay-badge ${goal.delayCount >= 4 ? 'critical' : ''}">😱 ${goal.delayCount}번 미룸!</span>` : ''}
                ${goal.finalTimerStartedAt ? '<span class="meta-item final-timer"></span>' : ''}
                ${goal.pomodoroSessions ? `<span class="meta-item pomodoro-sessions">🍅 ${goal.pomodoroSessions} 세션</span>` : ''}
            </div>
            <div class="goal-actions">
                ${!isTimerActive ? '<button class="btn-small btn-pomodoro-small">🍅 타이머 시작</button>' : '<button class="btn-small btn-pomodoro-stop-small">⏹️ 타이머 중지</button>'}
                <button class="btn-small btn-complete-small">✅ 완료</button>
                <button class="btn-small btn-delay-small">⏭️ 미루기</button>
                <button class="btn-small btn-share-small">📤 공유</button>
                <button class="btn-small btn-delete-small">🗑️</button>
            </div>
        </div>
    `;
}

// Create Completed Goal Card
function createCompletedGoalCard(goal) {
    const date = new Date(goal.completedAt);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    // Format total time taken
    let timeDisplay = '';
    if (goal.totalTimeTaken !== undefined) {
        if (goal.totalTimeTaken < 60) {
            timeDisplay = `${goal.totalTimeTaken}분`;
        } else {
            const hours = Math.floor(goal.totalTimeTaken / 60);
            const mins = goal.totalTimeTaken % 60;
            timeDisplay = mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
        }
    }

    return `
        <div class="goal-card">
            <div class="goal-header">
                <div class="goal-text">✅ ${goal.text}</div>
            </div>
            <div class="goal-meta">
                <span class="meta-item">⏱️ 예상 ${goal.estimatedTime}분</span>
                ${goal.totalTimeTaken !== undefined ? `<span class="meta-item" style="background: #6366f1; color: white;">⏳ 실제 ${timeDisplay}</span>` : ''}
                <span class="meta-item">${'⭐'.repeat(goal.importance)}</span>
                <span class="meta-item">📅 ${dateStr}</span>
                ${goal.delayCount === 0 ? 
                    '<span class="meta-item" style="background: #10b981; color: white;">🎯 바로 완료!</span>' : 
                    `<span class="meta-item delay-badge">${goal.delayCount}번 미룸</span>`
                }
            </div>
        </div>
    `;
}

// Get Delay Class
function getDelayClass(count) {
    if (count === 0) return '';
    if (count === 1) return 'delay-1';
    if (count === 2) return 'delay-2';
    if (count === 3) return 'delay-3';
    return 'delay-4plus';
}

// Get Delay Emoji
function getDelayEmoji(count) {
    if (count === 0) return '';
    if (count === 1) return '😅';
    if (count === 2) return '😰';
    if (count === 3) return '😱';
    return '🔥';
}

// Statistics
function updateStatistics() {
    const completed = goals.filter(g => g.status === 'completed');
    const active = goals.filter(g => g.status === 'active');
    const total = goals.length;

    // Total completed
    document.getElementById('total-completed').textContent = completed.length;

    // Completion rate
    const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;
    document.getElementById('completion-rate').textContent = `${completionRate}%`;

    // Current streak
    const streak = calculateStreak();
    document.getElementById('current-streak').textContent = `${streak}일`;

    // Average delays
    const avgDelays = completed.length > 0
        ? (completed.reduce((sum, g) => sum + (g.delayCount || 0), 0) / completed.length).toFixed(1)
        : 0;
    document.getElementById('avg-delays').textContent = avgDelays;
}

// Calculate Streak
function calculateStreak() {
    const completed = goals.filter(g => g.status === 'completed').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    if (completed.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < completed.length; i++) {
        const goalDate = new Date(completed[i].completedAt);
        goalDate.setHours(0, 0, 0, 0);

        const daysDiff = Math.floor((currentDate - goalDate) / (1000 * 60 * 60 * 24));

        if (daysDiff === streak) {
            streak++;
        } else if (daysDiff > streak) {
            break;
        }
    }

    return streak;
}

// Storage
function saveGoals() {
    localStorage.setItem('goals', JSON.stringify(goals));
}

// ===== CONFETTI ANIMATION =====
let confettiCanvas, confettiCtx;
let confettiParticles = [];

function setupConfettiCanvas() {
    confettiCanvas = document.getElementById('confetti-canvas');
    confettiCtx = confettiCanvas.getContext('2d');
    resizeConfettiCanvas();
    window.addEventListener('resize', resizeConfettiCanvas);
}

function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}

function launchConfetti() {
    // Create particles
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

    for (let i = 0; i < 150; i++) {
        confettiParticles.push({
            x: confettiCanvas.width / 2,
            y: confettiCanvas.height / 2,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15 - 5,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4,
            gravity: 0.3,
            life: 200
        });
    }

    animateConfetti();
}

function animateConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    confettiParticles = confettiParticles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;
        p.life--;

        // Draw
        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.rotation * Math.PI / 180);
        confettiCtx.fillStyle = p.color;
        confettiCtx.globalAlpha = p.life / 200;
        confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        confettiCtx.restore();

        return p.life > 0 && p.y < confettiCanvas.height + 50;
    });

    if (confettiParticles.length > 0) {
        requestAnimationFrame(animateConfetti);
    }
}

// ===== EMOJI RAIN ANIMATION =====
function launchEmojiRain() {
    const container = document.getElementById('emoji-rain-container');
    const emojis = ['😱', '😰', '😨', '😓', '🥺', '😩', '😵‍💫', '😣', '😖', '😫'];

    const emojiCount = Math.floor(Math.random() * 20) + 30; // 30-50개

    for (let i = 0; i < emojiCount; i++) {
        const emoji = document.createElement('div');
        emoji.className = 'emoji-rain';
        emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        emoji.style.left = Math.random() * 100 + '%';
        emoji.style.animationDuration = (Math.random() * 2 + 2) + 's'; // 2-4초
        emoji.style.animationDelay = Math.random() * 0.5 + 's';

        container.appendChild(emoji);

        // Remove after animation
        setTimeout(() => {
            emoji.remove();
        }, 5000);
    }
}

// ===== SHARE GOAL =====
function getShareMessage(goal) {
    const delayCount = goal.delayCount;

    if (delayCount === 0) {
        return {
            message: `목표를 지금 막 시작했어요!\n응원해주세요! 💪`,
            emoji: '💪',
            color: '#10b981'
        };
    } else if (delayCount === 1) {
        return {
            message: `한 번 미뤘지만\n곧 할 거예요!`,
            emoji: '😅',
            color: '#fbbf24'
        };
    } else if (delayCount === 2) {
        return {
            message: `두 번 미뤘어요...\n좀 걱정되네요`,
            emoji: '😰',
            color: '#f59e0b'
        };
    } else if (delayCount === 3) {
        return {
            message: `세 번이나 미뤘어요!\n도와주세요!`,
            emoji: '😱',
            color: '#f97316'
        };
    } else {
        return {
            message: `${delayCount}번이나 미뤘어요!\n어쩜 좋아요!`,
            emoji: '🔥',
            color: '#ef4444'
        };
    }
}

async function shareGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    // Get share message
    const shareInfo = getShareMessage(goal);

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 1000);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 1000);

    // White card
    ctx.fillStyle = 'white';
    ctx.roundRect(50, 100, 700, 800, 30);
    ctx.fill();

    // App title
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⏰ 미루지마!', 400, 80);

    // Emoji
    ctx.font = '120px Arial';
    ctx.fillText(shareInfo.emoji, 400, 280);

    // Goal text
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 36px Arial';

    // Wrap text if too long
    const maxWidth = 600;
    const words = goal.text.split(' ');
    let line = '';
    let y = 380;

    for (let word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line, 400, y);
            line = word + ' ';
            y += 45;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, 400, y);

    // Delay count badge (if delayed)
    if (goal.delayCount > 0) {
        y += 80;
        ctx.fillStyle = shareInfo.color;
        ctx.roundRect(250, y - 40, 300, 60, 15);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 32px Arial';
        ctx.fillText(`${goal.delayCount}번 미룸`, 400, y);
        y += 60;
    } else {
        y += 60;
    }

    // Share message
    y += 40;
    ctx.fillStyle = '#6b7280';
    ctx.font = '28px Arial';
    const messageLines = shareInfo.message.split('\n');
    messageLines.forEach((line, index) => {
        ctx.fillText(line, 400, y + (index * 40));
    });

    // Meta info
    y = 750;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '24px Arial';
    ctx.fillText(`⏱️ ${goal.estimatedTime}분  |  ${'⭐'.repeat(goal.importance)}`, 400, y);

    // Footer
    ctx.fillStyle = '#d1d5db';
    ctx.font = '20px Arial';
    ctx.fillText('미루지 말고, 지금 하세요! 💪', 400, 920);

    // Convert to blob
    canvas.toBlob(async (blob) => {
        const file = new File([blob], 'goal-share.png', { type: 'image/png' });

        // Try Web Share API (mobile)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: '미루지마! - 내 목표 공유',
                    text: `${goal.text}\n${shareInfo.message}`
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share failed:', err);
                    downloadImage(blob);
                }
            }
        } else {
            // Fallback: Download
            downloadImage(blob);
        }
    });
}

function downloadImage(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `미루지마-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Show notification
    alert('이미지가 다운로드되었어요! 친구에게 공유해보세요! 📤');
}

// ===== FINAL TIMER =====
function updateFinalTimers() {
    const timerElements = document.querySelectorAll('.final-timer');
    timerElements.forEach(timerEl => {
        const goalCard = timerEl.closest('.goal-card');
        const goalId = parseInt(goalCard.dataset.goalId);
        const goal = goals.find(g => g.id === goalId);

        if (goal && goal.finalTimerStartedAt) {
            const startTime = new Date(goal.finalTimerStartedAt);
            const now = new Date();
            const diff = now - startTime;

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            timerEl.textContent = `🔥 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    });
}

setInterval(updateFinalTimers, 1000);

// ===== POMODORO TIMER =====

// Initialize Pomodoro
function initPomodoro() {
    updatePomodoroDisplay();
    updatePomodoroStats();

    // Check if we need to reset today's sessions
    const today = new Date().toDateString();
    if (pomodoroStats.lastSessionDate !== today) {
        pomodoroStats.todaySessions = 0;
        pomodoroStats.lastSessionDate = today;
        savePomodoroStats();
    }
}

// Start/Resume Timer
function startPomodoro() {
    if (pomodoroState.isRunning) return;

    pomodoroState.isRunning = true;
    pomodoroState.isPaused = false;

    // Add running class for animation
    const timerContainer = document.getElementById('pomodoro-timer-container');
    if (timerContainer) {
        timerContainer.classList.add('running');
    }

    pomodoroState.timerInterval = setInterval(() => {
        pomodoroState.timeRemaining--;

        if (pomodoroState.timeRemaining <= 0) {
            completeSession();
        }

        updatePomodoroDisplay();
    }, 1000);

    updatePomodoroButtons();
}

// Pause Timer
function pausePomodoro() {
    if (!pomodoroState.isRunning) return;

    pomodoroState.isRunning = false;
    pomodoroState.isPaused = true;
    clearInterval(pomodoroState.timerInterval);

    // Remove running class
    const timerContainer = document.getElementById('pomodoro-timer-container');
    if (timerContainer) {
        timerContainer.classList.remove('running');
    }

    updatePomodoroButtons();
}

// Reset Timer
function resetPomodoro() {
    pomodoroState.isRunning = false;
    pomodoroState.isPaused = false;
    clearInterval(pomodoroState.timerInterval);

    // Remove running class
    const timerContainer = document.getElementById('pomodoro-timer-container');
    if (timerContainer) {
        timerContainer.classList.remove('running');
    }

    pomodoroState.timeRemaining = POMODORO_TIMES[pomodoroState.mode];
    pomodoroState.totalTime = POMODORO_TIMES[pomodoroState.mode];

    updatePomodoroDisplay();
    updatePomodoroButtons();
}

// Complete Session
function completeSession() {
    clearInterval(pomodoroState.timerInterval);
    pomodoroState.isRunning = false;

    // Play completion sound
    playSound('complete');

    if (pomodoroState.mode === 'focus') {
        // Focus session completed
        pomodoroState.sessions++;

        // Update stats
        pomodoroStats.todaySessions++;
        pomodoroStats.totalFocusMinutes += 25;
        const today = new Date().toDateString();
        pomodoroStats.lastSessionDate = today;
        savePomodoroStats();
        updatePomodoroStats();

        // Switch to break
        if (pomodoroState.sessions % 4 === 0) {
            // Long break after 4 sessions
            switchMode('longBreak');
        } else {
            // Short break
            switchMode('break');
        }

        // Show notification
        showNotification('집중 세션 완료! 🎉', '휴식 시간입니다. 잠시 쉬어가세요!');
    } else {
        // Break completed
        switchMode('focus');
        showNotification('휴식 끝! 💪', '다시 집중할 시간입니다!');
    }

    updatePomodoroDisplay();
    updatePomodoroButtons();
}

// Switch Mode (focus/break/longBreak)
function switchMode(mode) {
    pomodoroState.mode = mode;
    pomodoroState.timeRemaining = POMODORO_TIMES[mode];
    pomodoroState.totalTime = POMODORO_TIMES[mode];
    pomodoroState.isRunning = false;
    pomodoroState.isPaused = false;

    // Remove running class
    const timerContainer = document.getElementById('pomodoro-timer-container');
    if (timerContainer) {
        timerContainer.classList.remove('running');
    }

    // Update active mode button
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const modeId = mode === 'longBreak' ? 'mode-longbreak' : `mode-${mode}`;
    const activeBtn = document.getElementById(modeId);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    updatePomodoroDisplay();
    updatePomodoroButtons();
}

// Update Display
function updatePomodoroDisplay() {
    const minutes = Math.floor(pomodoroState.timeRemaining / 60);
    const seconds = pomodoroState.timeRemaining % 60;

    const timerDisplay = document.getElementById('pomodoro-time');
    if (timerDisplay) {
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    const modeDisplay = document.getElementById('pomodoro-mode');
    if (modeDisplay) {
        const modeText = {
            'focus': '집중 시간',
            'break': '짧은 휴식',
            'longBreak': '긴 휴식'
        };
        modeDisplay.textContent = modeText[pomodoroState.mode];
    }

    const sessionDisplay = document.getElementById('pomodoro-session');
    if (sessionDisplay) {
        sessionDisplay.textContent = `세션 ${pomodoroState.sessions}`;
    }

    // Update circle progress
    const circle = document.getElementById('pomodoro-circle');
    if (circle) {
        const progress = 1 - (pomodoroState.timeRemaining / pomodoroState.totalTime);
        const circumference = 2 * Math.PI * 140; // r=140
        const offset = circumference * (1 - progress);
        circle.style.strokeDashoffset = offset;
    }
}

// Update Buttons
function updatePomodoroButtons() {
    const startBtn = document.getElementById('pomodoro-start');
    const pauseBtn = document.getElementById('pomodoro-pause');
    const resetBtn = document.getElementById('pomodoro-reset');

    if (startBtn && pauseBtn) {
        if (pomodoroState.isRunning) {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-block';
        } else {
            startBtn.style.display = 'inline-block';
            pauseBtn.style.display = 'none';
        }
    }
}

// Update Stats
function updatePomodoroStats() {
    const todaySessionsEl = document.getElementById('pomodoro-today-sessions');
    const totalFocusEl = document.getElementById('pomodoro-total-focus');

    if (todaySessionsEl) {
        todaySessionsEl.textContent = pomodoroStats.todaySessions;
    }

    if (totalFocusEl) {
        const hours = Math.floor(pomodoroStats.totalFocusMinutes / 60);
        const mins = pomodoroStats.totalFocusMinutes % 60;
        totalFocusEl.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }
}

// Save Stats
function savePomodoroStats() {
    localStorage.setItem('pomodoroStats', JSON.stringify(pomodoroStats));
}

// Play Sound
function playSound(type) {
    // Using Web Audio API to generate simple beep
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'complete') {
        // Higher pitch for completion
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.3;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);

        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.frequency.value = 1000;
            gain2.gain.value = 0.3;
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.2);
        }, 150);
    }
}

// Show Notification
function showNotification(title, body) {
    // Try browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '⏰' });
    } else {
        // Fallback to alert
        alert(`${title}\n${body}`);
    }
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ===== AMBIENT SOUNDS =====
let ambientAudio = {
    audioContext: null,
    currentSound: null,
    gainNode: null,
    oscillators: [],
    bufferSource: null,
    youtubePlayer: null,
    youtubeReady: false
};

// YouTube video IDs for ambient sounds (only rain and cafe)
const YOUTUBE_AMBIENT = {
    rain: 'q76bMs-NwRk',    // 3시간 빗소리
    cafe: 'gaGkhXSyJSQ'     // 카페 분위기
};

// YouTube API ready callback
window.onYouTubeIframeAPIReady = function() {
    ambientAudio.youtubePlayer = new YT.Player('youtube-player', {
        height: '0',
        width: '0',
        playerVars: {
            autoplay: 0,
            controls: 0,
            loop: 1,
            playlist: '', // Will be set dynamically
            playsinline: 1
        },
        events: {
            onReady: function() {
                ambientAudio.youtubeReady = true;
                console.log('YouTube player ready');
            },
            onStateChange: function(event) {
                // Auto-loop: restart when ended
                if (event.data === YT.PlayerState.ENDED) {
                    ambientAudio.youtubePlayer.playVideo();
                }
            }
        }
    });
};

// Initialize ambient sound system
function initAmbientSounds() {
    // Set up event listeners for ambient buttons
    document.querySelectorAll('.ambient-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sound = btn.dataset.sound;
            toggleAmbientSound(sound, btn);
        });
    });

    // Volume control
    const volumeSlider = document.getElementById('ambient-volume');
    const volumeValue = document.querySelector('.volume-value');

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value;
            volumeValue.textContent = volume + '%';
            updateAmbientVolume(volume / 100);
        });
    }
}

// Toggle ambient sound
function toggleAmbientSound(sound, btn) {
    // If same sound is playing, stop it
    if (ambientAudio.currentSound === sound) {
        stopAmbientSound();
        btn.classList.remove('active');
        ambientAudio.currentSound = null;
        return;
    }

    // Stop any current sound
    stopAmbientSound();

    // Remove active class from all buttons
    document.querySelectorAll('.ambient-btn').forEach(b => b.classList.remove('active'));

    // Add active class to clicked button
    btn.classList.add('active');

    // Start new sound
    ambientAudio.currentSound = sound;
    playAmbientSound(sound);
}

// Play ambient sound using Web Audio API or YouTube
function playAmbientSound(sound) {
    // Check if this sound uses YouTube
    if (YOUTUBE_AMBIENT[sound]) {
        playYouTubeAmbient(sound);
    } else {
        // Use Web Audio API for whitenoise and forest
        if (!ambientAudio.audioContext) {
            ambientAudio.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const ctx = ambientAudio.audioContext;

        // Create gain node for volume control
        ambientAudio.gainNode = ctx.createGain();
        const volumeSlider = document.getElementById('ambient-volume');
        ambientAudio.gainNode.gain.value = (volumeSlider?.value || 50) / 100 * 0.3; // Max 30% volume
        ambientAudio.gainNode.connect(ctx.destination);

        switch(sound) {
            case 'whitenoise':
                createWhiteNoise(ctx);
                break;
            case 'forest':
                createForestSound(ctx);
                break;
        }
    }
}

// Play YouTube ambient sound
function playYouTubeAmbient(sound) {
    if (!ambientAudio.youtubeReady || !ambientAudio.youtubePlayer) {
        alert('YouTube 플레이어가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    const videoId = YOUTUBE_AMBIENT[sound];
    const volumeSlider = document.getElementById('ambient-volume');
    const volume = (volumeSlider?.value || 50);

    // Load video and set volume
    ambientAudio.youtubePlayer.loadVideoById({
        videoId: videoId,
        startSeconds: 0
    });
    ambientAudio.youtubePlayer.setVolume(volume);
    ambientAudio.youtubePlayer.playVideo();
}

// White noise generator
function createWhiteNoise(ctx) {
    const bufferSize = 4096;
    const whiteNoise = ctx.createScriptProcessor(bufferSize, 1, 1);

    whiteNoise.onaudioprocess = function(e) {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    };

    whiteNoise.connect(ambientAudio.gainNode);
    ambientAudio.bufferSource = whiteNoise;
}

// Rain and Cafe sounds are now handled by YouTube
// These functions are removed and replaced by playYouTubeAmbient()

// Forest sounds (filtered noise with low frequency)
function createForestSound(ctx) {
    const bufferSize = 4096;
    const noise = ctx.createScriptProcessor(bufferSize, 1, 1);

    noise.onaudioprocess = function(e) {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    };

    // Band-pass filter for forest ambience
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 1;

    noise.connect(filter);
    filter.connect(ambientAudio.gainNode);
    ambientAudio.bufferSource = noise;
}

// Stop ambient sound
function stopAmbientSound() {
    // Stop Web Audio API sounds
    if (ambientAudio.bufferSource) {
        try {
            ambientAudio.bufferSource.disconnect();
        } catch(e) {
            // Already disconnected
        }
        ambientAudio.bufferSource = null;
    }

    ambientAudio.oscillators.forEach(osc => {
        try {
            osc.stop();
            osc.disconnect();
        } catch(e) {
            // Already stopped
        }
    });
    ambientAudio.oscillators = [];

    // Stop YouTube player
    if (ambientAudio.youtubePlayer && ambientAudio.youtubeReady) {
        try {
            ambientAudio.youtubePlayer.stopVideo();
        } catch(e) {
            console.error('Error stopping YouTube player:', e);
        }
    }
}

// Update volume
function updateAmbientVolume(volume) {
    // Update Web Audio API volume
    if (ambientAudio.gainNode) {
        ambientAudio.gainNode.gain.value = volume * 0.3; // Max 30%
    }

    // Update YouTube player volume
    if (ambientAudio.youtubePlayer && ambientAudio.youtubeReady) {
        try {
            ambientAudio.youtubePlayer.setVolume(volume * 100);
        } catch(e) {
            console.error('Error setting YouTube volume:', e);
        }
    }
}

// Toggle Pomodoro Section
function togglePomodoroSection() {
    const section = document.querySelector('.pomodoro-section');
    section.classList.toggle('collapsed');

    // Save state to localStorage
    const isCollapsed = section.classList.contains('collapsed');
    localStorage.setItem('pomodoroCollapsed', isCollapsed);
}

// Initialize pomodoro collapsed state
function initPomodoroCollapsedState() {
    const isCollapsed = localStorage.getItem('pomodoroCollapsed') === 'true';
    const section = document.querySelector('.pomodoro-section');

    if (isCollapsed) {
        section.classList.add('collapsed');
    } else {
        section.classList.remove('collapsed');
    }
}

// ===== INTEGRATED MODE (Goal + Timer) =====

// Start pomodoro for specific goal
function startPomodoroForGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    // Set current goal
    pomodoroState.currentGoalId = goalId;

    // Initialize pomodoro sessions for goal if needed
    if (!goal.pomodoroSessions) {
        goal.pomodoroSessions = 0;
    }

    // Expand pomodoro section if collapsed
    const pomodoroSection = document.querySelector('.pomodoro-section');
    if (pomodoroSection.classList.contains('collapsed')) {
        pomodoroSection.classList.remove('collapsed');
        localStorage.setItem('pomodoroCollapsed', false);
    }

    // Switch to focus mode and start
    switchMode('focus');
    startPomodoro();

    // Scroll to timer
    pomodoroSection.scrollIntoView({ behavior: 'smooth' });

    // Re-render goals to show timer badge
    renderAllGoals();
}

// Stop pomodoro for goal
function stopPomodoroForGoal() {
    pomodoroState.currentGoalId = null;
    pausePomodoro();
    renderAllGoals();
}

// Update complete session to track goal progress
const originalCompleteSession = completeSession;
function completeSession() {
    // Track session for current goal
    if (pomodoroState.currentGoalId && pomodoroState.mode === 'focus') {
        const goal = goals.find(g => g.id === pomodoroState.currentGoalId);
        if (goal) {
            goal.pomodoroSessions = (goal.pomodoroSessions || 0) + 1;
            saveGoals();
        }
    }

    // Call original function
    originalCompleteSession();

    // Re-render goals to show updated sessions
    renderAllGoals();
}
