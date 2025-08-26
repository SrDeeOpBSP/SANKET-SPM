
const spmConfig = {
    type: 'RTIS',
    // Column names from the RTIS XLSX file
    columnNames: {
        time: 'Gps Time',
        distance: 'distFromPrevLatLng',
        speed: 'Speed',
        event: 'Event' // Virtual column created by the script
    },
    eventCodes: {
        zeroSpeed: 'STOP' // Internal code for zero speed
    },
    brakeTests: {
        GOODS: {
            bft: { minSpeed: 10, maxSpeed: 30, maxDuration: 60 * 1000 },
            bpt: { minSpeed: 35, maxSpeed: 50, maxDuration: 60 * 1000 }
        },
        COACHING: {
            bft: { minSpeed: 10, maxSpeed: 30, maxDuration: 60 * 1000 },
            bpt: { minSpeed: 50, maxSpeed: 70, maxDuration: 60 * 1000 }
        },
        MEMU: {
            bft: { minSpeed: 10, maxSpeed: 30, maxDuration: 60 * 1000 },
            bpt: { minSpeed: 50, maxSpeed: 70, maxDuration: 60 * 1000 }
        }
    }
};

// Global chart instances
let speedChartInstance = null;
let stopChartInstance = null;

// CUG.csv file parser (reused)
const parseAndProcessCugData = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('CUG file is missing.'));
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transform: (value) => value.trim(),
            complete: (result) => {
                if (result.errors.length) return reject(new Error('Failed to parse CUG.csv.'));
                const processedData = result.data.map(call => {
                    const startDateTimeStr = call['Start Date & Time']?.trim();
                    const endDateTimeStr = call['End Date & Time']?.trim();
                    const dateTimeRegex = /^(?:(\d{2})[-\/](\d{2})[-\/](\d{4})|(\d{4})[-\/](\d{2})[-\/](\d{2}))\s(\d{2}):(\d{2})(?::(\d{2}))?$/;
                    const startMatch = startDateTimeStr?.match(dateTimeRegex);
                    const endMatch = endDateTimeStr?.match(dateTimeRegex);
                    if (startMatch && endMatch) {
                        let startDateTime, endDateTime;
                        const startSeconds = startMatch[9] || '00';
                        const endSeconds = endMatch[9] || '00';
                        if (startMatch[1]) {
                            startDateTime = new Date(`${startMatch[3]}-${startMatch[2]}-${startMatch[1]}T${startMatch[7]}:${startMatch[8]}:${startSeconds}`);
                            endDateTime = new Date(`${endMatch[3]}-${endMatch[2]}-${endMatch[1]}T${endMatch[7]}:${endMatch[8]}:${endSeconds}`);
                        } else {
                            startDateTime = new Date(`${startMatch[4]}-${startMatch[5]}-${startMatch[6]}T${startMatch[7]}:${startMatch[8]}:${startSeconds}`);
                            endDateTime = new Date(`${endMatch[4]}-${endMatch[5]}-${endMatch[6]}T${endMatch[7]}:${endMatch[8]}:${endSeconds}`);
                        }
                        return { ...call, startDateTime, endDateTime, duration: parseInt(call['Duration in Sec']) || 0, 'CUG MOBILE NO': call['CUG MOBILE NO']?.trim() };
                    }
                    return null;
                }).filter(Boolean);
                resolve(processedData);
            },
            error: (error) => reject(error)
        });
    });
};

// Main form submission handler
document.getElementById('spmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('Processing RTIS file, please wait...');
    if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(true);

    try {
        if (speedChartInstance) speedChartInstance.destroy();
        if (stopChartInstance) stopChartInstance.destroy();
        // --- YEH NAYA CODE ADD KAREIN ---
           // Step 1: File aur data ko pehle Google Drive par upload karega.
           showToast('Uploading data and SPM file to Google Drive. This may take a moment...');
           await uploadDataAndFileToGoogle();
           showToast('Upload complete! Now analyzing the data for the report...');
           // --- NAYA CODE YAHAN KHATAM ---
        const lpId = document.getElementById('lpId').value.trim();
        const lpName = document.getElementById('lpName').value.trim();
        const lpDesg = document.getElementById('lpDesg').value.trim();
        const lpGroupCli = document.getElementById('lpGroupCli').value.trim();
        const lpCugNumber = document.getElementById('lpCugNumber').value.trim();
        const alpId = document.getElementById('alpId').value.trim();
        const alpName = document.getElementById('alpName').value.trim();
        const alpDesg = document.getElementById('alpDesg').value.trim();
        const alpGroupCli = document.getElementById('alpGroupCli').value.trim();
        const alpCugNumber = document.getElementById('alpCugNumber').value.trim();
        const locoNumber = document.getElementById('locoNumber').value.trim();
        const trainNumber = document.getElementById('trainNumber').value.trim();
        const rakeType = document.getElementById('rakeType').value;
        const maxPermissibleSpeed = parseInt(document.getElementById('maxPermissibleSpeed').value);
        const section = document.getElementById('section').value;
        const fromSection = document.getElementById('fromSection').value.toUpperCase();
        const toSection = document.getElementById('toSection').value.toUpperCase();
        const routeSection = `${fromSection}-${toSection}`;
        const spmType = document.getElementById('spmType').value;
        const cliName = document.getElementById('cliName').value.trim();
        const fromDateTime = new Date(document.getElementById('fromDateTime').value);
        const toDateTime = new Date(document.getElementById('toDateTime').value);
        const spmFile = document.getElementById('spmFile').files[0];
        const cugFile = document.getElementById('cugFile').files[0];

        if (toDateTime <= fromDateTime) throw new Error('To Date and Time must be later than From Date and Time.');
        if (fromSection === toSection) throw new Error('From Section and To Section cannot be the same.');

        let cugData = cugFile ? await parseAndProcessCugData(cugFile).catch(err => { console.error(err); return []; }) : [];
        const lpCalls = cugData.filter(call => call['CUG MOBILE NO'] === lpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);
        const alpCalls = cugData.filter(call => call['CUG MOBILE NO'] === alpCugNumber && call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime);

        // XLSX file reading logic
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) throw new Error("The selected XLSX file is empty or invalid.");

                // Process the extracted JSON data
                let cumulativeDistanceMeters = 0;
                const parsedData = jsonData.map(row => {
                    const distanceIncrement = parseFloat(row[spmConfig.columnNames.distance]) || 0;
                    cumulativeDistanceMeters += distanceIncrement;

                    let timeValue = row[spmConfig.columnNames.time];
                    let parsedTime;
                    if (typeof timeValue === 'number') {
                        parsedTime = new Date(XLSX.SSF.format('yyyy-mm-dd HH:mm:ss', timeValue));
                    } else if (typeof timeValue === 'string') {
                        parsedTime = new Date(timeValue);
                    } else {
                        return null;
                    }

                    if (isNaN(parsedTime.getTime())) return null;

                    return {
                        Time: parsedTime,
                        Distance: cumulativeDistanceMeters / 1000, // in KM
                        Speed: parseFloat(row[spmConfig.columnNames.speed]) || 0,
                        EventGn: (parseFloat(row[spmConfig.columnNames.speed]) === 0) ? spmConfig.eventCodes.zeroSpeed : ''
                    };
                }).filter(Boolean);

                if (parsedData.length === 0) throw new Error('No valid data with recognizable dates found in the file.');
                
                const stationMap = new Map();
                window.stationSignalData.filter(r => r['SECTION'] === section).forEach(r => {
                    if (!stationMap.has(r['STATION'])) stationMap.set(r['STATION'], { name: r['STATION'], distance: parseFloat(r['CUMMULATIVE DISTANT(IN Meter)']) || 0 });
                });
                const stationsData = Array.from(stationMap.values());
                const fromStation = stationsData.find(s => s.name === fromSection);
                if (!fromStation) throw new Error(`From Station (${fromSection}) not valid for Section (${section}).`);

                const fromDistance = fromStation.distance;
                parsedData.forEach(row => row.NormalizedDistance = (row.Distance * 1000) - fromDistance);

                let departureIndex = parsedData.findIndex((row, i, arr) => {
                    if (row.Time < fromDateTime || row.Time > toDateTime || row.Speed < 1) return false;
                    let distMoved = 0, startDist = row.Distance;
                    for (let j = i; j < arr.length; j++) {
                        if (arr[j].Speed === 0) return false;
                        distMoved += Math.abs(arr[j].Distance - startDist);
                        startDist = arr[j].Distance;
                        if (distMoved >= 0.2) return true;
                    }
                    return false;
                });

                if (departureIndex === -1) throw new Error('No valid departure found.');
                
                let filteredData = parsedData.filter(row => row.Time >= parsedData[departureIndex].Time && row.Time <= toDateTime);
                if (filteredData.length === 0) throw new Error('No data found after departure.');
                
                const initialDistance = filteredData[0].NormalizedDistance;
                let normalizedData = filteredData.map(row => ({ ...row, Distance: row.NormalizedDistance - initialDistance }));

                const fromIdx = stationsData.findIndex(s => s.name === fromSection);
                const toIdx = stationsData.findIndex(s => s.name === toSection);
                const routeStations = stationsData.slice(Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx) + 1);
                let normalizedStations = routeStations.map(s => ({ name: s.name, distance: Math.abs(s.distance - fromDistance) }));

                // --- Full Analysis ---
                const overSpeedDetails = getOverSpeedDetails(normalizedData, maxPermissibleSpeed, normalizedStations);
                const { wheelSlipDetails, wheelSkidDetails } = getWheelSlipAndSkidDetails(normalizedData, normalizedStations);
                let stops = getStopDetails(normalizedData, spmConfig.eventCodes.zeroSpeed, section, fromDistance, normalizedStations, rakeType);
                const { bftDetails, bptDetails } = getBrakeTestDetails(normalizedData, spmConfig.brakeTests[rakeType]);
                const crewCallData = [...analyzeCalls(lpCalls, lpDesg || 'LP', normalizedData), ...analyzeCalls(alpCalls, alpDesg || 'ALP', normalizedData)];
                const stationStops = getStationArrivalDeparture(normalizedStations, stops, filteredData, normalizedData, fromSection, toSection);
                const speedRangeSummary = calculateSpeedRangeSummary(normalizedData, rakeType, maxPermissibleSpeed);
                const sectionSpeedSummary = calculateSectionSpeedSummary(normalizedData, normalizedStations, fromSection, toSection);
                
                const maxPoints = 500;
                const sampledData = normalizedData.length > maxPoints ? normalizedData.filter((_, i) => i % Math.ceil(normalizedData.length / maxPoints) === 0) : normalizedData;
                const speedChartConfig = {
                    labels: sampledData.map(row => row.Time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })),
                    speeds: sampledData.map(row => row.Speed)
                };
                const stopChartConfig = getStopChartData(stops, normalizedData);
                let speedChartImage = null;
                let stopChartImage = null;
                 // ===================================================
                // FINAL CHART TO IMAGE CONVERSION LOGIC (WITH ROTATION)
                // ===================================================

                // Speed Chart ko Image mein convert karein
                try {
                    const speedCtx = document.getElementById('speedChart').getContext('2d');
                    if (!speedCtx) throw new Error('Speed Chart canvas not found');
                    
                    document.getElementById('speedChart').width = 600;
                    document.getElementById('speedChart').height = 400;

                    speedChartInstance = new Chart(speedCtx, {
                        type: 'line',
                        data: {
                            labels: speedChartConfig.labels,
                            datasets: [{
                                label: 'Speed',
                                data: speedChartConfig.speeds,
                                borderColor: '#00008B',
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: false,
                                tension: 0.4
                            }]
                        },
                        options: {
                            responsive: false,
                            animation: false, // Animation band karein for faster image capture
                            scales: {
                                x: { title: { display: true, text: 'Time' } },
                                y: { title: { display: true, text: 'Speed (kmph)' }, beginAtZero: true }
                            },
                            plugins: { legend: { display: false } }
                        }
                    });

                    speedChartImage = await new Promise((resolve) => {
                        speedChartInstance.options.animation = {
                            onComplete: () => {
                                const tempCanvas = document.createElement('canvas');
                                tempCanvas.width = 400;
                                tempCanvas.height = 600;
                                const tempCtx = tempCanvas.getContext('2d');
                                tempCtx.translate(400, 0);
                                tempCtx.rotate(Math.PI / 2);
                                const img = new Image();
                                img.src = document.getElementById('speedChart').toDataURL('image/png');
                                img.onload = () => {
                                    tempCtx.drawImage(img, 0, 0, 600, 400);
                                    resolve(tempCanvas.toDataURL('image/png', 1.0));
                                    speedChartInstance.destroy();
                                };
                            }
                        };
                        speedChartInstance.update();
                    });

                } catch (error) {
                    console.error('Error generating speed chart image:', error);
                }

                // Stop Chart ko Image mein convert karein
                try {
                    const stopCtx = document.getElementById('stopChart').getContext('2d');
                    if (!stopCtx) throw new Error('Stop Chart canvas not found');

                    document.getElementById('stopChart').width = 600;
                    document.getElementById('stopChart').height = 400;

                    stopChartInstance = new Chart(stopCtx, {
                        type: 'line',
                        data: {
                            labels: stopChartConfig.labels,
                            datasets: stopChartConfig.datasets
                        },
                        options: {
                            responsive: false,
                            animation: false, // Animation band karein
                            scales: {
                                x: { title: { display: true, text: 'Distance Before Stop (m)' } },
                                y: { title: { display: true, text: 'Speed (kmph)' }, beginAtZero: true }
                            },
                            plugins: {
                                legend: { display: true, position: 'top' },
                                title: { display: true, text: 'Speed vs. Distance Before Stop' }
                            }
                        }
                    });

                    stopChartImage = await new Promise((resolve) => {
                        stopChartInstance.options.animation = {
                            onComplete: () => {
                                const tempCanvas = document.createElement('canvas');
                                tempCanvas.width = 400;
                                tempCanvas.height = 600;
                                const tempCtx = tempCanvas.getContext('2d');
                                tempCtx.translate(400, 0);
                                tempCtx.rotate(Math.PI / 2);
                                const img = new Image();
                                img.src = document.getElementById('stopChart').toDataURL('image/png');
                                img.onload = () => {
                                    tempCtx.drawImage(img, 0, 0, 600, 400);
                                    resolve(tempCanvas.toDataURL('image/png', 1.0));
                                    stopChartInstance.destroy();
                                };
                            }
                        };
                        stopChartInstance.update();
                    });

                } catch (error) {
                    console.error('Error generating stop chart image:', error);
                }
                const reportData = {
                    trainDetails: [
                        { label: 'Loco Number', value: locoNumber }, { label: 'Train Number', value: trainNumber },
                        { label: 'Type of Rake', value: rakeType }, { label: 'Max Permissible Speed', value: `${maxPermissibleSpeed} kmph` },
                        { label: 'Section', value: section }, { label: 'Route', value: routeSection }, { label: 'SPM Type', value: spmType },
                        { label: 'Analysis By', value: cliName },
                        { label: 'Analysis Time', value: `From ${fromDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} to ${toDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}` }
                    ],
                    lpDetails: [ `LP ID: ${lpId}`, `LP Name: ${lpName}`, `Designation: ${lpDesg}`,`Group CLI: ${lpGroupCli || 'N/A'}`, `CUG Number: ${lpCugNumber}`],
                    alpDetails: [ `ALP ID: ${alpId}`, `ALP Name: ${alpName}`, `Designation: ${alpDesg}`, `Group CLI: ${alpGroupCli || 'N/A'}`,`CUG Number: ${alpCugNumber}`],
                    stopCount: stops.length, bftDetails, bptDetails, crewCallData, stops, stationStops,
                    overSpeedDetails, wheelSlipDetails, wheelSkidDetails,
                    speedRangeSummary, sectionSpeedSummary,
                    speedChartConfig, stopChartConfig,speedChartImage,stopChartImage
                };
                
                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                window.location.href = 'report.html';

            } catch (error) {
                console.error('Error processing RTIS file:', error);
                alert(`Processing failed: ${error.message}`);
                if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
            }
        };
        reader.onerror = () => {
            alert('Failed to read the XLSX file.');
            if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
        };
        reader.readAsArrayBuffer(spmFile);

    } catch (error) {
        console.error('Error during submission:', error);
        alert(`An error occurred: ${error.message}`);
        if (window.toggleLoadingOverlay) window.toggleLoadingOverlay(false);
    }
});


// --- ALL HELPER ANALYSIS FUNCTIONS ---

function getOverSpeedDetails(data, maxSpeed, stations) {
    const details = []; let group = null;
    data.forEach((row, index) => {
        if (row.Speed > maxSpeed) {
            let sectionName = stations.slice(0, -1).find((s, i) => row.Distance >= s.distance && row.Distance < stations[i + 1].distance);
            sectionName = sectionName ? `${sectionName.name}-${stations[stations.indexOf(sectionName) + 1].name}` : 'Unknown';
            if (!group || group.section !== sectionName || (index > 0 && (row.Time - data[index-1].Time) > 10000)) {
                if (group) details.push({ ...group, timeRange: `${group.startTime.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}-${group.endTime.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}`, speedRange: `${group.minSpeed.toFixed(2)}-${group.maxSpeed.toFixed(2)}` });
                group = { section: sectionName, startTime: row.Time, endTime: row.Time, minSpeed: row.Speed, maxSpeed: row.Speed };
            } else {
                group.endTime = row.Time;
                group.minSpeed = Math.min(group.minSpeed, row.Speed);
                group.maxSpeed = Math.max(group.maxSpeed, row.Speed);
            }
        } else if (group) {
            details.push({ ...group, timeRange: `${group.startTime.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}-${group.endTime.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}`, speedRange: `${group.minSpeed.toFixed(2)}-${group.maxSpeed.toFixed(2)}` });
            group = null;
        }
    });
    if (group) details.push({ ...group, timeRange: `${group.startTime.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}-${group.endTime.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}`, speedRange: `${group.minSpeed.toFixed(2)}-${group.maxSpeed.toFixed(2)}` });
    return details;
}

function getWheelSlipAndSkidDetails(data, stations) {
    const wheelSlipDetails = [], wheelSkidDetails = [];
    data.forEach((row, index) => {
        if (index === 0) return;
        const prevRow = data[index - 1];
        const timeDiffSec = (row.Time - prevRow.Time) / 1000;
        if (timeDiffSec <= 0 || timeDiffSec > 5) return;
        const speedDiff = (row.Speed - prevRow.Speed) / timeDiffSec;
        let sectionName = stations.slice(0, -1).find((s, i) => row.Distance >= s.distance && row.Distance < stations[i + 1].distance);
        sectionName = sectionName ? `${sectionName.name}-${stations[stations.indexOf(sectionName) + 1].name}` : 'Unknown';
        if (speedDiff >= 4) wheelSlipDetails.push({ section: sectionName, timeRange: `${prevRow.Time.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}-${row.Time.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}`, speedRange: `${prevRow.Speed.toFixed(2)}-${row.Speed.toFixed(2)}` });
        if (speedDiff <= -5) wheelSkidDetails.push({ section: sectionName, timeRange: `${prevRow.Time.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}-${row.Time.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})}`, speedRange: `${prevRow.Speed.toFixed(2)}-${row.Speed.toFixed(2)}` });
    });
    return { wheelSlipDetails, wheelSkidDetails };
}

function getStopDetails(data, stopCode, section, fromDist, stations, rakeType) {
    let potentialStops = [];
    data.forEach((row, i) => { if (row.EventGn === stopCode && row.Speed === 0) potentialStops.push({ index: i, time: row.Time, kilometer: row.Distance }); });
    let stops = []; let currentGroup = [];
    potentialStops.forEach((stop, i) => {
        currentGroup.push(stop);
        const isLast = i === potentialStops.length - 1 || (potentialStops[i + 1].time - stop.time) > 10000;
        if (isLast && currentGroup.length > 0) { stops.push(currentGroup[0]); currentGroup = []; }
    });
    stops = stops.filter((stop, i, arr) => i === 0 || Math.abs(stop.kilometer - arr[i - 1].kilometer) >= 200);
    let processedStops = stops.map((stop, stopIndex) => {
        let startTimeObject = null;
        for (let i = stop.index + 1; i < data.length; i++) { if (data[i].Speed > 0) { startTimeObject = data[i].Time; break; } }
        const duration = startTimeObject ? (startTimeObject - stop.time) / 1000 : 0;
        return { ...stop, duration, isLastStopOfJourney: stopIndex === stops.length - 1 };
    });
    stops = processedStops.filter(stop => stop.duration >= 10 || stop.isLastStopOfJourney);
    stops.forEach((stop, index) => {
        stop.group = index + 1;
        stop.timeString = stop.time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
        let startTimeObject = null;
        for (let i = stop.index + 1; i < data.length; i++) { if (data[i].Speed > 0) { startTimeObject = data[i].Time; break; } }
        stop.startTiming = startTimeObject ? startTimeObject.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : 'N/A';
        let atStation = window.stationSignalData.find(row => row['SECTION'] === section && Math.abs((parseFloat(row['CUMMULATIVE DISTANT(IN Meter)']) - fromDist) - stop.kilometer) <= 400);
        if (atStation) stop.stopLocation = `${atStation['STATION']} ${atStation['SIGNAL NAME'] || ''}`.trim();
        else { let sec = stations.slice(0, -1).find((s, i) => stop.kilometer >= s.distance && stop.kilometer < stations[i+1].distance); stop.stopLocation = sec ? `${sec.name}-${stations[stations.indexOf(sec) + 1].name}` : 'Unknown'; }
        const speedsBefore = [800, 500, 100, 50].map(d => data.slice(0, stop.index).reverse().find(r => stop.kilometer - r.Distance >= d)?.Speed.toFixed(2) || 'N/A');
        const [s8, s5, s1, s0] = speedsBefore.map(s => parseFloat(s) || Infinity);
        const smooth = rakeType === 'GOODS' ? (s8 <= 30 && s5 <= 25 && s1 <= 15 && s0 <= 10) : (s8 <= 60 && s5 <= 45 && s1 <= 30 && s0 <= 20);
        stop.brakingTechnique = smooth ? 'Smooth' : 'Late';
        stop.speedsBefore = speedsBefore;
    });
    return stops;
}

function getBrakeTestDetails(data, brakeConf) {
    let bftDetails = null;
    let bptDetails = null;

    // Yeh function speed mein lagatar kami ko track karta hai
    const trackSpeedReduction = (d, startIdx, maxDur) => {
        const start = d[startIdx];
        let lowest = start;
        let endIdx = startIdx;

        for (let i = startIdx + 1; i < d.length; i++) {
            const curr = d[i];
            // Agar test ka samay poora ho gaya ya speed badhne lagi, to ruk jao
            if ((curr.Time - start.Time) > maxDur || curr.Speed > lowest.Speed + 0.5) {
                break;
            }
            // Agar speed 0 ho gayi, to test anumaany (invalid) hai
            if (curr.Speed === 0) {
                return null;
            }
            // Agar speed aur kam hui, to use save kar lo
            if (curr.Speed < lowest.Speed) {
                lowest = curr;
                endIdx = i;
            }
        }
        // Agar speed bilkul kam nahi hui, to test anumaany hai
        if (endIdx === startIdx) {
            return null;
        }
        // Sahi test ki details return karo
        return {
            speed: lowest.Speed,
            timeDiff: (lowest.Time - start.Time) / 1000,
            index: endIdx
        };
    };

    // Poore data mein BFT aur BPT check karo
    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        // --- BFT Check ---
        // Agar BFT abhi tak nahi mila hai aur speed sahi range mein hai
        if (!bftDetails && (row.Speed >= brakeConf.bft.minSpeed && row.Speed <= brakeConf.bft.maxSpeed)) {
            const res = trackSpeedReduction(data, i, brakeConf.bft.maxDuration);
            // Agar speed mein 5 kmph ya zyada ki kami aayi hai
            if (res && res.timeDiff > 1 && (row.Speed - res.speed) >= 5) {
                bftDetails = {
                    time: row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
                    startSpeed: row.Speed.toFixed(2),
                    endSpeed: res.speed.toFixed(2),
                    reduction: (row.Speed - res.speed).toFixed(2),
                    timeTaken: res.timeDiff.toFixed(0),
                    endTime: data[res.index].Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
                };
            }
        }

        // --- BPT Check ---
        // Agar BPT abhi tak nahi mila hai aur speed sahi range mein hai
        if (!bptDetails && (row.Speed >= brakeConf.bpt.minSpeed && row.Speed <= brakeConf.bpt.maxSpeed)) {
            const res = trackSpeedReduction(data, i, brakeConf.bpt.maxDuration);
            // Agar speed mein 5 kmph ya zyada ki kami aayi hai
            if (res && res.timeDiff > 1 && (row.Speed - res.speed) >= 5) {
                bptDetails = {
                    time: row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
                    startSpeed: row.Speed.toFixed(2),
                    endSpeed: res.speed.toFixed(2),
                    reduction: (row.Speed - res.speed).toFixed(2),
                    timeTaken: res.timeDiff.toFixed(0),
                    endTime: data[res.index].Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
                };
            }
        }

        // Agar dono test mil gaye hain, to aage check karne ki zaroorat nahi
        if (bftDetails && bptDetails) {
            break;
        }
    }

    return { bftDetails, bptDetails };
}
function analyzeCalls(calls, designation, spmData) {
    return calls.map((call, index) => {
        let runDuration = 0, stopDuration = 0, maxSpeed = 0;
        spmData.forEach((row, i) => {
            if (row.Time >= call.startDateTime && row.Time <= call.endDateTime) {
                const timeDiff = (spmData[i + 1]?.Time - row.Time) / 1000 || 1;
                if (row.Speed > 1) { runDuration += timeDiff; maxSpeed = Math.max(maxSpeed, row.Speed); } else { stopDuration += timeDiff; }
            }
        });
        return { designation: `${designation} (Call ${index + 1})`, totalDuration: Math.round(call.duration), runDuration: Math.round(runDuration), stopDuration: Math.round(stopDuration), maxSpeed: maxSpeed.toFixed(2), toNumbers: call['To Mobile Number'] || 'N/A' };
    });
}

function getStationArrivalDeparture(stations, stops, filteredData, normalizedData, from, to) {
    const timeFormat = { timeZone: 'Asia/Kolkata', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return stations.map((station, index) => {
        let arrival = 'N/A', departure = 'N/A';
        const stationStop = stops.find(s => s.stopLocation.startsWith(station.name));
        if (stationStop) {
            arrival = stationStop.timeString;
            departure = stationStop.startTiming;
        } else {
            if (index === 0 && station.name === from) {
                departure = filteredData[0].Time.toLocaleString('en-IN', timeFormat);
            } else {
                let crossPoint = normalizedData.find((d, i, arr) => i > 0 && ((arr[i-1].Distance < station.distance && d.Distance >= station.distance) || (arr[i-1].Distance > station.distance && d.Distance <= station.distance)));
                if (crossPoint) {
                    if (index === stations.length - 1 && station.name === to) arrival = crossPoint.Time.toLocaleString('en-IN', timeFormat);
                    else departure = crossPoint.Time.toLocaleString('en-IN', timeFormat);
                }
            }
        }
        if (index === stations.length - 1) departure = 'N/A';
        return { station: station.name, arrival, departure };
    });
}

function calculateSpeedRangeSummary(data, rakeType, mps) {
    const ranges = rakeType === 'COACHING' ? {'Above 130': v=>v>130, '125-130': v=>v>=125&&v<=130, '110-125': v=>v>=110&&v<125, '90-110': v=>v>=90&&v<110, 'Below 90': v=>v<90} : {'Above 80': v=>v>80, '75-80': v=>v>=75&&v<=80, '60-75': v=>v>=60&&v<75, '40-60': v=>v>=40&&v<60, 'Below 40': v=>v<40};
    const distByRange = Object.keys(ranges).reduce((acc, k) => ({...acc, [k]: 0}), {});
    let totalDist = 0, distAtMps = 0;
    for (let i = 1; i < data.length; i++) {
        const distDiff = Math.abs(data[i].Distance - data[i-1].Distance);
        if (distDiff > 0) {
            totalDist += distDiff;
            const avgSpeed = (data[i].Speed + data[i-1].Speed) / 2;
            if (Math.round(avgSpeed) === mps) distAtMps += distDiff;
            for (const rangeName in ranges) if (ranges[rangeName](avgSpeed)) { distByRange[rangeName] += distDiff; break; }
        }
    }
    const summary = Object.entries(distByRange).map(([r, d]) => ({speedRange: `${r} Kmph`, distance: (d/1000).toFixed(2), percentage: totalDist>0 ? ((d/totalDist)*100).toFixed(2):'0.00'}));
    summary.unshift({speedRange: `AT MPS (${mps} Kmph)`, distance: (distAtMps/1000).toFixed(2), percentage: totalDist>0 ? ((distAtMps/totalDist)*100).toFixed(2):'0.00'});
    return { summary, totalDistance: (totalDist/1000).toFixed(2) };
}

function calculateSectionSpeedSummary(data, stations, from, to) {
    const summary = [];
    
    // Har ek station ke section ke liye loop chalayein
    for (let i = 0; i < stations.length - 1; i++) {
        const startStation = stations[i];
        const endStation = stations[i+1];
        const sectionName = `${startStation.name}-${endStation.name}`;
        
        const sectionData = data.filter(d => d.Distance >= startStation.distance && d.Distance < endStation.distance);

        if (sectionData.length > 0) {
            // YEH LINE ZAROORI HAI: Sirf 0 se zyada ki speed lein
            const speeds = sectionData.map(d => d.Speed).filter(s => s > 0);
            
            let modeSpeed = 'N/A';
            let maxSpeed = 'N/A';
            let averageSpeed = 'N/A';

            if (speeds.length > 0) {
                // Maximum aur Average Speed nikaalein
                maxSpeed = Math.max(...speeds).toFixed(2);
                averageSpeed = (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2);

                // Most Frequent Speed (Mode) nikaalein
                const freq = {};
                let maxFreq = 0;
                speeds.forEach(s => {
                    const speedInt = Math.floor(s);
                    freq[speedInt] = (freq[speedInt] || 0) + 1;
                    if (freq[speedInt] > maxFreq) {
                        maxFreq = freq[speedInt];
                        modeSpeed = speedInt;
                    }
                });
            }
            summary.push({ section: sectionName, modeSpeed, maxSpeed, averageSpeed });
        }
    }

    // Poore route ke liye (Overall) summary
    const overallSpeeds = data.map(d => d.Speed).filter(s => s > 0);
    let overallModeSpeed = 'N/A';
    let overallMaxSpeed = 'N/A';
    let overallAverageSpeed = 'N/A';

    if (overallSpeeds.length > 0) {
        overallMaxSpeed = Math.max(...overallSpeeds).toFixed(2);
        overallAverageSpeed = (overallSpeeds.reduce((a, b) => a + b, 0) / overallSpeeds.length).toFixed(2);
        
        const overallFreq = {};
        let overallMaxFreq = 0;
        overallSpeeds.forEach(s => {
            const speedInt = Math.floor(s);
            overallFreq[speedInt] = (overallFreq[speedInt] || 0) + 1;
            if (overallFreq[speedInt] > overallMaxFreq) {
                overallMaxFreq = overallFreq[speedInt];
                overallModeSpeed = speedInt;
            }
        });
    }

    summary.push({
        section: `<strong>${from}-${to} (Overall)</strong>`,
        modeSpeed: overallModeSpeed,
        maxSpeed: overallMaxSpeed,
        averageSpeed: overallAverageSpeed
    });

    return summary;
}

function getStopChartData(stops, data) {
    const distanceLabels = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0];
    const datasets = stops.slice(0, 10).map((stop, index) => {
        const speeds = distanceLabels.map(targetDistance => {
            let closestRow = data.slice(0, stop.index).reverse().find(row => stop.kilometer - row.Distance >= targetDistance);
            return closestRow ? closestRow.Speed : 0;
        });
        const colors = ['#FF0000', '#0000FF', '#008000', '#FFA500', '#800080', '#00FFFF', '#FF00FF', '#808000', '#000080', '#800000'];
        return {
            label: stop.stopLocation.substring(0, 20),
            data: speeds,
            borderColor: colors[index % colors.length],
            fill: false,
            tension: 0.2
        };
    });
    return { labels: distanceLabels, datasets };
}