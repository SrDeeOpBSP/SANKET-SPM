const spmConfig = {
    type: 'Medha',
    columnNames: {
        time: 'Date,Time',
        distance: 'Dist. Mtrs',
        speed: 'Inst Kmph',
        event: 'Event'
    },
    eventCodes: {
        zeroSpeed: 'STOP'
    },
    brakeTests: {
        GOODS: {
            bft: { minSpeed: 20, maxSpeed: 30, maxDuration: 60 * 1000 },
            bpt: { minSpeed: 40, maxSpeed: 50, maxDuration: 60 * 1000 }
        },
        COACHING: {
            bft: { minSpeed: 20, maxSpeed: 30, maxDuration: 60 * 1000 },
            bpt: { minSpeed: 50, maxSpeed: 60, maxDuration: 60 * 1000 }
        },
        MEMU: {
            bft: { minSpeed: 20, maxSpeed: 30, maxDuration: 60 * 1000 },
            bpt: { minSpeed: 50, maxSpeed: 60, maxDuration: 60 * 1000 }
        }
    }
};

let speedChartInstance = null;
let stopChartInstance = null;

/**
 * CUG CSV file ko parse karta hai aur date/time fields ko process karta hai.
 * @param {File} file User dwara upload ki gayi CUG.csv file.
 * @returns {Promise<Array>} Ek promise jo processed CUG data ke saath resolve hota hai.
 */
const parseAndProcessCugData = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error('CUG file is missing.'));
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transform: (value) => value.trim(),
            complete: (result) => {
                if (result.errors.length) {
                    console.error('Errors parsing CUG.csv:', result.errors);
                    return reject(new Error('Failed to parse CUG.csv. Check file format.'));
                }
                
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

                        if (startMatch[1]) { // DD-MM-YYYY format
                            startDateTime = new Date(`${startMatch[3]}-${startMatch[2]}-${startMatch[1]}T${startMatch[7]}:${startMatch[8]}:${startSeconds}`);
                            endDateTime = new Date(`${endMatch[3]}-${endMatch[2]}-${endMatch[1]}T${endMatch[7]}:${endMatch[8]}:${endSeconds}`);
                        } else { // YYYY-MM-DD format
                            startDateTime = new Date(`${startMatch[4]}-${startMatch[5]}-${startMatch[6]}T${startMatch[7]}:${startMatch[8]}:${startSeconds}`);
                            endDateTime = new Date(`${endMatch[4]}-${endMatch[5]}-${endMatch[6]}T${endMatch[7]}:${endMatch[8]}:${endSeconds}`);
                        }

                        return {
                            ...call,
                            startDateTime,
                            endDateTime,
                            duration: parseInt(call['Duration in Sec']) || 0,
                            'CUG MOBILE NO': call['CUG MOBILE NO']?.trim()
                        };
                    }
                    console.warn('Invalid date format in CUG.csv row:', call);
                    return null;
                }).filter(call => call && call.startDateTime && !isNaN(call.startDateTime.getTime()));
                
                resolve(processedData);
            },
            error: (error) => reject(error)
        });
    });
};

document.getElementById('spmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alert('Processing SPM file, please wait...');

    if (speedChartInstance) speedChartInstance.destroy();
    if (stopChartInstance) stopChartInstance.destroy();

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
        const fromDateTime = new Date(document.getElementById('fromDateTime').value);
        const toDateTime = new Date(document.getElementById('toDateTime').value);
        const spmFile = document.getElementById('spmFile').files[0];
        const cugFile = document.getElementById('cugFile').files[0];

    if (!spmFile.name.toLowerCase().endsWith('.txt')) {
        alert('Please upload a .txt file for Medha SPM.');
        return;
    }

    if (toDateTime <= fromDateTime) {
        alert('To Date and Time must be later than From Date and Time.');
        return;
    }

    if (fromSection === toSection) {
        alert('From Section and To Section cannot be the same.');
        return;
    }

    if (lpCugNumber === alpCugNumber && lpCugNumber !== '') {
        alert('LP and ALP cannot have the same CUG number. Please check the CREW.csv file.');
        return;
    }

   let cugData = [];
    if (cugFile) {
        try {
            cugData = await parseAndProcessCugData(cugFile);
            console.log("Processed CUG Data:", cugData);
        } catch (error) {
            console.error("Could not process CUG file:", error);
            alert('Could not process CUG.csv file. Continuing without call analysis.');
        }
    } else {
        console.log("No CUG file uploaded. Skipping call analysis.");
    }

    const lpCalls = cugData.filter(call => {
        const matchesNumber = call['CUG MOBILE NO'] === lpCugNumber;
        const withinTime = call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime;
        return matchesNumber && withinTime;
    });

    const alpCalls = cugData.filter(call => {
        const matchesNumber = call['CUG MOBILE NO'] === alpCugNumber;
        const withinTime = call.startDateTime >= fromDateTime && call.startDateTime <= toDateTime;
        return matchesNumber && withinTime;
    });


    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const text = event.target.result;
            const lines = text.split('\n').map(line => line.trim());
            const dataRows = [];

            const headerRegex = /^Date\s+\|\s+Time\s+\|\s+Inst\s+\|\s+Dist\.\s+\|/;
            const separatorRegex = /^_{50,}/;
            const footerRegex = /^(Total\s+Coasting|-----)/;
            let isDataSection = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (headerRegex.test(line) || separatorRegex.test(line) || footerRegex.test(line)) {
                    isDataSection = false;
                    continue;
                }
                if (line.match(/^\d{2}\/\d{2}\/\d{2}\s+\|/)) {
                    isDataSection = true;
                    const columns = line.split('|').map(col => col.trim());

                    if (columns.length >= 5) {
                        const baseRow = {
                            'Date': columns[0],
                            'Time': columns[1],
                            'Inst Kmph': parseInt(columns[2] || '0'),
                            'Dist. Mtrs': parseFloat(columns[3] || '0'),
                            'Event': columns[columns.length - 1] || ''
                        };

                        const dateTimeStr = `${baseRow.Date} ${baseRow.Time}`.trim();
                        const timePattern = /(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
                        const match = dateTimeStr.match(timePattern);
                        if (match) {
                            let year = parseInt(match[3]);
                            if (year < 100) year += 2000;
                            baseRow.time = new Date(year, parseInt(match[2]) - 1, parseInt(match[1]), 
                                                    parseInt(match[4]), parseInt(match[5]), parseInt(match[6]));
                        } else {
                            console.warn('Invalid date format at line:', line);
                            baseRow.time = new Date();
                        }

                        if (columns.length >= 14) {
                            baseRow['Coasting Km'] = parseFloat(columns[4] || '0');
                            baseRow['Coasting Sec'] = parseInt(columns[5] || '0');
                            baseRow['DB Sec'] = parseInt(columns[6] || '0');
                            baseRow['OHE KV'] = parseFloat(columns[7] || '0');
                            baseRow['OHE Amps'] = parseInt(columns[8] || '0');
                            baseRow['Power Factor'] = parseFloat(columns[9] || '0');
                            baseRow['Run Kwh'] = parseFloat(columns[10] || '0');
                            baseRow['Halt Kwh'] = parseFloat(columns[11] || '0');
                            baseRow['Total Kwh'] = parseFloat(columns[12] || '0');
                            baseRow['Event'] = columns[13] || '';
                        } else if (columns.length >= 9 && columns.slice(4, 12).some(col => col.match(/D[1-8]/))) {
                            baseRow['D1'] = columns[4] || 'Off';
                            baseRow['D2'] = columns[5] || 'Off';
                            baseRow['D3'] = columns[6] || 'Off';
                            baseRow['D4'] = columns[7] || 'Off';
                            baseRow['D5'] = columns[8] || 'Off';
                            baseRow['Event'] = columns[columns.length - 1] || '';
                        }

                        dataRows.push(baseRow);
                    } else {
                        console.warn(`Invalid data row at line ${i + 1}:`, line);
                    }
                }
            }

            if (dataRows.length === 0) {
                alert('No valid data found in the Medha SPM file. Please check the file format.');
                return;
            }

           // --- START: NAYA CODE YAHAN PASTE KAREIN ---

            let cumulativeDistanceMeters = 0;
            let jsonDataWithRecalculatedDistance = [];

            // Har row ke liye loop chala kar nayi distance calculate karein
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                const time = row.time;
                const speedKmph = parseFloat(row['Inst Kmph']) || 0;
                const event = (row.Event || '').toUpperCase();

                if (i > 0) {
                    const prevRow = dataRows[i - 1];
                    const prevTime = prevRow.time;
                    const timeDiffSeconds = (time.getTime() - prevTime.getTime()) / 1000;

                    if (timeDiffSeconds > 0 && timeDiffSeconds < 10) {
                        const prevSpeedKmph = parseFloat(prevRow['Inst Kmph']) || 0;
                        const avgSpeedMps = ((speedKmph + prevSpeedKmph) / 2) * (1000 / 3600);
                        const distanceTraveled = avgSpeedMps * timeDiffSeconds;
                        cumulativeDistanceMeters += distanceTraveled;
                    }
                }

                jsonDataWithRecalculatedDistance.push({
                    Time: time,
                    Speed: speedKmph,
                    CumulativeDistance: cumulativeDistanceMeters, // Apni calculate ki hui distance istemaal karein
                    Event: event
                });
            }

            // Ab user ke diye gaye time range mein data filter karein
            const jsonData = jsonDataWithRecalculatedDistance.filter(row =>
                row && row.Time && !isNaN(row.Time.getTime()) &&
                row.Time >= fromDateTime && row.Time <= toDateTime
            );

            if (jsonData.length === 0) {
                alert('No valid data found within the selected time range. Please check the SPM file or time inputs.');
                return;
            }

            console.log('Processed data with RECALCULATED distance (first 5):', jsonData.slice(0, 5));

            // stationsData ko yahaan define karein
            const stationsData = window.stationSignalData
                .filter(row => row['SECTION'] === section)
                .map(row => ({
                    name: row['STATION'],
                    distance: parseFloat(row['CUMMULATIVE DISTANT(IN Meter)']) || 0,
                    signal: row['SIGNAL NAME']
                }))
                .reduce((acc, curr) => {
                    const existing = acc.find(station_row => station_row.name === curr.name);
                    if (!existing) {
                        acc.push({ name: curr.name, distance: curr.distance });
                    }
                    return acc;
                }, []);

            console.log('Stations Data for Section:', stationsData);

            const fromStation = stationsData.find(station => station.name === fromSection);
            const toStation = stationsData.find(station => station.name === toSection);

            // Nayi calculate ki hui distance se variable ko define karein
            const calculatedTotalDistanceKm = jsonData.length > 0 ? jsonData[jsonData.length - 1].CumulativeDistance / 1000 : 0;
            console.log(`Recalculated Total Distance: ${calculatedTotalDistanceKm.toFixed(3)} km`);

            // Ab dono distance ko validate karein
            if (fromStation && toStation) {
                const expectedDistanceKm = Math.abs(toStation.distance - fromStation.distance) / 1000;
                console.log(`Expected Distance (${fromSection} to ${toSection}): ${expectedDistanceKm.toFixed(3)} km`);
                if (Math.abs(calculatedTotalDistanceKm - expectedDistanceKm) > 5) { // 5km ka margin rakha hai
                    console.warn(`Distance mismatch: Recalculated ${calculatedTotalDistanceKm.toFixed(3)} km vs Expected ${expectedDistanceKm.toFixed(3)} km`);
                }
            }
            // --- END: NAYA CODE YAHAN KHATAM ---
            if (!fromStation) {
                alert('Selected From Station is not valid for the chosen Section.');
                return;
            }

            const fromDistance = jsonData.length > 0 ? jsonData[0].CumulativeDistance : 0;
            jsonData.forEach(row => {
                row.NormalizedDistance = (row.CumulativeDistance - fromDistance) / 1000;
            });

            let departureIndex = jsonData.findIndex((row, i) => {
                if (row.Time > toDateTime || row.Speed <= 1) return false;
                let distanceMoved = 0;
                let startDistance = row.CumulativeDistance;
                for (let j = i; j < jsonData.length; j++) {
                    const currentSpeed = jsonData[j].Speed;
                    if (currentSpeed === 0) return false;
                    distanceMoved += Math.abs(jsonData[j].CumulativeDistance - startDistance);
                    startDistance = jsonData[j].CumulativeDistance;
                    if (distanceMoved >= 200) {
                        return row.Time >= fromDateTime;
                    }
                }
                return false;
            });

            if (departureIndex === -1) {
                alert('No valid departure found in the selected time range (Speed >= 1 km/h with 200m continuous movement).');
                return;
            }
            // --- AAP APNA NAYA CODE YAHAN DAAL SAKTE HAIN ---
            const departureAbsoluteSPMDistance = jsonData[departureIndex].CumulativeDistance;
            const fromStationAbsoluteCSVDistance = fromStation.distance;
            const distanceOffset = fromStationAbsoluteCSVDistance - departureAbsoluteSPMDistance;
            // ---
            const departureTime = jsonData[departureIndex].Time;
            console.log('Departure Time:', departureTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }));

            let filteredData = jsonData.filter(row => {
                const rowTime = row.Time;
                return rowTime >= departureTime && rowTime <= toDateTime && !isNaN(rowTime.getTime());
            });
            

            if (filteredData.length === 0) {
                alert('No valid data found after departure within the selected time range.');
                return;
            }

            console.log('Filtered Data (first 5):', filteredData.slice(0, 5).map(row => ({
                Time: row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
                Speed: row.Speed,
                Distance: row.CumulativeDistance.toFixed(2)
            })));

            const initialDistance = filteredData.length > 0 ? filteredData[0].CumulativeDistance : 0;
            let normalizedData = filteredData.map(row => ({
                ...row,
                // Main distance property: METERS mein, starting point se relative.
                Distance: row.CumulativeDistance - initialDistance
            }));

            console.log('Normalized Data (first 5, distance in meters):', normalizedData.slice(0, 5).map(r => ({...r, Distance: r.Distance.toFixed(2)})));

            const fromIndex = stationsData.findIndex(station => station.name === fromSection);
            const toIndex = stationsData.findIndex(station => station.name === toSection);
            if (fromIndex === -1 || toIndex === -1) {
                alert('From or To Station is invalid.');
                return;
            }

            const routeStations = [];
            const routeStartIndex = Math.min(fromIndex, toIndex);
            const endIndex = Math.max(fromIndex, toIndex);
            for (let i = routeStartIndex; i <= endIndex; i++) {
                routeStations.push(stationsData[i]);
            }

            let normalizedStations = routeStations.map(station => ({
                name: station.name,
                distance: Math.abs(station.distance - fromStation.distance)
            }));

            console.log('Normalized Stations:', normalizedStations);

            const overSpeedDetails = [];
            let overSpeedGroup = null;
            normalizedData.forEach((row, index) => {
                if (row.Speed > maxPermissibleSpeed) {
                    let sectionName = 'Unknown';
                    for (let i = 0; i < normalizedStations.length - 1; i++) {
                        const startStation = normalizedStations[i];
                        const endStation = normalizedStations[i + 1];
                        if (row.Distance >= startStation.distance && row.Distance < endStation.distance) {
                            sectionName = `${startStation.name}-${endStation.name}`;
                            break;
                        }
                    }

                    if (!overSpeedGroup || overSpeedGroup.section !== sectionName || 
                        (index > 0 && (row.Time.getTime() - normalizedData[index-1].Time.getTime()) > 10000)) {
                        if (overSpeedGroup) {
                            overSpeedDetails.push({
                                section: overSpeedGroup.section,
                                timeRange: `${overSpeedGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}-${overSpeedGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`,
                                speedRange: `${overSpeedGroup.minSpeed.toFixed(2)}-${overSpeedGroup.maxSpeed.toFixed(2)}`
                            });
                        }
                        overSpeedGroup = {
                            section: sectionName,
                            startTime: row.Time,
                            endTime: row.Time,
                            minSpeed: row.Speed,
                            maxSpeed: row.Speed
                        };
                    } else {
                        overSpeedGroup.endTime = row.Time;
                        overSpeedGroup.minSpeed = Math.min(overSpeedGroup.minSpeed, row.Speed);
                        overSpeedGroup.maxSpeed = Math.max(overSpeedGroup.maxSpeed, row.Speed);
                    }
                }
            });

            if (overSpeedGroup) {
                overSpeedDetails.push({
                    section: overSpeedGroup.section,
                    timeRange: `${overSpeedGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}-${overSpeedGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`,
                    speedRange: `${overSpeedGroup.minSpeed.toFixed(2)}-${overSpeedGroup.maxSpeed.toFixed(2)}`
                });
            }

            console.log('OverSpeed Details:', overSpeedDetails);

            const wheelSlipDetails = [];
            let wheelSlipGroup = null;
            normalizedData.forEach((row, index) => {
                if (index === 0) return;
                const prevRow = normalizedData[index - 1];
                const timeDiffSec = (row.Time.getTime() - prevRow.Time.getTime()) / 1000;
                if (timeDiffSec > 1) return;

                const speedDiff = row.Speed - prevRow.Speed;
                let sectionName = 'Unknown';
                for (let i = 0; i < normalizedStations.length - 1; i++) {
                    const startStation = normalizedStations[i];
                    const endStation = normalizedStations[i + 1];
                    if (row.Distance >= startStation.distance && row.Distance < endStation.distance) {
                        sectionName = `${startStation.name}-${endStation.name}`;
                        break;
                    }
                }

                if (speedDiff >= 2) {
                    if (!wheelSlipGroup || wheelSlipGroup.section !== sectionName || 
                        (row.Time.getTime() - prevRow.Time.getTime()) > 10000) {
                        if (wheelSlipGroup) {
                            wheelSlipDetails.push({
                                section: wheelSlipGroup.section,
                                timeRange: `${wheelSlipGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}-${wheelSlipGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`,
                                speedRange: `${wheelSlipGroup.minSpeed.toFixed(2)}-${wheelSlipGroup.maxSpeed.toFixed(2)}`
                            });
                        }
                        wheelSlipGroup = {
                            section: sectionName,
                            startTime: prevRow.Time,
                            endTime: row.Time,
                            minSpeed: prevRow.Speed,
                            maxSpeed: row.Speed
                        };
                    } else {
                        wheelSlipGroup.endTime = row.Time;
                        wheelSlipGroup.maxSpeed = Math.max(wheelSlipGroup.maxSpeed, row.Speed);
                    }
                }
            });

            if (wheelSlipGroup) {
                wheelSlipDetails.push({
                    section: wheelSlipGroup.section,
                    timeRange: `${wheelSlipGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}-${wheelSlipGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`,
                    speedRange: `${wheelSlipGroup.minSpeed.toFixed(2)}-${wheelSlipGroup.maxSpeed.toFixed(2)}`
                });
            }

            console.log('Wheel Slip Details:', wheelSlipDetails);

            const wheelSkidDetails = [];
            let wheelSkidGroup = null;
            normalizedData.forEach((row, index) => {
                if (index === 0) return;
                const prevRow = normalizedData[index - 1];
                const timeDiffSec = (row.Time.getTime() - prevRow.Time.getTime()) / 1000;
                if (timeDiffSec > 1) return;

                const speedDiff = row.Speed - prevRow.Speed;
                let sectionName = 'Unknown';
                for (let i = 0; i < normalizedStations.length - 1; i++) {
                    const startStation = normalizedStations[i];
                    const endStation = normalizedStations[i + 1];
                    if (row.Distance >= startStation.distance && row.Distance < endStation.distance) {
                        sectionName = `${startStation.name}-${endStation.name}`;
                        break;
                    }
                }

                if (speedDiff <= -4) {
                    if (!wheelSkidGroup || wheelSkidGroup.section !== sectionName || 
                        (row.Time.getTime() - prevRow.Time.getTime()) > 10000) {
                        if (wheelSkidGroup) {
                            wheelSkidDetails.push({
                                section: wheelSkidGroup.section,
                                timeRange: `${wheelSkidGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}-${wheelSkidGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`,
                                speedRange: `${wheelSkidGroup.maxSpeed.toFixed(2)}-${wheelSkidGroup.minSpeed.toFixed(2)}`
                            });
                        }
                        wheelSkidGroup = {
                            section: sectionName,
                            startTime: prevRow.Time,
                            endTime: row.Time,
                            minSpeed: row.Speed,
                            maxSpeed: prevRow.Speed
                        };
                    } else {
                        wheelSkidGroup.endTime = row.Time;
                        wheelSkidGroup.minSpeed = Math.min(wheelSkidGroup.minSpeed, row.Speed);
                    }
                }
            });

            if (wheelSkidGroup) {
                wheelSkidDetails.push({
                    section: wheelSkidGroup.section,
                    timeRange: `${wheelSkidGroup.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}-${wheelSkidGroup.endTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`,
                    speedRange: `${wheelSkidGroup.maxSpeed.toFixed(2)}-${wheelSkidGroup.minSpeed.toFixed(2)}`
                });
            }

            console.log('Wheel Skid Details:', wheelSkidDetails);

            // =================================================================
            // == UPDATED CREW CALL ANALYSIS SECTION ==
            // =================================================================
            const analyzeCalls = (calls, designation) => {
                    if (!calls || calls.length === 0) {
                        return [];
                    }
                    return calls.map((call, index) => {
                        const callStart = call.startDateTime;
                        const callEnd = call.endDateTime;
                        const totalDuration = call.duration;
                        let runDuration = 0;
                        let stopDuration = 0;
                        let maxSpeed = 0;

                        for (let i = 0; i < normalizedData.length; i++) {
                            const rowTime = normalizedData[i].Time;
                            if (rowTime >= callStart && rowTime <= callEnd) {
                                const timeDiff = i < normalizedData.length - 1 ?
                                    (normalizedData[i + 1].Time - rowTime) / 1000 :
                                    1;
                                if (normalizedData[i].Speed > 1) {
                                    runDuration += timeDiff;
                                    maxSpeed = Math.max(maxSpeed, normalizedData[i].Speed);
                                } else {
                                    stopDuration += timeDiff;
                                }
                            }
                        }

                        const totalCalculated = runDuration + stopDuration;
                        if (totalCalculated > 0) {
                            runDuration = (runDuration / totalCalculated) * totalDuration;
                            stopDuration = (stopDuration / totalCalculated) * totalDuration;
                        } else {
                            stopDuration = totalDuration;
                        }

                        return {
                            designation: `${designation} (Call ${index + 1})`,
                            totalDuration: totalDuration > 0 ? Math.round(totalDuration) : 'N/A',
                            runDuration: runDuration > 0 ? Math.round(runDuration) : 'N/A',
                            stopDuration: stopDuration > 0 ? Math.round(stopDuration) : 'N/A',
                            maxSpeed: runDuration > 0 ? maxSpeed.toFixed(2) : 'N/A',
                            toNumbers: call['To Mobile Number'] || 'N/A'
                        };
                    });
                };

                const lpCallDetails = analyzeCalls(lpCalls, lpDesg || 'LP');
                const alpCallDetails = analyzeCalls(alpCalls, alpDesg || 'ALP');
                const crewCallData = [...lpCallDetails, ...alpCallDetails];
                console.log('Crew Call Data:', crewCallData)

            const maxPoints = 1000;
            let sampledData = normalizedData;
            if (normalizedData.length > maxPoints) {
                const step = Math.ceil(normalizedData.length / maxPoints);
                sampledData = normalizedData.filter((_, index) => index % step === 0);
            }

            const labels = sampledData.map(row => row.Time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
            const speeds = sampledData.map(row => row.Speed);

            let stops = [];
            let stopGroup = 0;
            let potentialStops = [];

            for (let i = 0; i < normalizedData.length; i++) {
                const row = normalizedData[i];
                if (row.Event === spmConfig.eventCodes.zeroSpeed && row.Speed === 0) {
                    potentialStops.push({
                        index: i,
                        time: row.Time,
                        timeString: row.Time.toLocaleString(/*...*/),
                        timeLabel: row.Time.toLocaleTimeString(/*...*/),
                        // FIX: Yahaan absolute 'CumulativeDistance' ki jagah nayi 'Distance' (relative meters) istemaal karein.
                        kilometer: row.Distance
                    });
                }
            }

            console.log('Potential Stops:', potentialStops);

            const seenStops = new Set();
            let currentGroup = [];

            for (let i = 0; i < potentialStops.length; i++) {
                currentGroup.push(potentialStops[i]);
                const isLastInSequence = i === potentialStops.length - 1 || (() => {
                    const nextStop = potentialStops[i + 1];
                    const timeDiff = (nextStop.time.getTime() - potentialStops[i].time.getTime()) / 1000;
                    return timeDiff > 10;
                })();

                if (isLastInSequence && currentGroup.length > 0) {
                    const lastStop = currentGroup[currentGroup.length - 1];
                    const stopKey = `${lastStop.kilometer.toFixed(2)}-${lastStop.timeString}`;
                    if (!seenStops.has(stopKey)) {
                        seenStops.add(stopKey);
                        stops.push({
                            ...lastStop,
                            group: ++stopGroup
                        });
                    }
                    currentGroup = [];
                }
            }

            stops = stops.filter((stop, index, arr) => {
                if (index === 0) return true;
                const prevStop = arr[index - 1];
                const distanceDiff = Math.abs(stop.kilometer - prevStop.kilometer) / 1000;
                return distanceDiff >= 0.2;
            });

            stops.sort((a, b) => a.time.getTime() - b.time.getTime());

            console.log('Sorted Stops:', stops);

            if (stops.length === 0 && !normalizedData.some(row => row.Event === spmConfig.eventCodes.zeroSpeed)) {
                alert(`No ${spmConfig.eventCodes.zeroSpeed} (ZeroSpeed) event found. Please check the SPM file.`);
            }

          // --- START: NAYA STOPS.MAP CODE YAHAN PASTE KAREIN ---
// --- START: NAYA STOPS.MAP CODE YAHAN PASTE KAREIN ---
stops = stops.map((stop, index) => {
    const absoluteStopSPMDistance = initialDistance + stop.kilometer;
    const alignedStopDistanceCSV = absoluteStopSPMDistance + distanceOffset;

    let stopLocation = '';
    let startTiming = null;

    // Ab aligned distance ko CSV ke absolute distance se compare karein
    const atStationOrSignal = window.stationSignalData.find(row => {
        if (row['SECTION'] !== section) return false;
        const signalAbsoluteDistanceCSV = parseFloat(row['CUMMULATIVE DISTANT(IN Meter)']);
        const rangeStart = signalAbsoluteDistanceCSV - 200;
        const rangeEnd = signalAbsoluteDistanceCSV + 200;
        return alignedStopDistanceCSV >= rangeStart && alignedStopDistanceCSV <= rangeEnd;
    });

    if (atStationOrSignal) {
        stopLocation = `${atStationOrSignal['STATION']} ${atStationOrSignal['SIGNAL NAME'] || ''}`.trim();
    } else {
        // Fallback: Section dhoondhne ke liye bhi aligned distance ka istemaal karein
        let sectionStart = null;
        let sectionEnd = null;
        for (let i = 0; i < routeStations.length - 1; i++) {
            const startStation = routeStations[i];
            const endStation = routeStations[i + 1];
            if (alignedStopDistanceCSV >= startStation.distance && alignedStopDistanceCSV < endStation.distance) {
                sectionStart = startStation.name;
                sectionEnd = endStation.name;
                break;
            }
        }
        stopLocation = sectionStart && sectionEnd ? `${sectionStart}-${sectionEnd}` : 'Unknown Section';
    }

    // Start timing ka logic waisa hi rahega
    const stopIndex = stop.index;
    for (let i = stopIndex + 1; i < normalizedData.length; i++) {
        const currentSpeed = normalizedData[i].Speed;
        const currentTime = new Date(normalizedData[i].Time);
        if (currentSpeed > 0 && currentTime.getTime() > stop.time.getTime()) {
            startTiming = currentTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
            break;
        }
    }

    // SpeedsBefore aur brakingTechnique ka logic waisa hi rahega
    const distancesBefore = [1000, 500, 100, 50];
    const speedsBefore = distancesBefore.map(targetDistance => {
        let closestRow = null;
        let minDistanceDiff = Infinity;
        for (let i = stop.index; i >= 0; i--) {
            const row = normalizedData[i];
            const distanceDiff = stop.kilometer - row.Distance;
            if (distanceDiff >= targetDistance) {
                const absDiff = Math.abs(distanceDiff - targetDistance);
                if (absDiff < minDistanceDiff) {
                    minDistanceDiff = absDiff;
                    closestRow = row;
                }
            }
        }
        return closestRow ? Math.floor(closestRow.Speed).toString() : 'N/A';
    });

    const [speed1000m, speed500m, speed100m, speed50m] = speedsBefore.map(speed => parseFloat(speed) || Infinity);
    let isSmooth = speed1000m <= 60 && speed500m <= 30 && speed100m <= 20 && speed50m <= 10;
    const brakingTechnique = isSmooth ? 'Smooth' : 'Late';

    return {
        ...stop,
        stopLocation,
        startTiming: startTiming || 'N/A',
        speedsBefore: speedsBefore,
        brakingTechnique,
        group: index + 1
    };
});
// --- END: NAYA STOPS.MAP CODE YAHAN KHATAM --
            console.log('Enhanced Stops:', stops);

           const trackSpeedReduction = (data, startIdx, maxDurationMs) => {
                const startSpeed = data[startIdx].Speed;
                const startTime = data[startIdx].Time.getTime();
                let lowestSpeed = startSpeed;
                let lowestSpeedIdx = startIdx;

                for (let i = startIdx + 1; i < data.length; i++) {
                    const currentSpeed = data[i].Speed;
                    const currentTime = data[i].Time.getTime();
                    if (currentTime - startTime > maxDurationMs) break;
                    if (currentSpeed > lowestSpeed + 0.5) break;
                    if (currentSpeed < lowestSpeed) {
                        lowestSpeed = currentSpeed;
                        lowestSpeedIdx = i;
                    }
                }
                
                if (lowestSpeedIdx === startIdx) {
                    return null;
                }

                const endTime = data[lowestSpeedIdx].Time.getTime();
                return { 
                    index: lowestSpeedIdx, 
                    speed: lowestSpeed, 
                    timeDiff: (endTime - startTime) / 1000 
                };
            };

            let bftDetails = null;
            let bptDetails = null;
            const brakeTestsConfig = spmConfig.brakeTests[rakeType];

            for (let i = 0; i < normalizedData.length; i++) {
                const row = normalizedData[i];
                const speed = row.Speed;

                // BFT Check
                if (!bftDetails && speed >= brakeTestsConfig.bft.minSpeed && speed <= brakeTestsConfig.bft.maxSpeed) {
                    const result = trackSpeedReduction(normalizedData, i, brakeTestsConfig.bft.maxDuration);
                    if (result && result.timeDiff > 1) {
                        const speedReduction = speed - result.speed;
                        if (speedReduction >= 5) {
                            bftDetails = {
                                time: row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
                                startSpeed: speed.toFixed(2),
                                endSpeed: result.speed.toFixed(2),
                                reduction: speedReduction.toFixed(2),
                                timeTaken: result.timeDiff.toFixed(0),
                                endTime: normalizedData[result.index].Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
                            };
                            console.log('BFT Detected:', bftDetails);
                        }
                    }
                }

                // BPT Check
                if (!bptDetails && speed >= brakeTestsConfig.bpt.minSpeed && speed <= brakeTestsConfig.bpt.maxSpeed) {
                     const result = trackSpeedReduction(normalizedData, i, brakeTestsConfig.bpt.maxDuration);
                     if (result && result.timeDiff > 1) {
                        const speedReduction = speed - result.speed;
                        if (speedReduction >= 5) {
                            bptDetails = {
                                time: row.Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
                                startSpeed: speed.toFixed(2),
                                endSpeed: result.speed.toFixed(2),
                                reduction: speedReduction.toFixed(2),
                                timeTaken: result.timeDiff.toFixed(0),
                                endTime: normalizedData[result.index].Time.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
                            };
                            console.log('BPT Detected:', bptDetails);
                        }
                     }
                }

                if (bftDetails && bptDetails) break;
            }
           // --- START: NAYA STATION TIMING CODE YAHAN PASTE KAREIN ---
const stationStops = normalizedStations.map((station, stationIndex) => {
    const stopRangeStart = station.distance - 400; // Station ke 400m ke daayre mein
    const stopRangeEnd = station.distance + 400;

    let stationStop = stops.find(stop => {
        return stop.kilometer >= stopRangeStart && stop.kilometer <= stopRangeEnd;
    });

    let arrivalTime = 'N/A';
    let departureTime = 'N/A';
    const timeFormat = {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    };

    if (stationStop) {
        // Case 1: Agar train station par ruki thi
        arrivalTime = stationStop.timeString;
        departureTime = stationStop.startTiming;
    } else {
        // Case 2: Agar train nahi ruki (passing)
        if (stationIndex === 0 && station.name === fromSection) {
            // Pehla station
            departureTime = filteredData[0].Time.toLocaleString('en-IN', timeFormat);
        } else {
            // Beech ke stations ke liye "CROSSING" logic
            let crossingPoint = null;
            for (let i = 1; i < normalizedData.length; i++) {
                const prevRow = normalizedData[i - 1];
                const currRow = normalizedData[i];

                // Check karein ki train ne station ki doori ko cross kiya ya nahi
                if ((prevRow.Distance <= station.distance && currRow.Distance >= station.distance) ||
                    (prevRow.Distance >= station.distance && currRow.Distance <= station.distance)) {
                    crossingPoint = currRow; // Crossing point mil gaya
                    break;
                }
            }

            if (crossingPoint) {
                if (stationIndex === normalizedStations.length - 1) {
                    arrivalTime = crossingPoint.Time.toLocaleString('en-IN', timeFormat);
                } else {
                    departureTime = crossingPoint.Time.toLocaleString('en-IN', timeFormat);
                }
            }
        }
    }

    // Aakhri station ka departure hamesha N/A hoga
    if (stationIndex === normalizedStations.length - 1) {
        departureTime = 'N/A';
        // Agar aakhri station ka arrival abhi bhi N/A hai, to last point ka time lein
        if (arrivalTime === 'N/A' && normalizedData.length > 0) {
                const lastDataPoint = normalizedData[normalizedData.length - 1];
                if (Math.abs(lastDataPoint.Distance - station.distance) < 2000) { // 2km ke daayre mein
                arrivalTime = lastDataPoint.Time.toLocaleString('en-IN', timeFormat);
                }
        }
    }

    return {
        station: station.name,
        arrival: arrivalTime,
        departure: departureTime
    };
});

console.log('Station Stops:', stationStops);
            document.getElementById('speedChart').width = 600;
            document.getElementById('speedChart').height = 400;

            let speedChartImage = null;
            if (labels.length === 0 || speeds.length === 0) {
                alert('No valid data available for the time vs. speed graph. Please check console logs.');
                return;
            }

            try {
                const ctx = document.getElementById('speedChart').getContext('2d');
                ctx.clearRect(0, 0, 600, 400);
                speedChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Speed',
                                data: speeds,
                                borderColor: '#00008B',
                                backgroundColor: 'rgba(0, 0, 139, 0.1)',
                                fill: false,
                                tension: 0.4,
                                borderWidth: 2,
                                pointRadius: 0
                            }
                        ]
                    },
                    options: {
                        responsive: false,
                        scales: {
                            x: {
                                title: { display: true, text: 'Time' },
                                grid: { display: true, color: '#F5F5F5' },
                                ticks: {
                                    maxTicksLimit: 12,
                                    callback: function(value, index, values) {
                                        const label = labels[index];
                                        if (stops.map(stop => stop.timeLabel).includes(label)) {
                                            return label;
                                        }
                                        return index % Math.ceil(labels.length / 12) === 0 ? label : '';
                                    }
                                }
                            },
                            y: {
                                title: { display: true, text: 'Speed (kmph)' },
                                grid: { display: true, color: '#E6E6E6' },
                                beginAtZero: true,
                                ticks: { stepSize: 10 }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            title: { display: false }
                        }
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
                            img.src = document.getElementById('speedChart').toDataURL('image/png', 1.0);
                            img.onload = () => {
                                tempCtx.drawImage(img, 0, 0, 600, 400);
                                resolve(tempCanvas.toDataURL('image/png', 1.0));
                            };
                        }
                    };
                    speedChartInstance.update();
                });
            } catch (error) {
                console.error('Error generating time vs. speed chart:', error);
                alert('Failed to generate time vs. speed graph. Please check console logs.');
                return;
            }

            let stopChartImage = null;
            const distanceLabels = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0];

            const selectedStops = stops.length > 10 
                ? stops.slice(0, 10)
                : stops;

            const stopDatasets = selectedStops.map((stop, index) => {
                const speeds = distanceLabels.map(targetDistance => { // targetDistance METERS mein hai
                    let closestRow = null;
                    let minDistanceDiff = Infinity;
                    for (let i = stop.index; i >= 0; i--) {
                        const row = normalizedData[i];
                        // Yahaan bhi relative meters vs relative meters compare hoga.
                        const distanceDiff = stop.kilometer - row.Distance;
                        if (distanceDiff >= targetDistance) {
                            const absDiff = Math.abs(distanceDiff - targetDistance);
                            if (absDiff < minDistanceDiff) {
                                minDistanceDiff = absDiff;
                                closestRow = row;
                            }
                        }
                    }
                    return closestRow ? closestRow.Speed : 0;
                });

                const colors = [
                    '#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080',
                    '#00FFFF', '#FF00FF', '#FFFF00', '#008080', '#FFC0CB'
                ];
                return {
                    label: stop.stopLocation,
                    data: speeds,
                    borderColor: colors[index % colors.length],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.2,
                    borderWidth: 2,
                    pointRadius: 3
                };
            });

            if (stopDatasets.length > 0) {
                try {
                    const stopCanvas = document.createElement('canvas');
                    stopCanvas.id = 'stopChart_' + Date.now();
                    stopCanvas.width = 600;
                    stopCanvas.height = 400;
                    stopCanvas.style.display = 'none';
                    document.body.appendChild(stopCanvas);
                    const stopCtx = stopCanvas.getContext('2d');
                    stopCtx.clearRect(0, 0, 600, 400);
                    stopChartInstance = new Chart(stopCtx, {
                        type: 'line',
                        data: {
                            labels: distanceLabels,
                            datasets: stopDatasets
                        },
                        options: {
                            responsive: false,
                            scales: {
                                x: {
                                    title: { display: true, text: 'Distance Before Stop (m)' },
                                    grid: { display: true, color: '#F5F5F5' },
                                    ticks: { stepSize: 100 }
                                },
                                y: {
                                    title: { display: true, text: 'Speed (kmph)' },
                                    grid: { display: true, color: '#E6E6E6' },
                                    beginAtZero: true,
                                    ticks: { stepSize: 10 }
                                }
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
                                img.src = stopCanvas.toDataURL('image/png', 1.0);
                                img.onload = () => {
                                    tempCtx.drawImage(img, 0, 0, 600, 400);
                                    const dataUrl = tempCanvas.toDataURL('image/png', 1.0);
                                    console.log('Stop Chart Image generated:', dataUrl.substring(0, 50) + '...');
                                    resolve(dataUrl);
                                };
                            }
                        };
                        stopChartInstance.update();
                    });
                } catch (error) {
                    console.error('Error generating stop chart:', error);
                    alert('Failed to generate speed vs. distance chart. Please check console logs.');
                }
            }

            const reportData = {
                trainDetails: [
                    { label: 'Loco Number', value: locoNumber || 'N/A' },
                    { label: 'Train Number', value: trainNumber || 'N/A' },
                    { label: 'Type of Rake', value: rakeType || 'N/A' },
                    { label: 'Max Permissible Speed', value: maxPermissibleSpeed ? `${maxPermissibleSpeed} kmph` : 'N/A' },
                    { label: 'Section', value: section || 'N/A' },
                    { label: 'Route', value: routeSection || 'N/A' },
                    { label: 'SPM Type', value: spmType || 'N/A' },
                    { label: 'Analysis Time', value: `From ${fromDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })} to ${toDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}` }
                ],
                lpDetails: [
                    `LP ID: ${lpId || 'N/A'}`,
                    `LP Name: ${lpName || 'N/A'}`,
                    `Designation: ${lpDesg || 'N/A'}`,
                    `Group CLI: ${lpGroupCli || 'N/A'}`,
                    `CUG Number: ${lpCugNumber || 'N/A'}`
                ],
                alpDetails: [
                    `ALP ID: ${alpId || 'N/A'}`,
                    `ALP Name: ${alpName || 'N/A'}`,
                    `Designation: ${alpDesg || 'N/A'}`,
                    `Group CLI: ${alpGroupCli || 'N/A'}`,
                    `CUG Number: ${alpCugNumber || 'N/A'}`
                ],
                stopCount: stops.length,
                bftDetails,
                bptDetails,
                crewCallData,
                stops: stops.map((stop) => ({
                    group: stop.group,
                    stopLocation: stop.stopLocation,
                    timeString: stop.timeString,
                    startTiming: stop.startTiming,
                    kilometer: stop.kilometer,
                    speedsBefore: stop.speedsBefore,
                    brakingTechnique: stop.brakingTechnique
                })),
                stationStops,
                overSpeedDetails,
                wheelSlipDetails,
                wheelSkidDetails,
                speedChartImage,
                stopChartImage,
                speedChartConfig: {
                    labels: labels.slice(0, maxPoints),
                    speeds: speeds.slice(0, maxPoints)
                },
                stopChartConfig: {
                    labels: distanceLabels,
                    datasets: stopDatasets
                }
            };

            try {
                localStorage.setItem('spmReportData', JSON.stringify(reportData));
                console.log('reportData saved to localStorage');
            } catch (error) {
                console.error('Error saving reportData to localStorage:', error);
                alert('Failed to save report data. Please check console logs.');
                return;
            }

            setTimeout(() => {
                window.location.href = 'report.html';
            }, 1000);

            if (reportData.stopCount === 0) {
                alert('No stops found. Please check the report and console logs.');
            }
        } catch (error) {
            console.error('Error processing SPM file:', error);
            alert('Failed to process SPM file. Please check console logs.');
        }
    };

    reader.onerror = () => {
        console.error('Error reading file');
        alert('Failed to read SPM file.');
    };

    reader.readAsText(spmFile);
});
