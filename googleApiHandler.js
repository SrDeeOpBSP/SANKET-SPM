const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz88hGtB4PbKB0q_rXE6KlDI3yk3NM_B_nPbJRfzE94stBn5OtJJg1DsFH7saTgrCjeEA/exec';

/**
 * Converts a file to a Base64 string.
 * @param {File} file The file to convert.
 * @returns {Promise<String>} A promise that resolves with the Base64 string.
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // The result includes a prefix like "data:mime/type;base64,", which we need to remove.
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
 * @returns {Promise<Object>} A promise that resolves upon successful submission.
 */
async function uploadDataAndFileToGoogle() {
    // 1. Gather all form data into a single object
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
        fromDateTime: document.getElementById('fromDateTime').value,
        toDateTime: document.getElementById('toDateTime').value,
    };

    const spmFile = document.getElementById('spmFile').files[0];
    if (!spmFile) {
        throw new Error("SPM file is not selected.");
    }

    // 2. Add file details and its Base64 content to the payload
    formData.fileName = spmFile.name;
    formData.mimeType = spmFile.type || 'application/octet-stream'; // Provide a fallback MIME type
    formData.fileContent = await fileToBase64(spmFile);

    // 3. Send the entire payload to your Google Apps Script
    // We use 'no-cors' mode as a simple way to send data without a complex server setup.
    // The script will execute, but our browser code won't be able to read the response.
    await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', 
        body: JSON.stringify(formData)
    });

    // Since we can't read the response in no-cors mode, we optimistically assume success.
    return { status: 'success', message: 'Data sent to Google Sheet for processing.' };
}