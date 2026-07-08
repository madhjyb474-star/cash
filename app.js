// ===== FAMILY EXPENSE TRACKER =====
// All data is stored in localStorage for offline use

const STORAGE_KEY = 'familyBudgetApp';
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
}

// ===== INIT =====

function init() {
    loadData();

    if (appData.isSetup) {
        showMainScreen();
    } else {
        showSetupScreen();
    }
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

    if (!name) {
        showToast('⚠️ الرجاء إدخال الاسم');
        return;
    }

    // Prevent duplicate names
    if (appData.members.some(m => m.name === name)) {
        showToast('⚠️ هذا الاسم موجود مسبقاً');
        return;
    }

    appData.members.push({
        id: Date.now(),
        name: name,
        role: roleInput.value
    });

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
    const balanceInput = document.getElementById('initial-balance');
    const balance = cleanNumber(balanceInput.value);

    if (balance < 0) {
        showToast('⚠️ الرصيد لا يمكن أن يكون سالباً');
        return;
    }

    appData.balance = balance;
    appData.initialBalance = balance;
    appData.isSetup = true;
    saveData();

    showMainScreen();
    showToast('🎉 تم الإعداد بنجاح! يلا نبدأ');
}

// ===== TAB NAVIGATION =====

function setupTabNavigation() {
    // Top tabs
    document.querySelectorAll('#tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Bottom nav
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tabName) {
    // Update top tabs
    document.querySelectorAll('#tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Update bottom nav
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
    });
    const target = document.getElementById('tab-' + tabName);
    if (target) target.classList.add('active');

    // Render content
    if (tabName === 'transactions') {
        renderTransactions();
    } else if (tabName === 'members') {
        renderMembersTab();
    } else if (tabName === 'summary') {
        renderCategoriesGrid();
        renderMembersGrid();
    }
}

// ===== BALANCE DISPLAY =====

function renderBalance() {
    const balanceEl = document.getElementById('current-balance');
    const incomeEl = document.getElementById('total-income');
    const expenseEl = document.getElementById('total-expense');

    balanceEl.textContent = formatNumber(appData.balance);

    const totalIncome = appData.transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = appData.transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    incomeEl.textContent = formatNumber(totalIncome);
    expenseEl.textContent = formatNumber(totalExpense);
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

    if (!amount || amount <= 0) {
        showToast('⚠️ الرجاء إدخال مبلغ صحيح');
        return;
    }

    if (!category) {
        showToast('⚠️ الرجاء اختيار الفئة');
        return;
    }

    if (!date) {
        showToast('⚠️ الرجاء اختيار التاريخ');
        return;
    }

    // Handle custom category
    if (category === 'other') {
        const custom = document.getElementById('expense-custom-category').value.trim();
        if (!custom) {
            showToast('⚠️ الرجاء كتابة اسم الفئة');
            return;
        }
        category = '🔧 ' + custom;
    }

    if (amount > appData.balance) {
        showToast('⚠️ المبلغ أكبر من الرصيد المتاح!');
    }

    const memberName = memberId === 'general' ? 'مصروف عام' :
        (appData.members.find(m => String(m.id) === String(memberId)) || {}).name || 'غير معروف';

    appData.transactions.unshift({
        id: appData.nextId++,
        type: 'expense',
        amount: amount,
        category: category,
        memberId: memberId,
        memberName: memberName,
        date: date,
        note: note,
        createdAt: Date.now()
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

    if (!amount || amount <= 0) {
        showToast('⚠️ الرجاء إدخال مبلغ صحيح');
        return;
    }

    if (!date) {
        showToast('⚠️ الرجاء اختيار التاريخ');
        return;
    }

    if (source === 'other') {
        const custom = document.getElementById('income-custom-source').value.trim();
        if (!custom) {
            showToast('⚠️ الرجاء كتابة وصف المصدر');
            return;
        }
        source = '🔧 ' + custom;
    }

    appData.transactions.unshift({
        id: appData.nextId++,
        type: 'income',
        amount: amount,
        category: source,
        memberId: 'general',
        memberName: 'مصروف عام',
        date: date,
        note: note,
        createdAt: Date.now()
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

    // Get category totals
    const catTotals = {};
    expenses.forEach(t => {
        if (!catTotals[t.category]) {
            catTotals[t.category] = { amount: 0, count: 0 };
        }
        catTotals[t.category].amount += t.amount;
        catTotals[t.category].count++;
    });

    // Sort by amount descending
    const sortedCats = Object.entries(catTotals)
        .sort((a, b) => b[1].amount - a[1].amount);

    if (sortedCats.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#757575;font-size:13px;padding:20px;grid-column:1/-1;">لا توجد مصروفات بعد</p>';
        return;
    }

    grid.innerHTML = sortedCats.map(([catName, data]) => {
        const icon = getCategoryIcon(catName);
        return `
            <div class="category-card">
                <div class="category-icon">${icon}</div>
                <div class="category-name">${escapeHtml(catName)}</div>
                <div class="category-amount">${formatNumber(data.amount)}</div>
                <div class="category-count">${data.count} عملية</div>
            </div>
        `;
    }).join('');
}

// ===== MEMBERS GRID (Summary) =====

function renderMembersGrid() {
    const grid = document.getElementById('members-grid');
    const expenses = appData.transactions.filter(t => t.type === 'expense');

    // Calculate per-member spending
    const memberTotals = {};
    expenses.forEach(t => {
        const key = t.memberId || 'general';
        if (!memberTotals[key]) {
            memberTotals[key] = { amount: 0, name: t.memberName || 'مصروف عام' };
        }
        memberTotals[key].amount += t.amount;
    });

    const sorted = Object.entries(memberTotals)
        .sort((a, b) => b[1].amount - a[1].amount);

    if (sorted.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#757575;font-size:13px;padding:20px;">لا توجد بيانات بعد</p>';
        return;
    }

    grid.innerHTML = sorted.map(([id, data]) => `
        <div class="member-card">
            <div class="avatar">${getInitials(data.name)}</div>
            <div class="info">
                <div class="name">${escapeHtml(data.name)}</div>
            </div>
            <div style="text-align:left;">
                <div class="spent">${formatNumber(data.amount)}</div>
                <div class="spent-label">ل.س</div>
            </div>
        </div>
    `).join('');
}

// ===== TRANSACTIONS LIST =====

function renderTransactions() {
    const list = document.getElementById('transactions-list');
    const emptyState = document.getElementById('empty-transactions');

    const filterCategory = document.getElementById('filter-category').value;
    const filterMember = document.getElementById('filter-member').value;
    const filterDateFrom = document.getElementById('filter-date-from').value;
    const filterDateTo = document.getElementById('filter-date-to').value;
    const searchTerm = document.getElementById('search-transactions').value.trim().toLowerCase();

    let filtered = [...appData.transactions];

    if (filterCategory !== 'all') {
        filtered = filtered.filter(t => t.category === filterCategory);
    }

    if (filterMember !== 'all') {
        filtered = filtered.filter(t => String(t.memberId) === String(filterMember));
    }

    if (filterDateFrom) {
        filtered = filtered.filter(t => t.date >= filterDateFrom);
    }

    if (filterDateTo) {
        filtered = filtered.filter(t => t.date <= filterDateTo);
    }

    if (searchTerm) {
        filtered = filtered.filter(t =>
            (t.category && t.category.toLowerCase().includes(searchTerm)) ||
            (t.memberName && t.memberName.toLowerCase().includes(searchTerm)) ||
            (t.note && t.note.toLowerCase().includes(searchTerm))
        );
    }

    // Sort by date desc, then by createdAt desc
    filtered.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (filtered.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    // Group by date
    let html = '';
    let lastDate = '';

    filtered.forEach(t => {
        if (t.date !== lastDate) {
            lastDate = t.date;
            html += `<div class="date-separator">${formatDateArabic(t.date)}</div>`;
        }

        const icon = t.type === 'income' ? '💰' : getCategoryIcon(t.category);
        const amountPrefix = t.type === 'income' ? '+' : '-';
        const amountClass = t.type === 'income' ? 'income' : 'expense';

        html += `
            <div class="transaction-item" onclick="showTransactionDetail(${t.id})">
                <div class="transaction-icon ${amountClass}">${icon}</div>
                <div class="transaction-info">
                    <div class="transaction-title">${escapeHtml(t.category)}</div>
                    <div class="transaction-subtitle">${escapeHtml(t.memberName || '')}${t.note ? ' • ' + escapeHtml(t.note) : ''}</div>
                </div>
                <div class="transaction-amount ${amountClass}">${amountPrefix}${formatNumber(t.amount)}</div>
            </div>
        `;
    });

    list.innerHTML = html;
}

// ===== MEMBERS TAB =====

function renderMembersTab() {
    const container = document.getElementById('members-list');
    const expenses = appData.transactions.filter(t => t.type === 'expense');

    container.innerHTML = appData.members.map(member => {
        const memberExpenses = expenses.filter(t => String(t.memberId) === String(member.id));
        const total = memberExpenses.reduce((sum, t) => sum + t.amount, 0);

        const transactionsHtml = memberExpenses.length > 0 ?
            memberExpenses.slice(0, 5).map(t => `
                <div class="mini-transaction">
                    <span>${getCategoryIcon(t.category)} ${escapeHtml(t.category)}</span>
                    <span class="date">${formatDateArabic(t.date)}</span>
                    <span class="amount">${formatNumber(t.amount)}</span>
                </div>
            `).join('') :
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
                    ${transactionsHtml}
                    ${memberExpenses.length > 5 ? `<div style="text-align:center;padding:8px;font-size:12px;color:var(--primary);">+${memberExpenses.length - 5} عمليات أخرى</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function addNewMember() {
    const nameInput = document.getElementById('add-member-name-input');
    const roleInput = document.getElementById('add-member-role-input');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('⚠️ الرجاء إدخال الاسم');
        return;
    }

    if (appData.members.some(m => m.name === name)) {
        showToast('⚠️ هذا الاسم موجود مسبقاً');
        return;
    }

    appData.members.push({
        id: Date.now(),
        name: name,
        role: roleInput.value
    });

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

    showConfirm(
        'هل تريد حذف "' + member.name + '"؟ المصروفات المرتبطة به لن تُحذف.',
        () => {
            appData.members = appData.members.filter(m => m.id !== id);
            saveData();
            populateMemberSelects();
            populateFilterSelects();
            renderAll();
            showToast('🗑️ تم حذف العضو');
        }
    );
}

// ===== TRANSACTION DETAIL =====

function showTransactionDetail(id) {
    const t = appData.transactions.find(tr => tr.id === id);
    if (!t) return;

    currentDetailId = id;

    const title = document.getElementById('detail-title');
    const body = document.getElementById('detail-body');

    title.textContent = t.type === 'income' ? '💰 تفاصيل الدخل' : '💰 تفاصيل المصروف';

    const amountClass = t.type === 'income' ? 'amount-income' : 'amount-expense';
    const amountPrefix = t.type === 'income' ? '+' : '-';

    body.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">المبلغ</span>
            <span class="detail-value ${amountClass}">${amountPrefix}${formatNumber(t.amount)} ل.س</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">النوع</span>
            <span class="detail-value">${t.type === 'income' ? '➕ دخل' : '➖ مصروف'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">الفئة / المصدر</span>
            <span class="detail-value">${escapeHtml(t.category)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">العضو</span>
            <span class="detail-value">${escapeHtml(t.memberName || 'مصروف عام')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">التاريخ</span>
            <span class="detail-value">${formatDateArabic(t.date)}</span>
        </div>
        ${t.note ? `
        <div class="detail-row">
            <span class="detail-label">ملاحظات</span>
            <span class="detail-value">${escapeHtml(t.note)}</span>
        </div>
        ` : ''}
    `;

    openModal('modal-detail');
}

function deleteCurrentTransaction() {
    if (currentDetailId === null) return;

    showConfirm('هل أنت متأكد من حذف هذه العملية؟ لا يمكن التراجع عن هذا الإجراء.', () => {
        const t = appData.transactions.find(tr => tr.id === currentDetailId);
        if (!t) return;

        if (t.type === 'expense') {
            appData.balance += t.amount;
        } else {
            appData.balance -= t.amount;
        }

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
    const dataStr = JSON.stringify(appData);
    const encoded = btoa(unescape(encodeURIComponent(dataStr)));

    // Try native share
    if (navigator.share) {
        navigator.share({
            title: 'بيانات ميزانية العائلة',
            text: 'انسخ هذه البيانات والصقها في التطبيق:\n\n' + encoded,
        }).catch(() => {
            copyToClipboard(encoded);
        });
    } else {
        copyToClipboard(encoded);
    }
}

function importData() {
    const encoded = document.getElementById('import-data').value.trim();
    if (!encoded) {
        showToast('⚠️ الرجاء لصق البيانات');
        return;
    }

    try {
        const decoded = decodeURIComponent(escape(atob(encoded)));
        const imported = JSON.parse(decoded);

        if (!imported.members || !Array.isArray(imported.transactions)) {
            throw new Error('Invalid format');
        }

        showConfirm(
            'سيتم استبدال جميع البيانات الحالية بالبيانات المستوردة. هل تريد المتابعة؟',
            () => {
                appData = imported;
                saveData();
                closeModal('modal-export');
                showMainScreen();
                showToast('✅ تم استيراد البيانات بنجاح');
            }
        );
    } catch (e) {
        showToast('❌ البيانات غير صالحة. تأكد من نسخها بالكامل.');
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('✅ تم النسخ! أرسله وألصقه في الجهاز الآخر');
        }).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('✅ تم النسخ! أرسله وألصقه في الجهاز الآخر');
    } catch (e) {
        showToast('⚠️ لم يتم النسخ. جرب مرة أخرى.');
    }
    document.body.removeChild(ta);
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
    // Remove old listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
        closeModal('modal-confirm');
        onConfirm();
    });
    openModal('modal-confirm');
}

// ===== UTILITY FUNCTIONS =====

function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return Math.round(num).toLocaleString('en-US');
}

// Remove commas from formatted number strings (for parsing)
function cleanNumber(val) {
    if (!val) return 0;
    return parseFloat(String(val).replace(/,/g, '')) || 0;
}

// Format a number input live with thousands separators as user types
function formatAmountInput(input) {
    input.addEventListener('input', () => {
        // Get the raw digits only
        let raw = input.value.replace(/[^\d]/g, '');
        if (raw.length === 0) {
            input.value = '';
            return;
        }
        // Format with commas
        input.value = Number(raw).toLocaleString('en-US');
    });
    // On focus, select all for easy editing
    input.addEventListener('focus', () => {
        setTimeout(() => input.select(), 50);
    });
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getCategoryIcon(category) {
    if (!category) return '📦';
    const firstChar = category.charAt(0);
    if (firstChar >= '🀀') return firstChar; // It's already an emoji
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
        const parts = dateStr.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);

        const months = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];

        const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        const d = new Date(year, month - 1, day);
        const dayName = days[d.getDay()];

        return `${dayName}، ${day} ${months[month - 1]} ${year}`;
    } catch (e) {
        return dateStr;
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function populateMemberSelects() {
    const expenseMember = document.getElementById('expense-member');
    if (!expenseMember) return;

    expenseMember.innerHTML = '<option value="general">🏠 مصروف عام</option>' +
        appData.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.role)})</option>`).join('');
}

function populateFilterSelects() {
    // Category filter
    const catFilter = document.getElementById('filter-category');
    if (catFilter) {
        const usedCats = [...new Set(appData.transactions.filter(t => t.type === 'expense').map(t => t.category))];
        catFilter.innerHTML = '<option value="all">جميع الفئات</option>' +
            usedCats.map(c => `<option value="${c}">${escapeHtml(c)}</option>`).join('');
    }

    // Member filter
    const memberFilter = document.getElementById('filter-member');
    if (memberFilter) {
        memberFilter.innerHTML = '<option value="all">جميع الأفراد</option>' +
            '<option value="general">مصروف عام</option>' +
            appData.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    }
}

// ===== CUSTOM CATEGORY TOGGLE =====

document.addEventListener('change', (e) => {
    if (e.target.id === 'expense-category') {
        const customGroup = document.getElementById('custom-category-group');
        customGroup.style.display = e.target.value === 'other' ? 'block' : 'none';
    }
    if (e.target.id === 'income-source') {
        const customGroup = document.getElementById('custom-income-source-group');
        customGroup.style.display = e.target.value === 'other' ? 'block' : 'none';
    }
});

// ===== CLOSE MODAL ON BACKDROP CLICK =====

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ===== SERVICE WORKER REGISTRATION =====

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

// ===== LIVE FORMAT AMOUNT INPUTS =====

document.querySelectorAll('#initial-balance, #expense-amount, #income-amount').forEach(input => {
    formatAmountInput(input);
});

// ===== START APP =====

init();
