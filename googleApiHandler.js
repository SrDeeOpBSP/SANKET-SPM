const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz88hGtB4PbKB0q_rXE6KlDI3yk3NM_B_nPbJRfzE94stBn5OtJJg1DsFH7saTgrCjeEA/exec';

/**
 * Converts a file to a Base64 string.
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const encoded = reader.result.toString().replace(/^data:(.*,)?/, '');
            if ((encoded.length % 4) > 0) {
                encoded += '='.repeat(4 - (encoded.length % 4));
            }
            resolve(encoded);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Gathers all data from the form, converts the SPM file, and sends everything
 * to the Google Apps Script.
 */
async function uploadDataAndFileToGoogle() {
    // --- 1. DEFINE ALLOWED HQS ---
    const ALLOWED_HQS = ['AKT', 'BJRI', 'BRJN', 'BSP', 'KHS', 'KRBA', 'PND', 'RIG', 'SDL', 'SJQ', 'USL'];

    // Get Current HQ from the readonly field
    // Agar field khali hai ya exist nahi karta, toh empty string manenge
    const currentHq = document.getElementById('cliHqDisplay') ? document.getElementById('cliHqDisplay').value.trim().toUpperCase() : '';

    // --- 2. CHECK IF UPLOAD SHOULD BE SKIPPED ---
    // Agar current HQ allowed list mein NAHI hai, toh upload skip karo
    if (!ALLOWED_HQS.includes(currentHq)) {
        console.log(`CLI HQ (${currentHq}) is not in the allowed list. Skipping Google Drive Upload.`);
        // Return a fake success object so the form process continues to local analysis
        return { status: 'skipped', message: 'Skipped Drive Upload for Other Division HQ.' };
    }

    // --- 3. GATHER FORM DATA ---
    const formData = {
        lpId: document.getElementById('lpId').value.trim(),
        lpName: document.getElementById('lpName').value.trim(),
        lpDesg: document.getElementById('lpDesg').value.trim(),
        lpGroupCli: document.getElementById('lpGroupCli').value.trim(),
        lpCugNumber: document.getElementById('lpCugNumber').value.trim(),
        alpId: document.getElementById('alpId').value.trim(),
        alpName: document.getElementById('alpName').value.trim(),
        alpDesg: document.getElementById('alpDesg').value.trim(),
        alpGroupCli: document.getElementById('alpGroupCli').value.trim(),
        alpCugNumber: document.getElementById('alpCugNumber').value.trim(),
        locoNumber: document.getElementById('locoNumber').value.trim(),
        trainNumber: document.getElementById('trainNumber').value.trim(),
        rakeType: document.getElementById('rakeType').value,
        maxPermissibleSpeed: document.getElementById('maxPermissibleSpeed').value,
        section: document.getElementById('section').value,
        fromSection: document.getElementById('fromSection').value.toUpperCase(),
        toSection: document.getElementById('toSection').value.toUpperCase(),
        spmType: document.getElementById('spmType').value,
        cliName: document.getElementById('cliName').value.trim(),
        cliHq: currentHq, // Sending HQ to script as well
        fromDateTime: document.getElementById('fromDateTime').value,
        toDateTime: document.getElementById('toDateTime').value,
    };

    const spmFile = document.getElementById('spmFile').files[0];
    if (!spmFile) {
        throw new Error("SPM file is not selected.");
    }

    // --- 4. PREPARE FILE ---
    formData.fileName = spmFile.name;
    formData.mimeType = spmFile.type || 'application/octet-stream'; 
    formData.fileContent = await fileToBase64(spmFile);

    // --- 5. UPLOAD TO DRIVE ---
    await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', 
        body: JSON.stringify(formData)
    });

    return { status: 'success', message: 'Data sent to Google Sheet for processing.' };
}