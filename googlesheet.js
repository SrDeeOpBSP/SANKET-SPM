// googlesheet.js (Updated with 'no-cors' mode and redirect logic)

async function sendDataToGoogleSheet(data) {
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbxW6rSZx8XzLnKKhDu9SMx3vU9Fhm2pQRPrrrGawW4-QRMk8o9nQJExIBsCSRogUyK-/exec';

    // --- START: NEW ABNORMALITY DATA COLLECTION ---

    // 1. Collect 1/0 values for each checkbox
    data.abnormality_bft_nd = document.getElementById('chk-bft-nd').checked ? 1 : 0;
    data.abnormality_bpt_nd = document.getElementById('chk-bpt-nd').checked ? 1 : 0;
    data.abnormality_bft_rule = document.getElementById('chk-bft-rule').checked ? 1 : 0;
    data.abnormality_bpt_rule = document.getElementById('chk-bpt-rule').checked ? 1 : 0;
    data.abnormality_late_ctrl = document.getElementById('chk-late-ctrl').checked ? 1 : 0;
    data.abnormality_overspeed = document.getElementById('chk-overspeed').checked ? 1 : 0;
    data.abnormality_others = document.getElementById('chk-others').checked ? 1 : 0;

    // 2. Build the abnormality string for Column AM
    const abnormalityStrings = [];
    if (data.abnormality_bft_nd === 1) abnormalityStrings.push("BFT not done");
    if (data.abnormality_bpt_nd === 1) abnormalityStrings.push("BPT not done");
    if (data.abnormality_bft_rule === 1) abnormalityStrings.push(`BFT not done as per rule:- ${document.getElementById('txt-bft-rule').value.trim()}`);
    if (data.abnormality_bpt_rule === 1) abnormalityStrings.push(`BPT not done as per rule:- ${document.getElementById('txt-bpt-rule').value.trim()}`);
    if (data.abnormality_late_ctrl === 1) abnormalityStrings.push(`Late Controlling:- ${document.getElementById('txt-late-ctrl').value.trim()}`);
    if (data.abnormality_overspeed === 1) abnormalityStrings.push(`Over speeding:- ${document.getElementById('txt-overspeed').value.trim()}`);
    if (data.abnormality_others === 1) abnormalityStrings.push(`Other Abnormalities:- ${document.getElementById('txt-others').value.trim()}`);

    // This will be sent to the sheet's "Abnormality Found" column
    data.abnormality = abnormalityStrings.join(',\n') || 'NIL';

    // Also populate the hidden textarea for the PDF generation
    document.getElementById('cliAbnormalities').value = data.abnormality;

    // --- END: NEW ABNORMALITY DATA COLLECTION ---

    // Add data from other CLI observation textareas
    data.cliObservation = document.getElementById('cliRemarks').value.trim() || 'NIL';
    data.totalAbnormality = document.getElementById('totalAbnormality').value.trim() || '0';
    data.actionTaken = document.getElementById('actionTaken').value.trim() || 'NIL';

    // Add BFT and BPT remarks
    data.bftRemark = document.getElementById('bftRemark').value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark').value.trim() || 'NA';

    // Update stop remarks from the UI
    if (data.stops && Array.isArray(data.stops)) {
        data.stops.forEach((stop, index) => {
            const systemAnalysisSelect = document.querySelector(`.system-analysis-dropdown[data-stop-index="${index}"]`);
            stop.finalSystemAnalysis = systemAnalysisSelect ? systemAnalysisSelect.value : stop.brakingTechnique;

            const cliRemarkInput = document.querySelector(`.cli-remark-input-row[data-stop-index="${index}"]`);
            stop.cliRemark = cliRemarkInput ? cliRemarkInput.value.trim() : 'NA';
        });
    }

    try {
        await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'no-cors', // <<-- महत्वपूर्ण बदलाव: यह लाइन वापस जोड़ दी गई है
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        // 'no-cors' मोड में, हम यह मान लेते हैं कि डेटा सफलतापूर्वक भेज दिया गया है
        console.log('Data sent to Google Sheet (assumed success in no-cors mode).');

    } catch (error) {
        // यह एरर आमतौर पर नेटवर्क समस्याओं के लिए ही दिखेगा
        console.error('Error sending data to Google Sheet:', error);
        alert('There was a network error while sending the data. Please check your connection.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');

    if (downloadButton) {
        downloadButton.addEventListener('click', async () => {
            // --- VALIDATION START ---
            let isValid = true;
            document.querySelectorAll('#abnormalities-checkbox-container input[type="checkbox"]:checked').forEach(chk => {
                const textId = chk.dataset.textId;
                if (textId) {
                    const textField = document.getElementById(textId);
                    if (!textField.value.trim()) {
                        alert(`Please enter a remark for "${chk.parentElement.textContent.trim()}".`);
                        textField.focus();
                        isValid = false;
                    }
                }
            });

            if (!isValid) return; // Stop if validation fails
            // --- VALIDATION END ---

            // Disable the button immediately to prevent multiple clicks
            downloadButton.disabled = true;
            downloadButton.textContent = 'Processing...';

            const reportDataString = localStorage.getItem('spmReportData');
            if (reportDataString) {
                const reportData = JSON.parse(reportDataString);

                // 1. Send data to Google Sheet
                await sendDataToGoogleSheet(reportData);

                // 2. Generate the PDF
                if (typeof generatePDF === 'function') {
                    generatePDF();
                } else {
                    console.error('generatePDF function is not defined.');
                }

                // 3. Inform user and redirect
                alert('Report has been downloaded and data submitted. You will now be redirected to the main page.');
                localStorage.removeItem('spmReportData'); // Clean up old data
                window.location.href = 'index.html'; // Redirect to the main form
            } else {
                alert('Error: Report data not found. Please try again.');
                downloadButton.disabled = false;
                downloadButton.textContent = 'Download Report';
            }
        });
    }

});
