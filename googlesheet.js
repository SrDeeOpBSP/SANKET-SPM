// googlesheet.js (Updated with new fields and redirect logic)

async function sendDataToGoogleSheet(data) {
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbzrJqN2MNxpVhtOLBH3TZPUiFyP6F2dVTsAJso5sawc_6IE13LyIpxNtR9R6x234209/exec';
    
    // Add data from all CLI observation textareas
    data.cliObservation = document.getElementById('cliRemarks').value.trim() || 'NIL';
    data.abnormality = document.getElementById('cliAbnormalities').value.trim() || 'NIL';
    data.totalAbnormality = document.getElementById('totalAbnormality').value.trim() || 'NIL';
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
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        console.log('Data successfully sent to Google Sheet.');
    } catch (error) {
        console.error('Error sending data to Google Sheet:', error);
        alert('There was an error sending the data to Google Sheet. Please check the console.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');
    
    if (downloadButton) {
        downloadButton.addEventListener('click', async () => {
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