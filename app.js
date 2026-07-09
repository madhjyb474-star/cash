// ===== FAMILY EXPENSE TRACKER WITH FIREBASE SYNC =====

const STORAGE_KEY = 'familyBudgetApp';
const DEVICE_ID_KEY = 'familyBudgetDeviceId';

const CATEGORIES = [
    { name: '🥬 خضروات وفواكه', icon: '🥬' },
    { name: '🍞 حاجات منزلية', icon: '🍞' },
    { name: '🍳 طبخ', icon: '🍳' },
    { name: '👕 ملابس', icon: '👕' },
    { name: '🍪 سناكس وحلويات', icon: '🍪' },
    { name: '💊 صحة', icon: '💊' },
    { name: '📚 دراسة', icon: '📚' },
    { name: '🚌 مواصلات', icon: '🚌' },
    { name: '💡 كهرباء وماء', icon: '💡' },
    { name: '📱 موبايل وانترنت', icon: '📱' },
    { name: '🧴 تنظيف وعناية', icon: '🧴' },
    { name: '🎁 هدايا', icon: '🎁' },
    { name: '🏠 إيجار', icon: '🏠' }
];

let appData = null;
let currentDetailId = null;
let firebaseDB = null;
let firebaseListenerActive = false;
let isSyncing = false; // prevent loops when receiving sync
let deviceId = '';

// ===== DEVICE ID =====
function getDeviceId() {
    if (!deviceId) {
        deviceId = localStorage.getItem(DEVICE_ID_KEY);
        if (!deviceId) {
            deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }
    }
    return deviceId;
}

// ===== DATA MANAGEMENT =====

function getDefaultData() {
    return {
        isSetup: false,
        balance: 0,
        initialBalance: 0,
        members: [],
        transactions: [],
        nextId: 1
    };
}

function loadData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            appData = JSON.parse(stored);
        } else {
            appData = getDefaultData();
        }
    } catch (e) {
        appData = getDefaultData();
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    // Push to Firebase if connected
    pushToFirebase();
}

// ===== INIT =====

function init() {
    getDeviceId();
    loadData();

    if (appData.isSetup) {
        showMainScreen();
    } else {
        showSetupScreen();
    }

    // Auto-reconnect Firebase if previously connected
    autoReconnectFirebase();
}

// ===== SETUP =====

function showSetupScreen() {
    document.getElementById('setup-screen').classList.add('active');
    document.getElementById('main-screen').classList.remove('active');
    renderSetupMembers();
    document.getElementById('initial-balance').focus();
}

function showMainScreen() {
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    setTodayDefaults();
    populateMemberSelects();
    populateFilterSelects();
    renderAll();
    setupTabNavigation();
    updateSyncUI();
}

function setTodayDefaults() {
    const today = getTodayString();
    const expenseDate = document.getElementById('expense-date');
    const incomeDate = document.getElementById('income-date');
    if (expenseDate) expenseDate.value = today;
    if (incomeDate) incomeDate.value = today;
}

function getTodayString() {
    const d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

function addFamilyMemberToSetup() {
    const nameInput = document.getElementById('new-member-name');
    const roleInput = document.getElementById('new-member-role');
    const name = nameInput.value.trim();

    if (!name) { showToast('⚠️ الرجاء إدخال الاسم'); return; }
    if (appData.members.some(m => m.name === name)) { showToast('⚠️ هذا الاسم موجود مسبقاً'); return; }

    appData.members.push({ id: Date.now(), name, role: roleInput.value });
    nameInput.value = '';
    nameInput.focus();
    renderSetupMembers();
    showToast('✅ تمت إضافة ' + name);
}

function removeSetupMember(id) {
    appData.members = appData.members.filter(m => m.id !== id);
    renderSetupMembers();
}

function renderSetupMembers() {
    const list = document.getElementById('family-setup-list');
    if (appData.members.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#757575;font-size:13px;padding:12px;">لم يتم إضافة أفراد بعد</p>';
        return;
    }
    list.innerHTML = appData.members.map(m => `
        <div class="family-member-setup">
            <div class="info">
                <div class="avatar">${getInitials(m.name)}</div>
                <div>
                    <div class="name">${escapeHtml(m.name)}</div>
                    <div class="role">${escapeHtml(m.role)}</div>
                </div>
            </div>
            <button class="remove-btn" onclick="removeSetupMember(${m.id})">✕</button>
        </div>
    `).join('');
}

function finishSetup() {
    const balance = cleanNumber(document.getElementById('initial-balance').value);
    if (balance < 0) { showToast('⚠️ الرصيد لا يمكن أن يكون سالباً'); return; }

    appData.balance = balance;
    appData.initialBalance = balance;
    appData.isSetup = true;
    saveData();
    showMainScreen();
    showToast('🎉 تم الإعداد بنجاح! يلا نبدأ');
}

// ===== TAB NAVIGATION =====

function setupTabNavigation() {
    document.querySelectorAll('#tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tabName) {
    document.querySelectorAll('#tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById('tab-' + tabName);
    if (target) target.classList.add('active');
    if (tabName === 'transactions') renderTransactions();
    else if (tabName === 'members') renderMembersTab();
    else if (tabName === 'summary') { renderCategoriesGrid(); renderMembersGrid(); }
}

// ===== BALANCE =====

function renderBalance() {
    document.getElementById('current-balance').textContent = formatNumber(appData.balance);
    const totalIncome = appData.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = appData.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    document.getElementById('total-income').textContent = formatNumber(totalIncome);
    document.getElementById('total-expense').textContent = formatNumber(totalExpense);
}

// ===== ADD EXPENSE =====

function openAddExpense() {
    populateMemberSelects();
    setTodayDefaults();
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-category').value = '';
    document.getElementById('expense-note').value = '';
    document.getElementById('expense-member').value = 'general';
    document.getElementById('custom-category-group').style.display = 'none';
    openModal('modal-expense');
    setTimeout(() => document.getElementById('expense-amount').focus(), 300);
}

function saveExpense() {
    const amount = parseFloat(cleanNumber(document.getElementById('expense-amount').value));
    let category = document.getElementById('expense-category').value;
    const memberId = document.getElementById('expense-member').value;
    const date = document.getElementById('expense-date').value;
    const note = document.getElementById('expense-note').value.trim();

    if (!amount || amount <= 0) { showToast('⚠️ الرجاء إدخال مبلغ صحيح'); return; }
    if (!category) { showToast('⚠️ الرجاء اختيار الفئة'); return; }
    if (!date) { showToast('⚠️ الرجاء اختيار التاريخ'); return; }

    if (category === 'other') {
        const custom = document.getElementById('expense-custom-category').value.trim();
        if (!custom) { showToast('⚠️ الرجاء كتابة اسم الفئة'); return; }
        category = '🔧 ' + custom;
    }

    if (amount > appData.balance) showToast('⚠️ المبلغ أكبر من الرصيد المتاح!');

    const memberName = memberId === 'general' ? 'مصروف عام' :
        (appData.members.find(m => String(m.id) === String(memberId)) || {}).name || 'غير معروف';

    appData.transactions.unshift({
        id: appData.nextId++,
        type: 'expense', amount, category, memberId, memberName, date, note,
        createdAt: Date.now(),
        deviceId: getDeviceId()
    });

    appData.balance -= amount;
    saveData();
    closeModal('modal-expense');
    renderAll();
    showToast('✅ تم تسجيل المصروف');
}

// ===== ADD INCOME =====

function openAddIncome() {
    setTodayDefaults();
    document.getElementById('income-amount').value = '';
    document.getElementById('income-source').value = 'تحويل من الأب';
    document.getElementById('income-note').value = '';
    document.getElementById('custom-income-source-group').style.display = 'none';
    openModal('modal-income');
    setTimeout(() => document.getElementById('income-amount').focus(), 300);
}

function saveIncome() {
    const amount = parseFloat(cleanNumber(document.getElementById('income-amount').value));
    let source = document.getElementById('income-source').value;
    const date = document.getElementById('income-date').value;
    const note = document.getElementById('income-note').value.trim();

    if (!amount || amount <= 0) { showToast('⚠️ الرجاء إدخال مبلغ صحيح'); return; }
    if (!date) { showToast('⚠️ الرجاء اختيار التاريخ'); return; }

    if (source === 'other') {
        const custom = document.getElementById('income-custom-source').value.trim();
        if (!custom) { showToast('⚠️ الرجاء كتابة وصف المصدر'); return; }
        source = '🔧 ' + custom;
    }

    appData.transactions.unshift({
        id: appData.nextId++,
        type: 'income', amount, category: source,
        memberId: 'general', memberName: 'مصروف عام',
        date, note, createdAt: Date.now(), deviceId: getDeviceId()
    });

    appData.balance += amount;
    saveData();
    closeModal('modal-income');
    renderAll();
    showToast('✅ تم إضافة المبلغ');
}

// ===== RENDER ALL =====

function renderAll() {
    renderBalance();
    renderCategoriesGrid();
    renderMembersGrid();
    renderTransactions();
    renderMembersTab();
}

// ===== CATEGORIES GRID =====

function renderCategoriesGrid() {
    const grid = document.getElementById('categories-grid');
    const expenses = appData.transactions.filter(t => t.type === 'expense');
    const catTotals = {};
    expenses.forEach(t => {
        if (!catTotals[t.category]) catTotals[t.category] = { amount: 0, count: 0 };
        catTotals[t.category].amount += t.amount;
        catTotals[t.category].count++;
    });
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1].amount - a[1].amount);

    if (sortedCats.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#757575;font-size:13px;padding:20px;grid-column:1/-1;">لا توجد مصروفات بعد</p>';
        return;
    }
    grid.innerHTML = sortedCats.map(([catName, data]) => `
        <div class="category-card">
            <div class="category-icon">${getCategoryIcon(catName)}</div>
            <div class="category-name">${escapeHtml(catName)}</div>
            <div class="category-amount">${formatNumber(data.amount)}</div>
            <div class="category-count">${data.count} عملية</div>
        </div>
    `).join('');
}

// ===== MEMBERS GRID =====

function renderMembersGrid() {
    const grid = document.getElementById('members-grid');
    const expenses = appData.transactions.filter(t => t.type === 'expense');
    const memberTotals = {};
    expenses.forEach(t => {
        const key = t.memberId || 'general';
        if (!memberTotals[key]) memberTotals[key] = { amount: 0, name: t.memberName || 'مصروف عام' };
        memberTotals[key].amount += t.amount;
    });
    const sorted = Object.entries(memberTotals).sort((a, b) => b[1].amount - a[1].amount);

    if (sorted.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#757575;font-size:13px;padding:20px;">لا توجد بيانات بعد</p>';
        return;
    }
    grid.innerHTML = sorted.map(([id, data]) => `
        <div class="member-card">
            <div class="avatar">${getInitials(data.name)}</div>
            <div class="info"><div class="name">${escapeHtml(data.name)}</div></div>
            <div style="text-align:left;">
                <div class="spent">${formatNumber(data.amount)}</div>
                <div class="spent-label">ل.س</div>
            </div>
        </div>
    `).join('');
}

// ===== TRANSACTIONS =====

function renderTransactions() {
    const list = document.getElementById('transactions-list');
    const emptyState = document.getElementById('empty-transactions');
    const filterCategory = document.getElementById('filter-category').value;
    const filterMember = document.getElementById('filter-member').value;
    const filterDateFrom = document.getElementById('filter-date-from').value;
    const filterDateTo = document.getElementById('filter-date-to').value;
    const searchTerm = document.getElementById('search-transactions').value.trim().toLowerCase();

    let filtered = [...appData.transactions];
    if (filterCategory !== 'all') filtered = filtered.filter(t => t.category === filterCategory);
    if (filterMember !== 'all') filtered = filtered.filter(t => String(t.memberId) === String(filterMember));
    if (filterDateFrom) filtered = filtered.filter(t => t.date >= filterDateFrom);
    if (filterDateTo) filtered = filtered.filter(t => t.date <= filterDateTo);
    if (searchTerm) filtered = filtered.filter(t =>
        (t.category && t.category.toLowerCase().includes(searchTerm)) ||
        (t.memberName && t.memberName.toLowerCase().includes(searchTerm)) ||
        (t.note && t.note.toLowerCase().includes(searchTerm))
    );

    filtered.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (filtered.length === 0) { list.innerHTML = ''; emptyState.style.display = 'block'; return; }
    emptyState.style.display = 'none';

    let html = '', lastDate = '';
    filtered.forEach(t => {
        if (t.date !== lastDate) { lastDate = t.date; html += `<div class="date-separator">${formatDateArabic(t.date)}</div>`; }
        const icon = t.type === 'income' ? '💰' : getCategoryIcon(t.category);
        const prefix = t.type === 'income' ? '+' : '-';
        const cls = t.type === 'income' ? 'income' : 'expense';
        html += `
            <div class="transaction-item" onclick="showTransactionDetail(${t.id})">
                <div class="transaction-icon ${cls}">${icon}</div>
                <div class="transaction-info">
                    <div class="transaction-title">${escapeHtml(t.category)}</div>
                    <div class="transaction-subtitle">${escapeHtml(t.memberName || '')}${t.note ? ' • ' + escapeHtml(t.note) : ''}</div>
                </div>
                <div class="transaction-amount ${cls}">${prefix}${formatNumber(t.amount)}</div>
            </div>`;
    });
    list.innerHTML = html;
}

// ===== MEMBERS TAB =====

function renderMembersTab() {
    const container = document.getElementById('members-list');
    const expenses = appData.transactions.filter(t => t.type === 'expense');

    container.innerHTML = appData.members.map(member => {
        const memberExpenses = expenses.filter(t => String(t.memberId) === String(member.id));
        const total = memberExpenses.reduce((s, t) => s + t.amount, 0);
        const txHtml = memberExpenses.length > 0 ?
            memberExpenses.slice(0, 5).map(t => `
                <div class="mini-transaction">
                    <span>${getCategoryIcon(t.category)} ${escapeHtml(t.category)}</span>
                    <span class="date">${formatDateArabic(t.date)}</span>
                    <span class="amount">${formatNumber(t.amount)}</span>
                </div>`).join('') :
            '<div class="no-member-transactions">لا توجد مصروفات مسجلة</div>';

        return `
            <div class="member-detail-card">
                <div class="member-detail-header">
                    <div class="avatar">${getInitials(member.name)}</div>
                    <div class="info">
                        <div class="name">${escapeHtml(member.name)}</div>
                        <div class="role">${escapeHtml(member.role)}</div>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-weight:800;color:var(--expense);font-size:18px;direction:ltr;">${formatNumber(total)}</div>
                        <div style="font-size:11px;color:var(--text-secondary);">ل.س</div>
                    </div>
                    <button class="remove-member-btn" onclick="confirmRemoveMember(${member.id})">✕</button>
                </div>
                <div class="member-transactions">
                    ${txHtml}
                    ${memberExpenses.length > 5 ? `<div style="text-align:center;padding:8px;font-size:12px;color:var(--primary);">+${memberExpenses.length - 5} عمليات أخرى</div>` : ''}
                </div>
            </div>`;
    }).join('');
}

function addNewMember() {
    const nameInput = document.getElementById('add-member-name-input');
    const roleInput = document.getElementById('add-member-role-input');
    const name = nameInput.value.trim();
    if (!name) { showToast('⚠️ الرجاء إدخال الاسم'); return; }
    if (appData.members.some(m => m.name === name)) { showToast('⚠️ هذا الاسم موجود مسبقاً'); return; }

    appData.members.push({ id: Date.now(), name, role: roleInput.value });
    saveData();
    nameInput.value = '';
    populateMemberSelects();
    populateFilterSelects();
    renderAll();
    showToast('✅ تمت إضافة ' + name);
}

function confirmRemoveMember(id) {
    const member = appData.members.find(m => m.id === id);
    if (!member) return;
    showConfirm('هل تريد حذف "' + member.name + '"؟ المصروفات المرتبطة لن تُحذف.', () => {
        appData.members = appData.members.filter(m => m.id !== id);
        saveData();
        populateMemberSelects();
        populateFilterSelects();
        renderAll();
        showToast('🗑️ تم حذف العضو');
    });
}

// ===== TRANSACTION DETAIL =====

function showTransactionDetail(id) {
    const t = appData.transactions.find(tr => tr.id === id);
    if (!t) return;
    currentDetailId = id;
    document.getElementById('detail-title').textContent = t.type === 'income' ? '💰 تفاصيل الدخل' : '💰 تفاصيل المصروف';
    const cls = t.type === 'income' ? 'amount-income' : 'amount-expense';
    const prefix = t.type === 'income' ? '+' : '-';
    document.getElementById('detail-body').innerHTML = `
        <div class="detail-row"><span class="detail-label">المبلغ</span><span class="detail-value ${cls}">${prefix}${formatNumber(t.amount)} ل.س</span></div>
        <div class="detail-row"><span class="detail-label">النوع</span><span class="detail-value">${t.type === 'income' ? '➕ دخل' : '➖ مصروف'}</span></div>
        <div class="detail-row"><span class="detail-label">الفئة / المصدر</span><span class="detail-value">${escapeHtml(t.category)}</span></div>
        <div class="detail-row"><span class="detail-label">العضو</span><span class="detail-value">${escapeHtml(t.memberName || 'مصروف عام')}</span></div>
        <div class="detail-row"><span class="detail-label">التاريخ</span><span class="detail-value">${formatDateArabic(t.date)}</span></div>
        ${t.note ? `<div class="detail-row"><span class="detail-label">ملاحظات</span><span class="detail-value">${escapeHtml(t.note)}</span></div>` : ''}
    `;
    openModal('modal-detail');
}

function deleteCurrentTransaction() {
    if (currentDetailId === null) return;
    showConfirm('هل أنت متأكد من حذف هذه العملية؟ لا يمكن التراجع.', () => {
        const t = appData.transactions.find(tr => tr.id === currentDetailId);
        if (!t) return;
        if (t.type === 'expense') appData.balance += t.amount;
        else appData.balance -= t.amount;
        appData.transactions = appData.transactions.filter(tr => tr.id !== currentDetailId);
        saveData();
        closeModal('modal-detail');
        renderAll();
        showToast('🗑️ تم حذف العملية');
        currentDetailId = null;
    });
}

// ===== EXPORT / IMPORT =====

function showExportModal() {
    document.getElementById('import-data').value = '';
    openModal('modal-export');
}

function exportData() {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(appData))));
    if (navigator.share) {
        navigator.share({ title: 'بيانات ميزانية العائلة', text: encoded }).catch(() => copyToClipboard(encoded));
    } else { copyToClipboard(encoded); }
}

function importData() {
    const encoded = document.getElementById('import-data').value.trim();
    if (!encoded) { showToast('⚠️ الرجاء لصق البيانات'); return; }
    try {
        const imported = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        if (!imported.members || !Array.isArray(imported.transactions)) throw new Error('bad');
        showConfirm('سيتم استبدال البيانات الحالية. متابعة؟', () => {
            appData = imported;
            saveData();
            closeModal('modal-export');
            showMainScreen();
            showToast('✅ تم استيراد البيانات');
        });
    } catch (e) { showToast('❌ البيانات غير صالحة'); }
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('✅ تم النسخ!')).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('✅ تم النسخ!'); } catch (e) { showToast('⚠️ لم يتم النسخ'); }
    document.body.removeChild(ta);
}

// ============================================================
// =====              FIREBASE REAL-TIME SYNC              =====
// ============================================================

const SYNC_STORAGE_KEY = 'familyBudgetFirebaseConfig';

function getSyncConfig() {
    try {
        const c = localStorage.getItem(SYNC_STORAGE_KEY);
        return c ? JSON.parse(c) : null;
    } catch (e) { return null; }
}

function saveSyncConfig(url, code) {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ url, code }));
}

function clearSyncConfig() {
    localStorage.removeItem(SYNC_STORAGE_KEY);
}

function showSyncModal() {
    const config = getSyncConfig();
    if (config) {
        document.getElementById('firebase-url').value = config.url || '';
        document.getElementById('family-code').value = config.code || '';
        if (firebaseDB) {
            document.getElementById('sync-current-info').style.display = 'block';
            document.getElementById('sync-connected-value').textContent = config.code;
        }
    } else {
        document.getElementById('firebase-url').value = '';
        document.getElementById('family-code').value = '';
        document.getElementById('sync-current-info').style.display = 'none';
    }
    openModal('modal-sync');
}

function connectSync() {
    const url = document.getElementById('firebase-url').value.trim();
    const code = document.getElementById('family-code').value.trim();

    if (!url) { showToast('⚠️ الرجاء إدخال رابط Firebase'); return; }
    if (!code) { showToast('⚠️ الرجاء إدخال رمز العائلة'); return; }

    // Clean URL - remove trailing slash
    const cleanUrl = url.replace(/\/+$/, '');

    // Validate URL format
    if (!cleanUrl.startsWith('https://') || !cleanUrl.includes('firebaseio.com')) {
        showToast('⚠️ الرابط غير صحيح. يجب أن يبدأ بـ https:// وينتهي بـ firebaseio.com');
        return;
    }

    try {
        // Initialize Firebase if not already done with same config
        if (!firebase.apps.length) {
            firebase.initializeApp({
                databaseURL: cleanUrl
            });
        }

        firebaseDB = firebase.database();
        saveSyncConfig(cleanUrl, code);

        // Check if family code path exists
        const ref = firebaseDB.ref('families/' + code);

        ref.once('value', (snapshot) => {
            if (snapshot.exists()) {
                // Family data exists - sync it
                showConfirm('رمز العائلة "' + code + '" موجود بالفعل. هل تريد المزامنة معه؟ (بياناتك الحالية ستُستبدل)', () => {
                    startListening(code);
                    closeModal('modal-sync');
                });
            } else {
                // New family code - upload current data
                showConfirm('رمز "' + code + '" جديد. سيتم رفع بياناتك الحالية. هل تريد المتابعة؟', () => {
                    // Upload current data
                    const uploadData = { ...appData, lastSync: Date.now(), syncedBy: getDeviceId() };
                    ref.set(uploadData, (error) => {
                        if (error) {
                            showToast('❌ فشل الرفع: ' + error.message);
                        } else {
                            startListening(code);
                            closeModal('modal-sync');
                            showToast('✅ تم الاتصال بنجاح!');
                        }
                    });
                });
            }
        }, (error) => {
            showToast('❌ خطأ في الاتصال: تحقق من الرابط والقواعد');
        });

    } catch (e) {
        showToast('❌ خطأ: ' + e.message);
    }
}

function startListening(code) {
    if (firebaseListenerActive) {
        // Detach old listener
        firebaseDB.ref('families/' + appData._syncCode).off('value');
    }

    appData._syncCode = code;
    firebaseListenerActive = true;

    const ref = firebaseDB.ref('families/' + code);

    ref.on('value', (snapshot) => {
        if (!snapshot.exists()) return;

        const remote = snapshot.val();
        if (!remote) return;

        isSyncing = true;

        // Check if remote data is newer or different
        const remoteChanged = JSON.stringify({
            balance: remote.balance,
            transactions: remote.transactions,
            members: remote.members,
            nextId: remote.nextId
        });

        const localChanged = JSON.stringify({
            balance: appData.balance,
            transactions: appData.transactions,
            members: appData.members,
            nextId: appData.nextId
        });

        if (remoteChanged !== localChanged) {
            // Remote has different data - update local
            appData.balance = remote.balance || 0;
            appData.initialBalance = remote.initialBalance || 0;
            appData.members = remote.members || [];
            appData.transactions = remote.transactions || [];
            appData.nextId = remote.nextId || 1;
            appData.isSetup = true;

            // Recalculate balance to be safe
            const totalIncome = appData.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const totalExpense = appData.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            appData.balance = (remote.initialBalance || 0) + totalIncome - totalExpense;

            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
            renderAll();
            populateMemberSelects();
            populateFilterSelects();
            showToast('🔄 تم تحديث البيانات من الجهاز الآخر');
        }

        isSyncing = false;
        setSyncStatus('connected');
    }, (error) => {
        setSyncStatus('error');
        console.error('Firebase listener error:', error);
    });
}

function pushToFirebase() {
    if (!firebaseDB || !firebaseListenerActive || isSyncing || !appData._syncCode) return;

    const code = appData._syncCode;
    const uploadData = {
        balance: appData.balance,
        initialBalance: appData.initialBalance,
        members: appData.members,
        transactions: appData.transactions,
        nextId: appData.nextId,
        isSetup: true,
        lastSync: Date.now(),
        lastSyncDevice: getDeviceId()
    };

    setSyncStatus('syncing');

    firebaseDB.ref('families/' + code).set(uploadData, (error) => {
        if (error) {
            setSyncStatus('error');
            console.error('Push error:', error);
        } else {
            setSyncStatus('connected');
        }
    });
}

function disconnectSync() {
    if (firebaseDB && appData._syncCode) {
        firebaseDB.ref('families/' + appData._syncCode).off('value');
    }
    firebaseListenerActive = false;
    firebaseDB = null;
    clearSyncConfig();
    delete appData._syncCode;

    // Delete the app to reinitialize fresh if reconnected
    if (firebase.apps.length) {
        firebase.apps.forEach(app => app.delete());
    }

    document.getElementById('sync-current-info').style.display = 'none';
    updateSyncUI();
    closeModal('modal-sync');
    showToast('🔒 تم قطع الاتصال');
}

function autoReconnectFirebase() {
    const config = getSyncConfig();
    if (config && config.url && config.code && firebase.apps.length === 0) {
        try {
            firebase.initializeApp({ databaseURL: config.url });
            firebaseDB = firebase.database();
            startListening(config.code);
        } catch (e) {
            console.error('Auto-reconnect failed:', e);
            clearSyncConfig();
        }
    }
}

function updateSyncUI() {
    const bar = document.getElementById('sync-status-bar');
    const config = getSyncConfig();

    if (config && config.url && config.code) {
        bar.style.display = 'flex';
        setSyncStatus('connected');
    } else {
        bar.style.display = 'none';
    }
}

function setSyncStatus(status) {
    const dot = document.getElementById('sync-dot');
    const text = document.getElementById('sync-text');
    dot.className = 'sync-dot';

    switch (status) {
        case 'connected':
            text.textContent = '🟢 متصل - مزامنة فورية';
            break;
        case 'syncing':
            dot.classList.add('syncing');
            text.textContent = '⏳ جاري المزامنة...';
            break;
        case 'error':
            dot.classList.add('offline');
            text.textContent = '🔴 غير متصل';
            break;
    }
}

// ===== MODALS =====

function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

function showConfirm(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    const btn = document.getElementById('confirm-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => { closeModal('modal-confirm'); onConfirm(); });
    openModal('modal-confirm');
}

// ===== UTILITY FUNCTIONS =====

function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return Math.round(num).toLocaleString('en-US');
}

function cleanNumber(val) {
    if (!val) return 0;
    return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function formatAmountInput(input) {
    input.addEventListener('input', () => {
        let raw = input.value.replace(/[^\d]/g, '');
        if (raw.length === 0) { input.value = ''; return; }
        input.value = Number(raw).toLocaleString('en-US');
    });
    input.addEventListener('focus', () => { setTimeout(() => input.select(), 50); });
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getCategoryIcon(category) {
    if (!category) return '📦';
    const c = category.charAt(0);
    // Check if it's an emoji (emoji chars are multi-byte)
    if (category.codePointAt(0) > 0x2600) return c;
    return '🔧';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateArabic(dateStr) {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const dt = new Date(y, m - 1, d);
        return `${days[dt.getDay()]}، ${d} ${months[m - 1]} ${y}`;
    } catch (e) { return dateStr; }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

function populateMemberSelects() {
    const el = document.getElementById('expense-member');
    if (!el) return;
    el.innerHTML = '<option value="general">🏠 مصروف عام</option>' +
        appData.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.role)})</option>`).join('');
}

function populateFilterSelects() {
    const catFilter = document.getElementById('filter-category');
    if (catFilter) {
        const usedCats = [...new Set(appData.transactions.filter(t => t.type === 'expense').map(t => t.category))];
        catFilter.innerHTML = '<option value="all">جميع الفئات</option>' +
            usedCats.map(c => `<option value="${c}">${escapeHtml(c)}</option>`).join('');
    }
    const memberFilter = document.getElementById('filter-member');
    if (memberFilter) {
        memberFilter.innerHTML = '<option value="all">جميع الأفراد</option><option value="general">مصروف عام</option>' +
            appData.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    }
}

// ===== EVENT LISTENERS =====

document.addEventListener('change', (e) => {
    if (e.target.id === 'expense-category') {
        document.getElementById('custom-category-group').style.display = e.target.value === 'other' ? 'block' : 'none';
    }
    if (e.target.id === 'income-source') {
        document.getElementById('custom-income-source-group').style.display = e.target.value === 'other' ? 'block' : 'none';
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ===== SERVICE WORKER =====

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

// ===== FORMAT AMOUNT INPUTS =====

document.querySelectorAll('#initial-balance, #expense-amount, #income-amount').forEach(input => {
    formatAmountInput(input);
});

// ===== START =====

init();
