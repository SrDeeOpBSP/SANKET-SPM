// googlesheet.js

async function sendDataToGoogleSheet(data) {
    // Aapka Diya Gaya Apps Script URL
    const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbwwzY_Dn0wcfmAJ2hLbYqUpOL7jLoDKkbxJ2eesiyZYzoQGeq3m2y8kHomvpIulbWqW/exec';

    data.cliObservation = document.getElementById('cliRemarks').value.trim();

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

// Yeh code page load hone ke baad download button se jud jayega
document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('downloadReport');
    
    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            // 1. localStorage se report data lein
            const reportDataString = localStorage.getItem('spmReportData');
            if (reportDataString) {
                const reportData = JSON.parse(reportDataString);
                
                // Driving Analysis table se CLI ke remarks collect karein
                const cliAnalysisSelections = Array.from(document.querySelectorAll('.cli-analysis')).map(select => select.value);
                reportData.cliAnalysis = cliAnalysisSelections;
                
                // Data ko Google Sheet par bhejein
                sendDataToGoogleSheet(reportData);
            }
            
            // 2. PDF download function call karein (yeh report.html mein pehle se hai)
            if (typeof generatePDF === 'function') {
                generatePDF();
            } else {
                console.error('generatePDF function is not defined.');
            }
        });
    }
});