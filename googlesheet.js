// googlesheet.js (Updated on 23-July-2025)

async function sendDataToGoogleSheet(data) {
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz1y1pLeoOnO8d1FleAA98FNjS3AIzaIARB_PTwn7CplqBQW-k6ncbBzH17NCyp21MO/exec';

    // General CLI Observation and abnormalities
    data.cliObservation = document.getElementById('cliRemarks').value.trim() || 'NIL';
    data.abnormality = document.getElementById('cliAbnormalities').value.trim() || 'NIL';
    
    // BFT and BPT remarks
    data.bftRemark = document.getElementById('bftRemark').value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark').value.trim() || 'NA';

    // --- START: MODIFICATION FOR DRIVING ANALYSIS ---
    // Har stop ke liye report data ko update karein, jismein latest analysis aur remarks shamil hon
    if (data.stops && Array.isArray(data.stops)) {
        data.stops.forEach((stop, index) => {
            // "System Analysis" dropdown se vartaman value prapt karein
            const systemAnalysisSelect = document.querySelector(`.system-analysis-dropdown[data-stop-index="${index}"]`);
            stop.finalSystemAnalysis = systemAnalysisSelect ? systemAnalysisSelect.value : stop.brakingTechnique;

            // "CLI Remark" input field se vartaman value prapt karein
            const cliRemarkInput = document.querySelector(`.cli-remark-input-row[data-stop-index="${index}"]`);
            stop.cliRemark = cliRemarkInput ? cliRemarkInput.value.trim() : 'NA';
        });
    }
    // --- END: MODIFICATION FOR DRIVING ANALYSIS ---

    // --- START: DUPLICATE PREVENTION LOGIC ---
    // 1. Create a Unique ID from report details
    const trainNumber = data.trainDetails?.find(d => d.label === 'Train Number')?.value || 'N/A';
    const locoNumber = data.trainDetails?.find(d => d.label === 'Loco Number')?.value || 'N/A';
    const analysisTime = data.trainDetails?.find(d => d.label === 'Analysis Time')?.value || 'N/A';
    const uniqueId = `report_${trainNumber}_${locoNumber}_${analysisTime.replace(/[^\w]/g, '_')}`;

    // 2. Check localStorage if this report has been sent before
    if (localStorage.getItem(uniqueId)) {
        const userWantsToResubmit = confirm("This report data has already been sent to the Google Sheet. Do you want to send it again?");
        if (!userWantsToResubmit) {
            console.log('Submission cancelled by user to prevent duplicate entry.');
            // Stop the sheet submission but allow the PDF download to proceed.
            return;
        }
    }
    // --- END: DUPLICATE PREVENTION LOGIC ---

    try {
        await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        console.log('Data successfully sent to Google Sheet.');
        alert('Data successfully sent to Google Sheet!'); // Inform the user

        // --- START: DUPLICATE PREVENTION LOGIC (FLAGGING) ---
        // 3. Flag the report as sent in localStorage
        localStorage.setItem(uniqueId, 'true');
        // --- END: DUPLICATE PREVENTION LOGIC (FLAGGING) ---

    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
        alert('There was an error sending the data to Google Sheet. Please check the console.'); // Inform user of error
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');
    
    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            const reportDataString = localStorage.getItem('spmReportData');
            if (reportDataString) {
                const reportData = JSON.parse(reportDataString);
                
                // Yeh function ab data bhejne se pehle usse modify karega
                sendDataToGoogleSheet(reportData);
            }
            
            if (typeof generatePDF === 'function') {
                // PDF function data bhejne ke baad bhi call hoga
                generatePDF();
            } else {
                console.error('generatePDF function is not defined.');
            }
        });
    }
});