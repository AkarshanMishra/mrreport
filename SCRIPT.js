// MR CRM frontend backed by the local Node server.

let masterDB = { hqs: [], products: [], doctors: [], chemists: [] };
let visitsDB = [];
let activeUser = JSON.parse(localStorage.getItem('mr_advanced_activeUser')) || null;
let filteredData = [];
let editMode = { product: null, doctor: null, chemist: null };

document.addEventListener('DOMContentLoaded', async () => {
    setAuthMode('login');
    await hydrateServerData();
    bindStaticEvents();
    loadUserState();
});

function bindStaticEvents() {
    const spec = document.getElementById('d_spec');
    if (spec) spec.addEventListener('change', toggleSpecialisationCustom);

    const visitForm = document.getElementById('visitForm');
    if (visitForm) visitForm.addEventListener('submit', saveVisit);
}

async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Server request failed.');
    return data;
}

async function hydrateServerData() {
    try {
        let data = await apiRequest('/api/data');
        if (serverLooksEmpty(data)) {
            data = await migrateLegacyBrowserData(data);
        }
        masterDB = data.masterDB || masterDB;
        visitsDB = data.visitsDB || [];
        filteredData = [...visitsDB];
    } catch (error) {
        alert(`Cannot connect to the server. Start it with: node server.js\n\n${error.message}`);
    }
}

function serverLooksEmpty(data) {
    const serverMaster = data.masterDB || {};
    const masterCount = ['hqs', 'products', 'doctors', 'chemists'].reduce((sum, key) => sum + (serverMaster[key]?.length || 0), 0);
    return masterCount === 0 && (data.visitsDB || []).length === 0;
}

async function migrateLegacyBrowserData(data) {
    const legacyMaster = JSON.parse(localStorage.getItem('mr_advanced_masterDB') || 'null');
    const legacyVisits = JSON.parse(localStorage.getItem('mr_advanced_visitsDB') || 'null');
    const hasLegacyMaster = legacyMaster && ['hqs', 'products', 'doctors', 'chemists'].some(key => legacyMaster[key]?.length);
    const hasLegacyVisits = Array.isArray(legacyVisits) && legacyVisits.length;

    if (!hasLegacyMaster && !hasLegacyVisits) return data;

    return apiRequest('/api/import-local-data', {
        method: 'POST',
        body: JSON.stringify({
            masterDB: hasLegacyMaster ? legacyMaster : undefined,
            visitsDB: hasLegacyVisits ? legacyVisits : undefined
        })
    });
}

async function persistMasterDB() {
    const data = await apiRequest('/api/master', {
        method: 'POST',
        body: JSON.stringify({ masterDB })
    });
    masterDB = data.masterDB;
}

async function persistVisitsDB() {
    const data = await apiRequest('/api/visits', {
        method: 'POST',
        body: JSON.stringify({ visitsDB })
    });
    visitsDB = data.visitsDB;
    filteredData = [...visitsDB];
}

function setAuthMode(mode) {
    const loginPanel = document.getElementById('loginPanel');
    const registerPanel = document.getElementById('registerPanel');
    const loginBtn = document.getElementById('btnLoginMode');
    const registerBtn = document.getElementById('btnRegisterMode');

    if (mode === 'register') {
        loginPanel.classList.add('d-none');
        registerPanel.classList.remove('d-none');
        loginBtn.classList.remove('active');
        registerBtn.classList.add('active');
    } else {
        loginPanel.classList.remove('d-none');
        registerPanel.classList.add('d-none');
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
    }
}

function loadUserState() {
    if (activeUser) {
        showAppSection();
        setUserStatus();
        document.getElementById('v_date').valueAsDate = new Date();
        renderMasterLists();
        populateDropdowns();
        renderDetailsView();
        toggleVisitType();
        toggleWorkWithOther();
        applyFilter();
    } else {
        showAuthSection();
    }
}

function showAuthSection() {
    document.getElementById('authSection').classList.remove('d-none');
    document.getElementById('appSection').classList.add('d-none');
    document.getElementById('userControls').classList.add('d-none');
}

function showAppSection() {
    document.getElementById('authSection').classList.add('d-none');
    document.getElementById('appSection').classList.remove('d-none');
    document.getElementById('userControls').classList.remove('d-none');
}

function setUserStatus() {
    const name = activeUser?.name || activeUser?.username || 'User';
    const role = activeUser?.role || 'MR';
    document.getElementById('navUsername').innerText = `Signed in as ${name}`;
    document.getElementById('navRole').innerText = role;
    document.getElementById('welcomeBadge').innerText = `Hi, ${name}`;
}

function isAdmin() {
    return activeUser?.role === 'Admin';
}

function setActiveUser(user) {
    activeUser = user;
    localStorage.setItem('mr_advanced_activeUser', JSON.stringify(activeUser));
}

function clearActiveUser() {
    activeUser = null;
    localStorage.removeItem('mr_advanced_activeUser');
}

async function registerUser(event) {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const username = document.getElementById('registerUsername').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const role = document.getElementById('registerRole').value;

    if (!name || !email || !username || !password) return alert('Please complete all registration fields.');
    if (password.length < 6) return alert('Password should be at least 6 characters.');
    if (password !== passwordConfirm) return alert('Passwords do not match.');

    try {
        const data = await apiRequest('/api/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, username, password, role })
        });
        setActiveUser(data.user);
        alert('User created successfully. You are now logged in.');
        document.getElementById('registerForm').reset();
        loadUserState();
    } catch (error) {
        alert(error.message);
    }
}

async function loginUser(event) {
    event.preventDefault();
    const identifier = document.getElementById('loginIdentifier').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    try {
        const data = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });
        setActiveUser(data.user);
        document.getElementById('loginForm').reset();
        alert(`Welcome back, ${data.user.name}!`);
        await hydrateServerData();
        loadUserState();
    } catch (error) {
        alert(error.message);
    }
}

function logoutUser() {
    if (!confirm('Logout and return to login screen?')) return;
    clearActiveUser();
    showAuthSection();
}

async function saveSimpleMaster(event, category, inputId) {
    event.preventDefault();
    masterDB[category].push({ id: Date.now(), name: document.getElementById(inputId).value.trim() });
    await updateDBAndUI(event);
}

async function saveProduct(event) {
    event.preventDefault();
    const name = document.getElementById('product_input').value.trim();
    const salts = document.getElementById('product_salts').value.trim();
    if (!name || !salts) return alert('Please enter product name and salts/ingredients.');

    if (editMode.product) {
        const product = masterDB.products.find(p => p.id === editMode.product);
        if (product) Object.assign(product, { name, salts });
        cancelEditProduct();
    } else {
        masterDB.products.push({ id: Date.now(), name, salts });
    }
    await updateDBAndUI(event);
    document.getElementById('product_input').focus();
}

function editProduct(id) {
    const product = masterDB.products.find(p => p.id === id);
    if (!product) return;
    editMode.product = id;
    document.getElementById('product_input').value = product.name;
    document.getElementById('product_salts').value = product.salts;
    document.getElementById('productSubmitBtn').innerText = 'Update Product';
    document.getElementById('productCancelBtn').style.display = 'inline-block';
    document.getElementById('product_input').focus();
}

function cancelEditProduct() {
    editMode.product = null;
    document.getElementById('product_input').value = '';
    document.getElementById('product_salts').value = '';
    document.getElementById('productSubmitBtn').innerText = 'Save Product';
    document.getElementById('productCancelBtn').style.display = 'none';
}

async function saveDoctor(event) {
    event.preventDefault();
    const spec = document.getElementById('d_spec').value;
    const finalSpec = spec === 'Other' ? document.getElementById('d_spec_custom').value.trim() : spec;
    if (!finalSpec) return alert('Please select or specify a specialisation.');

    const doctorObj = {
        name: document.getElementById('d_name').value.trim(),
        spec: finalSpec,
        hospital: document.getElementById('d_hosp').value.trim(),
        loc: document.getElementById('d_loc').value.trim(),
        phone: document.getElementById('d_phone').value.trim()
    };

    if (editMode.doctor) {
        const doctor = masterDB.doctors.find(d => d.id === editMode.doctor);
        if (doctor) Object.assign(doctor, doctorObj);
        cancelEditDoctor();
    } else {
        masterDB.doctors.push({ id: Date.now(), ...doctorObj });
    }
    await updateDBAndUI(event);
}

function editDoctor(id) {
    const doctor = masterDB.doctors.find(d => d.id === id);
    if (!doctor) return;
    editMode.doctor = id;
    document.getElementById('d_name').value = doctor.name;
    document.getElementById('d_hosp').value = doctor.hospital;
    document.getElementById('d_loc').value = doctor.loc;
    document.getElementById('d_phone').value = doctor.phone;

    const specOptions = Array.from(document.getElementById('d_spec').options).map(o => o.value);
    if (specOptions.includes(doctor.spec)) {
        document.getElementById('d_spec').value = doctor.spec;
    } else {
        document.getElementById('d_spec').value = 'Other';
        document.getElementById('d_spec_custom').value = doctor.spec;
    }
    toggleSpecialisationCustom();
    document.getElementById('doctorSubmitBtn').innerText = 'Update Doctor';
    document.getElementById('doctorCancelBtn').style.display = 'inline-block';
    document.getElementById('d_name').focus();
}

function cancelEditDoctor() {
    editMode.doctor = null;
    document.getElementById('d_name').value = '';
    document.getElementById('d_spec').value = '';
    document.getElementById('d_spec_custom').value = '';
    document.getElementById('d_hosp').value = '';
    document.getElementById('d_loc').value = '';
    document.getElementById('d_phone').value = '';
    document.getElementById('customSpecWrap').classList.add('d-none');
    document.getElementById('doctorSubmitBtn').innerText = 'Save Doctor';
    document.getElementById('doctorCancelBtn').style.display = 'none';
}

function toggleSpecialisationCustom() {
    const spec = document.getElementById('d_spec').value;
    const wrap = document.getElementById('customSpecWrap');
    if (spec === 'Other') {
        wrap.classList.remove('d-none');
        document.getElementById('d_spec_custom').focus();
    } else {
        wrap.classList.add('d-none');
    }
}

async function saveChemist(event) {
    event.preventDefault();
    const chemistObj = {
        name: document.getElementById('c_name').value.trim(),
        person: document.getElementById('c_person').value.trim(),
        loc: document.getElementById('c_loc').value.trim(),
        phone: document.getElementById('c_phone').value.trim()
    };

    if (editMode.chemist) {
        const chemist = masterDB.chemists.find(c => c.id === editMode.chemist);
        if (chemist) Object.assign(chemist, chemistObj);
        cancelEditChemist();
    } else {
        masterDB.chemists.push({ id: Date.now(), ...chemistObj });
    }
    await updateDBAndUI(event);
}

function editChemist(id) {
    const chemist = masterDB.chemists.find(c => c.id === id);
    if (!chemist) return;
    editMode.chemist = id;
    document.getElementById('c_name').value = chemist.name;
    document.getElementById('c_person').value = chemist.person;
    document.getElementById('c_loc').value = chemist.loc;
    document.getElementById('c_phone').value = chemist.phone;
    document.getElementById('chemistSubmitBtn').innerText = 'Update Chemist';
    document.getElementById('chemistCancelBtn').style.display = 'inline-block';
    document.getElementById('c_name').focus();
}

function cancelEditChemist() {
    editMode.chemist = null;
    document.getElementById('c_name').value = '';
    document.getElementById('c_person').value = '';
    document.getElementById('c_loc').value = '';
    document.getElementById('c_phone').value = '';
    document.getElementById('chemistSubmitBtn').innerText = 'Save Chemist';
    document.getElementById('chemistCancelBtn').style.display = 'none';
}

async function updateDBAndUI(event) {
    try {
        await persistMasterDB();
        if (event) event.target.reset();
        renderMasterLists();
        renderDetailsView();
        populateDropdowns();
    } catch (error) {
        alert(`Data was not saved on the server: ${error.message}`);
    }
}

async function deleteMasterData(category, id) {
    if (!isAdmin()) return alert('Only Admin users can delete data. MRs can only add and edit.');
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) return;

    masterDB[category] = masterDB[category].filter(item => item.id !== id);
    await updateDBAndUI(null);
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function renderMasterLists() {
    document.getElementById('list-hqs').innerHTML = masterDB.hqs.map(i =>
        `<div class="d-flex justify-content-between border-bottom py-1">
            <span>${escapeHTML(i.name)}</span>
            ${isAdmin() ? `<span class="delete-btn" onclick="deleteMasterData('hqs', ${i.id})">X</span>` : ''}
        </div>`
    ).join('');

    document.getElementById('list-products').innerHTML = masterDB.products.map(i => {
        const actions = `<div class="d-flex gap-1">
            ${isAdmin() ? `<button class="btn btn-sm btn-outline-warning" onclick="editProduct(${i.id})">Edit</button>` : ''}
            ${isAdmin() ? `<span class="delete-btn" onclick="deleteMasterData('products', ${i.id})">X</span>` : ''}
        </div>`;
        return `<div class="d-flex justify-content-between align-items-start border-bottom py-1">
            <div style="flex: 1;"><strong>${escapeHTML(i.name)}</strong><br><small class="text-muted">${escapeHTML(i.salts || 'N/A')}</small></div>${actions}
        </div>`;
    }).join('');

    document.getElementById('list-doctors').innerHTML = masterDB.doctors.map(i => {
        const actions = `<div class="d-flex gap-1">
            ${isAdmin() ? `<button class="btn btn-sm btn-outline-warning" onclick="editDoctor(${i.id})">Edit</button>` : ''}
            ${isAdmin() ? `<span class="delete-btn" onclick="deleteMasterData('doctors', ${i.id})">X</span>` : ''}
        </div>`;
        return `<div class="d-flex justify-content-between align-items-start border-bottom py-2">
            <div style="line-height: 1.2;">
                <strong>${escapeHTML(i.name)}</strong> (${escapeHTML(i.spec)})<br>
                <small class="text-muted">${escapeHTML(i.hospital)}, ${escapeHTML(i.loc)} | Phone: ${escapeHTML(i.phone || 'N/A')}</small>
            </div>${actions}
        </div>`;
    }).join('');

    document.getElementById('list-chemists').innerHTML = masterDB.chemists.map(i => {
        const actions = `<div class="d-flex gap-1">
            ${isAdmin() ? `<button class="btn btn-sm btn-outline-warning" onclick="editChemist(${i.id})">Edit</button>` : ''}
            ${isAdmin() ? `<span class="delete-btn" onclick="deleteMasterData('chemists', ${i.id})">X</span>` : ''}
        </div>`;
        return `<div class="d-flex justify-content-between align-items-start border-bottom py-2">
            <div style="line-height: 1.2;">
                <strong>${escapeHTML(i.name)}</strong><br>
                <small class="text-muted">Person: ${escapeHTML(i.person || 'N/A')} | ${escapeHTML(i.loc)} | Phone: ${escapeHTML(i.phone || 'N/A')}</small>
            </div>${actions}
        </div>`;
    }).join('');
}

function toggleVisitType() {
    const type = document.getElementById('v_type').value;
    document.getElementById('div-doctor').classList.toggle('d-none', type !== 'Doctor');
    document.getElementById('div-chemist').classList.toggle('d-none', type === 'Doctor');
}

function populateDropdowns() {
    document.getElementById('v_hq').innerHTML = '<option value="">-- Select HQ --</option>' + masterDB.hqs.map(i => `<option value="${escapeHTML(i.name)}">${escapeHTML(i.name)}</option>`).join('');
    renderDoctorDropdown();
    renderLinkedChemistDropdown();
    renderChemistDropdown();
    renderProductDropdown();
}

function renderDoctorDropdown(filter = '') {
    const query = filter.trim().toLowerCase();
    const doctorOptions = masterDB.doctors
        .filter(i => !query || i.name.toLowerCase().includes(query) || i.spec.toLowerCase().includes(query) || i.hospital.toLowerCase().includes(query))
        .map(i => `<option value="${escapeHTML(`${i.name} (${i.hospital})`)}">${escapeHTML(i.name)} - ${escapeHTML(i.hospital)}</option>`)
        .join('');
    document.getElementById('v_doctor').innerHTML = '<option value="">-- Select Doctor --</option>' + doctorOptions + '<option value="__add_doctor__">+ Add new Doctor</option>';
}

function renderLinkedChemistDropdown(filter = '') {
    const query = filter.trim().toLowerCase();
    const chemOptions = masterDB.chemists
        .filter(i => !query || i.name.toLowerCase().includes(query) || i.loc.toLowerCase().includes(query) || (i.person || '').toLowerCase().includes(query))
        .map(i => `<option value="${escapeHTML(`${i.name} (${i.loc})`)}">${escapeHTML(i.name)} - ${escapeHTML(i.loc)}</option>`)
        .join('');
    document.getElementById('v_linked_chemist').innerHTML = '<option value="None">-- None / Not Applicable --</option>' + chemOptions + '<option value="__add_chemist__">+ Add new Chemist</option>';
}

function renderChemistDropdown(filter = '') {
    const query = filter.trim().toLowerCase();
    const chemOptions = masterDB.chemists
        .filter(i => !query || i.name.toLowerCase().includes(query) || i.loc.toLowerCase().includes(query) || (i.person || '').toLowerCase().includes(query))
        .map(i => `<option value="${escapeHTML(`${i.name} (${i.loc})`)}">${escapeHTML(i.name)} - ${escapeHTML(i.loc)}</option>`)
        .join('');
    document.getElementById('v_chemist').innerHTML = '<option value="">-- Select Chemist --</option>' + chemOptions + '<option value="__add_chemist__">+ Add new Chemist</option>';
}

function renderProductDropdown(filter = '') {
    const query = filter.trim().toLowerCase();
    const productOptions = masterDB.products
        .filter(i => !query || i.name.toLowerCase().includes(query))
        .map(i => `<option value="${escapeHTML(i.name)}">${escapeHTML(i.name)}</option>`)
        .join('');
    document.getElementById('v_products').innerHTML = productOptions + '<option value="__add_product__">+ Add new Product</option>';
}

function filterDoctorOptions() {
    renderDoctorDropdown(document.getElementById('filterDoctor')?.value || '');
}

function filterLinkedChemistOptions() {
    renderLinkedChemistDropdown(document.getElementById('filterLinkedChemist')?.value || '');
}

function filterChemistOptions() {
    renderChemistDropdown(document.getElementById('filterChemist')?.value || '');
}

function filterProductOptions() {
    renderProductDropdown(document.getElementById('filterProduct')?.value || '');
}

function toggleWorkWithOther() {
    const isOther = document.getElementById('v_work_with').value === 'Other';
    document.getElementById('otherWorkWithWrap').classList.toggle('d-none', !isOther);
    document.getElementById('v_work_with_other').required = isOther;
}

function getSelectedWorkWith() {
    const workWith = document.getElementById('v_work_with').value;
    if (workWith === 'Other') return document.getElementById('v_work_with_other').value.trim();
    return workWith;
}

function openMasterTab(section) {
    const masterTabBtn = document.querySelector('button[data-bs-target="#tab-master"]');
    if (masterTabBtn) masterTabBtn.click();
    setTimeout(() => {
        const targets = {
            doctor: 'd_name',
            chemist: 'c_name',
            product: 'product_input',
            hq: 'hq_input'
        };
        const targetElement = document.getElementById(targets[section]);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.focus();
        }
    }, 150);
}

function renderDetailsView() {
    document.getElementById('detailsDoctorsBody').innerHTML = masterDB.doctors.map(d => `
        <tr>
            <td><strong>${escapeHTML(d.name)}</strong></td>
            <td>${escapeHTML(d.spec)}</td>
            <td>${escapeHTML(d.hospital)}</td>
            <td>${escapeHTML(d.loc)}</td>
            <td>${escapeHTML(d.phone || '-')}</td>
            <td>
                <button class="btn btn-xs btn-outline-success" onclick="downloadMasterRecord('doctors', ${d.id})">Download</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-muted">No doctors added yet</td></tr>';

    document.getElementById('detailsProductsBody').innerHTML = masterDB.products.map(p => `
        <tr>
            <td><strong>${escapeHTML(p.name)}</strong></td>
            <td>${escapeHTML(p.salts || '-')}</td>
            <td>
                <button class="btn btn-xs btn-outline-success" onclick="downloadMasterRecord('products', ${p.id})">Download</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="text-center text-muted">No products added yet</td></tr>';

    document.getElementById('detailsChemistsBody').innerHTML = masterDB.chemists.map(c => `
        <tr>
            <td><strong>${escapeHTML(c.name)}</strong></td>
            <td>${escapeHTML(c.person || '-')}</td>
            <td>${escapeHTML(c.loc)}</td>
            <td>${escapeHTML(c.phone || '-')}</td>
            <td>
                <button class="btn btn-xs btn-outline-success" onclick="downloadMasterRecord('chemists', ${c.id})">Download</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="text-center text-muted">No chemists added yet</td></tr>';
}

function downloadMasterRecord(category, id) {
    const record = masterDB[category]?.find(item => item.id === id);
    if (!record) return alert('Record not found.');

    const categoryLabels = {
        doctors: 'Doctor',
        products: 'Product',
        chemists: 'Chemist'
    };
    const label = categoryLabels[category] || 'Record';
    const exportRows = [formatMasterRecordForExport(category, record)];
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label);
    const safeName = String(record.name || label).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || label;
    XLSX.writeFile(wb, `${label}_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function formatMasterRecordForExport(category, record) {
    if (category === 'doctors') {
        return {
            'Name': record.name,
            'Specialisation': record.spec,
            'Hospital': record.hospital,
            'Location': record.loc,
            'Phone': record.phone || ''
        };
    }
    if (category === 'products') {
        return {
            'Product Name': record.name,
            'Salts / Ingredients': record.salts || ''
        };
    }
    if (category === 'chemists') {
        return {
            'Chemist Name': record.name,
            'Contact Person': record.person || '',
            'Location': record.loc,
            'Phone': record.phone || ''
        };
    }
    return { ...record };
}

async function saveVisit(e) {
    e.preventDefault();
    const selectedProducts = Array.from(document.getElementById('v_products').selectedOptions).map(opt => opt.value);
    const type = document.getElementById('v_type').value;
    const workWith = getSelectedWorkWith();
    let clientData = '';
    let linkedChem = 'N/A';

    if (!workWith) return alert('Please enter who you worked with, or choose Self.');

    if (selectedProducts.includes('__add_product__')) {
        openMasterTab('product');
        return alert('Please add the product in Master Data before saving the visit.');
    }

    if (type === 'Doctor') {
        clientData = document.getElementById('v_doctor').value;
        linkedChem = document.getElementById('v_linked_chemist').value;
        if (clientData === '__add_doctor__') {
            openMasterTab('doctor');
            return alert('Please add the doctor in Master Data before saving the visit.');
        }
        if (linkedChem === '__add_chemist__') {
            openMasterTab('chemist');
            return alert('Please add the chemist in Master Data before saving the visit.');
        }
        if (!clientData) return alert('Please select a Doctor. If list is empty, add one in Master Data.');
    } else {
        clientData = document.getElementById('v_chemist').value;
        if (clientData === '__add_chemist__') {
            openMasterTab('chemist');
            return alert('Please add the chemist in Master Data before saving the visit.');
        }
        if (!clientData) return alert('Please select a Chemist. If list is empty, add one in Master Data.');
    }

    const visitObj = {
        id: Date.now(),
        date: document.getElementById('v_date').value,
        hq: document.getElementById('v_hq').value,
        type,
        workWith,
        client: clientData,
        linkedChemist: linkedChem,
        products: selectedProducts.filter(v => v !== '__add_product__').join(', ') || 'None',
        pob: parseFloat(document.getElementById('v_pob').value) || 0,
        expense: parseFloat(document.getElementById('v_expense').value) || 0,
        remarks: document.getElementById('v_remarks').value || 'None'
    };

    try {
        visitsDB.push(visitObj);
        await persistVisitsDB();
        alert('Visit Logged Successfully!');

        const savedDate = document.getElementById('v_date').value;
        const savedHQ = document.getElementById('v_hq').value;
        e.target.reset();
        document.getElementById('v_date').value = savedDate;
        document.getElementById('v_hq').value = savedHQ;
        toggleVisitType();
        toggleWorkWithOther();
        applyFilter();
    } catch (error) {
        visitsDB = visitsDB.filter(v => v.id !== visitObj.id);
        alert(`Visit was not saved on the server: ${error.message}`);
    }
}

function applyFilter() {
    const filterType = document.getElementById('filterType').value;
    const customDates = document.getElementById('customDates');
    const today = new Date();

    customDates.classList.toggle('hidden', filterType !== 'custom');

    filteredData = visitsDB.filter(item => {
        const itemDate = new Date(item.date);
        if (filterType === 'monthly') return itemDate.getMonth() === today.getMonth() && itemDate.getFullYear() === today.getFullYear();
        if (filterType === 'yearly') return itemDate.getFullYear() === today.getFullYear();
        if (filterType === 'weekly') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            return itemDate >= sevenDaysAgo && itemDate <= today;
        }
        if (filterType === 'custom') {
            const start = document.getElementById('startDate').value;
            const end = document.getElementById('endDate').value;
            if (start && end) return item.date >= start && item.date <= end;
        }
        return true;
    });

    filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderTableAndCards();
}

function renderTableAndCards() {
    const tbody = document.getElementById('reportTableBody');
    let totalVisits = 0;
    let totalPOB = 0;
    let totalExp = 0;

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">No records found.</td></tr>';
    } else {
        tbody.innerHTML = filteredData.map(v => {
            totalVisits++;
            totalPOB += v.pob;
            totalExp += v.expense;
            return `
            <tr>
                <td class="text-nowrap">${escapeHTML(v.date)}<br><small class="text-muted">${escapeHTML(v.hq)}</small></td>
                <td><span class="badge ${v.type === 'Doctor' ? 'bg-primary' : 'bg-success'}">${escapeHTML(v.type)}</span></td>
                <td><small>${escapeHTML(v.workWith || 'Self')}</small></td>
                <td class="fw-bold">${escapeHTML(v.client)}</td>
                <td><small>${escapeHTML(v.linkedChemist)}</small></td>
                <td><small>${escapeHTML(v.products)}</small></td>
                <td class="text-success fw-bold">INR ${escapeHTML(v.pob)}</td>
                <td class="text-danger">INR ${escapeHTML(v.expense)}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(v.remarks)}"><small>${escapeHTML(v.remarks)}</small></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="deleteVisit(${v.id})">Del</button></td>
            </tr>`;
        }).join('');
    }

    document.getElementById('sum-visits').innerText = totalVisits;
    document.getElementById('sum-pob').innerText = `INR ${totalPOB.toLocaleString()}`;
    document.getElementById('sum-expense').innerText = `INR ${totalExp.toLocaleString()}`;
}

async function deleteVisit(id) {
    if (!confirm('Delete this visit record?')) return;
    const previousVisits = [...visitsDB];
    visitsDB = visitsDB.filter(v => v.id !== id);
    try {
        await persistVisitsDB();
        applyFilter();
    } catch (error) {
        visitsDB = previousVisits;
        alert(`Visit was not deleted on the server: ${error.message}`);
    }
}

function exportToExcel() {
    if (filteredData.length === 0) return alert('No data to export!');

    const exportData = filteredData.map(v => ({
        'Date': v.date,
        'HQ / Area': v.hq,
        'Visit Type': v.type,
        'Work With': v.workWith || 'Self',
        'Client Visited': v.client,
        'Linked Chemist (For Doctor Visits)': v.linkedChemist,
        'Products Detailed': v.products,
        'POB Generated (INR)': v.pob,
        'Travel Expense (INR)': v.expense,
        'Remarks / Feedback': v.remarks
    }));

    exportData.unshift({
        'Date': 'Company',
        'HQ / Area': 'BIOXEN HEALTH CARE',
        'Visit Type': '',
        'Work With': '',
        'Client Visited': '',
        'Linked Chemist (For Doctor Visits)': '',
        'Products Detailed': '',
        'POB Generated (INR)': '',
        'Travel Expense (INR)': '',
        'Remarks / Feedback': ''
    });

    const totalPOB = filteredData.reduce((sum, v) => sum + v.pob, 0);
    const totalExp = filteredData.reduce((sum, v) => sum + v.expense, 0);
    exportData.push({
        'Date': 'TOTALS',
        'HQ / Area': '',
        'Visit Type': '',
        'Work With': '',
        'Client Visited': `Visits: ${filteredData.length}`,
        'Linked Chemist (For Doctor Visits)': '',
        'Products Detailed': '',
        'POB Generated (INR)': totalPOB,
        'Travel Expense (INR)': totalExp,
        'Remarks / Feedback': ''
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MR CRM Logs');
    XLSX.writeFile(wb, `MR_CRM_Advanced_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
