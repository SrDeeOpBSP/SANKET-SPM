// googlesheet.js (Corrected: Original Data Send + New await Logic)

async function sendDataToGoogleSheet(data) {
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbxjGV2wkdd0JV1UZTLjLuwj75B4l4XanHNrM8t8vQiSaH_pwkdN_SgNHPoRCq4Q7OA3/exec';

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

    data.abnormality = abnormalityStrings.join('; \n') || 'NIL'; // Use semicolon
    document.getElementById('cliAbnormalities').value = data.abnormality;
    // --- END: ABNORMALITY DATA COLLECTION ---

    data.cliObservation = document.getElementById('cliRemarks').value.trim() || 'NIL';
    data.totalAbnormality = document.getElementById('totalAbnormality').value.trim() || '0';
    
    // --- FIX: Read from Radio Buttons ---
    const selectedActionRadio = document.querySelector('input[name="actionTakenRadio"]:checked');
    data.actionTaken = selectedActionRadio ? selectedActionRadio.value : 'NIL';

    data.bftRemark = document.getElementById('bftRemark').value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark').value.trim() || 'NA';

    if (data.stops && Array.isArray(data.stops)) {
        data.stops.forEach((stop, index) => {
            const systemAnalysisSelect = document.querySelector(`.system-analysis-dropdown[data-stop-index="${index}"]`);
            stop.finalSystemAnalysis = systemAnalysisSelect ? systemAnalysisSelect.value : stop.brakingTechnique;
            const cliRemarkInput = document.querySelector(`.cli-remark-input-row[data-stop-index="${index}"]`);
            stop.cliRemark = cliRemarkInput ? cliRemarkInput.value.trim() : 'NIL'; // Use NIL
        });
    }
    
    // Clean data before sending
    delete data.speedChartConfig;
    delete data.stopChartConfig;
    delete data.speedChartImage;
    delete data.stopChartImage;

    console.log("Data being sent (Original Method):", data);

    // --- Using your original, working fetch logic ---
    try {
        await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'application/json' // <<< Reverted to 'application/json'
            },
            body: JSON.stringify(data) // <<< Reverted to sending data directly
        });

        console.log('Data sent to Google Sheet (assumed success in no-cors mode).');

    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
        alert('There was a network error while sending the data. Please check your connection.');
        throw error; // Stop the process
    }
}

// --- Event Listener with await logic ---
document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');

    if (downloadButton) {
        downloadButton.addEventListener('click', async () => { // <<< Must be async
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
            loadingOverlay.style.display = 'flex';

            const reportDataString = localStorage.getItem('spmReportData');
            if (reportDataString) {
                let reportData;
                try {
                     reportData = JSON.parse(reportDataString);
                } catch(e) {
                     alert("Error retrieving report data. Please go back and try again.");
                     downloadButton.disabled = false;
                     downloadButton.textContent = 'Download Report';
                     loadingOverlay.style.display = 'none';
                     return;
                }

                try {
                    // 1. Send data to Google Sheet
                    await sendDataToGoogleSheet(reportData);
                    console.log("Data sending initiated.");

                    // 2. Generate the PDF AND WAIT
                    if (typeof generatePDF === 'function') {
                        console.log("Calling generatePDF...");
                        await generatePDF(); // <<< Wait for PDF function
                        console.log("generatePDF process finished.");
                        
                        // 3. Inform user and redirect AFTER PDF
                        alert('Data submitted and report generated. You will now be redirected.');
                        localStorage.removeItem('spmReportData');
                        window.location.href = 'index.html'; 

                    } else {
                        console.error('generatePDF function is not defined.');
                        alert('Error: PDF generation function not found. Data might have been submitted.');
                        downloadButton.disabled = false;
                        downloadButton.textContent = 'Download Failed - Retry?';
                        loadingOverlay.style.display = 'none';
                    }
                } catch (error) { // Catch errors from sendData OR generatePDF
                    console.error("Error during process:", error);
                    alert("An error occurred. Please check console and try again.");
                    downloadButton.disabled = false;
                    downloadButton.textContent = 'Download Report';
                    loadingOverlay.style.display = 'none';
                }
            } else {
                alert('Error: Report data not found. Please go back and try again.');
                downloadButton.disabled = false;
                downloadButton.textContent = 'Download Report';
                loadingOverlay.style.display = 'none';
            }
        }); // End click listener
    } // End if(downloadButton)
}); // End DOMContentLoaded
