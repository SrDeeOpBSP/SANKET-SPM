// googlesheet.js (Updated on 23-July-2025)

async function sendDataToGoogleSheet(data) {
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbwjofnu1yAXI2KMzfn7Ypdh1_RbNrRmheAAsqDxo-3aK9WF_lcvPf1F8nzV--C4Nay6/exec';

    // General CLI Observation
    data.cliObservation = document.getElementById('cliRemarks').value.trim();
    
    // BFT aur BPT remarks
    data.bftRemark = document.getElementById('bftRemark').value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark').value.trim() || 'NA';

    // *** NAYA CODE: Abnormality text ko data mein add karein ***
    data.abnormality = document.getElementById('cliAbnormalities').value.trim() || 'NIL';

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
                
                const cliAnalysisSelections = Array.from(document.querySelectorAll('.cli-analysis')).map(select => select.value);
                reportData.cliAnalysis = cliAnalysisSelections;
                
                // This function now contains the duplicate check logic
                sendDataToGoogleSheet(reportData);
            }
            
            if (typeof generatePDF === 'function') {
                // The generatePDF function is called regardless of whether the data was sent to the sheet again.
                generatePDF();
            } else {
                console.error('generatePDF function is not defined.');
            }
        });
    }
});