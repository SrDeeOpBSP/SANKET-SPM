// googlesheet.js (Updated on 23-July-2025)

async function sendDataToGoogleSheet(data) {
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbxrW5C-pW1z2TXxMkvUWE3BLJkEzg7EDdPVgLkQ08f99ByNU5GgqgwcN2Iq9Z_m6Gfp/exec';

    // General CLI Observation
    data.cliObservation = document.getElementById('cliRemarks').value.trim();
    
    // BFT aur BPT remarks
    data.bftRemark = document.getElementById('bftRemark').value.trim() || 'NA';
    data.bptRemark = document.getElementById('bptRemark').value.trim() || 'NA';

    // *** NAYA CODE: Abnormality text ko data mein add karein ***
    data.abnormality = document.getElementById('cliAbnormalities').value.trim() || 'NIL';

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
                
                sendDataToGoogleSheet(reportData);
            }
            
            if (typeof generatePDF === 'function') {
                generatePDF();
            } else {
                console.error('generatePDF function is not defined.');
            }
        });
    }
});