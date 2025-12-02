// googlesheet.js - Fully Updated with Dual Sheet Support

async function sendDataToGoogleSheet(data) {
    // 1. Primary Apps Script URL (Main Sheet)
    const primaryAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbxjGV2wkdd0JV1UZTLjLuwj75B4l4XanHNrM8t8vQiSaH_pwkdN_SgNHPoRCq4Q7OA3/exec';

    // 2. Secondary Apps Script URL (Other/New Sheet)
    // 👇👇👇 IMPORTANT: Paste your NEW Web App URL below inside the quotes 👇👇👇
    const otherAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyE7iCeO3YByhz8mOr1jwSlngk88PMbSkJBybp7bfXlZGQdYJsZ3qsBDuEMdygd8JqK/exec'; 

    // --- START: ABNORMALITY DATA COLLECTION ---
    data.abnormality_bft_nd = document.getElementById('chk-bft-nd').checked ? 1 : 0;
    data.abnormality_bpt_nd = document.getElementById('chk-bpt-nd').checked ? 1 : 0;
    data.abnormality_bft_rule = document.getElementById('chk-bft-rule').checked ? 1 : 0;
    data.abnormality_bpt_rule = document.getElementById('chk-bpt-rule').checked ? 1 : 0;
    data.abnormality_late_ctrl = document.getElementById('chk-late-ctrl').checked ? 1 : 0;
    data.abnormality_overspeed = document.getElementById('chk-overspeed').checked ? 1 : 0;
    data.abnormality_others = document.getElementById('chk-others').checked ? 1 : 0;

    const abnormalityStrings = [];
    if (data.abnormality_bft_nd === 1) abnormalityStrings.push("BFT not done");
    if (data.abnormality_bpt_nd === 1) abnormalityStrings.push("BPT not done");
    if (data.abnormality_bft_rule === 1) abnormalityStrings.push(`BFT not done as per rule:- ${document.getElementById('txt-bft-rule').value.trim()}`);
    if (data.abnormality_bpt_rule === 1) abnormalityStrings.push(`BPT not done as per rule:- ${document.getElementById('txt-bpt-rule').value.trim()}`);
    if (data.abnormality_late_ctrl === 1) abnormalityStrings.push(`Late Controlling:- ${document.getElementById('txt-late-ctrl').value.trim()}`);
    if (data.abnormality_overspeed === 1) abnormalityStrings.push(`Over speeding:- ${document.getElementById('txt-overspeed').value.trim()}`);
    if (data.abnormality_others === 1) abnormalityStrings.push(`Other Abnormalities:- ${document.getElementById('txt-others').value.trim()}`);

    data.abnormality = abnormalityStrings.join('; \n') || 'NIL'; 
    
    // Ensure the hidden textarea is updated so PDF picks it up correctly (if used separately)
    const cliAbnormalitiesArea = document.getElementById('cliAbnormalities');
    if(cliAbnormalitiesArea) cliAbnormalitiesArea.value = data.abnormality;

    // --- END: ABNORMALITY DATA COLLECTION ---

    // Collect Remarks and Action Taken
    data.cliObservation = document.getElementById('cliRemarks').value.trim() || 'NIL';
    data.totalAbnormality = document.getElementById('totalAbnormality').value.trim() || '0';
    
    const selectedActionRadio = document.querySelector('input[name="actionTakenRadio"]:checked');
    data.actionTaken = selectedActionRadio ? selectedActionRadio.value : 'NIL';

    data.bftRemark = document.getElementById('bftRemark').value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark').value.trim() || 'NA';

    // Collect Stop Analysis Details
    if (data.stops && Array.isArray(data.stops)) {
        data.stops.forEach((stop, index) => {
            const systemAnalysisSelect = document.querySelector(`.system-analysis-dropdown[data-stop-index="${index}"]`);
            stop.finalSystemAnalysis = systemAnalysisSelect ? systemAnalysisSelect.value : stop.brakingTechnique;
            const cliRemarkInput = document.querySelector(`.cli-remark-input-row[data-stop-index="${index}"]`);
            stop.cliRemark = cliRemarkInput ? cliRemarkInput.value.trim() : 'NIL'; 
        });
    }
    
    // Clean heavy data before sending to Sheet (images/configs not needed in Sheet)
    delete data.speedChartConfig;
    delete data.stopChartConfig;
    delete data.speedChartImage;
    delete data.stopChartImage;

    // --- CHECK FOR "OTHER" CLI MODE ---
    const isOtherMode = localStorage.getItem('isOtherCliMode') === 'true';
    const customName = localStorage.getItem('customCliName');

    let targetUrl = primaryAppsScriptUrl; // Default to Primary

    if (isOtherMode && customName) {
      // Sirf yeh check karein ki URL khali toh nahi hai
if (!otherAppsScriptUrl || otherAppsScriptUrl.trim() === '') {
    alert("Configuration Error: Secondary Google Sheet URL is missing inside 'googlesheet.js'.");
    throw new Error("Secondary URL missing");
}
        targetUrl = otherAppsScriptUrl;
        
        // Override the CLI Name in data payload
        data.cliName = customName;
        console.log(`Switching to Secondary Sheet for CLI: ${customName}`);
    } else {
        console.log("Using Primary Sheet.");
    }

    console.log("Sending data to:", targetUrl);

    // --- SEND DATA ---
    try {
        await fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        console.log('Data sent successfully (no-cors mode).');

    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
        alert('There was a network error while sending the data. Please check your connection.');
        throw error; 
    }
}

// --- Event Listener for Download Button ---
document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (downloadButton) {
        downloadButton.addEventListener('click', async () => { 
            console.log("Download button clicked.");

            // --- VALIDATION START ---
            let isValid = true;
            let firstInvalidElement = null;

            // 1. Check Abnormality Remarks
            document.querySelectorAll('#abnormalities-checkbox-container input[type="checkbox"]:checked').forEach(chk => {
                const textId = chk.dataset.textId;
                if (textId) {
                    const textField = document.getElementById(textId);
                    if (!textField || !textField.value.trim()) {
                        const labelText = chk.closest('label')?.textContent.trim() || 'the selected abnormality';
                        alert(`Please enter a remark for "${labelText}".`);
                        if (textField && !firstInvalidElement) firstInvalidElement = textField;
                        isValid = false;
                    }
                }
            });
            if (!isValid) {
                if(firstInvalidElement) firstInvalidElement.focus();
                return;
            }

             // 2. Check Action Taken
             const actionSelected = document.querySelector('input[name="actionTakenRadio"]:checked');
             if (!actionSelected) {
                 alert('Please select an option for "Action Taken".');
                 const firstRadio = document.getElementById('actionIntensive');
                 if(firstRadio && !firstInvalidElement) firstInvalidElement = firstRadio;
                 isValid = false;
             }
            if (!isValid) {
                if(firstInvalidElement) firstInvalidElement.focus();
                return;
            }
            // --- VALIDATION END ---

            // --- PROCESS START ---
            downloadButton.disabled = true;
            downloadButton.textContent = 'Processing... Please Wait...';
            if(loadingOverlay) loadingOverlay.style.display = 'flex';

            const reportDataString = localStorage.getItem('spmReportData');
            if (reportDataString) {
                let reportData;
                try {
                     reportData = JSON.parse(reportDataString);
                } catch(e) {
                     alert("Error retrieving report data. Please go back and try again.");
                     downloadButton.disabled = false;
                     downloadButton.textContent = 'Download Report';
                     if(loadingOverlay) loadingOverlay.style.display = 'none';
                     return;
                }

                try {
                    // 1. Send data to Google Sheet (Primary or Secondary based on logic)
                    await sendDataToGoogleSheet(reportData);
                    console.log("Data sending initiated.");

                    // 2. Generate the PDF AND WAIT
                    if (typeof generatePDF === 'function') {
                        console.log("Calling generatePDF...");
                        await generatePDF(); 
                        console.log("generatePDF process finished.");
                        
                        // 3. Inform user and redirect AFTER PDF
                        alert('Data submitted and report generated. You will now be redirected.');
                        
                        // Clean up
                        localStorage.removeItem('spmReportData');
                        localStorage.removeItem('isOtherCliMode');
                        localStorage.removeItem('customCliName');
                        
                        window.location.href = 'index.html'; 

                    } else {
                        console.error('generatePDF function is not defined.');
                        alert('Error: PDF generation function not found. Data might have been submitted.');
                        downloadButton.disabled = false;
                        downloadButton.textContent = 'Download Failed - Retry?';
                        if(loadingOverlay) loadingOverlay.style.display = 'none';
                    }
                } catch (error) { 
                    console.error("Error during process:", error);
                    alert("An error occurred during submission. Please check console.");
                    downloadButton.disabled = false;
                    downloadButton.textContent = 'Download Report';
                    if(loadingOverlay) loadingOverlay.style.display = 'none';
                }
            } else {
                alert('Error: Report data not found. Please go back and try again.');
                downloadButton.disabled = false;
                downloadButton.textContent = 'Download Report';
                if(loadingOverlay) loadingOverlay.style.display = 'none';
            }
        }); 
    } 
});