// googlesheet.js - Fixed: Reads HQ from LocalStorage

async function sendDataToGoogleSheet(data) {
    // 1. Primary Apps Script URL (Main Sheet - SPM ANALYSIS BANK)
    const primaryAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbxjGV2wkdd0JV1UZTLjLuwj75B4l4XanHNrM8t8vQiSaH_pwkdN_SgNHPoRCq4Q7OA3/exec';

    // 2. Secondary Apps Script URL (Other Sheet - OTHER DIVISION)
    const otherAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyE7iCeO3YByhz8mOr1jwSlngk88PMbSkJBybp7bfXlZGQdYJsZ3qsBDuEMdygd8JqK/exec'; 

    // --- ALLOWED HQ LIST ---
    const ALLOWED_HQS = ['AKT', 'BJRI', 'BRJN', 'BSP', 'KHS', 'KRBA', 'PND', 'RIG', 'SDL', 'SJQ', 'USL'];

    // --- START: DATA COLLECTION ---
    data.abnormality_bft_nd = document.getElementById('chk-bft-nd')?.checked ? 1 : 0;
    data.abnormality_bpt_nd = document.getElementById('chk-bpt-nd')?.checked ? 1 : 0;
    data.abnormality_bft_rule = document.getElementById('chk-bft-rule')?.checked ? 1 : 0;
    data.abnormality_bpt_rule = document.getElementById('chk-bpt-rule')?.checked ? 1 : 0;
    data.abnormality_late_ctrl = document.getElementById('chk-late-ctrl')?.checked ? 1 : 0;
    data.abnormality_overspeed = document.getElementById('chk-overspeed')?.checked ? 1 : 0;
    data.abnormality_others = document.getElementById('chk-others')?.checked ? 1 : 0;

    const abnormalityStrings = [];
    if (data.abnormality_bft_nd) abnormalityStrings.push("BFT not done");
    if (data.abnormality_bpt_nd) abnormalityStrings.push("BPT not done");
    if (data.abnormality_bft_rule) abnormalityStrings.push(`BFT not done as per rule:- ${document.getElementById('txt-bft-rule')?.value.trim()}`);
    if (data.abnormality_bpt_rule) abnormalityStrings.push(`BPT not done as per rule:- ${document.getElementById('txt-bpt-rule')?.value.trim()}`);
    if (data.abnormality_late_ctrl) abnormalityStrings.push(`Late Controlling:- ${document.getElementById('txt-late-ctrl')?.value.trim()}`);
    if (data.abnormality_overspeed) abnormalityStrings.push(`Over speeding:- ${document.getElementById('txt-overspeed')?.value.trim()}`);
    if (data.abnormality_others) abnormalityStrings.push(`Other Abnormalities:- ${document.getElementById('txt-others')?.value.trim()}`);

    data.abnormality = abnormalityStrings.join('; \n') || 'NIL'; 
    
    const cliAbnormalitiesArea = document.getElementById('cliAbnormalities');
    if(cliAbnormalitiesArea) cliAbnormalitiesArea.value = data.abnormality;

    data.cliObservation = document.getElementById('cliRemarks')?.value.trim() || 'NIL';
    data.totalAbnormality = document.getElementById('totalAbnormality')?.value.trim() || '0';
    
    const selectedActionRadio = document.querySelector('input[name="actionTakenRadio"]:checked');
    data.actionTaken = selectedActionRadio ? selectedActionRadio.value : 'NIL';

    data.bftRemark = document.getElementById('bftRemark')?.value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark')?.value.trim() || 'NA';

    if (data.stops && Array.isArray(data.stops)) {
        data.stops.forEach((stop, index) => {
            const systemAnalysisSelect = document.querySelector(`.system-analysis-dropdown[data-stop-index="${index}"]`);
            stop.finalSystemAnalysis = systemAnalysisSelect ? systemAnalysisSelect.value : stop.brakingTechnique;
            const cliRemarkInput = document.querySelector(`.cli-remark-input-row[data-stop-index="${index}"]`);
            stop.cliRemark = cliRemarkInput ? cliRemarkInput.value.trim() : 'NIL'; 
        });
    }
    
    delete data.speedChartConfig;
    delete data.stopChartConfig;
    delete data.speedChartImage;
    delete data.stopChartImage;

    // --- CRITICAL FIX: READ HQ FROM STORAGE ---
    
    // 1. Try LocalStorage (Saved during Submit)
    let storedHq = localStorage.getItem('currentSessionHq');
    
    // 2. Try DOM (If still visible)
    if (!storedHq && document.getElementById('cliHqDisplay')) {
        storedHq = document.getElementById('cliHqDisplay').value;
    }

    // 3. Normalize
    let currentHq = storedHq ? storedHq.toString().trim().toUpperCase() : "UNKNOWN";
    
    // Update data payload
    data.cliHq = currentHq;

    // Debugging
    console.log(`Final HQ for Routing: [${currentHq}]`);

    let targetUrl = primaryAppsScriptUrl;

    // 4. CHECK LOGIC
    if (ALLOWED_HQS.includes(currentHq)) {
        console.log(`MATCH: Sending to PRIMARY Sheet.`);
        targetUrl = primaryAppsScriptUrl;
    } else {
        console.log(`NO MATCH: Sending to OTHER DIVISION Sheet.`);
        targetUrl = otherAppsScriptUrl;
    }

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

        console.log('Data sent successfully.');

    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
        alert('Network Error. Data could not be sent.');
        throw error; 
    }
}

// --- Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (downloadButton) {
        downloadButton.addEventListener('click', async () => { 
            let isValid = true;
            let firstInvalidElement = null;

            document.querySelectorAll('#abnormalities-checkbox-container input[type="checkbox"]:checked').forEach(chk => {
                const textId = chk.dataset.textId;
                if (textId) {
                    const textField = document.getElementById(textId);
                    if (!textField || !textField.value.trim()) {
                        alert(`Please enter a remark for the selected abnormality.`);
                        if (textField && !firstInvalidElement) firstInvalidElement = textField;
                        isValid = false;
                    }
                }
            });
            
            const actionSelected = document.querySelector('input[name="actionTakenRadio"]:checked');
            if (!actionSelected) {
                 alert('Please select an option for "Action Taken".');
                 isValid = false;
            }

            if (!isValid) return;

            downloadButton.disabled = true;
            downloadButton.textContent = 'Processing...';
            if(loadingOverlay) loadingOverlay.style.display = 'flex';

            const reportDataString = localStorage.getItem('spmReportData');
            if (reportDataString) {
                let reportData;
                try {
                     reportData = JSON.parse(reportDataString);
                } catch(e) {
                     alert("Error retrieving data. Refresh page.");
                     if(loadingOverlay) loadingOverlay.style.display = 'none';
                     return;
                }

                try {
                    await sendDataToGoogleSheet(reportData);
                    
                    if (typeof generatePDF === 'function') {
                        await generatePDF(); 
                        alert('Data submitted and report generated. Redirecting...');
                        
                        localStorage.removeItem('spmReportData');
                        localStorage.removeItem('currentSessionHq'); // Clean up HQ
                        localStorage.removeItem('isOtherCliMode');
                        localStorage.removeItem('customCliName');
                        window.location.href = 'index.html'; 
                    } else {
                        alert('PDF function missing.');
                    }
                } catch (error) { 
                    console.error("Error:", error);
                    alert("Error during submission.");
                    downloadButton.disabled = false;
                    if(loadingOverlay) loadingOverlay.style.display = 'none';
                }
            } else {
                alert('No report data found.');
                if(loadingOverlay) loadingOverlay.style.display = 'none';
            }
        }); 
    }
});